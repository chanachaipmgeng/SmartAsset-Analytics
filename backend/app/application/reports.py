"""Read-only reports; RLS scopes every row to the caller's tenant (superadmin sees all)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from app.application.context import Actor
from app.application.dashboard import BUSINESS_OFFSET, BUSINESS_TZ, aged_devices
from app.domain.enums import DeviceStatus, TransactionType
from app.domain.errors import NotFoundError, ValidationError
from app.domain.ports import IssueSummarizerPort, UnitOfWork
from app.domain.read_models import AgedDevice, DeviceView, StockBalanceRow
from app.infrastructure.issue_summarizer import KeywordIssueSummarizer

RiskLevel = Literal["low", "medium", "high"]

_REPAIR_TYPES = (TransactionType.SEND_REPAIR, TransactionType.QC_FAIL)
_OUTFLOW_TYPES = (TransactionType.CHECK_OUT, TransactionType.INSTALL)
_MOVEMENT_TYPES = (
    TransactionType.CHECK_IN,
    TransactionType.CHECK_OUT,
    TransactionType.INSTALL,
    TransactionType.RETIRE,
    TransactionType.SEND_REPAIR,
)
_TX_FETCH_LIMIT = 100_000


@dataclass(frozen=True)
class DeviceRisk:
    device: DeviceView
    score: int
    level: RiskLevel
    factors: list[str]


@dataclass(frozen=True)
class RepairRateRow:
    model_id: UUID
    brand: str
    model_name: str
    device_count: int
    repair_events: int
    rate: float


@dataclass(frozen=True)
class StockForecastRow:
    model_id: UUID
    brand: str
    model_name: str
    in_stock: int
    outflow_events: int
    avg_per_month: float
    months_of_stock: float | None


@dataclass(frozen=True)
class IssueGroup:
    category: str
    count: int
    sample_notes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class WarrantyRow:
    device: DeviceView
    days_remaining: int


@dataclass(frozen=True)
class RepairTatRow:
    supplier_name: str
    count: int
    avg_days: float
    min_days: float
    max_days: float


@dataclass(frozen=True)
class MonthlyMovementRow:
    month: str  # YYYY-MM in Asia/Bangkok
    counts: dict[TransactionType, int]
    total: int


@dataclass(frozen=True)
class FirmwareDriftRow:
    device: DeviceView
    model_firmware: str
    device_firmware: str


@dataclass(frozen=True)
class DepreciationRow:
    device: DeviceView
    cost: Decimal
    purchase_date: date
    age_years: float
    book_value: Decimal
    useful_years: int


def _risk_level(score: int) -> RiskLevel:
    if score < 30:
        return "low"
    if score < 60:
        return "medium"
    return "high"


def _score_device(
    device: DeviceView,
    *,
    repair_count: int,
    days_in_repair: int | None,
    today: date,
) -> DeviceRisk:
    score = 0
    factors: list[str] = []

    repair_pts = min(45, repair_count * 15)
    if repair_pts:
        score += repair_pts
        factors.append(f"ประวัติซ่อม {repair_count} ครั้ง (+{repair_pts})")

    if days_in_repair is not None:
        if days_in_repair > 14:
            score += 25
            factors.append(f"อยู่ระหว่างซ่อม {days_in_repair} วัน (+25)")
        else:
            score += 10
            factors.append(f"อยู่ระหว่างซ่อม {days_in_repair} วัน (+10)")

    origin = device.purchase_date or device.created_at.astimezone(BUSINESS_OFFSET).date()
    age_years = max(0, (today - origin).days) / 365.25
    age_pts = min(15, int(age_years))
    if age_pts:
        score += age_pts
        factors.append(f"อายุราว {age_years:.1f} ปี (+{age_pts})")

    if device.warranty_end is not None:
        days_left = (device.warranty_end - today).days
        if days_left < 0:
            score += 20
            factors.append(f"ประกันหมดแล้ว {abs(days_left)} วัน (+20)")
        elif days_left <= 30:
            score += 10
            factors.append(f"ประกันหมดใน {days_left} วัน (+10)")

    score = min(100, score)
    return DeviceRisk(device=device, score=score, level=_risk_level(score), factors=factors)


def _window_since(days: int) -> datetime:
    if days < 1:
        raise ValidationError("จำนวนวันต้องอย่างน้อย 1")
    today = datetime.now(BUSINESS_OFFSET).date()
    start = today - timedelta(days=days - 1)
    return datetime.combine(start, time.min, tzinfo=BUSINESS_OFFSET).astimezone(UTC)


async def stock_balance(uow: UnitOfWork, actor: Actor, *, include_retired: bool = False) -> list[StockBalanceRow]:
    """Device count and summed cost per model x tenant x status."""
    rows = await uow.devices.stock_balance()
    return rows if include_retired else [r for r in rows if r.status != DeviceStatus.RETIRED]


async def aging(uow: UnitOfWork, actor: Actor, *, status: DeviceStatus | None = None) -> list[AgedDevice]:
    """Days each device has spent in its current status, oldest first; retired devices only when asked."""
    today = datetime.now(BUSINESS_OFFSET).date()
    rows = await aged_devices(uow, today, status)
    return rows if status else [r for r in rows if r.device.status != DeviceStatus.RETIRED]


async def device_risk(
    uow: UnitOfWork, actor: Actor, *, device_id: UUID | None = None
) -> list[DeviceRisk]:
    """Explainable risk score 0–100 per device (or one device)."""
    today = datetime.now(BUSINESS_OFFSET).date()
    if device_id is not None:
        view = await uow.devices.get_view(device_id)
        if view is None:
            raise NotFoundError("ไม่พบอุปกรณ์")
        devices = [view]
    else:
        devices = await uow.devices.list_views()

    repair_txs = await uow.transactions.list_views(
        device_id=device_id, limit=_TX_FETCH_LIMIT, tx_types=list(_REPAIR_TYPES)
    )
    repair_counts: dict[UUID, int] = defaultdict(int)
    for tx in repair_txs:
        repair_counts[tx.device_id] += 1

    days_in_repair: dict[UUID, int] = {}
    for aged in await aged_devices(uow, today, DeviceStatus.IN_REPAIR):
        days_in_repair[aged.device.id] = aged.days

    results = [
        _score_device(
            d,
            repair_count=repair_counts.get(d.id, 0),
            days_in_repair=days_in_repair.get(d.id) if d.status == DeviceStatus.IN_REPAIR else None,
            today=today,
        )
        for d in devices
    ]
    results.sort(key=lambda r: (-r.score, r.device.serial_number))
    return results


async def repair_rate_by_model(uow: UnitOfWork, actor: Actor, *, days: int = 90) -> list[RepairRateRow]:
    """Repair events (SEND_REPAIR + QC_FAIL) per model over the window, divided by device count."""
    since = _window_since(days)
    models = {m.id: m for m in await uow.device_models.list()}
    all_devices = await uow.devices.list_views()
    device_model = {d.id: d.model_id for d in all_devices}
    by_model: dict[UUID, int] = defaultdict(int)
    for d in all_devices:
        if d.status != DeviceStatus.RETIRED:
            by_model[d.model_id] += 1

    repair_txs = await uow.transactions.list_views(
        limit=_TX_FETCH_LIMIT, since=since, tx_types=list(_REPAIR_TYPES)
    )
    events: dict[UUID, int] = defaultdict(int)
    for tx in repair_txs:
        mid = device_model.get(tx.device_id)
        if mid is not None:
            events[mid] += 1

    rows: list[RepairRateRow] = []
    for mid, count in by_model.items():
        model = models.get(mid)
        if model is None:
            continue
        ev = events.get(mid, 0)
        rows.append(
            RepairRateRow(
                model_id=mid,
                brand=model.brand,
                model_name=model.name,
                device_count=count,
                repair_events=ev,
                rate=(ev / count) if count else 0.0,
            )
        )
    rows.sort(key=lambda r: (-r.rate, -r.repair_events, r.brand, r.model_name))
    return rows


async def stock_forecast(uow: UnitOfWork, actor: Actor, *, days: int = 90) -> list[StockForecastRow]:
    """Months of IN_STOCK cover based on checkout+install velocity in the window."""
    since = _window_since(days)
    models = {m.id: m for m in await uow.device_models.list()}
    devices = await uow.devices.list_views()
    in_stock: dict[UUID, int] = defaultdict(int)
    device_model = {d.id: d.model_id for d in devices}
    for d in devices:
        if d.status == DeviceStatus.IN_STOCK:
            in_stock[d.model_id] += 1

    outflow = await uow.transactions.list_views(
        limit=_TX_FETCH_LIMIT, since=since, tx_types=list(_OUTFLOW_TYPES)
    )
    events: dict[UUID, int] = defaultdict(int)
    for tx in outflow:
        mid = device_model.get(tx.device_id)
        if mid is not None:
            events[mid] += 1

    months = days / 30.0
    model_ids = set(in_stock) | set(events)
    rows: list[StockForecastRow] = []
    for mid in model_ids:
        model = models.get(mid)
        if model is None:
            continue
        stock = in_stock.get(mid, 0)
        ev = events.get(mid, 0)
        avg = (ev / months) if months else 0.0
        rows.append(
            StockForecastRow(
                model_id=mid,
                brand=model.brand,
                model_name=model.name,
                in_stock=stock,
                outflow_events=ev,
                avg_per_month=round(avg, 4),
                months_of_stock=(round(stock / avg, 2) if avg > 0 else None),
            )
        )
    rows.sort(key=lambda r: (r.months_of_stock is None, r.months_of_stock or 0, r.brand, r.model_name))
    return rows


async def issue_summary(
    uow: UnitOfWork,
    actor: Actor,
    *,
    days: int = 90,
    summarizer: IssueSummarizerPort | None = None,
) -> list[IssueGroup]:
    """Keyword-group QC_FAIL / SEND_REPAIR notes into Thai categories."""
    since = _window_since(days)
    summarizer = summarizer or KeywordIssueSummarizer()
    txs = await uow.transactions.list_views(
        limit=_TX_FETCH_LIMIT, since=since, tx_types=list(_REPAIR_TYPES)
    )
    buckets: dict[str, list[str]] = defaultdict(list)
    for tx in txs:
        note = (tx.note or "").strip()
        if not note:
            continue
        result = await summarizer.summarize(note)
        category = str(result.get("category") or "อื่นๆ")
        buckets[category].append(note)

    groups = [
        IssueGroup(category=cat, count=len(notes), sample_notes=notes[:3])
        for cat, notes in buckets.items()
    ]
    groups.sort(key=lambda g: (-g.count, g.category))
    return groups


async def warranty_report(
    uow: UnitOfWork, actor: Actor, *, within_days: int = 90
) -> list[WarrantyRow]:
    """Devices whose warranty ends within N days or already expired (not RETIRED)."""
    if within_days < 0:
        raise ValidationError("จำนวนวันต้องไม่ติดลบ")
    today = datetime.now(BUSINESS_OFFSET).date()
    devices = await uow.devices.warranty_expiring(today + timedelta(days=within_days))
    rows = [
        WarrantyRow(device=d, days_remaining=(d.warranty_end - today).days)
        for d in devices
        if d.warranty_end is not None
    ]
    rows.sort(key=lambda r: (r.device.warranty_end or today, r.device.serial_number))
    return rows


async def repair_tat(uow: UnitOfWork, actor: Actor, *, days: int = 180) -> list[RepairTatRow]:
    """Turnaround for completed repairs: SEND_REPAIR/QC_FAIL → next REPAIR_DONE, by supplier."""
    since = _window_since(days)
    txs = await uow.transactions.list_views(
        limit=_TX_FETCH_LIMIT,
        since=since,
        tx_types=[TransactionType.SEND_REPAIR, TransactionType.QC_FAIL, TransactionType.REPAIR_DONE],
    )
    # Oldest first for pairing.
    txs_asc = sorted(txs, key=lambda t: (t.occurred_at, t.id))
    open_start: dict[UUID, datetime] = {}
    open_supplier: dict[UUID, str] = {}
    durations: dict[str, list[float]] = defaultdict(list)

    for tx in txs_asc:
        if tx.transaction_type in _REPAIR_TYPES:
            if tx.device_id not in open_start:
                open_start[tx.device_id] = tx.occurred_at
                open_supplier[tx.device_id] = tx.supplier_name or "ไม่ระบุ"
        elif tx.transaction_type == TransactionType.REPAIR_DONE and tx.device_id in open_start:
            start = open_start.pop(tx.device_id)
            supplier = open_supplier.pop(tx.device_id, "ไม่ระบุ")
            delta = (tx.occurred_at - start).total_seconds() / 86400.0
            durations[supplier].append(max(0.0, delta))

    rows: list[RepairTatRow] = []
    for name, vals in durations.items():
        rows.append(
            RepairTatRow(
                supplier_name=name,
                count=len(vals),
                avg_days=round(sum(vals) / len(vals), 2),
                min_days=round(min(vals), 2),
                max_days=round(max(vals), 2),
            )
        )
    rows.sort(key=lambda r: (-r.count, r.supplier_name))
    return rows


async def monthly_movement(uow: UnitOfWork, actor: Actor, *, months: int = 12) -> list[MonthlyMovementRow]:
    """Counts per calendar month (Asia/Bangkok) for key movement types."""
    if months < 1:
        raise ValidationError("จำนวนเดือนต้องอย่างน้อย 1")
    today = datetime.now(BUSINESS_OFFSET).date()
    # First day of the month `months-1` ago.
    year, month = today.year, today.month
    month -= months - 1
    while month <= 0:
        month += 12
        year -= 1
    first = date(year, month, 1)
    since = datetime.combine(first, time.min, tzinfo=BUSINESS_OFFSET).astimezone(UTC)

    wanted = set(_MOVEMENT_TYPES)
    buckets: dict[str, dict[TransactionType, int]] = {}
    # Pre-create empty months so gaps show as zeros.
    y, m = first.year, first.month
    while (y, m) <= (today.year, today.month):
        buckets[f"{y:04d}-{m:02d}"] = {t: 0 for t in _MOVEMENT_TYPES}
        m += 1
        if m > 12:
            m = 1
            y += 1

    for row in await uow.transactions.daily_counts(since, BUSINESS_TZ):
        if row.transaction_type not in wanted:
            continue
        key = f"{row.day.year:04d}-{row.day.month:02d}"
        if key in buckets:
            buckets[key][row.transaction_type] = buckets[key].get(row.transaction_type, 0) + row.count

    return [
        MonthlyMovementRow(month=key, counts=counts, total=sum(counts.values()))
        for key, counts in sorted(buckets.items())
    ]


async def firmware_drift(uow: UnitOfWork, actor: Actor) -> list[FirmwareDriftRow]:
    """Devices whose firmware differs from the model's current firmware (both set; not RETIRED)."""
    models = {m.id: m for m in await uow.device_models.list()}
    rows: list[FirmwareDriftRow] = []
    for d in await uow.devices.list_views():
        if d.status == DeviceStatus.RETIRED:
            continue
        model = models.get(d.model_id)
        if model is None or not model.firmware_version or not d.firmware_version:
            continue
        if d.firmware_version != model.firmware_version:
            rows.append(
                FirmwareDriftRow(
                    device=d,
                    model_firmware=model.firmware_version,
                    device_firmware=d.firmware_version,
                )
            )
    rows.sort(key=lambda r: (r.device.brand, r.device.model_name, r.device.serial_number))
    return rows


async def depreciation(
    uow: UnitOfWork, actor: Actor, *, useful_years: int = 5, include_retired: bool = False
) -> list[DepreciationRow]:
    """Straight-line book value from cost and purchase_date."""
    if useful_years < 1:
        raise ValidationError("อายุการใช้งานต้องอย่างน้อย 1 ปี")
    today = datetime.now(BUSINESS_OFFSET).date()
    rows: list[DepreciationRow] = []
    for d in await uow.devices.list_views():
        if d.status == DeviceStatus.RETIRED and not include_retired:
            continue
        if d.cost is None or d.purchase_date is None:
            continue
        age_years = max(0.0, (today - d.purchase_date).days / 365.25)
        fraction = min(1.0, age_years / useful_years)
        book = max(Decimal("0"), (d.cost * (Decimal("1") - Decimal(str(fraction)))).quantize(Decimal("0.01")))
        rows.append(
            DepreciationRow(
                device=d,
                cost=d.cost,
                purchase_date=d.purchase_date,
                age_years=round(age_years, 2),
                book_value=book,
                useful_years=useful_years,
            )
        )
    rows.sort(key=lambda r: (r.book_value, r.device.serial_number))
    return rows
