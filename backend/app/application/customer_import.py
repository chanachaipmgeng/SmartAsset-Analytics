"""Bulk customer create from a spreadsheet: validate every row, then save all or none."""

import re
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.application import customers
from app.application.context import Actor
from app.domain.enums import ServiceLevel
from app.domain.errors import ValidationError
from app.domain.ports import UnitOfWork
from app.domain.rules import require_write

MAX_ROWS = 1000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TAX_ID_RE = re.compile(r"^[0-9]{13}$")

SERVICE_LEVEL_ALIASES: dict[str, ServiceLevel] = {
    "BASIC": ServiceLevel.BASIC,
    "STANDARD": ServiceLevel.STANDARD,
    "PREMIUM": ServiceLevel.PREMIUM,
    "พื้นฐาน": ServiceLevel.BASIC,
    "มาตรฐาน": ServiceLevel.STANDARD,
    "พรีเมียม": ServiceLevel.PREMIUM,
}

COLUMNS: list[tuple[str, str]] = [
    ("company_name", "ชื่อบริษัท"),
    ("contact_person", "ผู้ติดต่อ"),
    ("phone", "โทรศัพท์"),
    ("email", "อีเมล"),
    ("service_level", "ระดับบริการ"),
    ("address", "ที่อยู่"),
    ("tax_id", "เลขประจำตัวผู้เสียภาษี"),
    ("notes", "หมายเหตุ"),
    ("tenant_code", "รหัสกลุ่มลูกค้า"),
]
_ALIASES = {alias.lower(): key for key, th in COLUMNS for alias in (key, th)}


@dataclass
class ImportRow:
    row: int
    company_name: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    service_level: ServiceLevel | None = None
    address: str | None = None
    tax_id: str | None = None
    notes: str | None = None
    tenant_code: str | None = None
    errors: list[str] = field(default_factory=list)
    tenant_id: UUID | None = field(default=None, repr=False)


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


def _service_level(value: Any, errors: list[str]) -> ServiceLevel:
    text = _text(value)
    if not text:
        return ServiceLevel.STANDARD
    level = SERVICE_LEVEL_ALIASES.get(text.upper()) or SERVICE_LEVEL_ALIASES.get(text)
    if level is None:
        errors.append("ระดับบริการต้องเป็น BASIC/STANDARD/PREMIUM หรือ พื้นฐาน/มาตรฐาน/พรีเมียม")
        return ServiceLevel.STANDARD
    return level


async def _validate(uow: UnitOfWork, actor: Actor, table: list[tuple[int, dict[str, Any]]]) -> list[ImportRow]:
    if not table:
        raise ValidationError("ไม่พบข้อมูลในไฟล์ (แถวแรกต้องเป็นหัวคอลัมน์)")
    if len(table) > MAX_ROWS:
        raise ValidationError(f"นำเข้าได้ครั้งละไม่เกิน {MAX_ROWS} แถว")

    headers = {_ALIASES.get(h.strip().lower()) for h in table[0][1]}
    if "company_name" not in headers:
        raise ValidationError("ไฟล์ต้องมีคอลัมน์ 'ชื่อบริษัท' (ดาวน์โหลดไฟล์แม่แบบเพื่อดูรูปแบบ)")

    tenants = {t.code.upper(): t for t in await uow.tenants.list()} if actor.is_superadmin else {}
    seen: dict[tuple[str, str], int] = {}
    rows: list[ImportRow] = []
    for number, cells in table:
        raw = {_ALIASES[k.strip().lower()]: v for k, v in cells.items() if k.strip().lower() in _ALIASES}
        errors: list[str] = []
        row = ImportRow(row=number, errors=errors)

        company = _text(raw.get("company_name"))
        if not company:
            errors.append("ต้องระบุชื่อบริษัท")
        elif len(company) > 200:
            errors.append("ชื่อบริษัทยาวเกิน 200 ตัวอักษร")
        row.company_name = company

        contact = _text(raw.get("contact_person"))
        if contact and len(contact) > 200:
            errors.append("ผู้ติดต่อยาวเกิน 200 ตัวอักษร")
        row.contact_person = contact

        phone = _text(raw.get("phone"))
        if phone and len(phone) > 50:
            errors.append("โทรศัพท์ยาวเกิน 50 ตัวอักษร")
        row.phone = phone

        email = _text(raw.get("email"))
        if email:
            if len(email) > 254 or not EMAIL_RE.match(email):
                errors.append("อีเมลไม่ถูกต้อง")
        row.email = email

        row.service_level = _service_level(raw.get("service_level"), errors)

        address = _text(raw.get("address"))
        if address and len(address) > 2000:
            errors.append("ที่อยู่ยาวเกิน 2000 ตัวอักษร")
        row.address = address

        tax_id = _text(raw.get("tax_id"))
        if tax_id and not TAX_ID_RE.match(tax_id):
            errors.append("เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก")
        row.tax_id = tax_id

        notes = _text(raw.get("notes"))
        if notes and len(notes) > 2000:
            errors.append("หมายเหตุยาวเกิน 2000 ตัวอักษร")
        row.notes = notes

        tenant_key = ""
        if actor.is_superadmin:
            code = _text(raw.get("tenant_code"))
            if not code:
                errors.append("ต้องระบุรหัสกลุ่มลูกค้า")
            elif code.upper() not in tenants:
                errors.append(f"ไม่พบรหัสกลุ่มลูกค้า '{code}'")
            else:
                row.tenant_code = code.upper()
                row.tenant_id = tenants[code.upper()].id
                tenant_key = code.upper()
        else:
            assert actor.tenant_id is not None
            row.tenant_id = actor.tenant_id
            tenant_key = str(actor.tenant_id)

        if company and tenant_key:
            key = (tenant_key, company.lower())
            if key in seen:
                errors.append(f"ชื่อบริษัทซ้ำกับแถว {seen[key]} ในไฟล์")
            else:
                seen[key] = number

        rows.append(row)
    return rows


async def import_customers(
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
        assert r.company_name and r.service_level is not None
        await customers.create_customer(
            uow,
            actor,
            tenant_id=r.tenant_id,
            company_name=r.company_name,
            contact_person=r.contact_person,
            phone=r.phone,
            email=r.email,
            service_level=r.service_level,
            address=r.address,
            tax_id=r.tax_id,
            notes=r.notes,
        )
    return ImportResult(rows=rows, committed=True)
