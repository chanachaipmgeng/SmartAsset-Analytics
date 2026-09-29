from dataclasses import replace
from typing import Any
from uuid import UUID

from app.application.context import Actor
from app.domain.entities import Customer
from app.domain.errors import ConflictError, NotFoundError
from app.domain.ports import UnitOfWork
from app.domain.rules import require_admin, require_write


async def list_customers(uow: UnitOfWork, actor: Actor) -> list[Customer]:
    return await uow.customers.list()


async def create_customer(uow: UnitOfWork, actor: Actor, *, tenant_id: UUID | None, **data: Any) -> Customer:
    require_write(actor.role)
    tenant = actor.resolve_tenant(tenant_id)
    if await uow.tenants.get(tenant) is None:
        raise NotFoundError("ไม่พบกลุ่มลูกค้า")
    customer = Customer(tenant_id=tenant, **data)
    await uow.customers.add(customer)
    await uow.flush()
    return customer


async def update_customer(uow: UnitOfWork, actor: Actor, customer_id: UUID, changes: dict[str, Any]) -> Customer:
    require_write(actor.role)
    customer = await uow.customers.get(customer_id)
    if customer is None:
        raise NotFoundError("ไม่พบลูกค้า")
    changes.pop("tenant_id", None)
    customer = replace(customer, **changes)
    await uow.customers.update(customer)
    await uow.flush()
    return customer


async def delete_customer(uow: UnitOfWork, actor: Actor, customer_id: UUID) -> None:
    require_admin(actor.role)
    if await uow.customers.get(customer_id) is None:
        raise NotFoundError("ไม่พบลูกค้า")
    if await uow.customers.has_installations(customer_id):
        raise ConflictError("ลูกค้ารายนี้มีประวัติการติดตั้ง ไม่สามารถลบได้")
    await uow.customers.delete(customer_id)
    await uow.flush()
