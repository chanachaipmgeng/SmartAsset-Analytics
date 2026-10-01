from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, Path, Query, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.application import (
    admin,
    audit,
    auth,
    bulk,
    customer_import,
    customers,
    dashboard,
    device_import,
    documents,
    installation_import,
    inventory,
    photos,
    repairs,
    reports,
)
from app.domain.entities import Document, Photo
from app.domain.enums import AuditEntity, DeviceStatus, DocumentOwner, PhotoOwner, RepairOrderStatus, TransactionType
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
async def delete_device_model(model_id: UUID, actor: ActorDep, uow: UowDep, c: ContainerDep):
    await admin.delete_device_model(uow, c.media, actor, model_id)


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


@router.get("/devices/{device_id}/risk", response_model=s.DeviceRiskOut, tags=["devices", "reports"])
async def device_risk_one(device_id: UUID, actor: ActorDep, uow: UowDep):
    rows = await reports.device_risk(uow, actor, device_id=device_id)
    return rows[0]


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
    example = [
        "SN-0001", models[0] if models else "", "00:11:22:33:44:55", "2026-09-29", 12500, "2027-09-29", "ตัวอย่าง",
        "AT-0001", "", "",
    ]
    content = spreadsheet.build_template(headers, example[: len(headers)], models)
    return Response(
        content,
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": 'attachment; filename="device-import-template.xlsx"'},
    )


@router.post("/inventory/bulk", response_model=s.BulkOut, tags=["inventory"])
async def bulk_movement(body: s.BulkIn, actor: ActorDep, uow: UowDep):
    """One movement for up to 200 devices; 422 with `failures` (serial + reason) if any device cannot move."""
    moved = await bulk.bulk_action(uow, actor, **body.model_dump())
    return s.BulkOut(count=len(moved), items=[s.BulkMovedOut.model_validate(m) for m in moved])


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
    response: Response,
    device_id: UUID | None = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
    date_from: date | None = None,
    date_to: date | None = None,
    transaction_type: Annotated[list[TransactionType] | None, Query()] = None,
    user_id: UUID | None = None,
    customer_id: UUID | None = None,
):
    """`limit` caps the page size (default 500); `skip` offsets. `X-Total-Count` is the full match count."""
    items, total = await inventory.list_transactions(
        uow,
        actor,
        device_id=device_id,
        skip=skip,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
        tx_types=transaction_type,
        user_id=user_id,
        customer_id=customer_id,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


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


@router.post("/customers/import", response_model=s.CustomerImportResultOut, tags=["customers"])
async def import_customers(
    actor: ActorDep,
    uow: UowDep,
    file: Annotated[UploadFile, File(description=".xlsx หรือ .csv ตามไฟล์แม่แบบ")],
    dry_run: bool = True,
):
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise ValidationError("ไฟล์ต้องมีขนาดไม่เกิน 2 MB")
    table = spreadsheet.read_table(content, file.filename or "")
    return await customer_import.import_customers(uow, actor, table, dry_run=dry_run)


@router.get("/customers/import/template", tags=["customers"])
async def customer_import_template(actor: ActorDep, uow: UowDep):
    headers = customer_import.template_headers(include_tenant=actor.is_superadmin)
    example = [
        "บริษัท ตัวอย่าง จำกัด",
        "คุณสมชาย",
        "02-000-0001",
        "contact@example.com",
        "มาตรฐาน",
        "ถนนตัวอย่าง กรุงเทพมหานคร",
        "0105555555555",
        "ตัวอย่าง",
    ]
    if actor.is_superadmin:
        tenants = await uow.tenants.list()
        example.append(tenants[0].code if tenants else "")
    levels = ["พื้นฐาน", "มาตรฐาน", "พรีเมียม"]
    content = spreadsheet.build_template(headers, example[: len(headers)], levels)
    return Response(
        content,
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": 'attachment; filename="customer-import-template.xlsx"'},
    )


@router.get("/customers/{customer_id}", response_model=s.CustomerDetailOut, tags=["customers"])
async def get_customer(customer_id: UUID, actor: ActorDep, uow: UowDep):
    customer, summary = await customers.get_customer(uow, actor, customer_id)
    return s.CustomerDetailOut(
        **s.CustomerOut.model_validate(customer).model_dump(), summary=s.CustomerSummaryOut.model_validate(summary)
    )


@router.patch("/customers/{customer_id}", response_model=s.CustomerOut, tags=["customers"])
async def update_customer(customer_id: UUID, body: s.CustomerPatch, actor: ActorDep, uow: UowDep):
    return await customers.update_customer(uow, actor, customer_id, body.model_dump(exclude_unset=True))


@router.delete("/customers/{customer_id}", response_model=s.CustomerOut, tags=["customers"])
async def deactivate_customer(customer_id: UUID, actor: ActorDep, uow: UowDep):
    """Customers are never hard-deleted; this deactivates them (PATCH is_active=true restores)."""
    return await customers.deactivate_customer(uow, actor, customer_id)


# ---- installations ----
@router.get("/installations", response_model=list[s.InstallationOut], tags=["installations"])
async def list_installations(actor: ActorDep, uow: UowDep, active_only: bool = True, customer_id: UUID | None = None):
    return await inventory.list_installations(uow, actor, active_only=active_only, customer_id=customer_id)


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


@router.post("/installations/import", response_model=s.InstallationImportResultOut, tags=["installations"])
async def import_installations(
    actor: ActorDep,
    uow: UowDep,
    file: Annotated[UploadFile, File(description=".xlsx หรือ .csv ตามไฟล์แม่แบบ")],
    dry_run: bool = True,
):
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise ValidationError("ไฟล์ต้องมีขนาดไม่เกิน 2 MB")
    table = spreadsheet.read_table(content, file.filename or "")
    return await installation_import.import_installations(uow, actor, table, dry_run=dry_run)


@router.get("/installations/import/template", tags=["installations"])
async def installation_import_template(actor: ActorDep, uow: UowDep):
    headers = installation_import.template_headers()
    customers_list = await customers.list_customers(uow, actor)
    names = [c.company_name for c in customers_list if c.is_active]
    example = [
        "SN-0001",
        names[0] if names else "บริษัท ตัวอย่าง จำกัด",
        "2026-09-29",
        13.7563,
        100.5018,
        "ถนนตัวอย่าง กรุงเทพมหานคร",
        "คุณสมชาย",
        "02-000-0001",
        "ตัวอย่าง",
    ]
    content = spreadsheet.build_template(headers, example[: len(headers)], names)
    return Response(
        content,
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": 'attachment; filename="installation-import-template.xlsx"'},
    )


@router.patch("/installations/{installation_id}", response_model=s.InstallationOut, tags=["installations"])
async def update_installation(installation_id: UUID, body: s.InstallationPatch, actor: ActorDep, uow: UowDep):
    return await inventory.update_installation(uow, actor, installation_id, body.model_dump(exclude_unset=True))


# ---- audit ----
@router.get("/audit", response_model=list[s.AuditOut], tags=["audit"])
async def list_audit(
    actor: ActorDep,
    uow: UowDep,
    response: Response,
    entity_type: AuditEntity | None = None,
    entity_id: UUID | None = None,
    user_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
):
    """`limit` caps the page size (default 500); `skip` offsets. `X-Total-Count` is the full match count."""
    items, total = await audit.list_audit(
        uow,
        actor,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items


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


@router.get("/reports/device-risk", response_model=list[s.DeviceRiskOut], tags=["reports"])
async def device_risk_report(actor: ActorDep, uow: UowDep, device_id: UUID | None = None):
    return await reports.device_risk(uow, actor, device_id=device_id)


@router.get("/reports/repair-rate", response_model=list[s.RepairRateOut], tags=["reports"])
async def repair_rate_report(
    actor: ActorDep, uow: UowDep, days: Annotated[int, Query(ge=1, le=3650)] = 90
):
    return await reports.repair_rate_by_model(uow, actor, days=days)


@router.get("/reports/stock-forecast", response_model=list[s.StockForecastOut], tags=["reports"])
async def stock_forecast_report(
    actor: ActorDep, uow: UowDep, days: Annotated[int, Query(ge=1, le=3650)] = 90
):
    return await reports.stock_forecast(uow, actor, days=days)


@router.get("/reports/issue-summary", response_model=list[s.IssueGroupOut], tags=["reports"])
async def issue_summary_report(
    actor: ActorDep, uow: UowDep, days: Annotated[int, Query(ge=1, le=3650)] = 90
):
    return await reports.issue_summary(uow, actor, days=days)


@router.get("/reports/warranty", response_model=list[s.WarrantyRowOut], tags=["reports"])
async def warranty_report(
    actor: ActorDep, uow: UowDep, within_days: Annotated[int, Query(ge=0, le=3650)] = 90
):
    return await reports.warranty_report(uow, actor, within_days=within_days)


@router.get("/reports/repair-tat", response_model=list[s.RepairTatOut], tags=["reports"])
async def repair_tat_report(
    actor: ActorDep, uow: UowDep, days: Annotated[int, Query(ge=1, le=3650)] = 180
):
    return await reports.repair_tat(uow, actor, days=days)


@router.get("/reports/monthly-movement", response_model=list[s.MonthlyMovementOut], tags=["reports"])
async def monthly_movement_report(
    actor: ActorDep, uow: UowDep, months: Annotated[int, Query(ge=1, le=120)] = 12
):
    return await reports.monthly_movement(uow, actor, months=months)


@router.get("/reports/firmware-drift", response_model=list[s.FirmwareDriftOut], tags=["reports"])
async def firmware_drift_report(actor: ActorDep, uow: UowDep):
    return await reports.firmware_drift(uow, actor)


@router.get("/reports/depreciation", response_model=list[s.DepreciationOut], tags=["reports"])
async def depreciation_report(
    actor: ActorDep,
    uow: UowDep,
    useful_years: Annotated[int, Query(ge=1, le=50)] = 5,
    include_retired: bool = False,
):
    return await reports.depreciation(uow, actor, useful_years=useful_years, include_retired=include_retired)

# ---- photos ----
MAX_PHOTO_BYTES = 8 * 1024 * 1024


def _photo_out(photo: Photo, c: ContainerDep) -> s.PhotoOut:
    base = f"/api/v1/photos/{photo.id}/file?"
    return s.PhotoOut(
        id=photo.id,
        owner_type=photo.owner_type,
        owner_id=photo.owner_id,
        caption=photo.caption,
        width=photo.width,
        height=photo.height,
        size_bytes=photo.size_bytes,
        uploaded_by=photo.uploaded_by,
        created_at=photo.created_at,
        url=base + c.media.signed_query(photo.id, "full"),
        thumb_url=base + c.media.signed_query(photo.id, "thumb"),
    )


@router.get("/photos", response_model=list[s.PhotoOut], tags=["photos"])
async def list_photos(
    actor: ActorDep,
    uow: UowDep,
    c: ContainerDep,
    owner_type: PhotoOwner,
    owner_id: Annotated[list[UUID] | None, Query(max_length=500)] = None,
):
    """Photos of one or more records; without `owner_id` every visible photo of that owner type."""
    return [_photo_out(p, c) for p in await photos.list_photos(uow, actor, owner_type, owner_id)]


@router.post("/photos", response_model=s.PhotoOut, status_code=status.HTTP_201_CREATED, tags=["photos"])
async def upload_photo(
    actor: ActorDep,
    uow: UowDep,
    c: ContainerDep,
    owner_type: Annotated[PhotoOwner, Form()],
    owner_id: Annotated[UUID, Form()],
    file: Annotated[UploadFile, File(description="JPG, PNG หรือ WebP ไม่เกิน 8 MB")],
    caption: Annotated[str | None, Form(max_length=200)] = None,
):
    # Pillow decides the real format; this only rejects obvious non-images early.
    if file.content_type and not file.content_type.startswith("image/"):
        raise ValidationError("รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WebP")
    content = await file.read(MAX_PHOTO_BYTES + 1)
    if len(content) > MAX_PHOTO_BYTES:
        raise ValidationError("ไฟล์รูปต้องมีขนาดไม่เกิน 8 MB")
    photo = await photos.upload_photo(
        uow, c.media, actor, owner_type=owner_type, owner_id=owner_id, data=content, caption=caption
    )
    return _photo_out(photo, c)


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["photos"])
async def delete_photo(photo_id: UUID, actor: ActorDep, uow: UowDep, c: ContainerDep):
    await photos.delete_photo(uow, c.media, actor, photo_id)


@router.get("/photos/{photo_id}/file", tags=["photos"], response_class=FileResponse)
async def photo_file(
    photo_id: UUID,
    c: ContainerDep,
    v: Annotated[str, Query(pattern="^(full|thumb)$")],
    exp: int,
    sig: Annotated[str, Query(max_length=64)],
):
    """Signed link from `PhotoOut.url`, so it works in <img> without a bearer token."""
    variant = "thumb" if v == "thumb" else "full"
    path = c.media.path(photo_id, variant)
    if not c.media.verify(photo_id, variant, exp, sig) or not path.is_file():
        raise NotFoundError("ไม่พบรูปภาพหรือลิงก์หมดอายุ")
    return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "private, max-age=86400"})


# ---- repair orders ----
@router.get("/repair-orders", response_model=list[s.RepairOrderOut], tags=["repair-orders"])
async def list_repair_orders(
    actor: ActorDep,
    uow: UowDep,
    response: Response,
    status_: Annotated[RepairOrderStatus | None, Query(alias="status")] = None,
    device_id: UUID | None = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    take: Annotated[int | None, Query(ge=1, le=500)] = None,
):
    items, total = await repairs.list_orders(
        uow, actor, status=status_, device_id=device_id, skip=skip, take=take
    )
    response.headers["X-Total-Count"] = str(total)
    return items


@router.get("/repair-orders/{order_id}", response_model=s.RepairOrderOut, tags=["repair-orders"])
async def get_repair_order(order_id: UUID, actor: ActorDep, uow: UowDep):
    return await repairs.get_order(uow, actor, order_id)


@router.patch("/repair-orders/{order_id}", response_model=s.RepairOrderOut, tags=["repair-orders"])
async def update_repair_order(order_id: UUID, body: s.RepairOrderUpdateIn, actor: ActorDep, uow: UowDep):
    return await repairs.update_order(uow, actor, order_id, body.model_dump(exclude_unset=True))


@router.post("/repair-orders/{order_id}/cancel", response_model=s.RepairOrderOut, tags=["repair-orders"])
async def cancel_repair_order(order_id: UUID, actor: ActorDep, uow: UowDep):
    return await repairs.cancel_order(uow, actor, order_id)


# ---- documents ----
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024


def _document_out(doc: Document, c: ContainerDep) -> s.DocumentOut:
    return s.DocumentOut(
        id=doc.id,
        owner_type=doc.owner_type,
        owner_id=doc.owner_id,
        file_name=doc.file_name,
        content_type=doc.content_type,
        size_bytes=doc.size_bytes,
        caption=doc.caption,
        uploaded_by=doc.uploaded_by,
        created_at=doc.created_at,
        url=f"/api/v1/documents/{doc.id}/file?" + c.documents.signed_query(doc.id),
    )


@router.get("/documents", response_model=list[s.DocumentOut], tags=["documents"])
async def list_documents(
    actor: ActorDep,
    uow: UowDep,
    c: ContainerDep,
    owner_type: DocumentOwner,
    owner_id: Annotated[list[UUID] | None, Query(max_length=500)] = None,
):
    return [_document_out(d, c) for d in await documents.list_documents(uow, actor, owner_type, owner_id)]


@router.post("/documents", response_model=s.DocumentOut, status_code=status.HTTP_201_CREATED, tags=["documents"])
async def upload_document(
    actor: ActorDep,
    uow: UowDep,
    c: ContainerDep,
    owner_type: Annotated[DocumentOwner, Form()],
    owner_id: Annotated[UUID, Form()],
    file: Annotated[UploadFile, File(description="PDF, DOCX หรือ XLSX ไม่เกิน 10 MB")],
    caption: Annotated[str | None, Form(max_length=200)] = None,
):
    content = await file.read(MAX_DOCUMENT_BYTES + 1)
    if len(content) > MAX_DOCUMENT_BYTES:
        raise ValidationError("ไฟล์เอกสารต้องมีขนาดไม่เกิน 10 MB")
    doc = await documents.upload_document(
        uow,
        c.documents,
        actor,
        owner_type=owner_type,
        owner_id=owner_id,
        file_name=file.filename or "document",
        content_type=file.content_type,
        data=content,
        caption=caption,
    )
    return _document_out(doc, c)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["documents"])
async def delete_document(document_id: UUID, actor: ActorDep, uow: UowDep, c: ContainerDep):
    await documents.delete_document(uow, c.documents, actor, document_id)


@router.get("/documents/{document_id}/file", tags=["documents"], response_class=FileResponse)
async def document_file(
    document_id: UUID,
    c: ContainerDep,
    uow: SystemUowDep,
    exp: int,
    sig: Annotated[str, Query(max_length=64)],
):
    """Signed link from `DocumentOut.url`, so downloads work without a bearer token."""
    path = c.documents.path(document_id)
    if not c.documents.verify(document_id, exp, sig) or not path.is_file():
        raise NotFoundError("ไม่พบเอกสารหรือลิงก์หมดอายุ")
    doc = await uow.documents.get(document_id)
    if doc is None:
        raise NotFoundError("ไม่พบเอกสารหรือลิงก์หมดอายุ")
    return FileResponse(
        path,
        media_type=doc.content_type,
        filename=doc.file_name,
        headers={"Cache-Control": "private, max-age=86400"},
    )
