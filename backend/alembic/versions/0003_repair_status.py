"""Repair / QC: IN_REPAIR device status and SEND_REPAIR / REPAIR_DONE movements

Revision ID: 0003_repair_status
Revises: 0002_tx_clock_timestamp
Create Date: 2026-09-29
"""
from alembic import op

revision = "0003_repair_status"
down_revision = "0002_tx_clock_timestamp"
branch_labels = None
depends_on = None

STATUSES = ("IN_STOCK", "CHECKED_OUT", "INSTALLED", "IN_REPAIR", "RETIRED")
TX_TYPES = ("CHECK_IN", "TRANSFER", "CHECK_OUT", "INSTALL", "RETURN", "SEND_REPAIR", "REPAIR_DONE", "RETIRE")


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _set_checks(statuses: tuple[str, ...], tx_types: tuple[str, ...]) -> None:
    op.execute("ALTER TABLE devices DROP CONSTRAINT devices_status_check")
    op.execute(f"ALTER TABLE devices ADD CONSTRAINT devices_status_check CHECK (status IN ({_in(statuses)}))")
    op.execute("ALTER TABLE inventory_transactions DROP CONSTRAINT inventory_transactions_transaction_type_check")
    op.execute(
        "ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_transaction_type_check "
        f"CHECK (transaction_type IN ({_in(tx_types)}))"
    )


def upgrade() -> None:
    _set_checks(STATUSES, TX_TYPES)


def downgrade() -> None:
    # Fails if repair rows exist; resolve them (REPAIR_DONE / RETIRE) before downgrading.
    _set_checks(
        tuple(s for s in STATUSES if s != "IN_REPAIR"),
        tuple(t for t in TX_TYPES if t not in ("SEND_REPAIR", "REPAIR_DONE")),
    )
