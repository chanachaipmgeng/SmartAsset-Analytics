"""inventory_transactions.occurred_at uses clock_timestamp() so movements in one request keep their order

Revision ID: 0002_tx_clock_timestamp
Revises: 0001_initial
Create Date: 2026-09-29
"""
from alembic import op

revision = "0002_tx_clock_timestamp"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE inventory_transactions ALTER COLUMN occurred_at SET DEFAULT clock_timestamp()")


def downgrade() -> None:
    op.execute("ALTER TABLE inventory_transactions ALTER COLUMN occurred_at SET DEFAULT now()")
