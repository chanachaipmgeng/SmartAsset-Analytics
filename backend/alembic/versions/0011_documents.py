"""Non-photo document attachments (PDF/DOCX/XLSX) for devices, customers and repair orders

Revision ID: 0011_documents
Revises: 0010_repair_orders
Create Date: 2026-10-01
"""
from alembic import op

revision = "0011_documents"
down_revision = "0010_repair_orders"
branch_labels = None
depends_on = None

# Device-model-style shared owners are not used; every document follows its owner's tenant.
TENANT_WRITE = "app_bypass_rls() OR tenant_id = app_current_tenant()"
ENTITY_TYPES = (
    "tenant",
    "user",
    "device_model",
    "supplier",
    "customer",
    "installation",
    "photo",
    "document",
)


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE documents (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid REFERENCES tenants(id),
            owner_type text NOT NULL
                CONSTRAINT documents_owner_type_check
                CHECK (owner_type IN ('device', 'customer', 'repair_order')),
            owner_id uuid NOT NULL,
            file_name text NOT NULL,
            content_type text NOT NULL,
            size_bytes integer NOT NULL CHECK (size_bytes > 0),
            caption text,
            uploaded_by uuid NOT NULL REFERENCES users(id),
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX documents_owner_idx ON documents (owner_type, owner_id, created_at)")
    op.execute("CREATE INDEX documents_tenant_idx ON documents (tenant_id)")
    op.execute("ALTER TABLE documents ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY documents_read ON documents FOR SELECT USING ({TENANT_WRITE})"
    )
    op.execute(f"CREATE POLICY documents_insert ON documents FOR INSERT WITH CHECK ({TENANT_WRITE})")
    op.execute(
        f"CREATE POLICY documents_update ON documents FOR UPDATE USING ({TENANT_WRITE}) WITH CHECK ({TENANT_WRITE})"
    )
    op.execute(f"CREATE POLICY documents_delete ON documents FOR DELETE USING ({TENANT_WRITE})")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO inventory_app")

    # Extend audit entity CHECK to cover document create/delete.
    op.execute("ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_type_check")
    op.execute(
        f"ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_check "
        f"CHECK (entity_type IN ({_in(ENTITY_TYPES)}))"
    )


def downgrade() -> None:
    prev = (
        "tenant",
        "user",
        "device_model",
        "supplier",
        "customer",
        "installation",
        "photo",
    )
    op.execute("ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_type_check")
    op.execute(
        f"ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_check "
        f"CHECK (entity_type IN ({_in(prev)}))"
    )
    op.execute("DROP TABLE documents")
