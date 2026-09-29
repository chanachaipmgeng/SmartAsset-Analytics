import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { AuthStore } from '../core/auth.store';
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_TONES } from '../core/labels';
import { AuditEntity, AuditEntry } from '../core/models';
import { AuditDiff } from './audit-diff';
import { StatusChip } from './status-chip';

const HISTORY_LIMIT = 20;

/** "ประวัติการแก้ไข" section for a settings record; shown to admins only (the API refuses everyone else). */
@Component({
  selector: 'app-audit-history',
  imports: [AuditDiff, StatusChip, DatePipe],
  template: `
    @if (auth.isAdmin() && entityId()) {
      <section class="audit-history">
        <h4>ประวัติการแก้ไข</h4>
        @if (entries.isLoading()) {
          <p class="muted">กำลังโหลด…</p>
        } @else if (entries.error()) {
          <p class="muted">โหลดประวัติไม่สำเร็จ</p>
        } @else if (!entries.value().length) {
          <p class="muted">ยังไม่มีประวัติการแก้ไข</p>
        } @else {
          <ol>
            @for (e of entries.value(); track e.id) {
              <li>
                <div class="head">
                  <app-status-chip [tone]="tones[e.action]" [text]="actions[e.action]" />
                  <span class="who">{{ e.user_name }}</span>
                  <span class="when">{{ e.occurred_at | date: 'd MMM y HH:mm' }}</span>
                </div>
                @if (e.action !== 'create' && e.action !== 'delete') {
                  <app-audit-diff [changes]="e.changes" />
                }
              </li>
            }
          </ol>
        }
      </section>
    }
  `,
  styles: `
    .audit-history {
      margin-top: 16px;

      h4 {
        margin: 0 0 8px;
        font-size: 14px;
        font-weight: 600;
      }

      ol {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 10px;
      }

      li {
        padding: 10px 12px;
        border: 1px solid rgba(var(--app-outline-variant), 0.8);
        border-radius: 10px;
      }

      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }

      .who {
        font-weight: 500;
      }

      .when,
      .muted {
        font-size: 12px;
        color: rgb(var(--app-on-surface-variant));
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditHistory {
  protected readonly auth = inject(AuthStore);
  readonly entityType = input.required<AuditEntity>();
  readonly entityId = input<string | null | undefined>(null);
  /** Loads only while the surrounding view is open. */
  readonly active = input(true);

  protected readonly actions = AUDIT_ACTION_LABELS;
  protected readonly tones = AUDIT_ACTION_TONES;
  protected readonly entries = httpResource<AuditEntry[]>(
    () => {
      const id = this.entityId();
      if (!id || !this.active() || !this.auth.isAdmin()) return undefined;
      return { url: '/api/v1/audit', params: { entity_type: this.entityType(), entity_id: id, limit: HISTORY_LIMIT } };
    },
    { defaultValue: [] },
  );
}
