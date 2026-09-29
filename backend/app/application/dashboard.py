from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta, timezone

from app.application.context import Actor
from app.domain.enums import TransactionType
from app.domain.ports import UnitOfWork
from app.domain.read_models import CountItem, DeviceView, InstallationView, TransactionView

WARRANTY_ALERT_DAYS = 30
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
    )
