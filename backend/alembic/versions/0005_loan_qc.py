"""Loan and inspection: ON_LOAN / UNDER_QC statuses, LOAN / QC_PASS / QC_FAIL movements, devices.loan_due_date

Revision ID: 0005_loan_qc
Revises: 0004_edit_audit
Create Date: 2026-09-29
"""
import sqlalchemy as sa
from alembic import op

revision = "0005_loan_qc"
down_revision = "0004_edit_audit"
branch_labels = None
depends_on = None

STATUSES = ("IN_STOCK", "CHECKED_OUT", "INSTALLED", "ON_LOAN", "UNDER_QC", "IN_REPAIR", "RETIRED")
TX_TYPES = (
    "CHECK_IN", "TRANSFER", "CHECK_OUT", "INSTALL", "RETURN", "LOAN", "QC_PASS", "QC_FAIL",
    "SEND_REPAIR", "REPAIR_DONE", "RETIRE", "EDIT",
)
NEW_STATUSES = ("ON_LOAN", "UNDER_QC")
NEW_TX_TYPES = ("LOAN", "QC_PASS", "QC_FAIL")


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
    op.add_column("devices", sa.Column("loan_due_date", sa.Date(), nullable=True))
    op.create_index(
        "devices_loan_due_idx", "devices", ["loan_due_date"], postgresql_where=sa.text("status = 'ON_LOAN'")
    )


def downgrade() -> None:
    # Fails if devices are on loan or awaiting QC, or history contains the new movements; resolve those first.
    op.drop_index("devices_loan_due_idx", table_name="devices")
    op.drop_column("devices", "loan_due_date")
    _set_checks(
        tuple(s for s in STATUSES if s not in NEW_STATUSES),
        tuple(t for t in TX_TYPES if t not in NEW_TX_TYPES),
    )
