import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { STATUS_LABELS, TX_ICONS, TX_LABELS, TX_TONES, toDate } from '../../core/labels';
import { InventoryTransaction } from '../../core/models';
import { DataGrid, GridCell, GridColumn } from '../../shared/data-grid';
import { PageHeader } from '../../shared/page-header';

const WIDE = '(min-width: 768px)';

const COLUMNS: GridColumn[] = [
  { field: 'occurred_at', headerText: 'วันเวลา', type: 'datetime', format: 'dd/MM/yyyy HH:mm', width: 150 },
  { field: 'type_label', headerText: 'รายการ', width: 190 },
  { field: 'serial_number', headerText: 'ซีเรียล', width: 150 },
  { field: 'from_label', headerText: 'จากสถานะ', width: 120, hideAtMedia: WIDE },
  { field: 'to_label', headerText: 'เป็นสถานะ', width: 120, hideAtMedia: WIDE },
  { field: 'tenant_label', headerText: 'กลุ่มลูกค้า', width: 190, hideAtMedia: WIDE },
  { field: 'customer_name', headerText: 'ลูกค้า', width: 180, hideAtMedia: WIDE },
  { field: 'user_name', headerText: 'ผู้ทำรายการ', width: 150, hideAtMedia: WIDE },
  { field: 'note', headerText: 'หมายเหตุ', width: 200, hideAtMedia: WIDE },
];

@Component({
  selector: 'app-transactions',
  imports: [ButtonModule, PageHeader, DataGrid, GridCell],
  template: `
    <div class="page">
      <app-page-header title="ความเคลื่อนไหวสต็อก" subtitle="ประวัติทุกรายการที่เปลี่ยนสถานะหรือย้ายอุปกรณ์">
        <button ejs-button cssClass="e-outline" iconCss="e-icons e-refresh" (click)="transactions.reload()">รีเฟรช</button>
      </app-page-header>
      <div class="panel">
        <app-data-grid
          [data]="rows()"
          [columns]="columns"
          perspectiveKey="transactions"
          exportName="stock-transactions"
          [loading]="transactions.isLoading()"
          [error]="transactions.error()"
          emptyTitle="ยังไม่มีความเคลื่อนไหว"
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
  protected readonly columns = COLUMNS;
  protected readonly transactions = httpResource<InventoryTransaction[]>(() => '/api/v1/inventory/transactions', {
    defaultValue: [],
  });

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
}
