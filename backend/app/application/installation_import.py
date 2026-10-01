"""Bulk install from a spreadsheet: validate every row, then save all or none."""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any
from uuid import UUID

from app.application import inventory
from app.application.context import Actor
from app.domain.enums import DeviceStatus
from app.domain.errors import ValidationError
from app.domain.ports import UnitOfWork
from app.domain.rules import STATUS_LABELS_TH, require_write

MAX_ROWS = 1000
BUDDHIST_ERA_OFFSET = 543

COLUMNS: list[tuple[str, str]] = [
    ("serial_number", "ซีเรียล"),
    ("customer", "ลูกค้า"),
    ("install_date", "วันที่ติดตั้ง"),
    ("latitude", "ละติจูด"),
    ("longitude", "ลองจิจูด"),
    ("address", "ที่อยู่"),
    ("site_contact", "ผู้ติดต่อหน้างาน"),
    ("site_phone", "โทรศัพท์หน้างาน"),
    ("notes", "หมายเหตุ"),
]
_ALIASES = {alias.lower(): key for key, th in COLUMNS for alias in (key, th)}


@dataclass
class ImportRow:
    row: int
    serial_number: str | None = None
    customer: str | None = None
    install_date: date | None = None
    latitude: float | None = None
    longitude: float | None = None
    address: str | None = None
    site_contact: str | None = None
    site_phone: str | None = None
    notes: str | None = None
    errors: list[str] = field(default_factory=list)
    device_id: UUID | None = field(default=None, repr=False)
    customer_id: UUID | None = field(default=None, repr=False)


@dataclass(frozen=True)
class ImportResult:
    rows: list[ImportRow]
    committed: bool

    @property
    def total(self) -> int:
        return len(self.rows)

    @property
    def invalid(self) -> int:
        return sum(1 for r in self.rows if r.errors)

    @property
    def valid(self) -> int:
        return self.total - self.invalid


def template_headers() -> list[str]:
    return [th for _, th in COLUMNS]


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).strip()
    return text or None


def _date(value: Any, label: str, errors: list[str]) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        parsed = value.date()
    elif isinstance(value, date):
        parsed = value
    else:
        text = str(value).strip()
        parsed = None
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                parsed = datetime.strptime(text, fmt).date()
                break
            except ValueError:
                continue
        if parsed is None:
            errors.append(f"{label} ต้องเป็นวันที่ เช่น 2026-09-29 หรือ 29/09/2026")
            return None
    if parsed.year > 2400:
        parsed = parsed.replace(year=parsed.year - BUDDHIST_ERA_OFFSET)
    return parsed


def _coord(value: Any, label: str, lo: float, hi: float, errors: list[str]) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        errors.append(f"{label} ต้องเป็นตัวเลข")
        return None
    if not lo <= number <= hi:
        errors.append(f"{label} ต้องอยู่ระหว่าง {lo:g} ถึง {hi:g}")
        return None
    return number


async def _validate(uow: UnitOfWork, actor: Actor, table: list[tuple[int, dict[str, Any]]]) -> list[ImportRow]:
    if not table:
        raise ValidationError("ไม่พบข้อมูลในไฟล์ (แถวแรกต้องเป็นหัวคอลัมน์)")
    if len(table) > MAX_ROWS:
        raise ValidationError(f"นำเข้าได้ครั้งละไม่เกิน {MAX_ROWS} แถว")

    headers = {_ALIASES.get(h.strip().lower()) for h in table[0][1]}
    required = {"serial_number", "customer", "install_date", "latitude", "longitude"}
    if not required <= headers:
        raise ValidationError(
            "ไฟล์ต้องมีคอลัมน์ 'ซีเรียล', 'ลูกค้า', 'วันที่ติดตั้ง', 'ละติจูด' และ 'ลองจิจูด' "
            "(ดาวน์โหลดไฟล์แม่แบบเพื่อดูรูปแบบ)"
        )

    customers_by_name: dict[str, list[Any]] = {}
    for c in await uow.customers.list():
        customers_by_name.setdefault(c.company_name.lower(), []).append(c)

    seen_serials: dict[str, int] = {}
    rows: list[ImportRow] = []
    for number, cells in table:
        raw = {_ALIASES[k.strip().lower()]: v for k, v in cells.items() if k.strip().lower() in _ALIASES}
        errors: list[str] = []
        row = ImportRow(row=number, errors=errors)

        serial = _text(raw.get("serial_number"))
        device = None
        if not serial:
            errors.append("ต้องระบุซีเรียล")
        else:
            serial = serial.upper()
            if serial in seen_serials:
                errors.append(f"ซีเรียลซ้ำกับแถว {seen_serials[serial]} ในไฟล์")
            else:
                seen_serials[serial] = number
                device = await uow.devices.get_by_serial(serial)
                if device is None:
                    errors.append(f"ไม่พบอุปกรณ์ '{serial}'")
                elif device.status != DeviceStatus.CHECKED_OUT:
                    errors.append(
                        f"อุปกรณ์ต้องอยู่ในสถานะ '{STATUS_LABELS_TH[DeviceStatus.CHECKED_OUT]}' "
                        f"(ปัจจุบัน: '{STATUS_LABELS_TH[device.status]}')"
                    )
                else:
                    row.device_id = device.id
        row.serial_number = serial

        customer_name = _text(raw.get("customer"))
        if not customer_name:
            errors.append("ต้องระบุลูกค้า")
        else:
            matches = customers_by_name.get(customer_name.lower(), [])
            active = [c for c in matches if c.is_active]
            if not matches:
                errors.append(f"ไม่พบลูกค้า '{customer_name}'")
            elif not active:
                errors.append(f"ลูกค้า '{customer_name}' ถูกระงับการใช้งาน")
            elif len(active) > 1:
                errors.append(f"พบลูกค้าชื่อ '{customer_name}' มากกว่า 1 ราย กรุณาระบุให้ชัดเจน")
            else:
                customer = active[0]
                if device is not None and device.tenant_id is not None and customer.tenant_id != device.tenant_id:
                    errors.append("ลูกค้าและอุปกรณ์ต้องอยู่ในกลุ่มลูกค้าเดียวกัน")
                else:
                    row.customer_id = customer.id
        row.customer = customer_name

        if raw.get("install_date") in (None, ""):
            errors.append("ต้องระบุวันที่ติดตั้ง")
        else:
            row.install_date = _date(raw.get("install_date"), "วันที่ติดตั้ง", errors)

        if raw.get("latitude") in (None, ""):
            errors.append("ต้องระบุละติจูด")
        else:
            row.latitude = _coord(raw.get("latitude"), "ละติจูด", -90, 90, errors)

        if raw.get("longitude") in (None, ""):
            errors.append("ต้องระบุลองจิจูด")
        else:
            row.longitude = _coord(raw.get("longitude"), "ลองจิจูด", -180, 180, errors)

        address = _text(raw.get("address"))
        if address and len(address) > 2000:
            errors.append("ที่อยู่ยาวเกิน 2000 ตัวอักษร")
        row.address = address

        site_contact = _text(raw.get("site_contact"))
        if site_contact and len(site_contact) > 200:
            errors.append("ผู้ติดต่อหน้างานยาวเกิน 200 ตัวอักษร")
        row.site_contact = site_contact

        site_phone = _text(raw.get("site_phone"))
        if site_phone and len(site_phone) > 50:
            errors.append("โทรศัพท์หน้างานยาวเกิน 50 ตัวอักษร")
        row.site_phone = site_phone

        notes = _text(raw.get("notes"))
        if notes and len(notes) > 2000:
            errors.append("หมายเหตุยาวเกิน 2000 ตัวอักษร")
        row.notes = notes

        rows.append(row)
    return rows


async def import_installations(
    uow: UnitOfWork, actor: Actor, table: list[tuple[int, dict[str, Any]]], *, dry_run: bool
) -> ImportResult:
    require_write(actor.role)
    rows = await _validate(uow, actor, table)
    if dry_run:
        return ImportResult(rows=rows, committed=False)

    invalid = [r.row for r in rows if r.errors]
    if invalid:
        raise ValidationError(f"มี {len(invalid)} แถวที่ไม่ถูกต้อง (เช่น แถว {invalid[0]}) แก้ไขแล้วลองอีกครั้ง")

    for r in rows:
        assert (
            r.device_id
            and r.customer_id
            and r.install_date
            and r.latitude is not None
            and r.longitude is not None
        )
        await inventory.install(
            uow,
            actor,
            device_id=r.device_id,
            customer_id=r.customer_id,
            install_date=r.install_date,
            latitude=r.latitude,
            longitude=r.longitude,
            address=r.address,
            site_contact=r.site_contact,
            site_phone=r.site_phone,
            notes=r.notes,
        )
    return ImportResult(rows=rows, committed=True)
