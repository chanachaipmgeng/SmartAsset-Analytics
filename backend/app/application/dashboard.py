from dataclasses import dataclass
from datetime import date, timedelta

from app.application.context import Actor
from app.domain.ports import UnitOfWork
from app.domain.read_models import CountItem, DeviceView, InstallationView

WARRANTY_ALERT_DAYS = 30


@dataclass(frozen=True)
class DashboardSummary:
    total_devices: int
    by_status: list[CountItem]
    by_model: list[CountItem]
    warranty_expiring: list[DeviceView]
    installations: list[InstallationView]


async def dashboard_summary(uow: UnitOfWork, actor: Actor, *, today: date | None = None) -> DashboardSummary:
    today = today or date.today()
    by_status = await uow.devices.count_by_status()
    return DashboardSummary(
        total_devices=sum(c.count for c in by_status),
        by_status=by_status,
        by_model=await uow.devices.count_by_model(),
        warranty_expiring=await uow.devices.warranty_expiring(today + timedelta(days=WARRANTY_ALERT_DAYS)),
        installations=await uow.installations.list_views(active_only=True),
    )
