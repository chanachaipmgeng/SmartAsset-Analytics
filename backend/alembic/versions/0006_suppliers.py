"""Suppliers / repair shops (platform-wide) and inventory_transactions.supplier_id

Revision ID: 0006_suppliers
Revises: 0005_loan_qc
Create Date: 2026-09-29
"""
from alembic import op

revision = "0006_suppliers"
down_revision = "0005_loan_qc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE suppliers (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL,
            contact_person text,
            phone text,
            email text,
            notes text,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX suppliers_name_uq ON suppliers (lower(name))")
    op.execute("ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY suppliers_read_all ON suppliers FOR SELECT USING (true)")
    op.execute(
        "CREATE POLICY suppliers_superadmin_write ON suppliers FOR ALL "
        "USING (app_bypass_rls()) WITH CHECK (app_bypass_rls())"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO inventory_app")
    op.execute(
        "ALTER TABLE inventory_transactions ADD COLUMN supplier_id uuid "
        "CONSTRAINT inventory_tx_supplier_fk REFERENCES suppliers(id)"
    )
    op.execute(
        "CREATE INDEX inventory_tx_supplier_idx ON inventory_transactions (supplier_id) WHERE supplier_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE inventory_transactions DROP COLUMN supplier_id")
    op.execute("DROP TABLE suppliers")
