"""Read-only reports; RLS scopes every row to the caller's tenant (superadmin sees all)."""

from datetime import datetime

from app.application.context import Actor
from app.application.dashboard import BUSINESS_OFFSET, aged_devices
from app.domain.enums import DeviceStatus
from app.domain.ports import UnitOfWork
from app.domain.read_models import AgedDevice, StockBalanceRow


async def stock_balance(uow: UnitOfWork, actor: Actor, *, include_retired: bool = False) -> list[StockBalanceRow]:
    """Device count and summed cost per model x tenant x status."""
    rows = await uow.devices.stock_balance()
    return rows if include_retired else [r for r in rows if r.status != DeviceStatus.RETIRED]


async def aging(uow: UnitOfWork, actor: Actor, *, status: DeviceStatus | None = None) -> list[AgedDevice]:
    """Days each device has spent in its current status, oldest first; retired devices only when asked."""
    today = datetime.now(BUSINESS_OFFSET).date()
    rows = await aged_devices(uow, today, status)
    return rows if status else [r for r in rows if r.device.status != DeviceStatus.RETIRED]
