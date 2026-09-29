from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.application.bulk import BULK_MAX_DEVICES, BulkAction
from app.domain.enums import AuditAction, AuditEntity, DeviceStatus, PhotoOwner, Role, ServiceLevel, TransactionType

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text = Annotated[str, StringConstraints(max_length=2000)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]
Mac = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$")]
AssetTag = Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)]
Firmware = Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)]
TaxId = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[0-9]{13}$")]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
PhoneText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)]


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth ----
class LoginIn(BaseModel):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class RefreshIn(BaseModel):
    refresh_token: str


class ChangePasswordIn(BaseModel):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    new_password: Password


class UserOut(Out):
    id: UUID
    email: str
    full_name: str
    role: Role
    tenant_id: UUID | None
    is_active: bool


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- tenants / users ----
class TenantIn(BaseModel):
    name: Name
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")]


class TenantPatch(BaseModel):
    name: Name | None = None
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")] | None = None
    is_active: bool | None = None


class TenantOut(Out):
    id: UUID
    name: str
    code: str
    is_active: bool


class UserIn(BaseModel):
    email: EmailStr
    full_name: Name
    role: Role
    password: Password
    tenant_id: UUID | None = None


class UserPatch(BaseModel):
    full_name: Name | None = None
    role: Role | None = None
    password: Password | None = None
    tenant_id: UUID | None = None
    is_active: bool | None = None


# ---- device models ----
class DeviceModelIn(BaseModel):
    brand: Name
    name: Name
    device_type: Name
    firmware_version: Annotated[str, StringConstraints(max_length=50)] | None = None
    description: Text | None = None


class DeviceModelPatch(BaseModel):
    brand: Name | None = None
    name: Name | None = None
    device_type: Name | None = None
    firmware_version: Annotated[str, StringConstraints(max_length=50)] | None = None
    description: Text | None = None


class DeviceModelOut(Out):
    id: UUID
    brand: str
    name: str
    device_type: str
    firmware_version: str | None
    description: str | None


# ---- suppliers ----
Phone = Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)]


class SupplierIn(BaseModel):
    name: Name
    contact_person: Name | None = None
    phone: Phone | None = None
    email: EmailStr | None = None
    notes: Text | None = None


class SupplierPatch(BaseModel):
    name: Name | None = None
    contact_person: Name | None = None
    phone: Phone | None = None
    email: EmailStr | None = None
    notes: Text | None = None


class SupplierOut(Out):
    id: UUID
    name: str
    contact_person: str | None
    phone: str | None
    email: str | None
    notes: str | None


# ---- devices / inventory ----
class DeviceIn(BaseModel):
    serial_number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=64)]
    model_id: UUID
    tenant_id: UUID | None = None
    mac_address: Mac | None = None
    purchase_date: date | None = None
    cost: Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)] | None = None
    warranty_end: date | None = None
    notes: Text | None = None
    asset_tag: AssetTag | None = None
    firmware_version: Firmware | None = None
    supplier_id: UUID | None = None


class DevicePatch(BaseModel):
    model_id: UUID | None = None
    mac_address: Mac | None = None
    purchase_date: date | None = None
    cost: Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)] | None = None
    warranty_end: date | None = None
    notes: Text | None = None
    asset_tag: AssetTag | None = None
    firmware_version: Firmware | None = None
    supplier_id: UUID | None = None


class DeviceOut(Out):
    id: UUID
    serial_number: str
    mac_address: str | None
    model_id: UUID
    model_name: str
    brand: str
    tenant_id: UUID | None
    tenant_name: str | None
    status: DeviceStatus
    purchase_date: date | None
    cost: Decimal | None
    warranty_end: date | None
    notes: str | None
    created_at: datetime
    loan_due_date: date | None = None
    asset_tag: str | None = None
    firmware_version: str | None = None
    supplier_id: UUID | None = None
    supplier_name: str | None = None


class MovementIn(BaseModel):
    device_id: UUID
    note: Text | None = None


class TransferIn(MovementIn):
    target_tenant_id: UUID | None = None


class LoanIn(MovementIn):
    due_date: date


class SendRepairIn(MovementIn):
    supplier_id: UUID | None = None


class BulkIn(BaseModel):
    action: BulkAction
    device_ids: Annotated[list[UUID], Field(min_length=1, max_length=BULK_MAX_DEVICES)]
    note: Text | None = None
    target_tenant_id: UUID | None = None
    supplier_id: UUID | None = None
    due_date: date | None = None


class BulkMovedOut(Out):
    device: DeviceOut
    transaction_id: UUID


class BulkOut(BaseModel):
    count: int
    items: list[BulkMovedOut]


class QcFailIn(BaseModel):
    device_id: UUID
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ImportRowOut(Out):
    row: int
    serial_number: str | None
    model: str | None
    mac_address: str | None
    purchase_date: date | None
    cost: Decimal | None
    warranty_end: date | None
    notes: str | None
    tenant_code: str | None
    asset_tag: str | None = None
    firmware_version: str | None = None
    supplier: str | None = None
    errors: list[str]


class ImportResultOut(Out):
    total: int
    valid: int
    invalid: int
    committed: bool
    rows: list[ImportRowOut]


class RepairDoneIn(BaseModel):
    device_id: UUID
    qc_note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class TransactionOut(Out):
    id: UUID
    device_id: UUID
    serial_number: str
    transaction_type: TransactionType
    from_status: DeviceStatus | None
    to_status: DeviceStatus
    tenant_id: UUID | None
    tenant_name: str | None
    customer_name: str | None
    user_name: str
    note: str | None
    occurred_at: datetime
    supplier_name: str | None = None
    customer_id: UUID | None = None


class CountOut(Out):
    key: str
    label: str
    count: int


class StockSummaryOut(BaseModel):
    by_status: list[CountOut]
    by_model: list[CountOut]


# ---- customers / installations ----
class CustomerIn(BaseModel):
    company_name: Name
    contact_person: Annotated[str, StringConstraints(max_length=200)] | None = None
    phone: Annotated[str, StringConstraints(max_length=50)] | None = None
    email: EmailStr | None = None
    service_level: ServiceLevel = ServiceLevel.STANDARD
    tenant_id: UUID | None = None
    address: Text | None = None
    tax_id: TaxId | None = None
    notes: Text | None = None


class CustomerPatch(BaseModel):
    company_name: Name | None = None
    contact_person: Annotated[str, StringConstraints(max_length=200)] | None = None
    phone: Annotated[str, StringConstraints(max_length=50)] | None = None
    email: EmailStr | None = None
    service_level: ServiceLevel | None = None
    is_active: bool | None = None
    address: Text | None = None
    tax_id: TaxId | None = None
    notes: Text | None = None


class CustomerOut(Out):
    id: UUID
    tenant_id: UUID
    company_name: str
    contact_person: str | None
    phone: str | None
    email: str | None
    service_level: ServiceLevel
    is_active: bool
    address: str | None = None
    tax_id: str | None = None
    notes: str | None = None


class CustomerSummaryOut(Out):
    active_installations: int
    total_installations: int
    devices_by_status: list[CountOut]
    under_warranty: int


class CustomerDetailOut(CustomerOut):
    summary: CustomerSummaryOut


class InstallationIn(BaseModel):
    device_id: UUID
    customer_id: UUID
    install_date: date
    latitude: Latitude
    longitude: Longitude
    address: Text | None = None
    site_contact: Short | None = None
    site_phone: PhoneText | None = None
    notes: Text | None = None


class InstallationPatch(BaseModel):
    install_date: date | None = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    address: Text | None = None
    site_contact: Short | None = None
    site_phone: PhoneText | None = None
    notes: Text | None = None


class InstallationOut(Out):
    id: UUID
    device_id: UUID
    serial_number: str
    model_name: str
    tenant_id: UUID
    customer_id: UUID
    customer_name: str
    service_level: ServiceLevel
    install_date: date
    latitude: float
    longitude: float
    address: str | None
    removed_at: datetime | None
    distance_m: float | None = None
    site_contact: str | None = None
    site_phone: str | None = None
    notes: str | None = None
    removal_reason: str | None = None


class ActivityDayOut(Out):
    day: date
    counts: dict[TransactionType, int]
    total: int


class AgedDeviceOut(Out):
    device: DeviceOut
    since: datetime
    days: int


class StockBalanceOut(Out):
    model_id: UUID
    brand: str
    model_name: str
    tenant_id: UUID | None
    tenant_name: str | None
    status: DeviceStatus
    count: int
    total_cost: Decimal


class DashboardOut(Out):
    total_devices: int
    by_status: list[CountOut]
    by_model: list[CountOut]
    warranty_expiring: list[DeviceOut]
    installations: list[InstallationOut]
    activity_30d: list[ActivityDayOut]
    recent_transactions: list[TransactionOut]
    pending_qc: int
    loan_overdue: list[DeviceOut]
    repair_aging: list[AgedDeviceOut]


# ---- photos ----
class PhotoOut(BaseModel):
    id: UUID
    owner_type: PhotoOwner
    owner_id: UUID
    caption: str | None
    width: int
    height: int
    size_bytes: int
    uploaded_by: UUID
    created_at: datetime | None
    url: str
    thumb_url: str


# ---- audit ----
class AuditOut(Out):
    id: UUID
    tenant_id: UUID | None
    tenant_name: str | None
    user_id: UUID
    user_name: str
    entity_type: AuditEntity
    entity_id: UUID
    entity_label: str | None
    action: AuditAction
    changes: dict[str, Any]
    occurred_at: datetime
