import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FIELD_LABELS, ROLE_LABELS, SERVICE_LEVEL_LABELS } from '../core/labels';
import { AuditEntry, Role, ServiceLevel } from '../core/models';

interface DiffRow {
  field: string;
  label: string;
  old: string;
  new: string;
  secret: boolean;
}

const EMPTY = '-';

export function formatAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่';
  if (field === 'role') return ROLE_LABELS[value as Role] ?? String(value);
  if (field === 'service_level')
    return SERVICE_LEVEL_LABELS[value as ServiceLevel] ?? String(value);
  return String(value);
}

export function auditRows(changes: AuditEntry['changes']): DiffRow[] {
  return Object.entries(changes).map(([field, change]) => {
    const label = FIELD_LABELS[field] ?? field;
    if (!Array.isArray(change))
      return { field, label, old: '', new: 'มีการเปลี่ยนแปลง', secret: true };
    return {
      field,
      label,
      old: formatAuditValue(field, change[0]),
      new: formatAuditValue(field, change[1]),
      secret: false,
    };
  });
}

/** Field-by-field before/after table for one audit entry. */
@Component({
  selector: 'app-audit-diff',
  template: `
    @if (rows().length) {
      <table class="audit-diff">
        <thead>
          <tr>
            <th>ข้อมูล</th>
            <th>ค่าเดิม</th>
            <th>ค่าใหม่</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.field) {
            <tr>
              <td class="field">{{ r.label }}</td>
              @if (r.secret) {
                <td colspan="2" class="muted">{{ r.new }} (ไม่แสดงค่า)</td>
              } @else {
                <td class="old">{{ r.old }}</td>
                <td class="new">{{ r.new }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="muted">ไม่มีรายละเอียดการเปลี่ยนแปลง</p>
    }
  `,
  styles: `
    .audit-diff {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      table-layout: fixed;

      th,
      td {
        padding: 6px 8px;
        text-align: left;
        vertical-align: top;
        border-bottom: 1px solid rgba(var(--app-outline-variant), 0.7);
        overflow-wrap: anywhere;
        white-space: pre-line;
      }

      th {
        font-weight: 500;
        font-size: 12px;
        color: rgb(var(--app-on-surface-variant));
      }

      .field {
        width: 30%;
        color: rgb(var(--app-on-surface-variant));
      }

      .old {
        color: rgb(var(--app-error));
        text-decoration: line-through;
        text-decoration-color: rgba(var(--app-error), 0.5);
      }

      .new {
        color: rgb(var(--app-success));
        font-weight: 500;
      }
    }

    .muted {
      color: rgb(var(--app-on-surface-variant));
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditDiff {
  readonly changes = input.required<AuditEntry['changes']>();
  protected readonly rows = computed(() => auditRows(this.changes()));
}
