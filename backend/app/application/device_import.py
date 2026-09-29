"""Bulk check-in from a spreadsheet: validate every row, then save all rows in one transaction or none."""

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.application import inventory
from app.application.context import Actor
from app.domain.errors import ConflictError, ValidationError
from app.domain.ports import UnitOfWork
from app.domain.rules import require_write

MAX_ROWS = 1000
MAC_RE = re.compile(r"^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$")
# Buddhist-era years (e.g. 2569) are common in Thai spreadsheets.
BUDDHIST_ERA_OFFSET = 543

# Template headers, in order; each field also accepts the English key as a header.
COLUMNS: list[tuple[str, str]] = [
    ("serial_number", "ซีเรียล"),
    ("model", "รุ่น"),
    ("mac_address", "MAC"),
    ("purchase_date", "วันที่ซื้อ"),
    ("cost", "ต้นทุน"),
    ("warranty_end", "หมดประกัน"),
    ("notes", "หมายเหตุ"),
    ("asset_tag", "รหัสทรัพย์สิน"),
    ("firmware_version", "เฟิร์มแวร์"),
    ("supplier", "ผู้จำหน่าย"),
    ("tenant_code", "รหัสกลุ่มลูกค้า"),
]
_ALIASES = {alias.lower(): key for key, th in COLUMNS for alias in (key, th)}


@dataclass
class ImportRow:
    row: int
    serial_number: str | None = None
    model: str | None = None
    mac_address: str | None = None
    purchase_date: date | None = None
    cost: Decimal | None = None
    warranty_end: date | None = None
    notes: str | None = None
    asset_tag: str | None = None
    firmware_version: str | None = None
    supplier: str | None = None
    tenant_code: str | None = None
    errors: list[str] = field(default_factory=list)


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


def template_headers(include_tenant: bool) -> list[str]:
    return [th for key, th in COLUMNS if include_tenant or key != "tenant_code"]


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


def _cost(value: Any, errors: list[str]) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        amount = Decimal(str(value).replace(",", "").strip())
    except InvalidOperation:
        errors.append("ต้นทุนต้องเป็นตัวเลข")
        return None
    if amount < 0 or amount >= Decimal("1e10"):
        errors.append("ต้นทุนต้องไม่ติดลบและไม่เกิน 9,999,999,999.99")
        return None
    return amount.quantize(Decimal("0.01"))


async def _validate(uow: UnitOfWork, actor: Actor, table: list[tuple[int, dict[str, Any]]]) -> list[ImportRow]:
    if not table:
        raise ValidationError("ไม่พบข้อมูลในไฟล์ (แถวแรกต้องเป็นหัวคอลัมน์)")
    if len(table) > MAX_ROWS:
        raise ValidationError(f"นำเข้าได้ครั้งละไม่เกิน {MAX_ROWS} แถว")

    headers = {_ALIASES.get(h.strip().lower()) for h in table[0][1]}
    if not {"serial_number", "model"} <= headers:
        raise ValidationError("ไฟล์ต้องมีคอลัมน์ 'ซีเรียล' และ 'รุ่น' (ดาวน์โหลดไฟล์แม่แบบเพื่อดูรูปแบบ)")

    models: dict[str, Any] = {}
    for m in await uow.device_models.list():
        models[m.name.lower()] = m.id
        models[f"{m.brand} {m.name}".lower()] = m.id
    tenants = {t.code.upper(): t for t in await uow.tenants.list()} if actor.is_superadmin else {}
    suppliers = {s.name.lower() for s in await uow.suppliers.list()}

    seen: dict[str, int] = {}
    seen_tags: dict[str, int] = {}
    rows: list[ImportRow] = []
    for number, cells in table:
        raw = {_ALIASES[k.strip().lower()]: v for k, v in cells.items() if k.strip().lower() in _ALIASES}
        errors: list[str] = []
        row = ImportRow(row=number, errors=errors)

        serial = _text(raw.get("serial_number"))
        if not serial:
            errors.append("ต้องระบุซีเรียล")
        else:
            serial = serial.upper()
            if not 3 <= len(serial) <= 64:
                errors.append("ซีเรียลต้องยาว 3-64 ตัวอักษร")
            elif serial in seen:
                errors.append(f"ซีเรียลซ้ำกับแถว {seen[serial]} ในไฟล์")
            elif await uow.devices.exists_serial(serial):
                errors.append("ซีเรียลนี้มีอยู่ในระบบแล้ว")
            seen.setdefault(serial, number)
        row.serial_number = serial

        row.model = _text(raw.get("model"))
        if not row.model:
            errors.append("ต้องระบุรุ่น")
        elif row.model.lower() not in models:
            errors.append(f"ไม่พบรุ่น '{row.model}'")

        mac = _text(raw.get("mac_address"))
        if mac:
            mac = mac.upper()
            if not MAC_RE.match(mac):
                errors.append("MAC ต้องอยู่ในรูปแบบ 00:11:22:33:44:55")
        row.mac_address = mac

        row.purchase_date = _date(raw.get("purchase_date"), "วันที่ซื้อ", errors)
        row.warranty_end = _date(raw.get("warranty_end"), "วันหมดประกัน", errors)
        if row.purchase_date and row.warranty_end and row.warranty_end < row.purchase_date:
            errors.append("วันหมดประกันต้องไม่ก่อนวันที่ซื้อ")
        row.cost = _cost(raw.get("cost"), errors)

        notes = _text(raw.get("notes"))
        if notes and len(notes) > 2000:
            errors.append("หมายเหตุยาวเกิน 2000 ตัวอักษร")
        row.notes = notes

        tag = _text(raw.get("asset_tag"))
        if tag:
            tag = tag.upper()
            if len(tag) > 50:
                errors.append("รหัสทรัพย์สินยาวเกิน 50 ตัวอักษร")
            elif tag in seen_tags:
                errors.append(f"รหัสทรัพย์สินซ้ำกับแถว {seen_tags[tag]} ในไฟล์")
            seen_tags.setdefault(tag, number)
        row.asset_tag = tag

        firmware = _text(raw.get("firmware_version"))
        if firmware and len(firmware) > 50:
            errors.append("เฟิร์มแวร์ยาวเกิน 50 ตัวอักษร")
        row.firmware_version = firmware

        supplier = _text(raw.get("supplier"))
        if supplier and supplier.lower() not in suppliers:
            errors.append(f"ไม่พบผู้จำหน่าย '{supplier}'")
        row.supplier = supplier

        if actor.is_superadmin:
            code = _text(raw.get("tenant_code"))
            if code and code.upper() not in tenants:
                errors.append(f"ไม่พบรหัสกลุ่มลูกค้า '{code}'")
            row.tenant_code = code.upper() if code else None
        rows.append(row)
    return rows


async def import_devices(
    uow: UnitOfWork, actor: Actor, table: list[tuple[int, dict[str, Any]]], *, dry_run: bool
) -> ImportResult:
    require_write(actor.role)
    rows = await _validate(uow, actor, table)
    if dry_run:
        return ImportResult(rows=rows, committed=False)

    invalid = [r.row for r in rows if r.errors]
    if invalid:
        raise ValidationError(f"มี {len(invalid)} แถวที่ไม่ถูกต้อง (เช่น แถว {invalid[0]}) แก้ไขแล้วลองอีกครั้ง")

    models = {m.name.lower(): m.id for m in await uow.device_models.list()}
    models |= {f"{m.brand} {m.name}".lower(): m.id for m in await uow.device_models.list()}
    tenants = {t.code.upper(): t.id for t in await uow.tenants.list()} if actor.is_superadmin else {}
    suppliers = {s.name.lower(): s.id for s in await uow.suppliers.list()}
    for r in rows:
        assert r.serial_number and r.model
        try:
            await inventory.check_in(
                uow,
                actor,
                serial_number=r.serial_number,
                model_id=models[r.model.lower()],
                tenant_id=tenants.get(r.tenant_code) if r.tenant_code else None,
                mac_address=r.mac_address,
                purchase_date=r.purchase_date,
                cost=r.cost,
                warranty_end=r.warranty_end,
                notes=r.notes,
                asset_tag=r.asset_tag,
                firmware_version=r.firmware_version,
                supplier_id=suppliers[r.supplier.lower()] if r.supplier else None,
            )
        except ConflictError as exc:
            # Serials owned by other tenants are hidden by RLS, so they only surface here.
            raise ConflictError(f"แถว {r.row} ({r.serial_number}): {exc}") from exc
    return ImportResult(rows=rows, committed=True)
