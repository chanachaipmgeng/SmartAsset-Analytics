"""Audit log for settings changes (tenants, users, models, suppliers, customers, installations, photos)

Revision ID: 0009_audit_log
Revises: 0008_more_fields
Create Date: 2026-09-29
"""
from alembic import op

revision = "0009_audit_log"
down_revision = "0008_more_fields"
branch_labels = None
depends_on = None

ENTITY_TYPES = ("tenant", "user", "device_model", "supplier", "customer", "installation", "photo")
ACTIONS = ("create", "update", "delete", "deactivate")


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE audit_logs (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid REFERENCES tenants(id),
            user_id uuid NOT NULL REFERENCES users(id),
            entity_type text NOT NULL CONSTRAINT audit_logs_entity_type_check CHECK (entity_type IN ({_in(ENTITY_TYPES)})),
            entity_id uuid NOT NULL,
            entity_label text,
            action text NOT NULL CONSTRAINT audit_logs_action_check CHECK (action IN ({_in(ACTIONS)})),
            changes jsonb NOT NULL DEFAULT '{{}}'::jsonb,
            occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
        )
        """
    )
    op.execute("CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, occurred_at DESC)")
    op.execute("CREATE INDEX audit_logs_tenant_idx ON audit_logs (tenant_id, occurred_at DESC)")
    op.execute("ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY")
    # Rows without a tenant (tenants, models, suppliers, platform users) are superadmin-only;
    # within a tenant only its admins read the log, while any writer may append to it.
    op.execute(
        "CREATE POLICY audit_logs_read ON audit_logs FOR SELECT USING (app_bypass_rls() OR "
        "(tenant_id = app_current_tenant() AND current_setting('app.role', true) = 'tenant_admin'))"
    )
    op.execute(
        "CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT "
        "WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())"
    )
    # Append-only: the app role gets no UPDATE or DELETE.
    op.execute("GRANT SELECT, INSERT ON audit_logs TO inventory_app")


def downgrade() -> None:
    op.execute("DROP TABLE audit_logs")
