import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DateRangePickerModule, RangeEventArgs } from '@syncfusion/ej2-angular-calendars';
import { STATUS_LABELS, TX_ICONS, TX_LABELS, TX_TONES, toDate, toIsoDate } from '../../core/labels';
import { InventoryTransaction, TransactionType } from '../../core/models';
import { DataGrid, GridCell, GridColumn } from '../../shared/data-grid';
import { FilterChip, FilterChips } from '../../shared/filter-chips';
import { PageHeader } from '../../shared/page-header';

type TypeFilter = TransactionType | 'ALL';

const WIDE = '(min-width: 768px)';
const LIMIT = 2000;

const COLUMNS: GridColumn[] = [
  { field: 'occurred_at', headerText: 'วันเวลา', type: 'datetime', format: 'dd/MM/yyyy HH:mm', width: 150 },
  { field: 'type_label', headerText: 'รายการ', width: 190 },
  { field: 'serial_number', headerText: 'ซีเรียล', width: 150 },
  { field: 'from_label', headerText: 'จากสถานะ', width: 120, hideAtMedia: WIDE },
  { field: 'to_label', headerText: 'เป็นสถานะ', width: 120, hideAtMedia: WIDE },
  { field: 'tenant_label', headerText: 'กลุ่มลูกค้า', width: 190, hideAtMedia: WIDE },
  { field: 'customer_name', headerText: 'ลูกค้า', width: 180, hideAtMedia: WIDE },
  { field: 'supplier_name', headerText: 'ผู้ซ่อม', width: 180, hideAtMedia: WIDE },
  { field: 'user_name', headerText: 'ผู้ทำรายการ', width: 150, hideAtMedia: WIDE },
  { field: 'note', headerText: 'หมายเหตุ', width: 200, hideAtMedia: WIDE },
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

@Component({
  selector: 'app-transactions',
  imports: [ButtonModule, DateRangePickerModule, PageHeader, DataGrid, GridCell, FilterChips],
  template: `
    <div class="page">
      <app-page-header title="ความเคลื่อนไหวสต็อก" subtitle="ประวัติทุกรายการที่เปลี่ยนสถานะหรือย้ายอุปกรณ์">
        <button ejs-button cssClass="e-outline" iconCss="e-icons e-refresh" (click)="transactions.reload()">รีเฟรช</button>
      </app-page-header>

      <div class="mb-3 flex flex-wrap items-center gap-3">
        <div class="w-full sm:w-72">
          <ejs-daterangepicker
            [startDate]="start()"
            [endDate]="end()"
            [presets]="presets"
            [max]="today"
            format="dd/MM/yyyy"
            placeholder="ทุกช่วงเวลา"
            (change)="onRange($event)"
          ></ejs-daterangepicker>
        </div>
        @if (from() || to() || type()) {
          <button ejs-button cssClass="e-flat" iconCss="e-icons e-close" (click)="clear()">ล้างตัวกรอง</button>
        }
        <span class="ml-auto text-sm text-on-surface-variant">
          {{ rows().length.toLocaleString('th-TH') }} รายการ{{ rows().length >= limit ? ' (แสดงล่าสุด ' + limit.toLocaleString('th-TH') + ' รายการ ปรับช่วงวันที่เพื่อดูเพิ่ม)' : '' }}
        </span>
      </div>
      <app-filter-chips [options]="typeOptions" [value]="typeFilter()" (valueChange)="setType($event)" label="กรองตามประเภทรายการ" />

      <div class="panel">
        <app-data-grid
          [data]="rows()"
          [columns]="columns"
          perspectiveKey="transactions"
          exportName="stock-transactions"
          [loading]="transactions.isLoading()"
          [error]="transactions.error()"
          [emptyTitle]="from() || to() || type() ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่มีความเคลื่อนไหว'"
          (retry)="transactions.reload()"
        >
          <ng-template gridCell="type_label" let-row>
            <span class="tone-chip has-icon" [attr.data-tone]="row.type_tone" [title]="row.type_label">
              <span [class]="row.type_icon"></span>{{ row.type_label }}
            </span>
          </ng-template>
        </app-data-grid>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsPage {
  private readonly router = inject(Router);

  /** Filters live in the query string (`?from=2026-09-01&to=2026-09-29&type=RETURN`) so links can be shared. */
  readonly from = input<string>();
  readonly to = input<string>();
  readonly type = input<string>();

  protected readonly columns = COLUMNS;
  protected readonly limit = LIMIT;
  protected readonly today = new Date();
  protected readonly presets = [
    { label: 'วันนี้', start: daysAgo(0), end: new Date() },
    { label: '7 วันล่าสุด', start: daysAgo(6), end: new Date() },
    { label: '30 วันล่าสุด', start: daysAgo(29), end: new Date() },
    { label: 'เดือนนี้', start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), end: new Date() },
  ];
  protected readonly typeOptions: FilterChip<TypeFilter>[] = [
    { key: 'ALL', label: 'ทุกประเภท' },
    ...(Object.keys(TX_LABELS) as TransactionType[]).map((t) => ({ key: t, label: TX_LABELS[t] })),
  ];

  protected readonly start = computed(() => toDate(this.from()));
  protected readonly end = computed(() => toDate(this.to()));
  protected readonly typeFilter = computed<TypeFilter>(() => {
    const t = this.type();
    return t && t in TX_LABELS ? (t as TransactionType) : 'ALL';
  });

  protected readonly transactions = httpResource<InventoryTransaction[]>(
    () => {
      const params: Record<string, string> = { limit: String(LIMIT) };
      if (this.from()) params['date_from'] = this.from()!;
      if (this.to()) params['date_to'] = this.to()!;
      if (this.typeFilter() !== 'ALL') params['transaction_type'] = this.typeFilter();
      return { url: '/api/v1/inventory/transactions', params };
    },
    { defaultValue: [] },
  );

  protected readonly rows = computed(() =>
    this.transactions.value().map((t) => ({
      ...t,
      occurred_at: toDate(t.occurred_at),
      type_label: TX_LABELS[t.transaction_type],
      type_icon: TX_ICONS[t.transaction_type],
      type_tone: TX_TONES[t.transaction_type],
      from_label: t.from_status ? STATUS_LABELS[t.from_status] : '-',
      to_label: STATUS_LABELS[t.to_status],
      tenant_label: t.tenant_name ?? 'คลังกลาง',
    })),
  );

  protected onRange(args: RangeEventArgs): void {
    this.navigate({ from: toIsoDate(args.startDate ?? null), to: toIsoDate(args.endDate ?? null) });
  }

  protected setType(type: TypeFilter): void {
    this.navigate({ type: type === 'ALL' ? null : type });
  }

  protected clear(): void {
    this.navigate({ from: null, to: null, type: null });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
