---
name: add-device-transition
description: Adds or changes a device lifecycle status or transaction type end-to-end (domain rules, migration, use case, API, frontend actions, dialogs, labels, tests, user guide) in myAssets. Use when the user asks for a new device action/status such as reserve, lend, calibrate, lost, or changes which statuses an action is allowed from.
disable-model-invocation: true
---

# Add a device lifecycle transition

The state machine is duplicated across backend and frontend. Missing one place gives a button that the API rejects
(or an API nobody can reach). Copy this checklist and tick each item.

```
- [ ] 1. Enums: backend/app/domain/enums.py (DeviceStatus / TransactionType)
- [ ] 2. Rules: ALLOWED_TRANSITIONS (+ STATUS_LABELS_TH for a new status) in backend/app/domain/rules.py
- [ ] 3. Migration: alembic/versions/000N_<name>.py rewriting CHECK constraints (template: 0003_repair_status.py)
- [ ] 4. Use case in backend/app/application/inventory.py
- [ ] 5. Schema (backend/app/presentation/schemas.py) + route (routers.py, POST /inventory/<action>)
- [ ] 6. Tests: tests/test_rules.py + a flow in tests/test_api_flow.py
- [ ] 7. Frontend types/labels: core/models.ts, core/labels.ts (STATUS_*/TX_LABELS, TX_ICONS, TX_TONES)
- [ ] 8. Frontend rule: core/device-actions.ts (RULES entry mirroring step 2 + role check)
- [ ] 9. API call: core/api.service.ts; dialog handling in shared/device-action-dialogs.ts
- [ ] 10. Dashboard/filters if a new status: status chips (pages/devices), stat cards, chart colours (STATUS_TONES)
- [ ] 11. Verify: uv run pytest, npx ng build, try the action in the browser
- [ ] 12. Docs: state table in docs/architecture.md, section + diagram in docs/user-guide/README.md
```

## Use case template (step 4)

Simplified shape; the real `send_repair` also closes an active installation.

```python
async def send_repair(uow: UnitOfWork, actor: Actor, device_id: UUID, note: str | None) -> DeviceView:
    require_write(actor.role)
    device = await _load_device(uow, device_id)
    from_status = device.status
    device = replace(device, status=next_status(device, TransactionType.SEND_REPAIR))
    await uow.devices.update(device)
    await _record(uow, actor, device, TransactionType.SEND_REPAIR, from_status, note=note)
    return await _view(uow, device.id)
```

Read the existing function you are closest to in `inventory.py` and follow it exactly (required notes like
`qc_note`, tenant preconditions, installation rows).

## Frontend rule template (step 8)

```ts
{
  id: 'send_repair',
  text: 'ส่งซ่อม',
  title: 'ส่งอุปกรณ์ซ่อม',
  iconCss: 'e-icons e-settings',
  allowed: (d, p) => p.canWrite && ['IN_STOCK', 'CHECKED_OUT', 'INSTALLED'].includes(d.status),
},
```

`allowed` must equal the backend `allowed_from` set plus the same role/tenant checks.

## Rules

- Error messages Thai, raised as `InvalidTransitionError` / `ValidationError`.
- A required reason (like QC) is validated in the schema (`min_length=1`) and disables the dialog confirm button until filled.
- Migration `downgrade()` must work when no rows use the new value; comment what blocks it otherwise.
