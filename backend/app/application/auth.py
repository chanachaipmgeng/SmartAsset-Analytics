from dataclasses import dataclass, replace
from uuid import UUID

from app.application.context import Actor
from app.domain.entities import User
from app.domain.enums import Role
from app.domain.errors import AuthenticationError, ValidationError
from app.domain.ports import PasswordHasher, TokenService, UnitOfWork

INVALID_LOGIN = "อีเมลหรือรหัสผ่านไม่ถูกต้อง"


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    user: User


def _claims(user: User) -> dict[str, str | None]:
    return {
        "sub": str(user.id),
        "role": user.role.value,
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
    }


def _issue(tokens: TokenService, user: User) -> TokenPair:
    claims = _claims(user)
    return TokenPair(tokens.issue_access(claims), tokens.issue_refresh({"sub": claims["sub"]}), user)


async def login(uow: UnitOfWork, hasher: PasswordHasher, tokens: TokenService, email: str, password: str) -> TokenPair:
    user = await uow.users.get_by_email(email)
    if user is None or not hasher.verify(user.password_hash, password):
        raise AuthenticationError(INVALID_LOGIN)
    if not user.is_active:
        raise AuthenticationError("บัญชีนี้ถูกระงับการใช้งาน")
    if user.tenant_id is not None:
        tenant = await uow.tenants.get(user.tenant_id)
        if tenant is None or not tenant.is_active:
            raise AuthenticationError("กลุ่มลูกค้าของบัญชีนี้ถูกระงับการใช้งาน")
    return _issue(tokens, user)


async def refresh(uow: UnitOfWork, tokens: TokenService, refresh_token: str) -> TokenPair:
    payload = tokens.decode(refresh_token, expected_type="refresh")
    user = await uow.users.get(UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise AuthenticationError("บัญชีนี้ไม่สามารถใช้งานได้")
    return _issue(tokens, user)


async def change_password(
    uow: UnitOfWork, hasher: PasswordHasher, actor: Actor, current_password: str, new_password: str
) -> None:
    """Self-service; a wrong current password is a 422, not a 401, so clients don't treat it as an expired session."""
    user = await uow.users.get(actor.user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("บัญชีนี้ไม่สามารถใช้งานได้")
    if not hasher.verify(user.password_hash, current_password):
        raise ValidationError("รหัสผ่านปัจจุบันไม่ถูกต้อง")
    if current_password == new_password:
        raise ValidationError("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม")
    await uow.users.update(replace(user, password_hash=hasher.hash(new_password)))
    await uow.flush()


def parse_access_claims(tokens: TokenService, token: str) -> tuple[UUID, Role, UUID | None]:
    payload = tokens.decode(token, expected_type="access")
    tenant = payload.get("tenant_id")
    return UUID(payload["sub"]), Role(payload["role"]), UUID(tenant) if tenant else None
