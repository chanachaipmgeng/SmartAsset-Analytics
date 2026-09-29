"""Data integrity checks that the application maintains but the schema can't enforce on its own.

Run (API container): python -m app.infrastructure.check_integrity   (exit code 1 when problems are found)
Uses the owner connection so it sees every tenant; read-only.
"""

import asyncio
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from app.core.config import get_settings
from app.infrastructure.media import LocalPhotoStorage

# (description, query returning one row per problem; the first column identifies the row)
SQL_CHECKS: list[tuple[str, str]] = [
    (
        "device status differs from its latest transaction",
        """
        SELECT d.serial_number, d.status, t.to_status
        FROM devices d
        LEFT JOIN LATERAL (
            SELECT to_status FROM inventory_transactions
            WHERE device_id = d.id ORDER BY occurred_at DESC, id DESC LIMIT 1
        ) t ON true
        WHERE t.to_status IS DISTINCT FROM d.status
        """,
    ),
    (
        "device has no CHECK_IN as its first transaction",
        """
        SELECT d.serial_number, t.transaction_type
        FROM devices d
        LEFT JOIN LATERAL (
            SELECT transaction_type FROM inventory_transactions
            WHERE device_id = d.id ORDER BY occurred_at, id LIMIT 1
        ) t ON true
        WHERE t.transaction_type IS DISTINCT FROM 'CHECK_IN'
        """,
    ),
    (
        "INSTALLED must have exactly one active installation, other statuses none",
        """
        SELECT d.serial_number, d.status, count(i.id) AS active_installations
        FROM devices d
        LEFT JOIN installations i ON i.device_id = d.id AND i.removed_at IS NULL
        GROUP BY d.id
        HAVING (d.status = 'INSTALLED') <> (count(i.id) = 1) OR count(i.id) > 1
        """,
    ),
    (
        "loan_due_date is set exactly when the device is ON_LOAN",
        """
        SELECT serial_number, status, loan_due_date FROM devices
        WHERE (loan_due_date IS NOT NULL) <> (status = 'ON_LOAN')
        """,
    ),
    (
        "active installation belongs to another tenant than its device or customer",
        """
        SELECT i.id, i.tenant_id, d.tenant_id AS device_tenant, c.tenant_id AS customer_tenant
        FROM installations i
        JOIN devices d ON d.id = i.device_id
        JOIN customers c ON c.id = i.customer_id
        WHERE i.removed_at IS NULL AND (i.tenant_id <> c.tenant_id OR i.tenant_id IS DISTINCT FROM d.tenant_id)
        """,
    ),
    (
        "transaction tenant differs from the customer's tenant",
        """
        SELECT t.id, t.tenant_id, c.tenant_id AS customer_tenant
        FROM inventory_transactions t
        JOIN customers c ON c.id = t.customer_id
        WHERE t.tenant_id IS DISTINCT FROM c.tenant_id
        """,
    ),
    (
        "photo owner is missing",
        """
        SELECT p.id, p.owner_type, p.owner_id FROM photos p
        WHERE NOT CASE p.owner_type
            WHEN 'device' THEN EXISTS (SELECT 1 FROM devices WHERE id = p.owner_id)
            WHEN 'installation' THEN EXISTS (SELECT 1 FROM installations WHERE id = p.owner_id)
            WHEN 'transaction' THEN EXISTS (SELECT 1 FROM inventory_transactions WHERE id = p.owner_id)
            WHEN 'user' THEN EXISTS (SELECT 1 FROM users WHERE id = p.owner_id)
            WHEN 'device_model' THEN EXISTS (SELECT 1 FROM device_models WHERE id = p.owner_id)
            ELSE false
        END
        """,
    ),
    (
        "photo tenant differs from its owner's tenant",
        """
        SELECT p.id, p.owner_type, p.tenant_id, o.tenant_id AS owner_tenant
        FROM photos p
        JOIN LATERAL (
            SELECT tenant_id FROM devices WHERE p.owner_type = 'device' AND id = p.owner_id
            UNION ALL SELECT tenant_id FROM installations WHERE p.owner_type = 'installation' AND id = p.owner_id
            UNION ALL SELECT tenant_id FROM inventory_transactions WHERE p.owner_type = 'transaction' AND id = p.owner_id
            UNION ALL SELECT tenant_id FROM users WHERE p.owner_type = 'user' AND id = p.owner_id
            UNION ALL SELECT NULL::uuid FROM device_models WHERE p.owner_type = 'device_model' AND id = p.owner_id
        ) o ON true
        WHERE p.tenant_id IS DISTINCT FROM o.tenant_id
        """,
    ),
    (
        "single-photo owner (user, device model) has more than one photo",
        """
        SELECT owner_type, owner_id, count(*) FROM photos
        WHERE owner_type IN ('user', 'device_model')
        GROUP BY owner_type, owner_id HAVING count(*) > 1
        """,
    ),
]


async def find_problems(conn: AsyncConnection, media: LocalPhotoStorage | None = None) -> list[str]:
    """Human-readable problems; empty when the data is consistent. `media` also checks photo files exist."""
    problems: list[str] = []
    for description, query in SQL_CHECKS:
        rows = (await conn.execute(text(query))).all()
        problems += [f"{description}: {tuple(row)}" for row in rows]
    if media is not None:
        ids: list[UUID] = list((await conn.execute(text("SELECT id FROM photos"))).scalars())
        problems += await asyncio.to_thread(_missing_files, media, ids)
    return problems


def _missing_files(media: LocalPhotoStorage, ids: list[UUID]) -> list[str]:
    problems = []
    for photo_id in ids:
        missing = [v for v in ("full", "thumb") if not Path(media.path(photo_id, v)).is_file()]
        if missing:
            problems.append(f"photo file missing: {photo_id} ({', '.join(missing)})")
    return problems


async def main() -> int:
    settings = get_settings()
    engine = create_async_engine(settings.migration_database_url)
    try:
        async with engine.connect() as conn:
            problems = await find_problems(conn, LocalPhotoStorage(settings.media_root, settings.jwt_secret))
    finally:
        await engine.dispose()
    for problem in problems:
        print(problem)
    print(f"check_integrity: {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
