"""Audit log for settings changes: who created, changed, deactivated or deleted which record."""

from dataclasses import asdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from app.application.context import Actor
from app.application.dashboard import BUSINESS_OFFSET
from app.domain.entities import AuditLog
from app.domain.enums import AuditAction, AuditEntity
from app.domain.errors import ValidationError
from app.domain.ports import UnitOfWork
from app.domain.read_models import AuditView
from app.domain.rules import require_admin

# Never diffed: identity/bookkeeping columns. Secrets are reported as "changed" without values.
_SKIPPED = frozenset({"id", "created_at", "occurred_at"})
_SECRETS = {"password_hash": "password"}
SECRET_CHANGED = "changed"


def _json(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def diff(before: Any | None, after: Any | None) -> dict[str, Any]:
    """Field-level changes between two versions of an entity; either side may be None (create/delete)."""
    old = asdict(before) if before is not None else {}
    new = asdict(after) if after is not None else {}
    changes: dict[str, Any] = {}
    for key in (old or new).keys():
        if key in _SKIPPED:
            continue
        a, b = old.get(key), new.get(key)
        if a == b:
            continue
        if key in _SECRETS:
            if before is not None and after is not None:
                changes[_SECRETS[key]] = SECRET_CHANGED
        else:
            changes[key] = [_json(a), _json(b)]
    return changes


async def record(
    uow: UnitOfWork,
    actor: Actor,
    entity_type: AuditEntity,
    entity_id: UUID,
    *,
    tenant_id: UUID | None,
    label: str | None,
    before: Any | None = None,
    after: Any | None = None,
    action: AuditAction | None = None,
) -> None:
    """Writes one entry in the caller's transaction. Updates that change nothing are not logged."""
    changes = diff(before, after)
    if action is None:
        if before is None:
            action = AuditAction.CREATE
        elif after is None:
            action = AuditAction.DELETE
        elif getattr(before, "is_active", None) is True and getattr(after, "is_active", None) is False:
            action = AuditAction.DEACTIVATE
        else:
            action = AuditAction.UPDATE
    if action == AuditAction.UPDATE and not changes:
        return
    # Flush first so constraint errors surface through uow.flush() as friendly conflicts.
    await uow.flush()
    await uow.audit.add(
        AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            user_id=actor.user_id,
            tenant_id=tenant_id,
            entity_label=label,
            changes=changes,
        )
    )


async def list_audit(
    uow: UnitOfWork,
    actor: Actor,
    *,
    entity_type: AuditEntity | None = None,
    entity_id: UUID | None = None,
    user_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    skip: int = 0,
    limit: int = 500,
) -> tuple[list[AuditView], int]:
    """Admins only; RLS narrows tenant admins to their own tenant's entries."""
    require_admin(actor.role)
    if date_from and date_to and date_to < date_from:
        raise ValidationError("วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น")
    since = datetime.combine(date_from, time.min, tzinfo=BUSINESS_OFFSET) if date_from else None
    until = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=BUSINESS_OFFSET) if date_to else None
    filters = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "user_id": user_id,
        "since": since,
        "until": until,
    }
    items = await uow.audit.list_views(**filters, skip=skip, limit=limit)
    if skip == 0 and len(items) < limit:
        return items, len(items)
    return items, await uow.audit.count_views(**filters)
