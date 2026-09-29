"""Device lifecycle: check-in, transfer, check-out, install, return, retire.

Every status change writes an inventory_transactions row in the same DB transaction,
so stock levels are always derivable from the audit trail.
"""

from dataclasses import replace
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.application.context import Actor
from app.domain.entities import Device, Installation, InventoryTransaction
from app.domain.enums import DeviceStatus, TransactionType
from app.domain.errors import NotFoundError, ValidationError
from app.domain.ports import UnitOfWork
from app.domain.read_models import CountItem, DeviceView, InstallationView, TransactionView
from app.domain.rules import (
    next_status,
    require_superadmin,
    require_write,
    validate_coordinates,
)


async def _load_device(uow: UnitOfWork, device_id: UUID) -> Device:
    device = await uow.devices.get(device_id, for_update=True)
    if device is None:
        raise NotFoundError("ไม่พบอุปกรณ์")
    return device


async def _view(uow: UnitOfWork, device_id: UUID) -> DeviceView:
    view = await uow.devices.get_view(device_id)
    assert view is not None
    return view


async def _record(
    uow: UnitOfWork,
    actor: Actor,
    device: Device,
    tx_type: TransactionType,
    from_status: DeviceStatus | None,
    *,
    from_tenant_id: UUID | None = None,
    customer_id: UUID | None = None,
    note: str | None = None,
) -> None:
    await uow.transactions.add(
        InventoryTransaction(
            device_id=device.id,
            transaction_type=tx_type,
            from_status=from_status,
            to_status=device.status,
            tenant_id=device.tenant_id,
            from_tenant_id=from_tenant_id,
            customer_id=customer_id,
            user_id=actor.user_id,
            note=note,
        )
    )
    await uow.flush()


async def list_devices(
    uow: UnitOfWork,
    actor: Actor,
    *,
    search: str | None = None,
    status: DeviceStatus | None = None,
    model_id: UUID | None = None,
) -> list[DeviceView]:
    return await uow.devices.list_views(search=search, status=status, model_id=model_id)


async def get_device(uow: UnitOfWork, actor: Actor, device_id: UUID) -> DeviceView:
    view = await uow.devices.get_view(device_id)
    if view is None:
        raise NotFoundError("ไม่พบอุปกรณ์")
    return view


async def check_in(
    uow: UnitOfWork,
    actor: Actor,
    *,
    serial_number: str,
    model_id: UUID,
    tenant_id: UUID | None = None,
    mac_address: str | None = None,
    purchase_date: date | None = None,
    cost: Decimal | None = None,
    warranty_end: date | None = None,
    notes: str | None = None,
) -> DeviceView:
    """Receive a new device. Superadmin may leave tenant empty (central stock)."""
    require_write(actor.role)
    if not actor.is_superadmin:
        tenant_id = actor.tenant_id
    elif tenant_id is not None and await uow.tenants.get(tenant_id) is None:
        raise NotFoundError("ไม่พบกลุ่มลูกค้า")
    if await uow.device_models.get(model_id) is None:
        raise NotFoundError("ไม่พบรุ่นอุปกรณ์")
    if purchase_date and warranty_end and warranty_end < purchase_date:
        raise ValidationError("วันสิ้นสุดประกันต้องไม่ก่อนวันที่ซื้อ")

    device = Device(
        serial_number=serial_number.strip().upper(),
        model_id=model_id,
        tenant_id=tenant_id,
        mac_address=mac_address.strip().upper() if mac_address else None,
        purchase_date=purchase_date,
        cost=cost,
        warranty_end=warranty_end,
        notes=notes,
    )
    await uow.devices.add(device)
    await uow.flush()
    await _record(uow, actor, device, TransactionType.CHECK_IN, None, note=notes)
    return await _view(uow, device.id)


async def update_device(uow: UnitOfWork, actor: Actor, device_id: UUID, changes: dict[str, Any]) -> DeviceView:
    """Edit descriptive fields only; status and tenant change through movements."""
    require_write(actor.role)
    device = await _load_device(uow, device_id)
    if "model_id" in changes and await uow.device_models.get(changes["model_id"]) is None:
        raise NotFoundError("ไม่พบรุ่นอุปกรณ์")
    if changes.get("mac_address"):
        changes["mac_address"] = changes["mac_address"].strip().upper()
    device = replace(device, **changes)
    if device.purchase_date and device.warranty_end and device.warranty_end < device.purchase_date:
        raise ValidationError("วันสิ้นสุดประกันต้องไม่ก่อนวันที่ซื้อ")
    await uow.devices.update(device)
    await uow.flush()
    return await _view(uow, device.id)


async def transfer(
    uow: UnitOfWork, actor: Actor, device_id: UUID, target_tenant_id: UUID | None, note: str | None
) -> DeviceView:
    require_superadmin(actor.role)
    device = await _load_device(uow, device_id)
    if target_tenant_id is not None and await uow.tenants.get(target_tenant_id) is None:
        raise NotFoundError("ไม่พบกลุ่มลูกค้าปลายทาง")
    if device.tenant_id == target_tenant_id:
        raise ValidationError("อุปกรณ์อยู่ที่ปลายทางนี้อยู่แล้ว")
    from_status, from_tenant = device.status, device.tenant_id
    device = replace(device, status=next_status(device, TransactionType.TRANSFER), tenant_id=target_tenant_id)
    await uow.devices.update(device)
    await _record(uow, actor, device, TransactionType.TRANSFER, from_status, from_tenant_id=from_tenant, note=note)
    return await _view(uow, device.id)


async def check_out(uow: UnitOfWork, actor: Actor, device_id: UUID, note: str | None) -> DeviceView:
    require_write(actor.role)
    device = await _load_device(uow, device_id)
    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.CHECK_OUT))
    await uow.devices.update(device)
    await _record(uow, actor, device, TransactionType.CHECK_OUT, from_status, note=note)
    return await _view(uow, device.id)


async def return_device(uow: UnitOfWork, actor: Actor, device_id: UUID, note: str | None) -> DeviceView:
    require_write(actor.role)
    device = await _load_device(uow, device_id)
    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.RETURN))
    customer_id = None
    active = await uow.installations.get_active_for_device(device.id)
    if active is not None:
        customer_id = active.customer_id
        await uow.installations.update(replace(active, removed_at=datetime.now(UTC)))
    await uow.devices.update(device)
    await _record(uow, actor, device, TransactionType.RETURN, from_status, customer_id=customer_id, note=note)
    return await _view(uow, device.id)


async def retire(uow: UnitOfWork, actor: Actor, device_id: UUID, note: str | None) -> DeviceView:
    require_write(actor.role)
    device = await _load_device(uow, device_id)
    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.RETIRE))
    await uow.devices.update(device)
    await _record(uow, actor, device, TransactionType.RETIRE, from_status, note=note)
    return await _view(uow, device.id)


async def list_transactions(
    uow: UnitOfWork, actor: Actor, *, device_id: UUID | None = None, limit: int = 500
) -> list[TransactionView]:
    return await uow.transactions.list_views(device_id=device_id, limit=limit)


async def stock_summary(uow: UnitOfWork, actor: Actor) -> dict[str, list[CountItem]]:
    return {"by_status": await uow.devices.count_by_status(), "by_model": await uow.devices.count_by_model()}


async def install(
    uow: UnitOfWork,
    actor: Actor,
    *,
    device_id: UUID,
    customer_id: UUID,
    install_date: date,
    latitude: float,
    longitude: float,
    address: str | None = None,
) -> InstallationView:
    require_write(actor.role)
    validate_coordinates(latitude, longitude)
    device = await _load_device(uow, device_id)
    customer = await uow.customers.get(customer_id)
    if customer is None:
        raise NotFoundError("ไม่พบลูกค้า")
    if customer.tenant_id != device.tenant_id:
        raise ValidationError("ลูกค้าและอุปกรณ์ต้องอยู่ในกลุ่มลูกค้าเดียวกัน")

    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.INSTALL))
    assert device.tenant_id is not None
    installation = Installation(
        device_id=device.id,
        tenant_id=device.tenant_id,
        customer_id=customer.id,
        install_date=install_date,
        latitude=latitude,
        longitude=longitude,
        address=address,
    )
    await uow.devices.update(device)
    await uow.installations.add(installation)
    await uow.flush()
    await _record(uow, actor, device, TransactionType.INSTALL, from_status, customer_id=customer.id)
    view = await uow.installations.get_view(installation.id)
    assert view is not None
    return view


async def update_installation(
    uow: UnitOfWork, actor: Actor, installation_id: UUID, changes: dict[str, Any]
) -> InstallationView:
    require_write(actor.role)
    installation = await uow.installations.get(installation_id)
    if installation is None:
        raise NotFoundError("ไม่พบจุดติดตั้ง")
    installation = replace(installation, **changes)
    validate_coordinates(installation.latitude, installation.longitude)
    await uow.installations.update(installation)
    await uow.flush()
    view = await uow.installations.get_view(installation.id)
    assert view is not None
    return view


async def list_installations(uow: UnitOfWork, actor: Actor, *, active_only: bool = True) -> list[InstallationView]:
    return await uow.installations.list_views(active_only=active_only)


async def nearby_installations(
    uow: UnitOfWork, actor: Actor, *, latitude: float, longitude: float, radius_m: float
) -> list[InstallationView]:
    validate_coordinates(latitude, longitude)
    if not 0 < radius_m <= 500_000:
        raise ValidationError("รัศมีต้องอยู่ระหว่าง 1 เมตร ถึง 500 กิโลเมตร")
    return await uow.installations.nearby(latitude, longitude, radius_m)
