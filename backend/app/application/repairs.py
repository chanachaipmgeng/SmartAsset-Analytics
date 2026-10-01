"""Repair work orders: auto-opened on SEND_REPAIR / QC_FAIL, closed on REPAIR_DONE."""

from dataclasses import replace
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.application.context import Actor
from app.domain.entities import RepairOrder
from app.domain.enums import RepairOrderStatus
from app.domain.errors import NotFoundError, ValidationError
from app.domain.ports import UnitOfWork
from app.domain.read_models import RepairOrderView
from app.domain.rules import require_write

EDITABLE_WHILE_OPEN = frozenset({"parts", "labor_cost", "parts_cost", "due_date", "assignee_name", "supplier_id"})


async def open_order(
    uow: UnitOfWork,
    actor: Actor,
    *,
    device_id: UUID,
    defect_note: str,
    supplier_id: UUID | None,
    opened_tx_id: UUID,
    tenant_id: UUID | None,
) -> RepairOrder:
    """Create an OPEN order, or refresh note/supplier on an existing OPEN order for the device."""
    note = defect_note.strip() or "ส่งซ่อม"
    existing = await uow.repair_orders.get_open_for_device(device_id)
    if existing is not None:
        updated = replace(
            existing,
            defect_note=note,
            supplier_id=supplier_id if supplier_id is not None else existing.supplier_id,
            opened_tx_id=opened_tx_id,
        )
        await uow.repair_orders.update(updated)
        await uow.flush()
        return updated

    order = RepairOrder(
        device_id=device_id,
        tenant_id=tenant_id,
        supplier_id=supplier_id,
        opened_by=actor.user_id,
        opened_tx_id=opened_tx_id,
        defect_note=note,
    )
    await uow.repair_orders.add(order)
    await uow.flush()
    return order


async def close_order(
    uow: UnitOfWork,
    *,
    device_id: UUID,
    closed_tx_id: UUID,
    qc_note: str,
) -> RepairOrder | None:
    """Mark the device's OPEN order CLOSED; no-op when none exists."""
    order = await uow.repair_orders.get_open_for_device(device_id)
    if order is None:
        return None
    closed = replace(
        order,
        status=RepairOrderStatus.CLOSED,
        closed_tx_id=closed_tx_id,
        qc_note=qc_note.strip(),
        closed_at=datetime.now(UTC),
    )
    await uow.repair_orders.update(closed)
    await uow.flush()
    return closed


async def list_orders(
    uow: UnitOfWork,
    actor: Actor,
    *,
    status: RepairOrderStatus | None = None,
    device_id: UUID | None = None,
    skip: int = 0,
    take: int | None = None,
) -> tuple[list[RepairOrderView], int]:
    filters = {"status": status, "device_id": device_id}
    items = await uow.repair_orders.list_views(**filters, skip=skip, take=take)
    if take is None and skip == 0:
        return items, len(items)
    return items, await uow.repair_orders.count_views(**filters)


async def get_order(uow: UnitOfWork, actor: Actor, order_id: UUID) -> RepairOrderView:
    view = await uow.repair_orders.get_view(order_id)
    if view is None:
        raise NotFoundError("ไม่พบใบงานซ่อม")
    return view


async def update_order(uow: UnitOfWork, actor: Actor, order_id: UUID, changes: dict[str, Any]) -> RepairOrderView:
    require_write(actor.role)
    order = await uow.repair_orders.get(order_id)
    if order is None:
        raise NotFoundError("ไม่พบใบงานซ่อม")
    if order.status != RepairOrderStatus.OPEN:
        raise ValidationError("แก้ไขได้เฉพาะใบงานที่ยังเปิดอยู่")
    unknown = set(changes) - EDITABLE_WHILE_OPEN
    if unknown:
        raise ValidationError("ไม่รองรับการแก้ไขฟิลด์นี้")
    if changes.get("supplier_id") is not None and await uow.suppliers.get(changes["supplier_id"]) is None:
        raise NotFoundError("ไม่พบผู้จำหน่าย/ผู้ซ่อม")
    if "assignee_name" in changes:
        changes["assignee_name"] = (changes["assignee_name"] or "").strip() or None
    if "parts" in changes:
        changes["parts"] = (changes["parts"] or "").strip() or None
    for cost_key in ("labor_cost", "parts_cost"):
        if cost_key in changes and changes[cost_key] is not None and changes[cost_key] < 0:
            raise ValidationError("ต้นทุนต้องไม่ติดลบ")
    order = replace(order, **changes)
    await uow.repair_orders.update(order)
    await uow.flush()
    return await get_order(uow, actor, order_id)


async def cancel_order(uow: UnitOfWork, actor: Actor, order_id: UUID) -> RepairOrderView:
    require_write(actor.role)
    order = await uow.repair_orders.get(order_id)
    if order is None:
        raise NotFoundError("ไม่พบใบงานซ่อม")
    if order.status != RepairOrderStatus.OPEN:
        raise ValidationError("ยกเลิกได้เฉพาะใบงานที่ยังเปิดอยู่")
    order = replace(order, status=RepairOrderStatus.CANCELLED, closed_at=datetime.now(UTC))
    await uow.repair_orders.update(order)
    await uow.flush()
    return await get_order(uow, actor, order_id)
