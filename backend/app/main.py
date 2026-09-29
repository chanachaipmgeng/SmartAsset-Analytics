from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.infrastructure.db.session import Database
from app.infrastructure.media import LocalPhotoStorage
from app.infrastructure.security import Argon2PasswordHasher, JwtTokenService
from app.presentation.deps import Container
from app.presentation.errors import register_error_handlers
from app.presentation.routers import router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    db = Database(settings.database_url)
    app.state.container = Container(
        db=db,
        hasher=Argon2PasswordHasher(),
        tokens=JwtTokenService(
            settings.jwt_secret, settings.jwt_algorithm, settings.access_token_minutes, settings.refresh_token_days
        ),
        media=LocalPhotoStorage(settings.media_root, settings.jwt_secret),
    )
    try:
        yield
    finally:
        await db.dispose()


def create_app() -> FastAPI:
    app = FastAPI(title="SmartAsset Analytics", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(router)

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
