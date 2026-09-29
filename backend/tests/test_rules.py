from uuid import uuid4

import pytest

from app.domain.entities import Device
from app.domain.enums import DeviceStatus, Role, TransactionType
from app.domain.errors import InvalidTransitionError, PermissionDeniedError, ValidationError
from app.domain.rules import (
    next_status,
    require_superadmin,
    require_write,
    validate_coordinates,
    validate_user_scope,
)


def device(status: DeviceStatus, tenant: bool = True) -> Device:
    return Device(serial_number="SN-1", model_id=uuid4(), status=status, tenant_id=uuid4() if tenant else None)


@pytest.mark.parametrize(
    ("status", "tx", "expected"),
    [
        (DeviceStatus.IN_STOCK, TransactionType.CHECK_OUT, DeviceStatus.CHECKED_OUT),
        (DeviceStatus.CHECKED_OUT, TransactionType.INSTALL, DeviceStatus.INSTALLED),
        (DeviceStatus.INSTALLED, TransactionType.RETURN, DeviceStatus.IN_STOCK),
        (DeviceStatus.CHECKED_OUT, TransactionType.RETURN, DeviceStatus.IN_STOCK),
        (DeviceStatus.IN_STOCK, TransactionType.RETIRE, DeviceStatus.RETIRED),
        (DeviceStatus.IN_STOCK, TransactionType.TRANSFER, DeviceStatus.IN_STOCK),
    ],
)
def test_allowed_transitions(status: DeviceStatus, tx: TransactionType, expected: DeviceStatus) -> None:
    assert next_status(device(status), tx) == expected


@pytest.mark.parametrize(
    ("status", "tx"),
    [
        (DeviceStatus.IN_STOCK, TransactionType.INSTALL),
        (DeviceStatus.INSTALLED, TransactionType.CHECK_OUT),
        (DeviceStatus.RETIRED, TransactionType.RETURN),
        (DeviceStatus.INSTALLED, TransactionType.RETIRE),
        (DeviceStatus.CHECKED_OUT, TransactionType.TRANSFER),
    ],
)
def test_rejected_transitions(status: DeviceStatus, tx: TransactionType) -> None:
    with pytest.raises(InvalidTransitionError):
        next_status(device(status), tx)


def test_central_stock_must_be_transferred_before_check_out() -> None:
    with pytest.raises(InvalidTransitionError, match="คลังกลาง"):
        next_status(device(DeviceStatus.IN_STOCK, tenant=False), TransactionType.CHECK_OUT)


def test_role_guards() -> None:
    require_write(Role.STAFF)
    with pytest.raises(PermissionDeniedError):
        require_write(Role.VIEWER)
    with pytest.raises(PermissionDeniedError):
        require_superadmin(Role.TENANT_ADMIN)


def test_coordinates_and_user_scope() -> None:
    validate_coordinates(13.75, 100.5)
    with pytest.raises(ValidationError):
        validate_coordinates(100.5, 13.75)
    with pytest.raises(ValidationError):
        validate_user_scope(Role.SUPERADMIN, uuid4())
    with pytest.raises(ValidationError):
        validate_user_scope(Role.STAFF, None)
