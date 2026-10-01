import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { NumericTextBoxModule } from '@syncfusion/ej2-angular-inputs';
import {
  RISK_LEVEL_LABELS,
  STATUS_LABELS,
  TX_LABELS,
  toDate,
} from '../../core/labels';
import {
  AgedDevice,
  DepreciationRow,
  DeviceRisk,
  DeviceStatus,
  FirmwareDriftRow,
  IssueGroup,
  MonthlyMovementRow,
  RepairRateRow,
  RepairTatRow,
  RiskLevel,
  StockForecastRow,
  TransactionType,
  WarrantyRow,
} from '../../core/models';
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

type Tab =
  | 'balance'
  | 'aging'
  | 'risk'
  | 'repair-rate'
  | 'forecast'
  | 'issues'
  | 'warranty'
  | 'repair-tat'
  | 'movement'
  | 'firmware'
  | 'depreciation';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'balance', label: 'ยอดคงเหลือ', icon: 'e-icons e-table-2' },
  { key: 'aging', label: 'อายุในสถานะ', icon: 'e-icons e-month' },
  { key: 'risk', label: 'ความเสี่ยง', icon: 'e-icons e-warning' },
  { key: 'repair-rate', label: 'อัตราซ่อมตามรุ่น', icon: 'e-icons e-chart' },
  { key: 'forecast', label: 'พยากรณ์สต็อก', icon: 'e-icons e-timeline-events' },
  { key: 'issues', label: 'สรุปอาการเสีย', icon: 'e-icons e-description' },
  { key: 'warranty', label: 'ประกัน', icon: 'e-icons e-check-box' },
  { key: 'repair-tat', label: 'เวลาซ่อม', icon: 'e-icons e-clock' },
  { key: 'movement', label: 'ความเคลื่อนไหวรายเดือน', icon: 'e-icons e-changes-track' },
  { key: 'firmware', label: 'เฟิร์มแวร์ไม่ตรงรุ่น', icon: 'e-icons e-code-view' },
  { key: 'depreciation', label: 'ค่าเสื่อม', icon: 'e-icons e-decrease-indent' },
];

const TAB_KEYS = new Set<string>(TABS.map((t) => t.key));

const BALANCE_COLUMNS: GridColumn[] = [
  { field: 'model', headerText: 'รุ่น', width: 200 },
  { field: 'tenant', headerText: 'กลุ่มลูกค้า', width: 200 },
  { field: 'status_label', headerText: 'สถานะ', width: 140 },
  {
    field: 'count',
    headerText: 'จำนวน',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 100,
  },
  {
    field: 'total_cost',
    headerText: 'ต้นทุนรวม (บาท)',
    type: 'number',
    format: 'N2',
    textAlign: 'Right',
    width: 150,
  },
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
  {
    field: 'since',
    headerText: 'อยู่ในสถานะตั้งแต่',
    type: 'date',
    format: 'dd/MM/yyyy',
    width: 150,
  },
  {
    field: 'days',
    headerText: 'จำนวนวัน',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 110,
  },
];
const AGING_TOTALS: GridAggregate[] = [
  { field: 'serial_number', type: 'Count' },
  { field: 'days', type: 'Max', format: 'N0' },
];

const RISK_COLUMNS: GridColumn[] = [
  { field: 'serial_number', headerText: 'ซีเรียล', width: 150, isPrimaryKey: true },
  { field: 'model', headerText: 'รุ่น', width: 180 },
  { field: 'status_label', headerText: 'สถานะ', width: 130 },
  { field: 'level_label', headerText: 'ระดับความเสี่ยง', width: 140 },
  {
    field: 'score',
    headerText: 'คะแนน',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 100,
  },
  { field: 'factors', headerText: 'ปัจจัย', width: 360 },
];

const REPAIR_RATE_COLUMNS: GridColumn[] = [
  { field: 'model', headerText: 'รุ่น', width: 220 },
  {
    field: 'device_count',
    headerText: 'จำนวนเครื่อง',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 120,
  },
  {
    field: 'repair_events',
    headerText: 'ครั้งที่ซ่อม',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 120,
  },
  {
    field: 'rate_pct',
    headerText: 'อัตรา (%)',
    type: 'number',
    format: 'N1',
    textAlign: 'Right',
    width: 110,
  },
];

const FORECAST_COLUMNS: GridColumn[] = [
  { field: 'model', headerText: 'รุ่น', width: 220 },
  {
    field: 'in_stock',
    headerText: 'คงเหลือ',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 100,
  },
  {
    field: 'outflow_events',
    headerText: 'เบิกออก',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 100,
  },
  {
    field: 'avg_per_month',
    headerText: 'เฉลี่ย/เดือน',
    type: 'number',
    format: 'N2',
    textAlign: 'Right',
    width: 120,
  },
  {
    field: 'months_of_stock',
    headerText: 'เดือนที่เหลือ',
    type: 'number',
    format: 'N1',
    textAlign: 'Right',
    width: 120,
  },
];

const WARRANTY_COLUMNS: GridColumn[] = [
  { field: 'serial_number', headerText: 'ซีเรียล', width: 150, isPrimaryKey: true },
  { field: 'model', headerText: 'รุ่น', width: 180 },
  { field: 'tenant', headerText: 'กลุ่มลูกค้า', width: 160 },
  {
    field: 'warranty_end',
    headerText: 'หมดประกัน',
    type: 'date',
    format: 'dd/MM/yyyy',
    width: 130,
  },
  {
    field: 'days_remaining',
    headerText: 'เหลือ (วัน)',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 110,
  },
];

const REPAIR_TAT_COLUMNS: GridColumn[] = [
  { field: 'supplier_name', headerText: 'ผู้ซ่อม', width: 220 },
  {
    field: 'count',
    headerText: 'จำนวนใบ',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 100,
  },
  {
    field: 'avg_days',
    headerText: 'เฉลี่ย (วัน)',
    type: 'number',
    format: 'N1',
    textAlign: 'Right',
    width: 120,
  },
  {
    field: 'min_days',
    headerText: 'เร็วสุด',
    type: 'number',
    format: 'N1',
    textAlign: 'Right',
    width: 100,
  },
  {
    field: 'max_days',
    headerText: 'ช้าสุด',
    type: 'number',
    format: 'N1',
    textAlign: 'Right',
    width: 100,
  },
];

const MOVEMENT_COLUMNS: GridColumn[] = [
  { field: 'month', headerText: 'เดือน', width: 110 },
  {
    field: 'total',
    headerText: 'รวม',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 90,
  },
  ...(['CHECK_IN', 'CHECK_OUT', 'INSTALL', 'SEND_REPAIR', 'REPAIR_DONE', 'RETIRE'] as TransactionType[]).map(
    (t): GridColumn => ({
      field: t,
      headerText: TX_LABELS[t],
      type: 'number',
      format: 'N0',
      textAlign: 'Right',
      width: 110,
    }),
  ),
];

const FIRMWARE_COLUMNS: GridColumn[] = [
  { field: 'serial_number', headerText: 'ซีเรียล', width: 150, isPrimaryKey: true },
  { field: 'model', headerText: 'รุ่น', width: 180 },
  { field: 'model_firmware', headerText: 'เฟิร์มแวร์รุ่น', width: 140 },
  { field: 'device_firmware', headerText: 'เฟิร์มแวร์เครื่อง', width: 140 },
  { field: 'status_label', headerText: 'สถานะ', width: 130 },
];

const DEPRECIATION_COLUMNS: GridColumn[] = [
  { field: 'serial_number', headerText: 'ซีเรียล', width: 150, isPrimaryKey: true },
  { field: 'model', headerText: 'รุ่น', width: 180 },
  {
    field: 'purchase_date',
    headerText: 'วันที่ซื้อ',
    type: 'date',
    format: 'dd/MM/yyyy',
    width: 120,
  },
  {
    field: 'cost',
    headerText: 'ต้นทุน',
    type: 'number',
    format: 'N2',
    textAlign: 'Right',
    width: 120,
  },
  {
    field: 'age_years',
    headerText: 'อายุ (ปี)',
    type: 'number',
    format: 'N1',
    textAlign: 'Right',
    width: 100,
  },
  {
    field: 'book_value',
    headerText: 'มูลค่าตามบัญชี',
    type: 'number',
    format: 'N2',
    textAlign: 'Right',
    width: 140,
  },
  {
    field: 'useful_years',
    headerText: 'อายุการใช้งาน',
    type: 'number',
    format: 'N0',
    textAlign: 'Right',
    width: 120,
  },
];

const AGING_STATUSES: DeviceStatus[] = [
  'IN_STOCK',
  'CHECKED_OUT',
  'INSTALLED',
  'ON_LOAN',
  'UNDER_QC',
  'IN_REPAIR',
];

@Component({
  selector: 'app-reports',
  imports: [PageHeader, DataGrid, FilterChips, CheckBoxModule, NumericTextBoxModule, DecimalPipe],
  template: `
    <div class="page">
      <app-page-header
        title="รายงาน"
        subtitle="ยอดคงเหลือ อายุในสถานะ และรายงานเชิงวิเคราะห์/พยากรณ์ ส่งออก Excel/PDF ได้จากแถบเครื่องมือของตาราง"
      />
      <nav class="tabs" role="tablist" aria-label="ประเภทรายงาน">
        @for (t of tabs; track t.key) {
          <button
            type="button"
            role="tab"
            class="tab"
            [class.active]="activeTab() === t.key"
            [attr.aria-selected]="activeTab() === t.key"
            (click)="selectTab(t.key)"
          >
            <span [class]="t.icon"></span>{{ t.label }}
          </button>
        }
      </nav>
      <div class="panel" role="tabpanel">
        @switch (activeTab()) {
          @case ('balance') {
            <div class="tab-body">
              <ejs-checkbox
                label="รวมอุปกรณ์ที่ปลดระวาง"
                [checked]="includeRetired()"
                (change)="includeRetired.set($event.checked)"
              ></ejs-checkbox>
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
          }
          @case ('aging') {
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
          @case ('risk') {
            <div class="tab-body">
              <app-data-grid
                [data]="riskRows()"
                [columns]="riskColumns"
                perspectiveKey="report-risk"
                exportName="device-risk"
                [loading]="risk.isLoading()"
                [error]="risk.error()"
                emptyTitle="ยังไม่มีข้อมูลความเสี่ยง"
                (retry)="risk.reload()"
              />
            </div>
          }
          @case ('repair-rate') {
            <div class="tab-body">
              <label class="days-field">
                ช่วงเวลา (วัน)
                <ejs-numerictextbox
                  [value]="repairRateDays()"
                  [min]="1"
                  [max]="3650"
                  format="N0"
                  [decimals]="0"
                  (change)="repairRateDays.set($event.value ?? 90)"
                ></ejs-numerictextbox>
              </label>
              <app-data-grid
                [data]="repairRateRows()"
                [columns]="repairRateColumns"
                perspectiveKey="report-repair-rate"
                exportName="repair-rate"
                [loading]="repairRate.isLoading()"
                [error]="repairRate.error()"
                emptyTitle="ยังไม่มีข้อมูลอัตราซ่อม"
                (retry)="repairRate.reload()"
              />
            </div>
          }
          @case ('forecast') {
            <div class="tab-body">
              <label class="days-field">
                ช่วงเวลา (วัน)
                <ejs-numerictextbox
                  [value]="forecastDays()"
                  [min]="1"
                  [max]="3650"
                  format="N0"
                  [decimals]="0"
                  (change)="forecastDays.set($event.value ?? 90)"
                ></ejs-numerictextbox>
              </label>
              <app-data-grid
                [data]="forecastRows()"
                [columns]="forecastColumns"
                perspectiveKey="report-forecast"
                exportName="stock-forecast"
                [loading]="forecast.isLoading()"
                [error]="forecast.error()"
                emptyTitle="ยังไม่มีข้อมูลพยากรณ์"
                (retry)="forecast.reload()"
              />
            </div>
          }
          @case ('issues') {
            <div class="tab-body">
              <label class="days-field">
                ช่วงเวลา (วัน)
                <ejs-numerictextbox
                  [value]="issuesDays()"
                  [min]="1"
                  [max]="3650"
                  format="N0"
                  [decimals]="0"
                  (change)="issuesDays.set($event.value ?? 90)"
                ></ejs-numerictextbox>
              </label>
              @if (issues.isLoading()) {
                <p class="muted">กำลังโหลด…</p>
              } @else if (issues.error()) {
                <p class="error">โหลดไม่สำเร็จ — <button type="button" class="link" (click)="issues.reload()">ลองใหม่</button></p>
              } @else if (!issues.value().length) {
                <p class="muted">ยังไม่มีสรุปอาการเสีย</p>
              } @else {
                <div class="issues-table-wrap">
                  <table class="issues-table">
                    <thead>
                      <tr>
                        <th>หมวดอาการ</th>
                        <th class="num">จำนวน</th>
                        <th>ตัวอย่างบันทึก</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (g of issues.value(); track g.category) {
                        <tr>
                          <td>{{ g.category }}</td>
                          <td class="num">{{ g.count | number }}</td>
                          <td>
                            <ul class="samples">
                              @for (n of g.sample_notes; track n) {
                                <li>{{ n }}</li>
                              }
                            </ul>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          }
          @case ('warranty') {
            <div class="tab-body">
              <label class="days-field">
                หมดภายใน (วัน)
                <ejs-numerictextbox
                  [value]="warrantyDays()"
                  [min]="0"
                  [max]="3650"
                  format="N0"
                  [decimals]="0"
                  (change)="warrantyDays.set($event.value ?? 90)"
                ></ejs-numerictextbox>
              </label>
              <app-data-grid
                [data]="warrantyRows()"
                [columns]="warrantyColumns"
                perspectiveKey="report-warranty"
                exportName="warranty"
                [loading]="warranty.isLoading()"
                [error]="warranty.error()"
                emptyTitle="ไม่มีอุปกรณ์ที่ใกล้หมดประกัน"
                (retry)="warranty.reload()"
              />
            </div>
          }
          @case ('repair-tat') {
            <div class="tab-body">
              <label class="days-field">
                ช่วงเวลา (วัน)
                <ejs-numerictextbox
                  [value]="tatDays()"
                  [min]="1"
                  [max]="3650"
                  format="N0"
                  [decimals]="0"
                  (change)="tatDays.set($event.value ?? 180)"
                ></ejs-numerictextbox>
              </label>
              <app-data-grid
                [data]="tatRows()"
                [columns]="repairTatColumns"
                perspectiveKey="report-repair-tat"
                exportName="repair-tat"
                [loading]="tat.isLoading()"
                [error]="tat.error()"
                emptyTitle="ยังไม่มีข้อมูลเวลาซ่อม"
                (retry)="tat.reload()"
              />
            </div>
          }
          @case ('movement') {
            <div class="tab-body">
              <label class="days-field">
                จำนวนเดือน
                <ejs-numerictextbox
                  [value]="movementMonths()"
                  [min]="1"
                  [max]="120"
                  format="N0"
                  [decimals]="0"
                  (change)="movementMonths.set($event.value ?? 12)"
                ></ejs-numerictextbox>
              </label>
              <app-data-grid
                [data]="movementRows()"
                [columns]="movementColumns"
                perspectiveKey="report-movement"
                exportName="monthly-movement"
                [loading]="movement.isLoading()"
                [error]="movement.error()"
                emptyTitle="ยังไม่มีความเคลื่อนไหว"
                (retry)="movement.reload()"
              />
            </div>
          }
          @case ('firmware') {
            <div class="tab-body">
              <app-data-grid
                [data]="firmwareRows()"
                [columns]="firmwareColumns"
                perspectiveKey="report-firmware"
                exportName="firmware-drift"
                [loading]="firmware.isLoading()"
                [error]="firmware.error()"
                emptyTitle="ไม่มีเครื่องที่เฟิร์มแวร์ไม่ตรงรุ่น"
                (retry)="firmware.reload()"
              />
            </div>
          }
          @case ('depreciation') {
            <div class="tab-body">
              <div class="toolbar-row">
                <label class="days-field">
                  อายุการใช้งาน (ปี)
                  <ejs-numerictextbox
                    [value]="usefulYears()"
                    [min]="1"
                    [max]="50"
                    format="N0"
                    [decimals]="0"
                    (change)="usefulYears.set($event.value ?? 5)"
                  ></ejs-numerictextbox>
                </label>
                <ejs-checkbox
                  label="รวมอุปกรณ์ที่ปลดระวาง"
                  [checked]="depIncludeRetired()"
                  (change)="depIncludeRetired.set($event.checked)"
                ></ejs-checkbox>
              </div>
              <app-data-grid
                [data]="depreciationRows()"
                [columns]="depreciationColumns"
                perspectiveKey="report-depreciation"
                exportName="depreciation"
                [loading]="depreciation.isLoading()"
                [error]="depreciation.error()"
                emptyTitle="ยังไม่มีข้อมูลค่าเสื่อม"
                (retry)="depreciation.reload()"
              />
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .tabs {
      display: flex;
      flex-wrap: nowrap;
      gap: 4px;
      margin-bottom: 12px;
      overflow-x: auto;
      border-bottom: 1px solid rgb(var(--app-outline-variant));
      scrollbar-width: thin;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      margin-bottom: -1px;
      padding: 10px 16px;
      border: 0;
      border-bottom: 3px solid transparent;
      background: none;
      color: rgb(var(--app-on-surface-variant));
      font: inherit;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;

      &:hover {
        color: rgb(var(--app-on-surface));
      }
      &.active {
        border-bottom-color: rgb(var(--app-primary));
        color: rgb(var(--app-primary));
      }
      &:focus-visible {
        outline: 2px solid rgb(var(--app-primary));
        outline-offset: -2px;
      }
    }
    .tab-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .days-field {
      display: inline-flex;
      flex-direction: column;
      gap: 4px;
      max-width: 160px;
      font-size: 13px;
      font-weight: 500;
      color: rgb(var(--app-on-surface-variant));
    }
    .toolbar-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 16px;
    }
    .muted {
      color: rgb(var(--app-on-surface-variant));
    }
    .error {
      color: rgb(var(--app-error));
    }
    .link {
      padding: 0;
      border: 0;
      background: none;
      color: rgb(var(--app-primary));
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
    }
    .issues-table-wrap {
      overflow: auto;
      border: 1px solid rgb(var(--app-outline-variant));
      border-radius: 12px;
    }
    .issues-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;

      th,
      td {
        padding: 10px 12px;
        text-align: left;
        vertical-align: top;
        border-bottom: 1px solid rgb(var(--app-outline-variant));
      }
      th {
        background: color-mix(in srgb, rgb(var(--app-surface)) 88%, rgb(var(--app-primary)));
        font-weight: 600;
      }
      .num {
        text-align: right;
        white-space: nowrap;
      }
    }
    .samples {
      margin: 0;
      padding-left: 18px;
      color: rgb(var(--app-on-surface-variant));
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {
  private readonly router = inject(Router);

  /** `?tab=aging` from the query string. */
  readonly tab = input<string>();
  protected readonly activeTab = computed<Tab>(() => {
    const t = this.tab();
    return t && TAB_KEYS.has(t) ? (t as Tab) : 'balance';
  });
  protected readonly tabs = TABS;

  protected readonly balanceColumns = BALANCE_COLUMNS;
  protected readonly balanceTotals = BALANCE_TOTALS;
  protected readonly agingColumns = AGING_COLUMNS;
  protected readonly agingTotals = AGING_TOTALS;
  protected readonly riskColumns = RISK_COLUMNS;
  protected readonly repairRateColumns = REPAIR_RATE_COLUMNS;
  protected readonly forecastColumns = FORECAST_COLUMNS;
  protected readonly warrantyColumns = WARRANTY_COLUMNS;
  protected readonly repairTatColumns = REPAIR_TAT_COLUMNS;
  protected readonly movementColumns = MOVEMENT_COLUMNS;
  protected readonly firmwareColumns = FIRMWARE_COLUMNS;
  protected readonly depreciationColumns = DEPRECIATION_COLUMNS;

  protected readonly includeRetired = signal(false);
  protected readonly balance = httpResource<StockBalanceRow[]>(
    () =>
      this.activeTab() === 'balance'
        ? {
            url: '/api/v1/reports/stock-balance',
            params: { include_retired: this.includeRetired() },
          }
        : undefined,
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
      if (this.activeTab() !== 'aging') return undefined;
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

  protected readonly risk = httpResource<DeviceRisk[]>(
    () => (this.activeTab() === 'risk' ? '/api/v1/reports/device-risk' : undefined),
    { defaultValue: [] },
  );
  protected readonly riskRows = computed(() =>
    this.risk.value().map((r) => ({
      serial_number: r.device.serial_number,
      model: `${r.device.brand} ${r.device.model_name}`,
      status_label: STATUS_LABELS[r.device.status],
      level_label: RISK_LEVEL_LABELS[r.level as RiskLevel] ?? r.level,
      score: r.score,
      factors: r.factors.join(' · '),
    })),
  );

  protected readonly repairRateDays = signal(90);
  protected readonly repairRate = httpResource<RepairRateRow[]>(
    () =>
      this.activeTab() === 'repair-rate'
        ? { url: '/api/v1/reports/repair-rate', params: { days: this.repairRateDays() } }
        : undefined,
    { defaultValue: [] },
  );
  protected readonly repairRateRows = computed(() =>
    this.repairRate.value().map((r) => ({
      model: `${r.brand} ${r.model_name}`,
      device_count: r.device_count,
      repair_events: r.repair_events,
      rate_pct: r.rate * 100,
    })),
  );

  protected readonly forecastDays = signal(90);
  protected readonly forecast = httpResource<StockForecastRow[]>(
    () =>
      this.activeTab() === 'forecast'
        ? { url: '/api/v1/reports/stock-forecast', params: { days: this.forecastDays() } }
        : undefined,
    { defaultValue: [] },
  );
  protected readonly forecastRows = computed(() =>
    this.forecast.value().map((r) => ({
      model: `${r.brand} ${r.model_name}`,
      in_stock: r.in_stock,
      outflow_events: r.outflow_events,
      avg_per_month: r.avg_per_month,
      months_of_stock: r.months_of_stock,
    })),
  );

  protected readonly issuesDays = signal(90);
  protected readonly issues = httpResource<IssueGroup[]>(
    () =>
      this.activeTab() === 'issues'
        ? { url: '/api/v1/reports/issue-summary', params: { days: this.issuesDays() } }
        : undefined,
    { defaultValue: [] },
  );

  protected readonly warrantyDays = signal(90);
  protected readonly warranty = httpResource<WarrantyRow[]>(
    () =>
      this.activeTab() === 'warranty'
        ? { url: '/api/v1/reports/warranty', params: { within_days: this.warrantyDays() } }
        : undefined,
    { defaultValue: [] },
  );
  protected readonly warrantyRows = computed(() =>
    this.warranty.value().map((r) => ({
      serial_number: r.device.serial_number,
      model: `${r.device.brand} ${r.device.model_name}`,
      tenant: r.device.tenant_name ?? 'คลังกลาง',
      warranty_end: toDate(r.device.warranty_end),
      days_remaining: r.days_remaining,
    })),
  );

  protected readonly tatDays = signal(180);
  protected readonly tat = httpResource<RepairTatRow[]>(
    () =>
      this.activeTab() === 'repair-tat'
        ? { url: '/api/v1/reports/repair-tat', params: { days: this.tatDays() } }
        : undefined,
    { defaultValue: [] },
  );
  protected readonly tatRows = computed(() => this.tat.value());

  protected readonly movementMonths = signal(12);
  protected readonly movement = httpResource<MonthlyMovementRow[]>(
    () =>
      this.activeTab() === 'movement'
        ? { url: '/api/v1/reports/monthly-movement', params: { months: this.movementMonths() } }
        : undefined,
    { defaultValue: [] },
  );
  protected readonly movementRows = computed(() =>
    this.movement.value().map((r) => ({
      month: r.month,
      total: r.total,
      CHECK_IN: r.counts['CHECK_IN'] ?? 0,
      CHECK_OUT: r.counts['CHECK_OUT'] ?? 0,
      INSTALL: r.counts['INSTALL'] ?? 0,
      SEND_REPAIR: r.counts['SEND_REPAIR'] ?? 0,
      REPAIR_DONE: r.counts['REPAIR_DONE'] ?? 0,
      RETIRE: r.counts['RETIRE'] ?? 0,
    })),
  );

  protected readonly firmware = httpResource<FirmwareDriftRow[]>(
    () => (this.activeTab() === 'firmware' ? '/api/v1/reports/firmware-drift' : undefined),
    { defaultValue: [] },
  );
  protected readonly firmwareRows = computed(() =>
    this.firmware.value().map((r) => ({
      serial_number: r.device.serial_number,
      model: `${r.device.brand} ${r.device.model_name}`,
      model_firmware: r.model_firmware,
      device_firmware: r.device_firmware,
      status_label: STATUS_LABELS[r.device.status],
    })),
  );

  protected readonly usefulYears = signal(5);
  protected readonly depIncludeRetired = signal(false);
  protected readonly depreciation = httpResource<DepreciationRow[]>(
    () =>
      this.activeTab() === 'depreciation'
        ? {
            url: '/api/v1/reports/depreciation',
            params: {
              useful_years: this.usefulYears(),
              include_retired: this.depIncludeRetired(),
            },
          }
        : undefined,
    { defaultValue: [] },
  );
  protected readonly depreciationRows = computed(() =>
    this.depreciation.value().map((r) => ({
      serial_number: r.device.serial_number,
      model: `${r.device.brand} ${r.device.model_name}`,
      purchase_date: toDate(r.purchase_date),
      cost: Number(r.cost),
      age_years: r.age_years,
      book_value: Number(r.book_value),
      useful_years: r.useful_years,
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
