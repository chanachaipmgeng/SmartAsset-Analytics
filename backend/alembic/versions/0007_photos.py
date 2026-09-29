"""Photos attached to devices, installations, transactions, users and device models

Revision ID: 0007_photos
Revises: 0006_suppliers
Create Date: 2026-09-29
"""
from alembic import op

revision = "0007_photos"
down_revision = "0006_suppliers"
branch_labels = None
depends_on = None

# Device model images are platform-wide like the models themselves; everything else follows its owner's tenant.
TENANT_WRITE = "app_bypass_rls() OR (owner_type <> 'device_model' AND tenant_id = app_current_tenant())"


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE photos (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid REFERENCES tenants(id),
            owner_type text NOT NULL
                CHECK (owner_type IN ('device', 'installation', 'transaction', 'user', 'device_model')),
            owner_id uuid NOT NULL,
            content_type text NOT NULL,
            size_bytes integer NOT NULL CHECK (size_bytes > 0),
            width integer NOT NULL CHECK (width > 0),
            height integer NOT NULL CHECK (height > 0),
            caption text,
            uploaded_by uuid NOT NULL REFERENCES users(id),
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX photos_owner_idx ON photos (owner_type, owner_id, created_at)")
    op.execute("CREATE INDEX photos_tenant_idx ON photos (tenant_id)")
    op.execute("ALTER TABLE photos ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY photos_read ON photos FOR SELECT "
        "USING (app_bypass_rls() OR owner_type = 'device_model' OR tenant_id = app_current_tenant())"
    )
    op.execute(f"CREATE POLICY photos_insert ON photos FOR INSERT WITH CHECK ({TENANT_WRITE})")
    op.execute(f"CREATE POLICY photos_update ON photos FOR UPDATE USING ({TENANT_WRITE}) WITH CHECK ({TENANT_WRITE})")
    op.execute(f"CREATE POLICY photos_delete ON photos FOR DELETE USING ({TENANT_WRITE})")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON photos TO inventory_app")


def downgrade() -> None:
    op.execute("DROP TABLE photos")
