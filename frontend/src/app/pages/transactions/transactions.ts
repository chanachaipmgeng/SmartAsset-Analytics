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
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DateRangePickerModule, RangeEventArgs } from '@syncfusion/ej2-angular-calendars';
import { firstValueFrom } from 'rxjs';
import { STATUS_LABELS, TX_ICONS, TX_LABELS, TX_TONES, toDate, toIsoDate } from '../../core/labels';
import { InventoryTransaction, TransactionType } from '../../core/models';
import {
  DataGrid,
  GridCell,
  GridColumn,
  GridQuery,
} from '../../shared/data-grid';
import { FilterChip, FilterChips } from '../../shared/filter-chips';
import { PageHeader } from '../../shared/page-header';

type TypeFilter = TransactionType | 'ALL';
type TxRow = Omit<InventoryTransaction, 'occurred_at'> & {
  occurred_at: Date | null;
  type_label: string;
  type_icon: string;
  type_tone: string;
  from_label: string;
  to_label: string;
  tenant_label: string;
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

function toRow(t: InventoryTransaction): TxRow {
  return {
    ...t,
    occurred_at: toDate(t.occurred_at),
    type_label: TX_LABELS[t.transaction_type],
    type_icon: TX_ICONS[t.transaction_type],
    type_tone: TX_TONES[t.transaction_type],
    from_label: t.from_status ? STATUS_LABELS[t.from_status] : '-',
    to_label: STATUS_LABELS[t.to_status],
    tenant_label: t.tenant_name ?? 'คลังกลาง',
  };
}

@Component({
  selector: 'app-transactions',
  imports: [
    ButtonModule,
    DateRangePickerModule,
    RouterLink,
    PageHeader,
    DataGrid,
    GridCell,
    FilterChips,
  ],
  template: `
    <div class="page">
      <app-page-header
        title="ความเคลื่อนไหวสต็อก"
        subtitle="ประวัติทุกรายการที่เปลี่ยนสถานะหรือย้ายอุปกรณ์"
      >
        <button
          ejs-button
          cssClass="e-outline"
          iconCss="e-icons e-refresh"
          (click)="transactions.reload()"
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
        @if (from() || to() || type()) {
          <button ejs-button cssClass="e-flat" iconCss="e-icons e-close" (click)="clear()">
            ล้างตัวกรอง
          </button>
        }
        <span class="ml-auto text-sm text-on-surface-variant">
          {{ total().toLocaleString('th-TH') }} รายการ
        </span>
      </div>
      <app-filter-chips
        [options]="typeOptions"
        [value]="typeFilter()"
        (valueChange)="setType($event)"
        label="กรองตามประเภทรายการ"
      />

      <div class="panel">
        <app-data-grid
          #grid
          [data]="rows()"
          [columns]="columns"
          perspectiveKey="transactions"
          exportName="stock-transactions"
          [serverPaging]="true"
          [total]="total()"
          [exportAll]="exportAll"
          [loading]="transactions.isLoading()"
          [error]="transactions.error()"
          [emptyTitle]="
            from() || to() || type() ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่มีความเคลื่อนไหว'
          "
          (query)="onQuery($event)"
          (retry)="transactions.reload()"
        >
          <ng-template gridCell="type_label" let-row>
            <span
              class="tone-chip has-icon"
              [attr.data-tone]="row.type_tone"
              [title]="row.type_label"
            >
              <span [class]="row.type_icon"></span>{{ row.type_label }}
            </span>
          </ng-template>
          <ng-template gridCell="customer_name" let-row>
            @if (row.customer_id) {
              <a class="customer-link" [routerLink]="['/customers', row.customer_id]">{{
                row.customer_name
              }}</a>
            }
          </ng-template>
        </app-data-grid>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsPage {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly grid = viewChild<DataGrid<TxRow>>('grid');

  /** Filters live in the query string (`?from=2026-09-01&to=2026-09-29&type=RETURN`) so links can be shared. */
  readonly from = input<string>();
  readonly to = input<string>();
  readonly type = input<string>();

  protected readonly columns = COLUMNS;
  protected readonly today = new Date();
  protected readonly presets = [
    { label: 'วันนี้', start: daysAgo(0), end: new Date() },
    { label: '7 วันล่าสุด', start: daysAgo(6), end: new Date() },
    { label: '30 วันล่าสุด', start: daysAgo(29), end: new Date() },
    {
      label: 'เดือนนี้',
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      end: new Date(),
    },
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

  private readonly gridQuery = signal<GridQuery | null>(null);

  private readonly listFilters = computed(() => {
    const params: Record<string, string> = {};
    if (this.from()) params['date_from'] = this.from()!;
    if (this.to()) params['date_to'] = this.to()!;
    if (this.typeFilter() !== 'ALL') params['transaction_type'] = this.typeFilter();
    return params;
  });

  protected readonly transactions = httpResource<InventoryTransaction[]>(() => {
    const q = this.gridQuery();
    if (!q) return undefined;
    return {
      url: '/api/v1/inventory/transactions',
      params: {
        ...this.listFilters(),
        skip: String(q.skip),
        limit: String(q.take || PAGE_SIZE),
      },
    };
  });

  private readonly page = linkedSignal<InventoryTransaction[] | undefined, InventoryTransaction[]>({
    source: () => (this.transactions.hasValue() ? this.transactions.value() : undefined),
    computation: (value, previous) => value ?? previous?.value ?? [],
  });

  protected readonly total = linkedSignal<string | null | undefined, number>({
    source: () => this.transactions.headers()?.get('X-Total-Count'),
    computation: (value, previous) => (value == null ? (previous?.value ?? 0) : Number(value)),
  });

  protected readonly rows = computed(() => this.page().map(toRow));

  protected readonly exportAll = async () => {
    const params = { ...this.listFilters(), skip: '0', limit: String(EXPORT_PAGE) };
    const items = await firstValueFrom(
      this.http.get<InventoryTransaction[]>('/api/v1/inventory/transactions', { params }),
    );
    return items.map(toRow);
  };

  protected onQuery(query: GridQuery): void {
    this.gridQuery.set(query);
  }

  protected onRange(args: RangeEventArgs): void {
    this.navigate({ from: toIsoDate(args.startDate ?? null), to: toIsoDate(args.endDate ?? null) });
    this.grid()?.firstPage();
  }

  protected setType(type: TypeFilter): void {
    this.navigate({ type: type === 'ALL' ? null : type });
    this.grid()?.firstPage();
  }

  protected clear(): void {
    this.navigate({ from: null, to: null, type: null });
    this.grid()?.firstPage();
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
