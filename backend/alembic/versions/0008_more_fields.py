"""Device asset tag / firmware / purchase supplier, customer address / tax id / notes,
installation site contact / notes / removal reason

Revision ID: 0008_more_fields
Revises: 0007_photos
Create Date: 2026-09-29
"""
from alembic import op

revision = "0008_more_fields"
down_revision = "0007_photos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE devices
            ADD COLUMN asset_tag text,
            ADD COLUMN firmware_version text,
            ADD COLUMN supplier_id uuid CONSTRAINT devices_supplier_fk REFERENCES suppliers(id)
        """
    )
    # Central stock (NULL tenant) counts as one owner for uniqueness.
    op.execute(
        "CREATE UNIQUE INDEX devices_asset_tag_uq ON devices "
        "(coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(asset_tag)) "
        "WHERE asset_tag IS NOT NULL"
    )
    op.execute("CREATE INDEX devices_supplier_idx ON devices (supplier_id) WHERE supplier_id IS NOT NULL")
    op.execute(
        """
        ALTER TABLE customers
            ADD COLUMN address text,
            ADD COLUMN tax_id text CONSTRAINT customers_tax_id_format CHECK (tax_id ~ '^[0-9]{13}$'),
            ADD COLUMN notes text
        """
    )
    op.execute(
        """
        ALTER TABLE installations
            ADD COLUMN site_contact text,
            ADD COLUMN site_phone text,
            ADD COLUMN notes text,
            ADD COLUMN removal_reason text
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE installations DROP COLUMN site_contact, DROP COLUMN site_phone, DROP COLUMN notes, DROP COLUMN removal_reason")
    op.execute("ALTER TABLE customers DROP COLUMN address, DROP COLUMN tax_id, DROP COLUMN notes")
    op.execute("DROP INDEX devices_asset_tag_uq")
    op.execute("ALTER TABLE devices DROP COLUMN asset_tag, DROP COLUMN firmware_version, DROP COLUMN supplier_id")
