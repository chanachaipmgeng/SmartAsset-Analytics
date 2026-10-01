import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import {
  REPAIR_ORDER_STATUS_LABELS,
  REPAIR_ORDER_STATUS_TONES,
  toDate,
  toIsoDate,
} from '../../core/labels';
import { RepairOrder, RepairOrderStatus, Supplier } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ConfirmService } from '../../shared/confirm.service';
import {
  DataGrid,
  GridCell,
  GridColumn,
  GridQuery,
  GridRowAction,
  GridRowActionId,
} from '../../shared/data-grid';
import { DocumentList } from '../../shared/document-list';
import { FilterChip, FilterChips } from '../../shared/filter-chips';
import { PageHeader } from '../../shared/page-header';
import { StatusChip } from '../../shared/status-chip';
import { DIALOG_ANIMATION, FORM_IMPORTS } from '../../shared/syncfusion';

type StatusFilter = RepairOrderStatus | 'ALL';

const COLUMNS: GridColumn[] = [
  { field: 'serial_number', headerText: 'ซีเรียล', width: 150 },
  { field: 'status_label', headerText: 'สถานะ', width: 110 },
  { field: 'defect_note', headerText: 'อาการเสีย', width: 260 },
  { field: 'supplier_name', headerText: 'ผู้ซ่อม', width: 160 },
  { field: 'assignee_name', headerText: 'ผู้รับผิดชอบ', width: 140 },
  {
    field: 'due_date',
    headerText: 'ครบกำหนด',
    type: 'date',
    format: 'dd/MM/yyyy',
    width: 120,
  },
  {
    field: 'labor_cost',
    headerText: 'ค่าแรง',
    type: 'number',
    format: 'N2',
    textAlign: 'Right',
    width: 110,
  },
  {
    field: 'parts_cost',
    headerText: 'ค่าอะไหล่',
    type: 'number',
    format: 'N2',
    textAlign: 'Right',
    width: 110,
  },
  {
    field: 'created_at',
    headerText: 'เปิดเมื่อ',
    type: 'date',
    format: 'dd/MM/yyyy',
    width: 120,
  },
  { field: 'opened_by_name', headerText: 'เปิดโดย', width: 140, hidden: true },
];

@Component({
  selector: 'app-repairs',
  imports: [
    ...FORM_IMPORTS,
    RouterLink,
    DatePipe,
    DecimalPipe,
    PageHeader,
    DataGrid,
    GridCell,
    FilterChips,
    StatusChip,
    DocumentList,
  ],
  templateUrl: './repairs.html',
  styleUrl: './repairs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepairsPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);

  protected readonly animation = DIALOG_ANIMATION;
  protected readonly columns = COLUMNS;
  protected readonly statusLabels = REPAIR_ORDER_STATUS_LABELS;
  protected readonly statusTones = REPAIR_ORDER_STATUS_TONES;

  protected readonly statusFilter = signal<StatusFilter>('OPEN');
  private readonly gridQuery = signal<GridQuery | null>(null);

  protected readonly orders = httpResource<RepairOrder[]>(() => {
    const q = this.gridQuery();
    if (!q) return undefined;
    const params: Record<string, string | number> = { skip: q.skip, take: q.take };
    const status = this.statusFilter();
    if (status !== 'ALL') params['status'] = status;
    return { url: '/api/v1/repair-orders', params };
  });

  private readonly page = linkedSignal<RepairOrder[] | undefined, RepairOrder[]>({
    source: () => (this.orders.hasValue() ? this.orders.value() : undefined),
    computation: (value, previous) => value ?? previous?.value ?? [],
  });
  protected readonly total = linkedSignal<string | null | undefined, number>({
    source: () => this.orders.headers()?.get('X-Total-Count'),
    computation: (value, previous) => (value == null ? (previous?.value ?? 0) : Number(value)),
  });

  protected readonly filters = computed<FilterChip<StatusFilter>[]>(() => [
    { key: 'ALL', label: 'ทั้งหมด' },
    { key: 'OPEN', label: 'เปิด' },
    { key: 'CLOSED', label: 'ปิดแล้ว' },
    { key: 'CANCELLED', label: 'ยกเลิก' },
  ]);

  protected readonly rows = computed(() =>
    this.page().map((o) => ({
      ...o,
      status_label: REPAIR_ORDER_STATUS_LABELS[o.status],
      status_tone: REPAIR_ORDER_STATUS_TONES[o.status],
      due_date: toDate(o.due_date),
      created_at: toDate(o.created_at),
      labor_cost: o.labor_cost == null ? null : Number(o.labor_cost),
      parts_cost: o.parts_cost == null ? null : Number(o.parts_cost),
    })),
  );

  protected readonly exportAll = async () => {
    const status = this.statusFilter();
    const params: Record<string, string> = { take: '500' };
    if (status !== 'ALL') params['status'] = status;
    return (await this.api.listRepairOrders(params)).map((o) => ({
      ...o,
      status_label: REPAIR_ORDER_STATUS_LABELS[o.status],
      due_date: toDate(o.due_date),
      created_at: toDate(o.created_at),
      labor_cost: o.labor_cost == null ? null : Number(o.labor_cost),
      parts_cost: o.parts_cost == null ? null : Number(o.parts_cost),
    }));
  };

  protected readonly selected = signal<RepairOrder | null>(null);
  protected readonly viewOpen = signal(false);
  protected readonly editOpen = signal(false);
  protected readonly busy = signal(false);

  protected readonly parts = signal('');
  protected readonly laborCost = signal<number | null>(null);
  protected readonly partsCost = signal<number | null>(null);
  protected readonly dueDate = signal<Date | null>(null);
  protected readonly assigneeName = signal('');
  protected readonly supplierId = signal<string | null>(null);

  protected readonly suppliers = httpResource<Supplier[]>(
    () => (this.editOpen() ? '/api/v1/suppliers' : undefined),
    { defaultValue: [] },
  );
  protected readonly supplierOptions = computed(() =>
    this.suppliers.value().map((s) => ({ value: s.id, text: s.name })),
  );

  protected readonly canEditSelected = computed(
    () => this.auth.canWrite() && this.selected()?.status === 'OPEN',
  );
  protected readonly rowActions = computed<GridRowActionId[]>(() =>
    this.auth.canWrite() ? ['view', 'edit'] : ['view'],
  );

  protected onStatusFilter(value: StatusFilter): void {
    this.statusFilter.set(value);
    this.gridQuery.update((q) => (q ? { ...q, skip: 0 } : q));
    this.selected.set(null);
  }

  protected onQuery(q: GridQuery): void {
    this.gridQuery.set(q);
  }

  protected onRowSelected(row: { id: string } | null): void {
    this.selected.set(row ? (this.page().find((o) => o.id === row.id) ?? null) : null);
  }

  protected onRowAction({ action, row }: GridRowAction<{ id: string }>): void {
    this.onRowSelected(row);
    if (action === 'edit' && this.canEditSelected()) this.openEdit();
    else this.openView();
  }

  protected openView(): void {
    if (!this.selected()) return;
    this.viewOpen.set(true);
  }

  protected openEdit(): void {
    const o = this.selected();
    if (!o || o.status !== 'OPEN') return;
    this.parts.set(o.parts ?? '');
    this.laborCost.set(o.labor_cost == null ? null : Number(o.labor_cost));
    this.partsCost.set(o.parts_cost == null ? null : Number(o.parts_cost));
    this.dueDate.set(toDate(o.due_date));
    this.assigneeName.set(o.assignee_name ?? '');
    this.supplierId.set(o.supplier_id);
    this.editOpen.set(true);
  }

  protected async save(): Promise<void> {
    const o = this.selected();
    if (!o || !this.canEditSelected()) return;
    this.busy.set(true);
    try {
      const updated = await this.api.updateRepairOrder(o.id, {
        parts: this.parts().trim() || null,
        labor_cost: this.laborCost(),
        parts_cost: this.partsCost(),
        due_date: toIsoDate(this.dueDate()),
        assignee_name: this.assigneeName().trim() || null,
        supplier_id: this.supplierId(),
      });
      this.selected.set(updated);
      this.notify.success('บันทึกใบงานซ่อมแล้ว');
      this.editOpen.set(false);
      this.orders.reload();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancelOrder(): Promise<void> {
    const o = this.selected();
    if (!o || o.status !== 'OPEN') return;
    const ok = await this.confirm.ask({
      title: 'ยืนยันการยกเลิกใบงาน',
      message: `ยกเลิกใบงานซ่อมของซีเรียล ${o.serial_number} ใช่หรือไม่`,
      okText: 'ยกเลิกใบงาน',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const updated = await this.api.cancelRepairOrder(o.id);
      this.selected.set(updated);
      this.notify.success('ยกเลิกใบงานซ่อมแล้ว');
      this.viewOpen.set(false);
      this.editOpen.set(false);
      this.orders.reload();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
