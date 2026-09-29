from dataclasses import fields
from datetime import date
from typing import Any, TypeVar
from uuid import UUID

from geoalchemy2 import Geography
from sqlalchemy import Select, cast, func, or_, select
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import (
    Customer,
    Device,
    DeviceModel,
    Installation,
    InventoryTransaction,
    Tenant,
    User,
)
from app.domain.enums import DeviceStatus, Role, ServiceLevel, TransactionType
from app.domain.errors import ConflictError, PermissionDeniedError
from app.domain.read_models import CountItem, DeviceView, InstallationView, TransactionView
from app.domain.rules import STATUS_LABELS_TH
from app.infrastructure.db.models import (
    CustomerORM,
    DeviceModelORM,
    DeviceORM,
    InstallationORM,
    InventoryTransactionORM,
    TenantORM,
    UserORM,
)

E = TypeVar("E")

ENUM_FIELDS: dict[str, type] = {
    "role": Role,
    "status": DeviceStatus,
    "service_level": ServiceLevel,
    "transaction_type": TransactionType,
    "from_status": DeviceStatus,
    "to_status": DeviceStatus,
}

CONSTRAINT_MESSAGES = {
    "devices_serial_number_key": "หมายเลขซีเรียลนี้มีอยู่ในระบบแล้ว",
    "users_email_lower_uq": "อีเมลนี้ถูกใช้งานแล้ว",
    "tenants_code_key": "รหัสกลุ่มลูกค้านี้ถูกใช้งานแล้ว",
    "device_models_brand_name_uq": "รุ่นอุปกรณ์นี้มีอยู่แล้ว",
    "installations_active_device_uq": "อุปกรณ์นี้มีจุดติดตั้งที่ใช้งานอยู่แล้ว",
}


def _to_entity(cls: type[E], row: Any) -> E:
    values = {}
    for f in fields(cls):  # type: ignore[arg-type]
        value = getattr(row, f.name)
        enum_cls = ENUM_FIELDS.get(f.name)
        if enum_cls is not None and value is not None:
            value = enum_cls(value)
        values[f.name] = value
    return cls(**values)


def _to_columns(entity: Any, orm_cls: type) -> dict[str, Any]:
    columns = orm_cls.__table__.columns.keys()
    result = {}
    for f in fields(entity):
        if f.name in columns:
            value = getattr(entity, f.name)
            if f.name in ("created_at", "occurred_at") and value is None:
                continue
            result[f.name] = value.value if hasattr(value, "value") else value
    return result


class _Repo:
    orm: type
    entity: type

    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def _get(self, id_: UUID) -> Any:
        row = await self.s.get(self.orm, id_)
        return _to_entity(self.entity, row) if row else None

    async def _list(self, stmt: Select) -> list[Any]:
        return [_to_entity(self.entity, r) for r in (await self.s.scalars(stmt)).all()]

    async def add(self, entity: Any) -> None:
        self.s.add(self.orm(**_to_columns(entity, self.orm)))

    async def update(self, entity: Any) -> None:
        row = await self.s.get(self.orm, entity.id)
        for key, value in _to_columns(entity, self.orm).items():
            setattr(row, key, value)


class SqlTenantRepository(_Repo):
    orm, entity = TenantORM, Tenant

    async def get(self, tenant_id: UUID) -> Tenant | None:
        return await self._get(tenant_id)

    async def get_by_code(self, code: str) -> Tenant | None:
        rows = await self._list(select(TenantORM).where(TenantORM.code == code))
        return rows[0] if rows else None

    async def list(self) -> list[Tenant]:
        return await self._list(select(TenantORM).order_by(TenantORM.name))


class SqlUserRepository(_Repo):
    orm, entity = UserORM, User

    async def get(self, user_id: UUID) -> User | None:
        return await self._get(user_id)

    async def get_by_email(self, email: str) -> User | None:
        rows = await self._list(select(UserORM).where(func.lower(UserORM.email) == email.lower()))
        return rows[0] if rows else None

    async def list(self) -> list[User]:
        return await self._list(select(UserORM).order_by(UserORM.full_name))


class SqlDeviceModelRepository(_Repo):
    orm, entity = DeviceModelORM, DeviceModel

    async def get(self, model_id: UUID) -> DeviceModel | None:
        return await self._get(model_id)

    async def list(self) -> list[DeviceModel]:
        return await self._list(select(DeviceModelORM).order_by(DeviceModelORM.brand, DeviceModelORM.name))

    async def delete(self, model_id: UUID) -> None:
        row = await self.s.get(DeviceModelORM, model_id)
        if row:
            await self.s.delete(row)

    async def is_in_use(self, model_id: UUID) -> bool:
        return bool(await self.s.scalar(select(func.count()).where(DeviceORM.model_id == model_id)))


def _device_view_stmt() -> Select:
    return (
        select(DeviceORM, DeviceModelORM.name, DeviceModelORM.brand, TenantORM.name)
        .join(DeviceModelORM, DeviceModelORM.id == DeviceORM.model_id)
        .outerjoin(TenantORM, TenantORM.id == DeviceORM.tenant_id)
    )


def _device_view(row: Any) -> DeviceView:
    d, model_name, brand, tenant_name = row
    return DeviceView(
        id=d.id,
        serial_number=d.serial_number,
        mac_address=d.mac_address,
        model_id=d.model_id,
        model_name=model_name,
        brand=brand,
        tenant_id=d.tenant_id,
        tenant_name=tenant_name,
        status=DeviceStatus(d.status),
        purchase_date=d.purchase_date,
        cost=d.cost,
        warranty_end=d.warranty_end,
        notes=d.notes,
        created_at=d.created_at,
    )


class SqlDeviceRepository(_Repo):
    orm, entity = DeviceORM, Device

    async def get(self, device_id: UUID, *, for_update: bool = False) -> Device | None:
        stmt = select(DeviceORM).where(DeviceORM.id == device_id)
        if for_update:
            stmt = stmt.with_for_update()
        rows = await self._list(stmt)
        return rows[0] if rows else None

    async def get_by_serial(self, serial_number: str) -> Device | None:
        rows = await self._list(select(DeviceORM).where(DeviceORM.serial_number == serial_number))
        return rows[0] if rows else None

    async def exists_serial(self, serial_number: str) -> bool:
        return (await self.get_by_serial(serial_number)) is not None

    async def get_view(self, device_id: UUID) -> DeviceView | None:
        row = (await self.s.execute(_device_view_stmt().where(DeviceORM.id == device_id))).first()
        return _device_view(row) if row else None

    async def list_views(
        self,
        *,
        search: str | None = None,
        status: DeviceStatus | None = None,
        model_id: UUID | None = None,
    ) -> list[DeviceView]:
        stmt = _device_view_stmt()
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    DeviceORM.serial_number.ilike(pattern),
                    DeviceORM.mac_address.ilike(pattern),
                    DeviceModelORM.name.ilike(pattern),
                )
            )
        if status:
            stmt = stmt.where(DeviceORM.status == status.value)
        if model_id:
            stmt = stmt.where(DeviceORM.model_id == model_id)
        rows = await self.s.execute(stmt.order_by(DeviceORM.created_at.desc()))
        return [_device_view(r) for r in rows.all()]

    async def count_by_status(self) -> list[CountItem]:
        rows = await self.s.execute(select(DeviceORM.status, func.count()).group_by(DeviceORM.status))
        counts = dict(rows.all())
        return [CountItem(key=s.value, label=STATUS_LABELS_TH[s], count=counts.get(s.value, 0)) for s in DeviceStatus]

    async def count_by_model(self) -> list[CountItem]:
        rows = await self.s.execute(
            select(DeviceModelORM.id, DeviceModelORM.brand, DeviceModelORM.name, func.count(DeviceORM.id))
            .join(DeviceORM, DeviceORM.model_id == DeviceModelORM.id)
            .where(DeviceORM.status != DeviceStatus.RETIRED.value)
            .group_by(DeviceModelORM.id)
            .order_by(func.count(DeviceORM.id).desc())
        )
        return [CountItem(key=str(i), label=f"{b} {n}", count=c) for i, b, n, c in rows.all()]

    async def warranty_expiring(self, until: date) -> list[DeviceView]:
        stmt = (
            _device_view_stmt()
            .where(DeviceORM.warranty_end.is_not(None), DeviceORM.warranty_end <= until)
            .where(DeviceORM.status != DeviceStatus.RETIRED.value)
            .order_by(DeviceORM.warranty_end)
        )
        return [_device_view(r) for r in (await self.s.execute(stmt)).all()]


class SqlTransactionRepository(_Repo):
    orm, entity = InventoryTransactionORM, InventoryTransaction

    async def list_views(self, *, device_id: UUID | None = None, limit: int = 500) -> list[TransactionView]:
        tx = InventoryTransactionORM
        stmt = (
            select(tx, DeviceORM.serial_number, TenantORM.name, CustomerORM.company_name, UserORM.full_name)
            .join(DeviceORM, DeviceORM.id == tx.device_id)
            # Outer join: RLS hides platform staff from tenant users, but their movements must still show.
            .outerjoin(UserORM, UserORM.id == tx.user_id)
            .outerjoin(TenantORM, TenantORM.id == tx.tenant_id)
            .outerjoin(CustomerORM, CustomerORM.id == tx.customer_id)
            .order_by(tx.occurred_at.desc())
            .limit(limit)
        )
        if device_id:
            stmt = stmt.where(tx.device_id == device_id)
        result = []
        for t, serial, tenant_name, customer_name, user_name in (await self.s.execute(stmt)).all():
            result.append(
                TransactionView(
                    id=t.id,
                    device_id=t.device_id,
                    serial_number=serial,
                    transaction_type=TransactionType(t.transaction_type),
                    from_status=DeviceStatus(t.from_status) if t.from_status else None,
                    to_status=DeviceStatus(t.to_status),
                    tenant_id=t.tenant_id,
                    tenant_name=tenant_name,
                    customer_name=customer_name,
                    user_name=user_name or "ผู้ดูแลแพลตฟอร์ม",
                    note=t.note,
                    occurred_at=t.occurred_at,
                )
            )
        return result


class SqlCustomerRepository(_Repo):
    orm, entity = CustomerORM, Customer

    async def get(self, customer_id: UUID) -> Customer | None:
        return await self._get(customer_id)

    async def list(self) -> list[Customer]:
        return await self._list(select(CustomerORM).order_by(CustomerORM.company_name))

    async def delete(self, customer_id: UUID) -> None:
        row = await self.s.get(CustomerORM, customer_id)
        if row:
            await self.s.delete(row)

    async def has_installations(self, customer_id: UUID) -> bool:
        stmt = select(func.count()).where(InstallationORM.customer_id == customer_id)
        return bool(await self.s.scalar(stmt))


class SqlInstallationRepository(_Repo):
    orm, entity = InstallationORM, Installation

    def _view_stmt(self, *extra: Any) -> Select:
        return (
            select(
                InstallationORM,
                DeviceORM.serial_number,
                DeviceModelORM.name,
                CustomerORM.company_name,
                CustomerORM.service_level,
                *extra,
            )
            .join(DeviceORM, DeviceORM.id == InstallationORM.device_id)
            .join(DeviceModelORM, DeviceModelORM.id == DeviceORM.model_id)
            .join(CustomerORM, CustomerORM.id == InstallationORM.customer_id)
        )

    @staticmethod
    def _view(row: Any) -> InstallationView:
        i, serial, model_name, customer_name, service_level, *rest = row
        return InstallationView(
            id=i.id,
            device_id=i.device_id,
            serial_number=serial,
            model_name=model_name,
            tenant_id=i.tenant_id,
            customer_id=i.customer_id,
            customer_name=customer_name,
            service_level=ServiceLevel(service_level),
            install_date=i.install_date,
            latitude=i.latitude,
            longitude=i.longitude,
            address=i.address,
            removed_at=i.removed_at,
            distance_m=float(rest[0]) if rest else None,
        )

    async def get(self, installation_id: UUID) -> Installation | None:
        return await self._get(installation_id)

    async def get_active_for_device(self, device_id: UUID) -> Installation | None:
        stmt = select(InstallationORM).where(
            InstallationORM.device_id == device_id, InstallationORM.removed_at.is_(None)
        )
        rows = await self._list(stmt)
        return rows[0] if rows else None

    async def get_view(self, installation_id: UUID) -> InstallationView | None:
        row = (await self.s.execute(self._view_stmt().where(InstallationORM.id == installation_id))).first()
        return self._view(row) if row else None

    async def list_views(self, *, active_only: bool = True) -> list[InstallationView]:
        stmt = self._view_stmt().order_by(InstallationORM.install_date.desc())
        if active_only:
            stmt = stmt.where(InstallationORM.removed_at.is_(None))
        return [self._view(r) for r in (await self.s.execute(stmt)).all()]

    async def nearby(self, latitude: float, longitude: float, radius_m: float) -> list[InstallationView]:
        point = cast(func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326), Geography)
        distance = func.ST_Distance(InstallationORM.location, point).label("distance_m")
        # ST_DWithin filters through the GiST index; ST_Distance only sorts the survivors.
        stmt = (
            self._view_stmt(distance)
            .where(InstallationORM.removed_at.is_(None))
            .where(func.ST_DWithin(InstallationORM.location, point, radius_m))
            .order_by(distance)
        )
        return [self._view(r) for r in (await self.s.execute(stmt)).all()]


class SqlUnitOfWork:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.tenants = SqlTenantRepository(session)
        self.users = SqlUserRepository(session)
        self.device_models = SqlDeviceModelRepository(session)
        self.devices = SqlDeviceRepository(session)
        self.transactions = SqlTransactionRepository(session)
        self.customers = SqlCustomerRepository(session)
        self.installations = SqlInstallationRepository(session)

    async def flush(self) -> None:
        try:
            await self.session.flush()
        except IntegrityError as exc:
            constraint = getattr(getattr(exc.orig, "__cause__", None), "constraint_name", None)
            message = CONSTRAINT_MESSAGES.get(constraint or "")
            if message is None:
                message = next((m for k, m in CONSTRAINT_MESSAGES.items() if k in str(exc.orig)), None)
            raise ConflictError(message or "ข้อมูลขัดแย้งกับข้อมูลที่มีอยู่") from exc
        except DBAPIError as exc:
            if "row-level security" in str(exc.orig):
                raise PermissionDeniedError("ไม่มีสิทธิ์เข้าถึงข้อมูลของกลุ่มลูกค้าอื่น") from exc
            raise
