"""Repair work orders linked to SEND_REPAIR / QC_FAIL and closed by REPAIR_DONE

Revision ID: 0010_repair_orders
Revises: 0009_audit_log
Create Date: 2026-10-01
"""
from alembic import op

revision = "0010_repair_orders"
down_revision = "0009_audit_log"
branch_labels = None
depends_on = None

TENANT = "app_bypass_rls() OR tenant_id = app_current_tenant()"


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE repair_orders (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid REFERENCES tenants(id),
            device_id uuid NOT NULL REFERENCES devices(id),
            supplier_id uuid REFERENCES suppliers(id),
            opened_by uuid NOT NULL REFERENCES users(id),
            opened_tx_id uuid REFERENCES inventory_transactions(id),
            closed_tx_id uuid REFERENCES inventory_transactions(id),
            status text NOT NULL
                CONSTRAINT repair_orders_status_check CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
            defect_note text NOT NULL,
            parts text,
            labor_cost numeric(12, 2) CHECK (labor_cost IS NULL OR labor_cost >= 0),
            parts_cost numeric(12, 2) CHECK (parts_cost IS NULL OR parts_cost >= 0),
            due_date date,
            assignee_name text,
            closed_at timestamptz,
            qc_note text,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX repair_orders_device_idx ON repair_orders (device_id, status)")
    op.execute("CREATE INDEX repair_orders_tenant_idx ON repair_orders (tenant_id, status)")
    op.execute(
        "CREATE UNIQUE INDEX repair_orders_open_device_uq ON repair_orders (device_id) "
        "WHERE status = 'OPEN'"
    )
    op.execute("ALTER TABLE repair_orders ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY repair_orders_tenant_isolation ON repair_orders "
        f"USING ({TENANT}) WITH CHECK ({TENANT})"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON repair_orders TO inventory_app")


def downgrade() -> None:
    op.execute("DROP TABLE repair_orders")
