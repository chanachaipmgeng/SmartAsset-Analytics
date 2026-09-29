from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from app.domain.enums import DeviceStatus, PhotoOwner, Role, ServiceLevel, TransactionType


@dataclass
class Tenant:
    name: str
    code: str
    is_active: bool = True
    id: UUID = field(default_factory=uuid4)
    created_at: datetime | None = None


@dataclass
class User:
    email: str
    full_name: str
    role: Role
    password_hash: str
    tenant_id: UUID | None = None
    is_active: bool = True
    id: UUID = field(default_factory=uuid4)
    created_at: datetime | None = None


@dataclass
class DeviceModel:
    brand: str
    name: str
    device_type: str
    firmware_version: str | None = None
    description: str | None = None
    id: UUID = field(default_factory=uuid4)


@dataclass
class Supplier:
    """Vendor or repair shop, shared across tenants like device models."""

    name: str
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str | None = None
    id: UUID = field(default_factory=uuid4)


@dataclass
class Device:
    serial_number: str
    model_id: UUID
    status: DeviceStatus = DeviceStatus.IN_STOCK
    tenant_id: UUID | None = None
    mac_address: str | None = None
    purchase_date: date | None = None
    cost: Decimal | None = None
    warranty_end: date | None = None
    notes: str | None = None
    loan_due_date: date | None = None
    asset_tag: str | None = None
    firmware_version: str | None = None
    supplier_id: UUID | None = None
    id: UUID = field(default_factory=uuid4)
    created_at: datetime | None = None


@dataclass
class InventoryTransaction:
    device_id: UUID
    transaction_type: TransactionType
    to_status: DeviceStatus
    user_id: UUID
    tenant_id: UUID | None = None
    from_status: DeviceStatus | None = None
    from_tenant_id: UUID | None = None
    customer_id: UUID | None = None
    supplier_id: UUID | None = None
    note: str | None = None
    id: UUID = field(default_factory=uuid4)
    occurred_at: datetime | None = None


@dataclass
class Customer:
    tenant_id: UUID
    company_name: str
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    service_level: ServiceLevel = ServiceLevel.STANDARD
    address: str | None = None
    tax_id: str | None = None
    notes: str | None = None
    is_active: bool = True
    id: UUID = field(default_factory=uuid4)
    created_at: datetime | None = None


@dataclass
class Installation:
    device_id: UUID
    tenant_id: UUID
    customer_id: UUID
    install_date: date
    latitude: float
    longitude: float
    address: str | None = None
    site_contact: str | None = None
    site_phone: str | None = None
    notes: str | None = None
    removal_reason: str | None = None
    removed_at: datetime | None = None
    id: UUID = field(default_factory=uuid4)

    @property
    def is_active(self) -> bool:
        return self.removed_at is None


@dataclass
class Photo:
    """Image attached to a device, installation, transaction, user (avatar) or device model.

    `tenant_id` follows the owner so RLS applies; the files live in media storage under `id`.
    """

    owner_type: PhotoOwner
    owner_id: UUID
    content_type: str
    size_bytes: int
    width: int
    height: int
    uploaded_by: UUID
    tenant_id: UUID | None = None
    caption: str | None = None
    id: UUID = field(default_factory=uuid4)
    created_at: datetime | None = None
