from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from geoalchemy2 import Geography
from sqlalchemy import Computed, Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, deferred, mapped_column


class Base(DeclarativeBase):
    pass


class TenantORM(Base):
    __tablename__ = "tenants"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str]
    code: Mapped[str]
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserORM(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID | None] = mapped_column(ForeignKey("tenants.id"))
    email: Mapped[str]
    full_name: Mapped[str]
    role: Mapped[str] = mapped_column(String)
    password_hash: Mapped[str]
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DeviceModelORM(Base):
    __tablename__ = "device_models"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    brand: Mapped[str]
    name: Mapped[str]
    device_type: Mapped[str]
    firmware_version: Mapped[str | None]
    description: Mapped[str | None]


class SupplierORM(Base):
    __tablename__ = "suppliers"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str]
    contact_person: Mapped[str | None]
    phone: Mapped[str | None]
    email: Mapped[str | None]
    notes: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DeviceORM(Base):
    __tablename__ = "devices"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    serial_number: Mapped[str]
    mac_address: Mapped[str | None]
    model_id: Mapped[UUID] = mapped_column(ForeignKey("device_models.id"))
    tenant_id: Mapped[UUID | None] = mapped_column(ForeignKey("tenants.id"))
    status: Mapped[str] = mapped_column(String)
    purchase_date: Mapped[date | None] = mapped_column(Date)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    warranty_end: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None]
    loan_due_date: Mapped[date | None] = mapped_column(Date)
    asset_tag: Mapped[str | None]
    firmware_version: Mapped[str | None]
    supplier_id: Mapped[UUID | None] = mapped_column(ForeignKey("suppliers.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CustomerORM(Base):
    __tablename__ = "customers"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    company_name: Mapped[str]
    contact_person: Mapped[str | None]
    phone: Mapped[str | None]
    email: Mapped[str | None]
    service_level: Mapped[str] = mapped_column(String)
    address: Mapped[str | None]
    tax_id: Mapped[str | None]
    notes: Mapped[str | None]
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InventoryTransactionORM(Base):
    __tablename__ = "inventory_transactions"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    device_id: Mapped[UUID] = mapped_column(ForeignKey("devices.id"))
    tenant_id: Mapped[UUID | None] = mapped_column(ForeignKey("tenants.id"))
    from_tenant_id: Mapped[UUID | None] = mapped_column(ForeignKey("tenants.id"))
    transaction_type: Mapped[str] = mapped_column(String)
    from_status: Mapped[str | None]
    to_status: Mapped[str]
    customer_id: Mapped[UUID | None] = mapped_column(ForeignKey("customers.id"))
    supplier_id: Mapped[UUID | None] = mapped_column(ForeignKey("suppliers.id"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None]
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InstallationORM(Base):
    __tablename__ = "installations"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    device_id: Mapped[UUID] = mapped_column(ForeignKey("devices.id"))
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id"))
    install_date: Mapped[date] = mapped_column(Date)
    latitude: Mapped[float]
    longitude: Mapped[float]
    location = deferred(
        mapped_column(
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            Computed("ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography", persisted=True),
        )
    )
    address: Mapped[str | None]
    site_contact: Mapped[str | None]
    site_phone: Mapped[str | None]
    notes: Mapped[str | None]
    removal_reason: Mapped[str | None]
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PhotoORM(Base):
    __tablename__ = "photos"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID | None] = mapped_column(ForeignKey("tenants.id"))
    owner_type: Mapped[str] = mapped_column(String)
    owner_id: Mapped[UUID]
    content_type: Mapped[str]
    size_bytes: Mapped[int]
    width: Mapped[int]
    height: Mapped[int]
    caption: Mapped[str | None]
    uploaded_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
