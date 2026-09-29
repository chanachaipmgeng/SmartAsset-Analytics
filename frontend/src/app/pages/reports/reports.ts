import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { STATUS_LABELS, toDate } from '../../core/labels';
import { AgedDevice, DeviceStatus } from '../../core/models';
import { DataGrid, GridAggregate, GridColumn } from '../../shared/data-grid';
import { FilterChip, FilterChips } from '../../shared/filter-chips';
import { PageHeader } from '../../shared/page-header';

interface StockBalanceRow {
  model_id: string;
  brand: string;
  model_name: string;
  tenant_id: string | null;
  tenant_name: string | null;
  status: DeviceStatus;
  count: number;
  total_cost: string;
}

type Tab = 'balance' | 'aging';

const BALANCE_COLUMNS: GridColumn[] = [
  { field: 'model', headerText: 'รุ่น', width: 200 },
  { field: 'tenant', headerText: 'กลุ่มลูกค้า', width: 200 },
  { field: 'status_label', headerText: 'สถานะ', width: 140 },
  { field: 'count', headerText: 'จำนวน', type: 'number', format: 'N0', textAlign: 'Right', width: 100 },
  { field: 'total_cost', headerText: 'ต้นทุนรวม (บาท)', type: 'number', format: 'N2', textAlign: 'Right', width: 150 },
];
const BALANCE_TOTALS: GridAggregate[] = [
  { field: 'count', type: 'Sum', format: 'N0' },
  { field: 'total_cost', type: 'Sum', format: 'N2' },
];

const AGING_COLUMNS: GridColumn[] = [
  { field: 'serial_number', headerText: 'ซีเรียล', width: 160, isPrimaryKey: true },
  { field: 'model', headerText: 'รุ่น', width: 180 },
  { field: 'tenant', headerText: 'กลุ่มลูกค้า', width: 180, hideAtMedia: '(min-width: 768px)' },
  { field: 'status_label', headerText: 'สถานะ', width: 140 },
  { field: 'since', headerText: 'อยู่ในสถานะตั้งแต่', type: 'date', format: 'dd/MM/yyyy', width: 150 },
  { field: 'days', headerText: 'จำนวนวัน', type: 'number', format: 'N0', textAlign: 'Right', width: 110 },
];
const AGING_TOTALS: GridAggregate[] = [
  { field: 'serial_number', type: 'Count' },
  { field: 'days', type: 'Max', format: 'N0' },
];

const AGING_STATUSES: DeviceStatus[] = ['IN_STOCK', 'CHECKED_OUT', 'INSTALLED', 'ON_LOAN', 'UNDER_QC', 'IN_REPAIR'];

@Component({
  selector: 'app-reports',
  imports: [PageHeader, DataGrid, FilterChips, CheckBoxModule],
  template: `
    <div class="page">
      <app-page-header title="รายงาน" subtitle="ยอดคงเหลือตามรุ่นและกลุ่มลูกค้า และอายุอุปกรณ์ในสถานะปัจจุบัน ส่งออก Excel/PDF ได้จากแถบเครื่องมือของตาราง" />
      <nav class="tabs" role="tablist" aria-label="ประเภทรายงาน">
        @for (t of tabs; track t.key) {
          <button type="button" role="tab" class="tab" [class.active]="activeTab() === t.key" [attr.aria-selected]="activeTab() === t.key" (click)="selectTab(t.key)">
            <span [class]="t.icon"></span>{{ t.label }}
          </button>
        }
      </nav>
      <div class="panel" role="tabpanel">
        @if (activeTab() === 'balance') {
          <div class="tab-body">
            <ejs-checkbox label="รวมอุปกรณ์ที่ปลดระวาง" [checked]="includeRetired()" (change)="includeRetired.set($event.checked)"></ejs-checkbox>
            <app-data-grid
              [data]="balanceRows()"
              [columns]="balanceColumns"
              [groupBy]="['model']"
              [aggregates]="balanceTotals"
              perspectiveKey="report-stock-balance"
              exportName="stock-balance"
              [loading]="balance.isLoading()"
              [error]="balance.error()"
              emptyTitle="ยังไม่มีอุปกรณ์"
              (retry)="balance.reload()"
            />
          </div>
        } @else {
          <div class="tab-body">
            <app-filter-chips [options]="statusChips" [(value)]="agingStatus" label="สถานะ" />
            <app-data-grid
              [data]="agingRows()"
              [columns]="agingColumns"
              [groupBy]="['status_label']"
              [aggregates]="agingTotals"
              perspectiveKey="report-aging"
              exportName="aging"
              [loading]="aging.isLoading()"
              [error]="aging.error()"
              emptyTitle="ไม่มีอุปกรณ์ในสถานะนี้"
              (retry)="aging.reload()"
            />
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
      border-bottom: 1px solid rgb(var(--color-sf-outline-variant));
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: -1px;
      padding: 10px 16px;
      border: 0;
      border-bottom: 3px solid transparent;
      background: none;
      color: rgb(var(--color-sf-on-surface-variant));
      font: inherit;
      font-weight: 500;
      cursor: pointer;

      &:hover {
        color: rgb(var(--color-sf-on-surface));
      }
      &.active {
        border-bottom-color: rgb(var(--color-sf-primary));
        color: rgb(var(--color-sf-primary));
      }
      &:focus-visible {
        outline: 2px solid rgb(var(--color-sf-primary));
        outline-offset: -2px;
      }
    }
    .tab-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {
  private readonly router = inject(Router);

  /** `?tab=aging` from the query string. */
  readonly tab = input<string>();
  protected readonly activeTab = computed<Tab>(() => (this.tab() === 'aging' ? 'aging' : 'balance'));
  protected readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'balance', label: 'ยอดคงเหลือ', icon: 'e-icons e-table-2' },
    { key: 'aging', label: 'อายุในสถานะ', icon: 'e-icons e-month' },
  ];

  protected readonly balanceColumns = BALANCE_COLUMNS;
  protected readonly balanceTotals = BALANCE_TOTALS;
  protected readonly agingColumns = AGING_COLUMNS;
  protected readonly agingTotals = AGING_TOTALS;

  protected readonly includeRetired = signal(false);
  protected readonly balance = httpResource<StockBalanceRow[]>(
    () => ({ url: '/api/v1/reports/stock-balance', params: { include_retired: this.includeRetired() } }),
    { defaultValue: [] },
  );
  protected readonly balanceRows = computed(() =>
    this.balance.value().map((r) => ({
      model: `${r.brand} ${r.model_name}`,
      tenant: r.tenant_name ?? 'คลังกลาง',
      status_label: STATUS_LABELS[r.status],
      count: r.count,
      total_cost: Number(r.total_cost),
    })),
  );

  protected readonly statusChips: FilterChip<DeviceStatus | 'ALL'>[] = [
    { key: 'ALL', label: 'ทุกสถานะ' },
    ...AGING_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] })),
  ];
  protected readonly agingStatus = signal<DeviceStatus | 'ALL'>('ALL');
  protected readonly aging = httpResource<AgedDevice[]>(
    () => {
      const status = this.agingStatus();
      const params: Record<string, string> = status === 'ALL' ? {} : { status };
      return { url: '/api/v1/reports/aging', params };
    },
    { defaultValue: [] },
  );
  protected readonly agingRows = computed(() =>
    this.aging.value().map((x) => ({
      serial_number: x.device.serial_number,
      model: `${x.device.brand} ${x.device.model_name}`,
      tenant: x.device.tenant_name ?? 'คลังกลาง',
      status_label: STATUS_LABELS[x.device.status],
      since: toDate(x.since),
      days: x.days,
    })),
  );

  protected selectTab(tab: Tab): void {
    void this.router.navigate([], {
      queryParams: { tab: tab === 'balance' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
