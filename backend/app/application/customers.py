from dataclasses import replace
from datetime import datetime
from typing import Any
from uuid import UUID

from app.application import audit
from app.application.context import Actor
from app.application.dashboard import BUSINESS_OFFSET
from app.domain.entities import Customer
from app.domain.enums import AuditEntity
from app.domain.errors import ConflictError, NotFoundError, PermissionDeniedError
from app.domain.ports import UnitOfWork
from app.domain.read_models import CustomerSummary
from app.domain.rules import require_admin, require_superadmin, require_write


async def list_customers(uow: UnitOfWork, actor: Actor) -> list[Customer]:
    return await uow.customers.list()


async def get_customer(uow: UnitOfWork, actor: Actor, customer_id: UUID) -> tuple[Customer, CustomerSummary]:
    customer = await uow.customers.get(customer_id)
    if customer is None:
        raise NotFoundError("ไม่พบลูกค้า")
    return customer, await uow.customers.summary(customer_id, datetime.now(BUSINESS_OFFSET).date())


async def create_customer(uow: UnitOfWork, actor: Actor, *, tenant_id: UUID | None, **data: Any) -> Customer:
    require_write(actor.role)
    tenant = actor.resolve_tenant(tenant_id)
    if await uow.tenants.get(tenant) is None:
        raise NotFoundError("ไม่พบกลุ่มลูกค้า")
    customer = Customer(tenant_id=tenant, **data)
    await uow.customers.add(customer)
    await uow.flush()
    await audit.record(
        uow, actor, AuditEntity.CUSTOMER, customer.id, tenant_id=tenant, label=customer.company_name, after=customer
    )
    return customer


async def _ensure_can_deactivate(uow: UnitOfWork, customer_id: UUID) -> None:
    if await uow.customers.has_active_installations(customer_id):
        raise ConflictError("ลูกค้ารายนี้ยังมีอุปกรณ์ติดตั้งอยู่ ต้องรับคืนอุปกรณ์ก่อนระงับ")


async def _apply_tenant_change(
    uow: UnitOfWork, actor: Actor, before: Customer, tenant_id: UUID | None
) -> UUID:
    """Move a customer (and historical installs/movements/attachments) to another tenant. Superadmin only."""
    require_superadmin(actor.role)
    if tenant_id is None:
        raise ConflictError("ลูกค้าต้องอยู่ในกลุ่มลูกค้า")
    if tenant_id == before.tenant_id:
        return before.tenant_id
    if await uow.tenants.get(tenant_id) is None:
        raise NotFoundError("ไม่พบกลุ่มลูกค้า")
    if await uow.customers.has_active_installations(before.id):
        raise ConflictError("ลูกค้ารายนี้ยังมีอุปกรณ์ติดตั้งอยู่ ต้องรับคืนอุปกรณ์ก่อนย้ายกลุ่มลูกค้า")
    await uow.customers.retenant_related(before.id, tenant_id)
    return tenant_id


async def update_customer(uow: UnitOfWork, actor: Actor, customer_id: UUID, changes: dict[str, Any]) -> Customer:
    require_write(actor.role)
    before = await uow.customers.get(customer_id)
    if before is None:
        raise NotFoundError("ไม่พบลูกค้า")
    if "tenant_id" in changes:
        if not actor.is_superadmin:
            raise PermissionDeniedError("เฉพาะผู้ดูแลแพลตฟอร์มเท่านั้นที่ย้ายกลุ่มลูกค้าได้")
        changes["tenant_id"] = await _apply_tenant_change(uow, actor, before, changes["tenant_id"])
    if "is_active" in changes and changes["is_active"] != before.is_active:
        require_admin(actor.role)
        if not changes["is_active"]:
            await _ensure_can_deactivate(uow, customer_id)
    customer = replace(before, **changes)
    await uow.customers.update(customer)
    await uow.flush()
    await audit.record(
        uow,
        actor,
        AuditEntity.CUSTOMER,
        customer.id,
        tenant_id=customer.tenant_id,
        label=customer.company_name,
        before=before,
        after=customer,
    )
    return customer


async def deactivate_customer(uow: UnitOfWork, actor: Actor, customer_id: UUID) -> Customer:
    """Customers are never hard-deleted: movements and installations keep pointing at them."""
    return await update_customer(uow, actor, customer_id, {"is_active": False})
