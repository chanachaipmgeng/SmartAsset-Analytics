import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { STATUS_LABELS, TX_LABELS, toDate } from '../../core/labels';
import { InventoryTransaction } from '../../core/models';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { PageHeader } from '../../shared/page-header';
import { GRID_DEFAULTS, GRID_IMPORTS, GRID_PROVIDERS } from '../../shared/syncfusion';

@Component({
  selector: 'app-transactions',
  imports: [...GRID_IMPORTS, ButtonModule, PageHeader],
  providers: [...GRID_PROVIDERS],
  template: `
    <div class="page">
      <app-page-header title="ความเคลื่อนไหวสต็อก" subtitle="ประวัติทุกรายการที่เปลี่ยนสถานะหรือย้ายอุปกรณ์">
        <button ejs-button cssClass="e-outline" iconCss="e-icons e-refresh" (click)="transactions.reload()">รีเฟรช</button>
      </app-page-header>
      <div class="panel">
        <ejs-grid
          [dataSource]="rows()"
          [allowPaging]="true"
          [allowSorting]="true"
          [allowFiltering]="true"
          [allowResizing]="true"
          [pageSettings]="grid.pageSettings"
          [filterSettings]="grid.filterSettings"
          [toolbar]="grid.toolbar"
        >
          <e-columns>
            <e-column field="occurred_at" headerText="วันเวลา" type="datetime" format="dd/MM/yyyy HH:mm" width="150"></e-column>
            <e-column field="type_label" headerText="รายการ" width="110"></e-column>
            <e-column field="serial_number" headerText="ซีเรียล" width="150"></e-column>
            <e-column field="from_label" headerText="จากสถานะ" width="120"></e-column>
            <e-column field="to_label" headerText="เป็นสถานะ" width="120"></e-column>
            <e-column field="tenant_label" headerText="กลุ่มลูกค้า" width="190"></e-column>
            <e-column field="customer_name" headerText="ลูกค้า" width="180"></e-column>
            <e-column field="user_name" headerText="ผู้ทำรายการ" width="150"></e-column>
            <e-column field="note" headerText="หมายเหตุ" width="200"></e-column>
          </e-columns>
        </ejs-grid>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsPage {
  protected readonly grid = GRID_DEFAULTS;
  protected readonly transactions = httpResource<InventoryTransaction[]>(() => '/api/v1/inventory/transactions', {
    defaultValue: [],
  });

  protected readonly rows = computed(() =>
    this.transactions.value().map((t) => ({
      ...t,
      occurred_at: toDate(t.occurred_at),
      type_label: TX_LABELS[t.transaction_type],
      from_label: t.from_status ? STATUS_LABELS[t.from_status] : '-',
      to_label: STATUS_LABELS[t.to_status],
      tenant_label: t.tenant_name ?? 'คลังกลาง',
    })),
  );
}
