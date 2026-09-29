from uuid import UUID

from app.domain.entities import Device
from app.domain.enums import DeviceStatus, Role, TransactionType
from app.domain.errors import InvalidTransitionError, PermissionDeniedError, ValidationError

STATUS_LABELS_TH: dict[DeviceStatus, str] = {
    DeviceStatus.IN_STOCK: "อยู่ในคลัง",
    DeviceStatus.CHECKED_OUT: "เบิกออก",
    DeviceStatus.INSTALLED: "ติดตั้งแล้ว",
    DeviceStatus.ON_LOAN: "ยืม",
    DeviceStatus.UNDER_QC: "รอตรวจสอบ (QC)",
    DeviceStatus.IN_REPAIR: "ส่งซ่อม",
    DeviceStatus.RETIRED: "ปลดระวาง",
}

ALLOWED_TRANSITIONS: dict[TransactionType, tuple[set[DeviceStatus], DeviceStatus]] = {
    TransactionType.TRANSFER: ({DeviceStatus.IN_STOCK}, DeviceStatus.IN_STOCK),
    TransactionType.CHECK_OUT: ({DeviceStatus.IN_STOCK}, DeviceStatus.CHECKED_OUT),
    TransactionType.INSTALL: ({DeviceStatus.CHECKED_OUT}, DeviceStatus.INSTALLED),
    TransactionType.LOAN: ({DeviceStatus.IN_STOCK}, DeviceStatus.ON_LOAN),
    # Everything that comes back from the field is inspected before it counts as stock again.
    TransactionType.RETURN: (
        {DeviceStatus.CHECKED_OUT, DeviceStatus.INSTALLED, DeviceStatus.ON_LOAN},
        DeviceStatus.UNDER_QC,
    ),
    TransactionType.QC_PASS: ({DeviceStatus.UNDER_QC}, DeviceStatus.IN_STOCK),
    TransactionType.QC_FAIL: ({DeviceStatus.UNDER_QC}, DeviceStatus.IN_REPAIR),
    TransactionType.SEND_REPAIR: (
        {DeviceStatus.IN_STOCK, DeviceStatus.CHECKED_OUT, DeviceStatus.INSTALLED},
        DeviceStatus.IN_REPAIR,
    ),
    TransactionType.REPAIR_DONE: ({DeviceStatus.IN_REPAIR}, DeviceStatus.IN_STOCK),
    # A device that cannot be repaired (or fails inspection beyond repair) may be retired directly.
    TransactionType.RETIRE: (
        {DeviceStatus.IN_STOCK, DeviceStatus.IN_REPAIR, DeviceStatus.UNDER_QC},
        DeviceStatus.RETIRED,
    ),
}

WRITE_ROLES = {Role.SUPERADMIN, Role.TENANT_ADMIN, Role.STAFF}
ADMIN_ROLES = {Role.SUPERADMIN, Role.TENANT_ADMIN}


def next_status(device: Device, tx_type: TransactionType) -> DeviceStatus:
    allowed_from, target = ALLOWED_TRANSITIONS[tx_type]
    if device.status not in allowed_from:
        allowed = ", ".join(STATUS_LABELS_TH[s] for s in sorted(allowed_from))
        raise InvalidTransitionError(
            f"อุปกรณ์ {device.serial_number} อยู่ในสถานะ '{STATUS_LABELS_TH[device.status]}' "
            f"ต้องอยู่ในสถานะ '{allowed}' จึงจะทำรายการนี้ได้"
        )
    if tx_type in (TransactionType.CHECK_OUT, TransactionType.INSTALL, TransactionType.LOAN) and device.tenant_id is None:
        raise InvalidTransitionError(
            f"อุปกรณ์ {device.serial_number} ยังอยู่ในคลังกลาง ต้องโอนให้กลุ่มลูกค้าก่อน"
        )
    return target


def require_write(role: Role) -> None:
    if role not in WRITE_ROLES:
        raise PermissionDeniedError("บัญชีนี้มีสิทธิ์ดูข้อมูลเท่านั้น")


def require_admin(role: Role) -> None:
    if role not in ADMIN_ROLES:
        raise PermissionDeniedError("ต้องเป็นผู้ดูแลระบบจึงจะทำรายการนี้ได้")


def require_superadmin(role: Role) -> None:
    if role != Role.SUPERADMIN:
        raise PermissionDeniedError("เฉพาะผู้ดูแลแพลตฟอร์ม (Superadmin) เท่านั้น")


def validate_coordinates(latitude: float, longitude: float) -> None:
    if not -90 <= latitude <= 90:
        raise ValidationError("ละติจูดต้องอยู่ระหว่าง -90 ถึง 90")
    if not -180 <= longitude <= 180:
        raise ValidationError("ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180")


def validate_user_scope(role: Role, tenant_id: UUID | None) -> None:
    if role == Role.SUPERADMIN and tenant_id is not None:
        raise ValidationError("Superadmin ต้องไม่ผูกกับกลุ่มลูกค้า")
    if role != Role.SUPERADMIN and tenant_id is None:
        raise ValidationError("ผู้ใช้ระดับกลุ่มลูกค้าต้องระบุกลุ่มลูกค้า")
