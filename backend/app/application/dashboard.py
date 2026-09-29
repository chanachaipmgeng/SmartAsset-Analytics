from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta, timezone

from app.application.context import Actor
from app.domain.enums import DeviceStatus, TransactionType
from app.domain.ports import UnitOfWork
from app.domain.read_models import AgedDevice, CountItem, DeviceView, InstallationView, TransactionView

WARRANTY_ALERT_DAYS = 30
REPAIR_AGING_DAYS = 14
ACTIVITY_DAYS = 30
RECENT_LIMIT = 10
# Activity is bucketed by the business's calendar day, not UTC. Thailand has no DST, so a fixed
# offset matches Postgres' Asia/Bangkok without needing tzdata in the Python runtime.
BUSINESS_TZ = "Asia/Bangkok"
BUSINESS_OFFSET = timezone(timedelta(hours=7))


@dataclass(frozen=True)
class ActivityDay:
    day: date
    counts: dict[TransactionType, int] = field(default_factory=dict)

    @property
    def total(self) -> int:
        return sum(self.counts.values())


@dataclass(frozen=True)
class DashboardSummary:
    total_devices: int
    by_status: list[CountItem]
    by_model: list[CountItem]
    warranty_expiring: list[DeviceView]
    installations: list[InstallationView]
    activity_30d: list[ActivityDay]
    recent_transactions: list[TransactionView]
    pending_qc: int = 0
    loan_overdue: list[DeviceView] = field(default_factory=list)
    repair_aging: list[AgedDevice] = field(default_factory=list)


def days_since(moment: datetime, today: date) -> int:
    return (today - moment.astimezone(BUSINESS_OFFSET).date()).days


async def aged_devices(
    uow: UnitOfWork, today: date, status: DeviceStatus | None = None, min_days: int = 0
) -> list[AgedDevice]:
    """Devices with days spent in their current status, oldest first."""
    result = []
    for device, since in await uow.devices.status_since(status):
        days = days_since(since, today)
        if days >= min_days:
            result.append(AgedDevice(device=device, since=since, days=days))
    return result


async def _activity(uow: UnitOfWork, today: date) -> list[ActivityDay]:
    first = today - timedelta(days=ACTIVITY_DAYS - 1)
    since = datetime.combine(first, time.min, tzinfo=BUSINESS_OFFSET).astimezone(UTC)
    days = {first + timedelta(days=i): ActivityDay(day=first + timedelta(days=i)) for i in range(ACTIVITY_DAYS)}
    for row in await uow.transactions.daily_counts(since, BUSINESS_TZ):
        if row.day in days:
            days[row.day].counts[row.transaction_type] = row.count
    return list(days.values())


async def dashboard_summary(uow: UnitOfWork, actor: Actor, *, today: date | None = None) -> DashboardSummary:
    today = today or datetime.now(BUSINESS_OFFSET).date()
    by_status = await uow.devices.count_by_status()
    return DashboardSummary(
        total_devices=sum(c.count for c in by_status),
        by_status=by_status,
        by_model=await uow.devices.count_by_model(),
        warranty_expiring=await uow.devices.warranty_expiring(today + timedelta(days=WARRANTY_ALERT_DAYS)),
        installations=await uow.installations.list_views(active_only=True),
        activity_30d=await _activity(uow, today),
        recent_transactions=await uow.transactions.list_views(limit=RECENT_LIMIT),
        pending_qc=next((c.count for c in by_status if c.key == DeviceStatus.UNDER_QC.value), 0),
        loan_overdue=await uow.devices.loan_overdue(today),
        repair_aging=await aged_devices(uow, today, DeviceStatus.IN_REPAIR, REPAIR_AGING_DAYS + 1),
    )
