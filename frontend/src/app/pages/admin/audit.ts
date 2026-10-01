import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DateRangePickerModule, RangeEventArgs } from '@syncfusion/ej2-angular-calendars';
import { firstValueFrom } from 'rxjs';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_TONES,
  AUDIT_ENTITY_LABELS,
  toDate,
  toIsoDate,
} from '../../core/labels';
import { AuditEntity, AuditEntry } from '../../core/models';
import { AuditDiff } from '../../shared/audit-diff';
import {
  DataGrid,
  GridCell,
  GridColumn,
  GridQuery,
  GridRowAction,
} from '../../shared/data-grid';
import { FilterChip, FilterChips } from '../../shared/filter-chips';
import { PageHeader } from '../../shared/page-header';
import { RecordField, RecordView } from '../../shared/record-view';

type EntityFilter = AuditEntity | 'ALL';
type AuditRow = Omit<AuditEntry, 'occurred_at'> & {
  occurred_at: Date | null;
  entity_label_text: string;
  entity_type_label: string;
  action_label: string;
  action_tone: string;
  tenant_label: string;
  summary: string;
};

const WIDE = '(min-width: 768px)';
const PAGE_SIZE = 50;
const EXPORT_PAGE = 5000;

const COLUMNS: GridColumn[] = [
  {
    field: 'occurred_at',
    headerText: 'วันเวลา',
    type: 'datetime',
    format: 'dd/MM/yyyy HH:mm',
    width: 150,
  },
  { field: 'action_label', headerText: 'การกระทำ', width: 140 },
  { field: 'entity_type_label', headerText: 'ประเภทข้อมูล', width: 150 },
  { field: 'entity_label_text', headerText: 'รายการ', width: 220 },
  { field: 'summary', headerText: 'ข้อมูลที่เปลี่ยน', width: 240, hideAtMedia: WIDE },
  { field: 'user_name', headerText: 'ผู้ทำรายการ', width: 160, hideAtMedia: WIDE },
  { field: 'tenant_label', headerText: 'กลุ่มลูกค้า', width: 170, hideAtMedia: WIDE },
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function toRow(e: AuditEntry): AuditRow {
  return {
    ...e,
    occurred_at: toDate(e.occurred_at),
    entity_label_text: e.entity_label ?? e.entity_id.slice(0, 8),
    entity_type_label: AUDIT_ENTITY_LABELS[e.entity_type],
    action_label: AUDIT_ACTION_LABELS[e.action],
    action_tone: AUDIT_ACTION_TONES[e.action],
    tenant_label: e.tenant_name ?? 'แพลตฟอร์ม',
    summary:
      e.action === 'update' || e.action === 'deactivate'
        ? Object.keys(e.changes).length + ' ฟิลด์'
        : '',
  };
}

/** Who changed which settings record and how; tenant admins see only their own tenant (enforced by RLS). */
@Component({
  selector: 'app-audit',
  imports: [
    ButtonModule,
    DateRangePickerModule,
    PageHeader,
    DataGrid,
    GridCell,
    FilterChips,
    RecordView,
    AuditDiff,
  ],
  template: `
    <div class="page">
      <app-page-header
        title="ประวัติการแก้ไขข้อมูล"
        subtitle="บันทึกการสร้าง แก้ไข ระงับ และลบข้อมูลตั้งค่า ลูกค้า และจุดติดตั้ง"
      >
        <button
          ejs-button
          cssClass="e-outline"
          iconCss="e-icons e-refresh"
          (click)="entries.reload()"
        >
          รีเฟรช
        </button>
      </app-page-header>

      <div class="mb-3 flex flex-wrap items-center gap-3">
        <div class="w-full sm:w-72">
          <ejs-daterangepicker
            [startDate]="start()"
            [endDate]="end()"
            [presets]="presets"
            [max]="today"
            format="dd/MM/yyyy"
            cssClass="field-pill"
            placeholder="ทุกช่วงเวลา"
            (change)="onRange($event)"
          ></ejs-daterangepicker>
        </div>
        @if (from() || to() || entity()) {
          <button ejs-button cssClass="e-flat" iconCss="e-icons e-close" (click)="clear()">
            ล้างตัวกรอง
          </button>
        }
        <span class="ml-auto text-sm text-on-surface-variant">
          {{ total().toLocaleString('th-TH') }} รายการ
        </span>
      </div>
      <app-filter-chips
        [options]="entityOptions"
        [value]="entityFilter()"
        (valueChange)="setEntity($event)"
        label="กรองตามประเภทข้อมูล"
      />

      <div class="panel">
        <app-data-grid
          #grid
          [data]="rows()"
          [columns]="columns"
          perspectiveKey="audit"
          exportName="audit-log"
          [serverPaging]="true"
          [total]="total()"
          [exportAll]="exportAll"
          [loading]="entries.isLoading()"
          [error]="entries.error()"
          [emptyTitle]="
            from() || to() || entity() ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่มีประวัติการแก้ไข'
          "
          [rowActions]="['view']"
          (rowAction)="onRowAction($event)"
          (query)="onQuery($event)"
          (retry)="entries.reload()"
        >
          <ng-template gridCell="action_label" let-row>
            <span class="tone-chip" [attr.data-tone]="row.action_tone">{{ row.action_label }}</span>
          </ng-template>
        </app-data-grid>
      </div>
    </div>

    <app-record-view [(open)]="viewOpen" [header]="viewHeader()" [fields]="viewFields()">
      @if (selected(); as e) {
        <h4 class="mb-2 mt-4 text-sm font-semibold">รายละเอียดการเปลี่ยนแปลง</h4>
        <app-audit-diff [changes]="e.changes" />
      }
    </app-record-view>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditPage {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly grid = viewChild<DataGrid<AuditRow>>('grid');

  /** Filters live in the query string (`?from=&to=&entity=user`) so links can be shared. */
  readonly from = input<string>();
  readonly to = input<string>();
  readonly entity = input<string>();

  protected readonly columns = COLUMNS;
  protected readonly today = new Date();
  protected readonly presets = [
    { label: 'วันนี้', start: daysAgo(0), end: new Date() },
    { label: '7 วันล่าสุด', start: daysAgo(6), end: new Date() },
    { label: '30 วันล่าสุด', start: daysAgo(29), end: new Date() },
  ];
  protected readonly entityOptions: FilterChip<EntityFilter>[] = [
    { key: 'ALL', label: 'ทุกประเภท' },
    ...(Object.keys(AUDIT_ENTITY_LABELS) as AuditEntity[]).map((k) => ({
      key: k,
      label: AUDIT_ENTITY_LABELS[k],
    })),
  ];

  protected readonly start = computed(() => toDate(this.from()));
  protected readonly end = computed(() => toDate(this.to()));
  protected readonly entityFilter = computed<EntityFilter>(() => {
    const e = this.entity();
    return e && e in AUDIT_ENTITY_LABELS ? (e as AuditEntity) : 'ALL';
  });

  private readonly gridQuery = signal<GridQuery | null>(null);

  private readonly listFilters = computed(() => {
    const params: Record<string, string> = {};
    if (this.from()) params['date_from'] = this.from()!;
    if (this.to()) params['date_to'] = this.to()!;
    if (this.entityFilter() !== 'ALL') params['entity_type'] = this.entityFilter();
    return params;
  });

  protected readonly entries = httpResource<AuditEntry[]>(() => {
    const q = this.gridQuery();
    if (!q) return undefined;
    return {
      url: '/api/v1/audit',
      params: {
        ...this.listFilters(),
        skip: String(q.skip),
        limit: String(q.take || PAGE_SIZE),
      },
    };
  });

  private readonly page = linkedSignal<AuditEntry[] | undefined, AuditEntry[]>({
    source: () => (this.entries.hasValue() ? this.entries.value() : undefined),
    computation: (value, previous) => value ?? previous?.value ?? [],
  });

  protected readonly total = linkedSignal<string | null | undefined, number>({
    source: () => this.entries.headers()?.get('X-Total-Count'),
    computation: (value, previous) => (value == null ? (previous?.value ?? 0) : Number(value)),
  });

  protected readonly rows = computed(() => this.page().map(toRow));

  protected readonly exportAll = async () => {
    const params = { ...this.listFilters(), skip: '0', limit: String(EXPORT_PAGE) };
    const items = await firstValueFrom(
      this.http.get<AuditEntry[]>('/api/v1/audit', { params }),
    );
    return items.map(toRow);
  };

  protected readonly selected = signal<AuditRow | null>(null);
  protected readonly viewOpen = signal(false);
  protected readonly viewHeader = computed(() => {
    const e = this.selected();
    return e
      ? `${e.action_label}${e.entity_type_label}: ${e.entity_label_text}`
      : 'ประวัติการแก้ไข';
  });
  protected readonly viewFields = computed<RecordField[]>(() => {
    const e = this.selected();
    if (!e) return [];
    return [
      { label: 'วันเวลา', value: e.occurred_at?.toLocaleString('th-TH') },
      { label: 'ผู้ทำรายการ', value: e.user_name },
      { label: 'ประเภทข้อมูล', value: e.entity_type_label },
      { label: 'กลุ่มลูกค้า', value: e.tenant_label },
    ];
  });

  protected onQuery(query: GridQuery): void {
    this.gridQuery.set(query);
  }

  protected onRowAction({ row }: GridRowAction<AuditRow>): void {
    this.selected.set(row);
    this.viewOpen.set(true);
  }

  protected onRange(args: RangeEventArgs): void {
    this.navigate({ from: toIsoDate(args.startDate ?? null), to: toIsoDate(args.endDate ?? null) });
    this.grid()?.firstPage();
  }

  protected setEntity(entity: EntityFilter): void {
    this.navigate({ entity: entity === 'ALL' ? null : entity });
    this.grid()?.firstPage();
  }

  protected clear(): void {
    this.navigate({ from: null, to: null, entity: null });
    this.grid()?.firstPage();
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
