"""Device lifecycle: check-in, transfer, check-out, install, return, retire.

Every status change writes an inventory_transactions row in the same DB transaction,
so stock levels are always derivable from the audit trail.
"""

from dataclasses import replace
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.application.context import Actor
from app.application.dashboard import BUSINESS_OFFSET
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
    supplier_id: UUID | None = None,
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
            supplier_id=supplier_id,
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


async def get_device_by_serial(uow: UnitOfWork, actor: Actor, serial_number: str) -> DeviceView:
    """Scanner lookup. RLS limits it to devices the caller may see, so other tenants' serials read as not found."""
    device = await uow.devices.get_by_serial(serial_number.strip().upper())
    if device is None:
        raise NotFoundError("ไม่พบอุปกรณ์หมายเลขซีเรียลนี้")
    return await _view(uow, device.id)


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


EDITABLE_FIELDS_TH = {
    "model_id": "รุ่น",
    "mac_address": "MAC",
    "purchase_date": "วันที่ซื้อ",
    "cost": "ต้นทุน",
    "warranty_end": "วันหมดประกัน",
    "notes": "หมายเหตุ",
}


async def update_device(uow: UnitOfWork, actor: Actor, device_id: UUID, changes: dict[str, Any]) -> DeviceView:
    """Edit descriptive fields only; status and tenant change through movements. Real changes are audited as EDIT."""
    require_write(actor.role)
    device = await _load_device(uow, device_id)
    if "model_id" in changes and await uow.device_models.get(changes["model_id"]) is None:
        raise NotFoundError("ไม่พบรุ่นอุปกรณ์")
    if changes.get("mac_address"):
        changes["mac_address"] = changes["mac_address"].strip().upper()
    changed = [EDITABLE_FIELDS_TH.get(k, k) for k, v in changes.items() if getattr(device, k) != v]
    device = replace(device, **changes)
    if device.purchase_date and device.warranty_end and device.warranty_end < device.purchase_date:
        raise ValidationError("วันสิ้นสุดประกันต้องไม่ก่อนวันที่ซื้อ")
    if changed:
        await uow.devices.update(device)
        await _record(uow, actor, device, TransactionType.EDIT, device.status, note="แก้ไข: " + ", ".join(changed))
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


async def loan(uow: UnitOfWork, actor: Actor, device_id: UUID, due_date: date, note: str | None) -> DeviceView:
    """Lend a stocked device (demo, trial, temporary replacement) until `due_date`."""
    require_write(actor.role)
    if due_date < datetime.now(BUSINESS_OFFSET).date():
        raise ValidationError("วันครบกำหนดคืนต้องไม่ก่อนวันนี้")
    device = await _load_device(uow, device_id)
    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.LOAN), loan_due_date=due_date)
    await uow.devices.update(device)
    note_text = f"ครบกำหนดคืน {due_date:%d/%m/%Y}" + (f" · {note}" if note else "")
    await _record(uow, actor, device, TransactionType.LOAN, from_status, note=note_text)
    return await _view(uow, device.id)


async def return_device(uow: UnitOfWork, actor: Actor, device_id: UUID, note: str | None) -> DeviceView:
    """Back from the field or a loan; the device waits for inspection (UNDER_QC) before it is stock again."""
    require_write(actor.role)
    device = await _load_device(uow, device_id)
    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.RETURN), loan_due_date=None)
    customer_id = None
    active = await uow.installations.get_active_for_device(device.id)
    if active is not None:
        customer_id = active.customer_id
        await uow.installations.update(replace(active, removed_at=datetime.now(UTC)))
    await uow.devices.update(device)
    await _record(uow, actor, device, TransactionType.RETURN, from_status, customer_id=customer_id, note=note)
    return await _view(uow, device.id)


async def send_repair(
    uow: UnitOfWork, actor: Actor, device_id: UUID, note: str | None, supplier_id: UUID | None = None
) -> DeviceView:
    """Send for repair from stock, checked-out or installed; an installed device leaves its site."""
    require_write(actor.role)
    if supplier_id is not None and await uow.suppliers.get(supplier_id) is None:
        raise NotFoundError("ไม่พบผู้จำหน่าย/ผู้ซ่อม")
    device = await _load_device(uow, device_id)
    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.SEND_REPAIR))
    customer_id = None
    active = await uow.installations.get_active_for_device(device.id)
    if active is not None:
        customer_id = active.customer_id
        await uow.installations.update(replace(active, removed_at=datetime.now(UTC)))
    await uow.devices.update(device)
    await _record(
        uow,
        actor,
        device,
        TransactionType.SEND_REPAIR,
        from_status,
        customer_id=customer_id,
        supplier_id=supplier_id,
        note=note,
    )
    return await _view(uow, device.id)


async def repair_done(uow: UnitOfWork, actor: Actor, device_id: UUID, qc_note: str) -> DeviceView:
    """Back to stock after repair; the QC result is mandatory so the audit trail shows what was checked."""
    require_write(actor.role)
    if not qc_note.strip():
        raise ValidationError("ต้องระบุผลการตรวจสอบคุณภาพ (QC)")
    device = await _load_device(uow, device_id)
    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.REPAIR_DONE))
    await uow.devices.update(device)
    await _record(uow, actor, device, TransactionType.REPAIR_DONE, from_status, note=qc_note.strip())
    return await _view(uow, device.id)


async def qc_pass(uow: UnitOfWork, actor: Actor, device_id: UUID, note: str | None) -> DeviceView:
    require_write(actor.role)
    device = await _load_device(uow, device_id)
    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.QC_PASS))
    await uow.devices.update(device)
    await _record(uow, actor, device, TransactionType.QC_PASS, from_status, note=note)
    return await _view(uow, device.id)


async def qc_fail(uow: UnitOfWork, actor: Actor, device_id: UUID, note: str) -> DeviceView:
    """Failed inspection goes to repair; the defect found is mandatory."""
    require_write(actor.role)
    if not note.strip():
        raise ValidationError("ต้องระบุอาการหรือสาเหตุที่ไม่ผ่าน QC")
    device = await _load_device(uow, device_id)
    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.QC_FAIL))
    await uow.devices.update(device)
    await _record(uow, actor, device, TransactionType.QC_FAIL, from_status, note=note.strip())
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
    uow: UnitOfWork,
    actor: Actor,
    *,
    device_id: UUID | None = None,
    limit: int = 500,
    date_from: date | None = None,
    date_to: date | None = None,
    tx_types: list[TransactionType] | None = None,
    user_id: UUID | None = None,
) -> list[TransactionView]:
    """`date_from`/`date_to` are inclusive business-calendar days (Asia/Bangkok)."""
    if date_from and date_to and date_to < date_from:
        raise ValidationError("วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น")
    since = datetime.combine(date_from, time.min, tzinfo=BUSINESS_OFFSET) if date_from else None
    until = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=BUSINESS_OFFSET) if date_to else None
    return await uow.transactions.list_views(
        device_id=device_id, limit=limit, since=since, until=until, tx_types=tx_types, user_id=user_id
    )


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
    if not customer.is_active:
        raise ValidationError("ลูกค้ารายนี้ถูกระงับการใช้งาน")
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
