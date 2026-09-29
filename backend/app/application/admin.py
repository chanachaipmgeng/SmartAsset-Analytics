"""Tenants, users and device models: platform administration use cases."""

from dataclasses import replace
from typing import Any
from uuid import UUID

from app.application.context import Actor
from app.domain.entities import DeviceModel, Tenant, User
from app.domain.enums import Role
from app.domain.errors import ConflictError, NotFoundError, PermissionDeniedError
from app.domain.ports import PasswordHasher, UnitOfWork
from app.domain.rules import require_admin, require_superadmin, validate_user_scope


async def list_tenants(uow: UnitOfWork, actor: Actor) -> list[Tenant]:
    return await uow.tenants.list()


async def create_tenant(uow: UnitOfWork, actor: Actor, *, name: str, code: str) -> Tenant:
    require_superadmin(actor.role)
    tenant = Tenant(name=name.strip(), code=code.strip().upper())
    await uow.tenants.add(tenant)
    await uow.flush()
    return tenant


async def update_tenant(uow: UnitOfWork, actor: Actor, tenant_id: UUID, changes: dict[str, Any]) -> Tenant:
    require_superadmin(actor.role)
    tenant = await uow.tenants.get(tenant_id)
    if tenant is None:
        raise NotFoundError("ไม่พบกลุ่มลูกค้า")
    if "code" in changes and changes["code"]:
        changes["code"] = changes["code"].strip().upper()
    tenant = replace(tenant, **changes)
    await uow.tenants.update(tenant)
    await uow.flush()
    return tenant


async def list_users(uow: UnitOfWork, actor: Actor) -> list[User]:
    require_admin(actor.role)
    return await uow.users.list()


def _check_user_scope(actor: Actor, role: Role, tenant_id: UUID | None) -> None:
    if not actor.is_superadmin:
        if role == Role.SUPERADMIN:
            raise PermissionDeniedError("ไม่สามารถสร้างหรือแก้ไขบัญชี Superadmin ได้")
        if tenant_id != actor.tenant_id:
            raise PermissionDeniedError("จัดการได้เฉพาะผู้ใช้ในกลุ่มลูกค้าของตนเอง")
    validate_user_scope(role, tenant_id)


async def create_user(
    uow: UnitOfWork,
    hasher: PasswordHasher,
    actor: Actor,
    *,
    email: str,
    full_name: str,
    role: Role,
    password: str,
    tenant_id: UUID | None,
) -> User:
    require_admin(actor.role)
    if not actor.is_superadmin:
        tenant_id = actor.tenant_id
    _check_user_scope(actor, role, tenant_id)
    user = User(
        email=email.strip().lower(),
        full_name=full_name.strip(),
        role=role,
        password_hash=hasher.hash(password),
        tenant_id=tenant_id,
    )
    await uow.users.add(user)
    await uow.flush()
    return user


async def update_user(
    uow: UnitOfWork, hasher: PasswordHasher, actor: Actor, user_id: UUID, changes: dict[str, Any]
) -> User:
    require_admin(actor.role)
    user = await uow.users.get(user_id)
    if user is None:
        raise NotFoundError("ไม่พบผู้ใช้")
    if not actor.is_superadmin:
        changes.pop("tenant_id", None)
    password = changes.pop("password", None)
    if password:
        changes["password_hash"] = hasher.hash(password)
    if user_id == actor.user_id and (changes.get("is_active") is False or changes.get("role", user.role) != user.role):
        raise ConflictError("ไม่สามารถระงับหรือเปลี่ยนบทบาทของบัญชีตนเองได้")
    _check_user_scope(actor, user.role, user.tenant_id)
    updated = replace(user, **changes)
    _check_user_scope(actor, updated.role, updated.tenant_id)
    await uow.users.update(updated)
    await uow.flush()
    return updated


async def list_device_models(uow: UnitOfWork, actor: Actor) -> list[DeviceModel]:
    return await uow.device_models.list()


async def create_device_model(uow: UnitOfWork, actor: Actor, **data: Any) -> DeviceModel:
    require_superadmin(actor.role)
    model = DeviceModel(**data)
    await uow.device_models.add(model)
    await uow.flush()
    return model


async def update_device_model(uow: UnitOfWork, actor: Actor, model_id: UUID, changes: dict[str, Any]) -> DeviceModel:
    require_superadmin(actor.role)
    model = await uow.device_models.get(model_id)
    if model is None:
        raise NotFoundError("ไม่พบรุ่นอุปกรณ์")
    model = replace(model, **changes)
    await uow.device_models.update(model)
    await uow.flush()
    return model


async def delete_device_model(uow: UnitOfWork, actor: Actor, model_id: UUID) -> None:
    require_superadmin(actor.role)
    if await uow.device_models.get(model_id) is None:
        raise NotFoundError("ไม่พบรุ่นอุปกรณ์")
    if await uow.device_models.is_in_use(model_id):
        raise ConflictError("มีอุปกรณ์ใช้งานรุ่นนี้อยู่ ไม่สามารถลบได้")
    await uow.device_models.delete(model_id)
    await uow.flush()
