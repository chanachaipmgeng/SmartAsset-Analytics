from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.application.auth import parse_access_claims
from app.application.context import Actor
from app.domain.errors import AuthenticationError
from app.infrastructure.db.repositories import SqlUnitOfWork
from app.infrastructure.db.session import Database
from app.infrastructure.media import LocalDocumentStorage, LocalPhotoStorage
from app.infrastructure.security import Argon2PasswordHasher, JwtTokenService


@dataclass
class Container:
    db: Database
    hasher: Argon2PasswordHasher
    tokens: JwtTokenService
    media: LocalPhotoStorage
    documents: LocalDocumentStorage


def get_container(request: Request) -> Container:
    return request.app.state.container


ContainerDep = Annotated[Container, Depends(get_container)]
_bearer = HTTPBearer(auto_error=False)


def get_actor(
    container: ContainerDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Actor:
    if credentials is None:
        raise AuthenticationError("กรุณาเข้าสู่ระบบ")
    user_id, role, tenant_id = parse_access_claims(container.tokens, credentials.credentials)
    return Actor(user_id=user_id, role=role, tenant_id=tenant_id)


ActorDep = Annotated[Actor, Depends(get_actor)]


async def get_uow(container: ContainerDep, actor: ActorDep) -> AsyncIterator[SqlUnitOfWork]:
    async with container.db.scoped(role=actor.role.value, tenant_id=actor.tenant_id) as session:
        yield SqlUnitOfWork(session)


async def get_system_uow(container: ContainerDep) -> AsyncIterator[SqlUnitOfWork]:
    async with container.db.scoped(role="system", tenant_id=None) as session:
        yield SqlUnitOfWork(session)


# scope="function" commits before the response is sent, so clients never read uncommitted results.
UowDep = Annotated[SqlUnitOfWork, Depends(get_uow, scope="function")]
SystemUowDep = Annotated[SqlUnitOfWork, Depends(get_system_uow, scope="function")]
