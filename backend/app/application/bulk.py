"""Run one movement on many devices at once, all-or-nothing."""

from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from uuid import UUID

from app.application import inventory
from app.application.context import Actor
from app.domain.errors import BulkActionError, InvalidTransitionError, NotFoundError, ValidationError
from app.domain.ports import UnitOfWork
from app.domain.read_models import DeviceView
from app.domain.rules import require_superadmin, require_write

BULK_MAX_DEVICES = 200


class BulkAction(StrEnum):
    """Movements that need nothing per device; install is excluded because every site has its own coordinates."""

    TRANSFER = "transfer"
    CHECK_OUT = "check_out"
    LOAN = "loan"
    RETURN = "return"
    QC_PASS = "qc_pass"
    SEND_REPAIR = "send_repair"
    RETIRE = "retire"


@dataclass(frozen=True)
class BulkMoved:
    device: DeviceView
    # The movement's transaction, so the caller can attach photos to it.
    transaction_id: UUID


async def bulk_action(
    uow: UnitOfWork,
    actor: Actor,
    *,
    action: BulkAction,
    device_ids: list[UUID],
    note: str | None = None,
    target_tenant_id: UUID | None = None,
    supplier_id: UUID | None = None,
    due_date: date | None = None,
) -> list[BulkMoved]:
    """Each device gets its own transaction row. If any device cannot move, the caller's DB transaction is
    rolled back by raising BulkActionError with one reason per failing device.
    """
    ids = list(dict.fromkeys(device_ids))
    if not ids:
        raise ValidationError("กรุณาเลือกอุปกรณ์อย่างน้อย 1 เครื่อง")
    if len(ids) > BULK_MAX_DEVICES:
        raise ValidationError(f"ทำรายการพร้อมกันได้สูงสุด {BULK_MAX_DEVICES} เครื่อง")
    if action == BulkAction.TRANSFER:
        require_superadmin(actor.role)
    else:
        require_write(actor.role)
    if action == BulkAction.LOAN and due_date is None:
        raise ValidationError("กรุณาระบุวันครบกำหนดคืน")
    note = (note or "").strip() or None

    async def move(device_id: UUID) -> DeviceView:
        match action:
            case BulkAction.TRANSFER:
                return await inventory.transfer(uow, actor, device_id, target_tenant_id, note)
            case BulkAction.CHECK_OUT:
                return await inventory.check_out(uow, actor, device_id, note)
            case BulkAction.LOAN:
                assert due_date is not None
                return await inventory.loan(uow, actor, device_id, due_date, note)
            case BulkAction.RETURN:
                return await inventory.return_device(uow, actor, device_id, note)
            case BulkAction.QC_PASS:
                return await inventory.qc_pass(uow, actor, device_id, note)
            case BulkAction.SEND_REPAIR:
                return await inventory.send_repair(uow, actor, device_id, note, supplier_id)
            case BulkAction.RETIRE:
                return await inventory.retire(uow, actor, device_id, note)

    moved: list[BulkMoved] = []
    failures: list[dict[str, str]] = []
    for device_id in ids:
        try:
            device = await move(device_id)
            latest = await uow.transactions.list_views(device_id=device_id, limit=1)
            moved.append(BulkMoved(device=device, transaction_id=latest[0].id))
        # These are raised before anything is written, so the transaction is still usable for the next device.
        except (InvalidTransitionError, NotFoundError, ValidationError) as exc:
            device = await uow.devices.get(device_id)
            failures.append(
                {
                    "device_id": str(device_id),
                    "serial_number": device.serial_number if device else str(device_id),
                    "reason": exc.message,
                }
            )
    if failures:
        raise BulkActionError(
            f"ทำรายการไม่ได้ {len(failures)} จาก {len(ids)} เครื่อง จึงไม่ได้บันทึกรายการใดเลย", failures
        )
    return moved
