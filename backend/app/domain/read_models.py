from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.domain.enums import AuditAction, AuditEntity, DeviceStatus, RepairOrderStatus, ServiceLevel, TransactionType


@dataclass(frozen=True)
class DeviceView:
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


# Keys accepted by `GET /devices?sort=`; prefix with "-" for descending.
DEVICE_SORT_FIELDS = frozenset(
    {
        "serial_number",
        "brand",
        "model_name",
        "status",
        "tenant_name",
        "mac_address",
        "purchase_date",
        "warranty_end",
        "cost",
        "created_at",
        "asset_tag",
    }
)


@dataclass(frozen=True)
class AgedDevice:
    """A device with the time it entered its current status (last status-changing movement)."""

    device: DeviceView
    since: datetime
    days: int


@dataclass(frozen=True)
class TransactionView:
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


@dataclass(frozen=True)
class InstallationView:
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


@dataclass(frozen=True)
class CustomerSummary:
    active_installations: int
    total_installations: int
    # Current status of every device ever installed for the customer.
    devices_by_status: list["CountItem"]
    # Devices installed now whose warranty has not ended.
    under_warranty: int


@dataclass(frozen=True)
class RepairOrderView:
    id: UUID
    tenant_id: UUID | None
    device_id: UUID
    serial_number: str
    supplier_id: UUID | None
    supplier_name: str | None
    opened_by: UUID
    opened_by_name: str
    opened_tx_id: UUID | None
    closed_tx_id: UUID | None
    status: RepairOrderStatus
    defect_note: str
    parts: str | None
    labor_cost: Decimal | None
    parts_cost: Decimal | None
    due_date: date | None
    assignee_name: str | None
    closed_at: datetime | None
    qc_note: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class AuditView:
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


@dataclass(frozen=True)
class CountItem:
    key: str
    label: str
    count: int


@dataclass(frozen=True)
class StockBalanceRow:
    model_id: UUID
    brand: str
    model_name: str
    tenant_id: UUID | None
    tenant_name: str | None
    status: DeviceStatus
    count: int
    total_cost: Decimal


@dataclass(frozen=True)
class DailyCount:
    day: date
    transaction_type: TransactionType
    count: int
