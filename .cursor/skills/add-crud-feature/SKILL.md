---
name: add-crud-feature
description: Scaffolds a new tenant-scoped entity end-to-end in SmartAsset Analytics - SQLAlchemy model with RLS migration, domain entity and repository port, use cases, FastAPI routes, Angular page with data grid and create/edit dialog, menu entry and route. Use when the user asks to add a new master-data screen or entity (e.g. suppliers, locations, contracts).
disable-model-invocation: true
---

# Add a CRUD feature

Reference implementations: backend `customers` (tenant-scoped) and `device_models` (global);
frontend `pages/admin/device-models.ts` (single-file page with grid + dialog).

```
Backend
- [ ] domain/entities.py: frozen dataclass
- [ ] domain/ports.py: <X>Repository Protocol; add attribute to UnitOfWork
- [ ] infrastructure/db/models.py: ORM model; repositories.py: Sql<X>Repository, wire into SqlUnitOfWork
- [ ] alembic/versions/000N_<xs>.py: table, indexes, ENABLE ROW LEVEL SECURITY + tenant policy (copy from 0001_initial.py)
- [ ] application/<xs>.py: list/create/update/delete with require_write/require_admin, actor.resolve_tenant()
- [ ] presentation/schemas.py: <X>In / <X>Update / <X>Out; routers.py: GET/POST/PATCH/DELETE /<xs>
- [ ] tests/test_api_flow.py: create, list, cross-tenant invisibility (tenant B must not see tenant A rows). If the entity can move tenants (like customers), assert superadmin-only + block while related live rows exist.
- [ ] If the entity is imported from spreadsheets: follow `customer_import.py` / `device_import.py` (template + dry_run)
Frontend
- [ ] core/models.ts interface; core/api.service.ts create/update/delete
- [ ] pages/<xs>/<xs>.ts page (copy device-models.ts pattern)
- [ ] app.routes.ts lazy route (+ adminGuard/superadminGuard if needed); shell nav item; command palette entry
Verify
- [ ] uv run pytest; npx ng build; open the page, create/edit/delete, check empty state and dark mode
- [ ] docs/architecture.md API table; user guide section with screenshot (see update-user-guide skill)
```

## Page skeleton

```ts
@Component({
  selector: 'app-suppliers',
  imports: [...FORM_IMPORTS, PageHeader, DataGrid],
  template: `
    <div class="page">
      <app-page-header title="ผู้จำหน่าย" subtitle="...">
        <button ejs-button [isPrimary]="true" iconCss="e-icons e-plus" (click)="openCreate()">เพิ่มผู้จำหน่าย</button>
      </app-page-header>
      <div class="panel">
        <app-data-grid [data]="items.value()" [columns]="columns" perspectiveKey="suppliers" exportName="suppliers"
          [loading]="items.isLoading()" [error]="items.error()" emptyTitle="ยังไม่มีผู้จำหน่าย"
          (selectionChange)="selected.set($event)" (retry)="items.reload()" />
      </div>
    </div>
    <!-- ejs-dialog with .form-grid, fields bound with [(value)] + [liveValue] -->
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuppliersPage {
  protected readonly items = httpResource<Supplier[]>(() => '/api/v1/suppliers', { defaultValue: [] });
  // signals per field, computed formValid, save()/remove() via ApiService + notify + reload
}
```

## Rules

- Thai labels everywhere the user sees text; Thai error messages from the backend.
- Deleting something referenced elsewhere raises `ConflictError` with a Thai reason (see `device_models.is_in_use`).
- Grid date columns need `toDate()` from `core/labels.ts`.
