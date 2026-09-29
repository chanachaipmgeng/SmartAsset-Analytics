"""Runs the integrity checks against the dev database (seed, demo data and whatever earlier tests left behind)."""

from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.infrastructure.check_integrity import find_problems
from app.infrastructure.media import LocalPhotoStorage

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_database_is_consistent() -> None:
    settings = get_settings()
    media = LocalPhotoStorage(settings.media_root, settings.jwt_secret) if Path(settings.media_root).is_dir() else None
    engine = create_async_engine(settings.migration_database_url)
    try:
        async with engine.connect() as conn:
            problems = await find_problems(conn, media)
    finally:
        await engine.dispose()
    assert not problems, "\n".join(problems)
