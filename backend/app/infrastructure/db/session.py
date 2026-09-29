from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine


class Database:
    def __init__(self, url: str) -> None:
        self.engine: AsyncEngine = create_async_engine(url, pool_size=10, max_overflow=5, pool_pre_ping=True)
        self._sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    @asynccontextmanager
    async def scoped(self, *, role: str, tenant_id: UUID | None) -> AsyncIterator[AsyncSession]:
        """One transaction per request; RLS context is transaction-local so pooled connections stay clean."""
        async with self._sessions() as session, session.begin():
            await session.execute(
                text("SELECT set_config('app.role', :role, true), set_config('app.tenant_id', :tenant, true)"),
                {"role": role, "tenant": str(tenant_id) if tenant_id else ""},
            )
            yield session

    async def dispose(self) -> None:
        await self.engine.dispose()
