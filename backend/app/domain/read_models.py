from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from app.domain.enums import DeviceStatus, ServiceLevel, TransactionType


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
