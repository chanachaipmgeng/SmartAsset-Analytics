from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Path, Query, Response, UploadFile, status

from app.application import admin, auth, customers, dashboard, device_import, inventory, reports
from app.domain.enums import DeviceStatus, TransactionType
from app.domain.errors import NotFoundError, ValidationError
from app.infrastructure import spreadsheet
from app.presentation import schemas as s
from app.presentation.deps import ActorDep, ContainerDep, SystemUowDep, UowDep

router = APIRouter(prefix="/api/v1")


def _token_out(pair: auth.TokenPair) -> s.TokenOut:
    return s.TokenOut(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        user=s.UserOut.model_validate(pair.user),
    )


# ---- auth ----
@router.post("/auth/login", response_model=s.TokenOut, tags=["auth"])
async def login(body: s.LoginIn, uow: SystemUowDep, c: ContainerDep):
    return _token_out(await auth.login(uow, c.hasher, c.tokens, body.email, body.password))


@router.post("/auth/refresh", response_model=s.TokenOut, tags=["auth"])
async def refresh(body: s.RefreshIn, uow: SystemUowDep, c: ContainerDep):
    return _token_out(await auth.refresh(uow, c.tokens, body.refresh_token))


@router.post("/auth/change-password", status_code=status.HTTP_204_NO_CONTENT, tags=["auth"])
async def change_password(body: s.ChangePasswordIn, actor: ActorDep, uow: UowDep, c: ContainerDep):
    await auth.change_password(uow, c.hasher, actor, body.current_password, body.new_password)


@router.get("/auth/me", response_model=s.UserOut, tags=["auth"])
async def me(actor: ActorDep, uow: UowDep):
    user = await uow.users.get(actor.user_id)
    if user is None:
        raise NotFoundError("ไม่พบผู้ใช้")
    return user


# ---- tenants ----
@router.get("/tenants", response_model=list[s.TenantOut], tags=["tenants"])
async def list_tenants(actor: ActorDep, uow: UowDep):
    return await admin.list_tenants(uow, actor)


@router.post("/tenants", response_model=s.TenantOut, status_code=status.HTTP_201_CREATED, tags=["tenants"])
async def create_tenant(body: s.TenantIn, actor: ActorDep, uow: UowDep):
    return await admin.create_tenant(uow, actor, name=body.name, code=body.code)


@router.patch("/tenants/{tenant_id}", response_model=s.TenantOut, tags=["tenants"])
async def update_tenant(tenant_id: UUID, body: s.TenantPatch, actor: ActorDep, uow: UowDep):
    return await admin.update_tenant(uow, actor, tenant_id, body.model_dump(exclude_unset=True))


# ---- users ----
@router.get("/users", response_model=list[s.UserOut], tags=["users"])
async def list_users(actor: ActorDep, uow: UowDep):
    return await admin.list_users(uow, actor)


@router.post("/users", response_model=s.UserOut, status_code=status.HTTP_201_CREATED, tags=["users"])
async def create_user(body: s.UserIn, actor: ActorDep, uow: UowDep, c: ContainerDep):
    return await admin.create_user(uow, c.hasher, actor, **body.model_dump())


@router.patch("/users/{user_id}", response_model=s.UserOut, tags=["users"])
async def update_user(user_id: UUID, body: s.UserPatch, actor: ActorDep, uow: UowDep, c: ContainerDep):
    return await admin.update_user(uow, c.hasher, actor, user_id, body.model_dump(exclude_unset=True))


# ---- device models ----
@router.get("/device-models", response_model=list[s.DeviceModelOut], tags=["device-models"])
async def list_device_models(actor: ActorDep, uow: UowDep):
    return await admin.list_device_models(uow, actor)


@router.post(
    "/device-models", response_model=s.DeviceModelOut, status_code=status.HTTP_201_CREATED, tags=["device-models"]
)
async def create_device_model(body: s.DeviceModelIn, actor: ActorDep, uow: UowDep):
    return await admin.create_device_model(uow, actor, **body.model_dump())


@router.patch("/device-models/{model_id}", response_model=s.DeviceModelOut, tags=["device-models"])
async def update_device_model(model_id: UUID, body: s.DeviceModelPatch, actor: ActorDep, uow: UowDep):
    return await admin.update_device_model(uow, actor, model_id, body.model_dump(exclude_unset=True))


@router.delete("/device-models/{model_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["device-models"])
async def delete_device_model(model_id: UUID, actor: ActorDep, uow: UowDep):
    await admin.delete_device_model(uow, actor, model_id)


# ---- suppliers ----
@router.get("/suppliers", response_model=list[s.SupplierOut], tags=["suppliers"])
async def list_suppliers(actor: ActorDep, uow: UowDep):
    return await admin.list_suppliers(uow, actor)


@router.post("/suppliers", response_model=s.SupplierOut, status_code=status.HTTP_201_CREATED, tags=["suppliers"])
async def create_supplier(body: s.SupplierIn, actor: ActorDep, uow: UowDep):
    return await admin.create_supplier(uow, actor, **body.model_dump())


@router.patch("/suppliers/{supplier_id}", response_model=s.SupplierOut, tags=["suppliers"])
async def update_supplier(supplier_id: UUID, body: s.SupplierPatch, actor: ActorDep, uow: UowDep):
    return await admin.update_supplier(uow, actor, supplier_id, body.model_dump(exclude_unset=True))


@router.delete("/suppliers/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["suppliers"])
async def delete_supplier(supplier_id: UUID, actor: ActorDep, uow: UowDep):
    await admin.delete_supplier(uow, actor, supplier_id)


# ---- devices ----
@router.get("/devices", response_model=list[s.DeviceOut], tags=["devices"])
async def list_devices(
    actor: ActorDep,
    uow: UowDep,
    response: Response,
    search: Annotated[str | None, Query(max_length=100)] = None,
    status_: Annotated[DeviceStatus | None, Query(alias="status")] = None,
    model_id: UUID | None = None,
    sort: Annotated[str | None, Query(max_length=40, description="Field name; prefix with '-' for descending")] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    take: Annotated[int | None, Query(ge=1, le=500)] = None,
):
    """Without `take` this returns every matching device; `X-Total-Count` always holds the match count."""
    items, total = await inventory.list_devices(
        uow, actor, search=search, status=status_, model_id=model_id, sort=sort, skip=skip, take=take
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get("/devices/status-counts", response_model=list[s.CountOut], tags=["devices"])
async def device_status_counts(actor: ActorDep, uow: UowDep):
    return await inventory.device_status_counts(uow, actor)


@router.post("/devices", response_model=s.DeviceOut, status_code=status.HTTP_201_CREATED, tags=["devices"])
async def create_device(body: s.DeviceIn, actor: ActorDep, uow: UowDep):
    return await inventory.check_in(uow, actor, **body.model_dump())


@router.get("/devices/by-serial/{serial_number}", response_model=s.DeviceOut, tags=["devices"])
async def get_device_by_serial(
    serial_number: Annotated[str, Path(min_length=1, max_length=100)], actor: ActorDep, uow: UowDep
):
    return await inventory.get_device_by_serial(uow, actor, serial_number)


@router.get("/devices/{device_id}", response_model=s.DeviceOut, tags=["devices"])
async def get_device(device_id: UUID, actor: ActorDep, uow: UowDep):
    return await inventory.get_device(uow, actor, device_id)


@router.patch("/devices/{device_id}", response_model=s.DeviceOut, tags=["devices"])
async def update_device(device_id: UUID, body: s.DevicePatch, actor: ActorDep, uow: UowDep):
    return await inventory.update_device(uow, actor, device_id, body.model_dump(exclude_unset=True))


@router.delete("/devices/{device_id}", response_model=s.DeviceOut, tags=["devices"])
async def retire_device(device_id: UUID, actor: ActorDep, uow: UowDep, note: str | None = None):
    """Devices are never hard-deleted; this retires them and keeps the audit trail."""
    return await inventory.retire(uow, actor, device_id, note)


# ---- inventory movements ----
@router.post("/inventory/check-in", response_model=s.DeviceOut, status_code=status.HTTP_201_CREATED, tags=["inventory"])
async def check_in(body: s.DeviceIn, actor: ActorDep, uow: UowDep):
    return await inventory.check_in(uow, actor, **body.model_dump())


@router.post("/inventory/check-out", response_model=s.DeviceOut, tags=["inventory"])
async def check_out(body: s.MovementIn, actor: ActorDep, uow: UowDep):
    return await inventory.check_out(uow, actor, body.device_id, body.note)


@router.post("/inventory/transfer", response_model=s.DeviceOut, tags=["inventory"])
async def transfer(body: s.TransferIn, actor: ActorDep, uow: UowDep):
    return await inventory.transfer(uow, actor, body.device_id, body.target_tenant_id, body.note)


@router.post("/inventory/return", response_model=s.DeviceOut, tags=["inventory"])
async def return_device(body: s.MovementIn, actor: ActorDep, uow: UowDep):
    return await inventory.return_device(uow, actor, body.device_id, body.note)


MAX_IMPORT_BYTES = 2 * 1024 * 1024
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.post("/inventory/import", response_model=s.ImportResultOut, tags=["inventory"])
async def import_devices(
    actor: ActorDep,
    uow: UowDep,
    file: Annotated[UploadFile, File(description=".xlsx หรือ .csv ตามไฟล์แม่แบบ")],
    dry_run: bool = True,
):
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise ValidationError("ไฟล์ต้องมีขนาดไม่เกิน 2 MB")
    table = spreadsheet.read_table(content, file.filename or "")
    return await device_import.import_devices(uow, actor, table, dry_run=dry_run)


@router.get("/inventory/import/template", tags=["inventory"])
async def import_template(actor: ActorDep, uow: UowDep):
    models = [f"{m.brand} {m.name}" for m in await uow.device_models.list()]
    headers = device_import.template_headers(include_tenant=actor.is_superadmin)
    example = ["SN-0001", models[0] if models else "", "00:11:22:33:44:55", "2026-09-29", 12500, "2027-09-29", "ตัวอย่าง"]
    content = spreadsheet.build_template(headers, example[: len(headers)], models)
    return Response(
        content,
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": 'attachment; filename="device-import-template.xlsx"'},
    )


@router.post("/inventory/send-repair", response_model=s.DeviceOut, tags=["inventory"])
async def send_repair(body: s.SendRepairIn, actor: ActorDep, uow: UowDep):
    return await inventory.send_repair(uow, actor, body.device_id, body.note, body.supplier_id)


@router.post("/inventory/repair-done", response_model=s.DeviceOut, tags=["inventory"])
async def repair_done(body: s.RepairDoneIn, actor: ActorDep, uow: UowDep):
    return await inventory.repair_done(uow, actor, body.device_id, body.qc_note)


@router.post("/inventory/loan", response_model=s.DeviceOut, tags=["inventory"])
async def loan(body: s.LoanIn, actor: ActorDep, uow: UowDep):
    return await inventory.loan(uow, actor, body.device_id, body.due_date, body.note)


@router.post("/inventory/qc-pass", response_model=s.DeviceOut, tags=["inventory"])
async def qc_pass(body: s.MovementIn, actor: ActorDep, uow: UowDep):
    return await inventory.qc_pass(uow, actor, body.device_id, body.note)


@router.post("/inventory/qc-fail", response_model=s.DeviceOut, tags=["inventory"])
async def qc_fail(body: s.QcFailIn, actor: ActorDep, uow: UowDep):
    return await inventory.qc_fail(uow, actor, body.device_id, body.note)


@router.get("/inventory/transactions", response_model=list[s.TransactionOut], tags=["inventory"])
async def list_transactions(
    actor: ActorDep,
    uow: UowDep,
    device_id: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
    date_from: date | None = None,
    date_to: date | None = None,
    transaction_type: Annotated[list[TransactionType] | None, Query()] = None,
    user_id: UUID | None = None,
):
    return await inventory.list_transactions(
        uow,
        actor,
        device_id=device_id,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
        tx_types=transaction_type,
        user_id=user_id,
    )


@router.get("/inventory/summary", response_model=s.StockSummaryOut, tags=["inventory"])
async def stock_summary(actor: ActorDep, uow: UowDep):
    return await inventory.stock_summary(uow, actor)


# ---- customers ----
@router.get("/customers", response_model=list[s.CustomerOut], tags=["customers"])
async def list_customers(actor: ActorDep, uow: UowDep):
    return await customers.list_customers(uow, actor)


@router.post("/customers", response_model=s.CustomerOut, status_code=status.HTTP_201_CREATED, tags=["customers"])
async def create_customer(body: s.CustomerIn, actor: ActorDep, uow: UowDep):
    return await customers.create_customer(uow, actor, **body.model_dump())


@router.patch("/customers/{customer_id}", response_model=s.CustomerOut, tags=["customers"])
async def update_customer(customer_id: UUID, body: s.CustomerPatch, actor: ActorDep, uow: UowDep):
    return await customers.update_customer(uow, actor, customer_id, body.model_dump(exclude_unset=True))


@router.delete("/customers/{customer_id}", response_model=s.CustomerOut, tags=["customers"])
async def deactivate_customer(customer_id: UUID, actor: ActorDep, uow: UowDep):
    """Customers are never hard-deleted; this deactivates them (PATCH is_active=true restores)."""
    return await customers.deactivate_customer(uow, actor, customer_id)


# ---- installations ----
@router.get("/installations", response_model=list[s.InstallationOut], tags=["installations"])
async def list_installations(actor: ActorDep, uow: UowDep, active_only: bool = True):
    return await inventory.list_installations(uow, actor, active_only=active_only)


@router.get("/installations/nearby", response_model=list[s.InstallationOut], tags=["installations"])
async def nearby_installations(
    actor: ActorDep,
    uow: UowDep,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
    radius_m: Annotated[float, Query(gt=0, le=500_000)] = 5000,
):
    return await inventory.nearby_installations(uow, actor, latitude=lat, longitude=lng, radius_m=radius_m)


@router.post(
    "/installations", response_model=s.InstallationOut, status_code=status.HTTP_201_CREATED, tags=["installations"]
)
async def create_installation(body: s.InstallationIn, actor: ActorDep, uow: UowDep):
    return await inventory.install(uow, actor, **body.model_dump())


@router.patch("/installations/{installation_id}", response_model=s.InstallationOut, tags=["installations"])
async def update_installation(installation_id: UUID, body: s.InstallationPatch, actor: ActorDep, uow: UowDep):
    return await inventory.update_installation(uow, actor, installation_id, body.model_dump(exclude_unset=True))


# ---- dashboard ----
@router.get("/dashboard/summary", response_model=s.DashboardOut, tags=["dashboard"])
async def dashboard_summary(actor: ActorDep, uow: UowDep):
    return await dashboard.dashboard_summary(uow, actor)


# ---- reports ----
@router.get("/reports/stock-balance", response_model=list[s.StockBalanceOut], tags=["reports"])
async def stock_balance_report(actor: ActorDep, uow: UowDep, include_retired: bool = False):
    return await reports.stock_balance(uow, actor, include_retired=include_retired)


@router.get("/reports/aging", response_model=list[s.AgedDeviceOut], tags=["reports"])
async def aging_report(
    actor: ActorDep, uow: UowDep, status_: Annotated[DeviceStatus | None, Query(alias="status")] = None
):
    return await reports.aging(uow, actor, status=status_)
