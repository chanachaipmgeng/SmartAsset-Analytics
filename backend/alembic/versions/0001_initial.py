"""initial schema: inventory, customers, installations (PostGIS) and RLS

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-29
"""
from alembic import op

from app.core.config import get_settings

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

TENANT_SCOPED = ("users", "devices", "customers", "installations")


def _run(script: str) -> None:
    """asyncpg rejects multi-statement strings, so split on ';' outside $$ bodies."""
    buf: list[str] = []
    in_dollar = False
    for line in script.splitlines():
        if line.strip().startswith("--"):
            continue
        buf.append(line)
        in_dollar ^= line.count("$$") % 2 == 1
        if not in_dollar and line.rstrip().endswith(";"):
            stmt = "\n".join(buf).strip().rstrip(";")
            if stmt:
                op.execute(stmt)
            buf = []
    tail = "\n".join(buf).strip()
    if tail:
        op.execute(tail)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    _run(
        """
        CREATE FUNCTION app_current_tenant() RETURNS uuid
        LANGUAGE sql STABLE AS $$
            SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
        $$;

        -- 'system' is set only by the auth use cases (login/refresh) before a tenant is known.
        CREATE FUNCTION app_bypass_rls() RETURNS boolean
        LANGUAGE sql STABLE AS $$
            SELECT coalesce(current_setting('app.role', true), '') IN ('superadmin', 'system')
        $$;
        """
    )

    _run(
        """
        CREATE TABLE tenants (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL,
            code text NOT NULL UNIQUE,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE users (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid REFERENCES tenants(id),
            email text NOT NULL,
            full_name text NOT NULL,
            role text NOT NULL CHECK (role IN ('superadmin', 'tenant_admin', 'staff', 'viewer')),
            password_hash text NOT NULL,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT users_role_scope CHECK ((role = 'superadmin') = (tenant_id IS NULL))
        );
        CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

        CREATE TABLE device_models (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            brand text NOT NULL,
            name text NOT NULL,
            device_type text NOT NULL,
            firmware_version text,
            description text,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT device_models_brand_name_uq UNIQUE (brand, name)
        );

        CREATE TABLE devices (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            serial_number text NOT NULL UNIQUE,
            mac_address text,
            model_id uuid NOT NULL REFERENCES device_models(id),
            tenant_id uuid REFERENCES tenants(id),
            status text NOT NULL DEFAULT 'IN_STOCK'
                CHECK (status IN ('IN_STOCK', 'CHECKED_OUT', 'INSTALLED', 'RETIRED')),
            purchase_date date,
            cost numeric(12, 2) CHECK (cost IS NULL OR cost >= 0),
            warranty_end date,
            notes text,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX devices_tenant_status_idx ON devices (tenant_id, status);
        CREATE INDEX devices_warranty_end_idx ON devices (warranty_end);

        CREATE TABLE customers (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants(id),
            company_name text NOT NULL,
            contact_person text,
            phone text,
            email text,
            service_level text NOT NULL DEFAULT 'STANDARD'
                CHECK (service_level IN ('BASIC', 'STANDARD', 'PREMIUM')),
            created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX customers_tenant_idx ON customers (tenant_id);

        CREATE TABLE inventory_transactions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id uuid NOT NULL REFERENCES devices(id),
            tenant_id uuid REFERENCES tenants(id),
            from_tenant_id uuid REFERENCES tenants(id),
            transaction_type text NOT NULL
                CHECK (transaction_type IN ('CHECK_IN', 'TRANSFER', 'CHECK_OUT', 'INSTALL', 'RETURN', 'RETIRE')),
            from_status text,
            to_status text NOT NULL,
            customer_id uuid REFERENCES customers(id),
            user_id uuid NOT NULL REFERENCES users(id),
            note text,
            occurred_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX inventory_tx_device_idx ON inventory_transactions (device_id, occurred_at DESC);
        CREATE INDEX inventory_tx_tenant_idx ON inventory_transactions (tenant_id, occurred_at DESC);

        CREATE TABLE installations (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id uuid NOT NULL REFERENCES devices(id),
            tenant_id uuid NOT NULL REFERENCES tenants(id),
            customer_id uuid NOT NULL REFERENCES customers(id),
            install_date date NOT NULL,
            latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
            longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
            location geography(Point, 4326) GENERATED ALWAYS AS (
                ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
            ) STORED,
            address text,
            removed_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX installations_location_gist ON installations USING GIST (location);
        CREATE UNIQUE INDEX installations_active_device_uq ON installations (device_id) WHERE removed_at IS NULL;
        CREATE INDEX installations_tenant_idx ON installations (tenant_id);
        """
    )

    for table in (*TENANT_SCOPED, "tenants", "device_models", "inventory_transactions"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    for table in TENANT_SCOPED:
        _run(
            f"""
            CREATE POLICY {table}_tenant_isolation ON {table}
                USING (app_bypass_rls() OR tenant_id = app_current_tenant())
                WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())
            """
        )

    _run(
        """
        CREATE POLICY tenants_read_own ON tenants FOR SELECT
            USING (app_bypass_rls() OR id = app_current_tenant());
        CREATE POLICY tenants_superadmin_write ON tenants FOR ALL
            USING (app_bypass_rls()) WITH CHECK (app_bypass_rls());

        CREATE POLICY device_models_read_all ON device_models FOR SELECT USING (true);
        CREATE POLICY device_models_superadmin_write ON device_models FOR ALL
            USING (app_bypass_rls()) WITH CHECK (app_bypass_rls());

        CREATE POLICY inventory_tx_tenant_isolation ON inventory_transactions
            USING (app_bypass_rls() OR tenant_id = app_current_tenant() OR from_tenant_id = app_current_tenant())
            WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());
        """
    )

    password = get_settings().app_db_password.replace("'", "''")
    if not password:
        raise RuntimeError("APP_DB_PASSWORD must be set before running migrations")
    _run(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inventory_app') THEN
                CREATE ROLE inventory_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '{password}';
            ELSE
                ALTER ROLE inventory_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '{password}';
            END IF;
        END $$;

        GRANT USAGE ON SCHEMA public TO inventory_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            tenants, users, device_models, devices, customers, inventory_transactions, installations
            TO inventory_app;
        GRANT EXECUTE ON FUNCTION app_current_tenant(), app_bypass_rls() TO inventory_app;
        """
    )


def downgrade() -> None:
    _run(
        """
        DROP TABLE IF EXISTS installations, inventory_transactions, customers, devices,
            device_models, users, tenants CASCADE;
        DROP FUNCTION IF EXISTS app_bypass_rls();
        DROP FUNCTION IF EXISTS app_current_tenant();
        """
    )
