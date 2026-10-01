"""Things that exist in several places and must agree: the state machine and enums in the backend, the migrations
(CHECK constraints, RLS) and the frontend (`device-actions.ts`, `models.ts`, `labels.ts`)."""

import re
from enum import StrEnum
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.application.bulk import BulkAction
from app.core.config import get_settings
from app.domain.enums import (
    AuditAction,
    AuditEntity,
    DeviceStatus,
    DocumentOwner,
    PhotoOwner,
    RepairOrderStatus,
    Role,
    ServiceLevel,
    TransactionType,
)
from app.domain.rules import ALLOWED_TRANSITIONS

REPO = Path(__file__).resolve().parents[2]
CORE = REPO / "frontend" / "src" / "app" / "core"
needs_frontend = pytest.mark.skipif(not CORE.is_dir(), reason="frontend sources not available")

# UI action id in device-actions.ts -> transaction type it performs.
UI_ACTIONS = {
    "transfer": TransactionType.TRANSFER,
    "checkout": TransactionType.CHECK_OUT,
    "install": TransactionType.INSTALL,
    "loan": TransactionType.LOAN,
    "return": TransactionType.RETURN,
    "qc_pass": TransactionType.QC_PASS,
    "qc_fail": TransactionType.QC_FAIL,
    "send_repair": TransactionType.SEND_REPAIR,
    "repair_done": TransactionType.REPAIR_DONE,
    "retire": TransactionType.RETIRE,
}

# TypeScript union type / label record -> backend enum.
UNIONS: dict[str, type[StrEnum]] = {
    "Role": Role,
    "DeviceStatus": DeviceStatus,
    "TransactionType": TransactionType,
    "ServiceLevel": ServiceLevel,
    "PhotoOwner": PhotoOwner,
    "AuditEntity": AuditEntity,
    "AuditAction": AuditAction,
}
LABELS: dict[str, type[StrEnum]] = {
    "STATUS_LABELS": DeviceStatus,
    "STATUS_TONES": DeviceStatus,
    "ROLE_LABELS": Role,
    "TX_LABELS": TransactionType,
    "TX_ICONS": TransactionType,
    "TX_TONES": TransactionType,
    "SERVICE_LEVEL_LABELS": ServiceLevel,
    "AUDIT_ENTITY_LABELS": AuditEntity,
    "AUDIT_ACTION_LABELS": AuditAction,
    "AUDIT_ACTION_TONES": AuditAction,
}

# CHECK constraint -> enum whose values it must list.
CHECKS: dict[str, type[StrEnum]] = {
    "users_role_check": Role,
    "devices_status_check": DeviceStatus,
    "inventory_transactions_transaction_type_check": TransactionType,
    "customers_service_level_check": ServiceLevel,
    "photos_owner_type_check": PhotoOwner,
    "repair_orders_status_check": RepairOrderStatus,
    "documents_owner_type_check": DocumentOwner,
    "audit_logs_entity_type_check": AuditEntity,
    "audit_logs_action_check": AuditAction,
}


def _values(enum: type[StrEnum]) -> set[str]:
    return {member.value for member in enum}


def _ui_rules() -> dict[str, set[str]]:
    """Action id -> statuses its `allowed` predicate accepts, parsed from the RULES array."""
    source = (CORE / "device-actions.ts").read_text(encoding="utf-8")
    body = source.split("const RULES: Rule[] = [", 1)[1].split("\n];", 1)[0]
    rules = {}
    for block in re.split(r"\n  \{", body)[1:]:
        action = re.search(r"id: '(\w+)'", block)
        allowed = re.search(r"allowed: (.+)", block)
        assert action and allowed, block
        rules[action.group(1)] = set(re.findall(r"'([A-Z_]+)'", allowed.group(1)))
    return rules


def _ts_union(source: str, name: str) -> set[str]:
    match = re.search(rf"export type {name} =([^;]+);", source)
    assert match, f"type {name} not found"
    return set(re.findall(r"'([^']+)'", match.group(1)))


def _ts_record_keys(source: str, name: str) -> set[str]:
    match = re.search(rf"export const {name}\b[^=]*= \{{(.*?)\n\}};", source, re.S)
    assert match, f"const {name} not found"
    return set(re.findall(r"^\s+'?([A-Za-z_]+)'?:", match.group(1), re.M))


@needs_frontend
def test_frontend_state_machine_matches_backend() -> None:
    rules = _ui_rules()
    assert set(rules) == set(UI_ACTIONS), "device-actions.ts actions differ from UI_ACTIONS"
    for action, tx_type in UI_ACTIONS.items():
        allowed_from, _ = ALLOWED_TRANSITIONS[tx_type]
        assert rules[action] == {s.value for s in allowed_from}, f"{action}: frontend {rules[action]} != backend"
    uncovered = set(ALLOWED_TRANSITIONS) - set(UI_ACTIONS.values())
    assert not uncovered, f"transitions without a UI action: {uncovered}"


@needs_frontend
def test_frontend_bulk_actions_match_backend() -> None:
    source = (CORE / "device-actions.ts").read_text(encoding="utf-8")
    body = source.split("export const BULK_ACTIONS = {", 1)[1].split("}", 1)[0]
    mapping = dict(re.findall(r"(\w+): '(\w+)'", body))
    assert set(mapping.values()) == _values(BulkAction)
    assert set(mapping) <= set(UI_ACTIONS)


@needs_frontend
def test_frontend_unions_match_enums() -> None:
    source = (CORE / "models.ts").read_text(encoding="utf-8")
    for name, enum in UNIONS.items():
        assert _ts_union(source, name) == _values(enum), f"models.ts {name} differs from {enum.__name__}"


@needs_frontend
def test_frontend_labels_cover_enums() -> None:
    source = (CORE / "labels.ts").read_text(encoding="utf-8")
    for name, enum in LABELS.items():
        assert _ts_record_keys(source, name) == _values(enum), f"labels.ts {name} differs from {enum.__name__}"


@pytest.mark.asyncio(loop_scope="session")
async def test_check_constraints_match_enums() -> None:
    engine = create_async_engine(get_settings().migration_database_url)
    try:
        async with engine.connect() as conn:
            rows = dict(
                (
                    await conn.execute(
                        text("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = ANY(:names)"),
                        {"names": list(CHECKS)},
                    )
                ).all()
            )
    finally:
        await engine.dispose()
    assert set(rows) == set(CHECKS), f"missing constraints: {set(CHECKS) - set(rows)}"
    for name, enum in CHECKS.items():
        assert set(re.findall(r"'([^']+)'::text", rows[name])) == _values(enum), f"{name} differs from {enum.__name__}"


@pytest.mark.asyncio(loop_scope="session")
async def test_rls_enabled_with_policies_on_every_app_table() -> None:
    engine = create_async_engine(get_settings().migration_database_url)
    try:
        async with engine.connect() as conn:
            rows = (
                await conn.execute(
                    text(
                        "SELECT c.relname, c.relrowsecurity, count(p.oid) FROM pg_class c "
                        "LEFT JOIN pg_policy p ON p.polrelid = c.oid "
                        "WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' "
                        "AND c.relname NOT IN ('alembic_version', 'spatial_ref_sys') GROUP BY c.oid"
                    )
                )
            ).all()
    finally:
        await engine.dispose()
    assert rows
    for table, enabled, policies in rows:
        assert enabled, f"{table}: row level security is not enabled"
        assert policies > 0, f"{table}: no RLS policy"
