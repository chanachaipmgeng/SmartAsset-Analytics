"""Audit device edits (EDIT transaction type) and deactivate customers instead of deleting them

Revision ID: 0004_edit_audit
Revises: 0003_repair_status
Create Date: 2026-09-29
"""
import sqlalchemy as sa
from alembic import op

revision = "0004_edit_audit"
down_revision = "0003_repair_status"
branch_labels = None
depends_on = None

TX_TYPES = ("CHECK_IN", "TRANSFER", "CHECK_OUT", "INSTALL", "RETURN", "SEND_REPAIR", "REPAIR_DONE", "RETIRE", "EDIT")


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _set_tx_check(tx_types: tuple[str, ...]) -> None:
    op.execute("ALTER TABLE inventory_transactions DROP CONSTRAINT inventory_transactions_transaction_type_check")
    op.execute(
        "ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_transaction_type_check "
        f"CHECK (transaction_type IN ({_in(tx_types)}))"
    )


def upgrade() -> None:
    _set_tx_check(TX_TYPES)
    op.add_column("customers", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column("customers", "is_active")
    op.execute("DELETE FROM inventory_transactions WHERE transaction_type = 'EDIT'")
    _set_tx_check(tuple(t for t in TX_TYPES if t != "EDIT"))
