import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { SERVICE_LEVEL_LABELS, toOptions } from '../../core/labels';
import { Customer, ServiceLevel, Tenant } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ConfirmService } from '../../shared/confirm.service';
import { PageHeader } from '../../shared/page-header';
import { DataGrid, GridCell, GridColumn, GridRowAction, GridRowActionId } from '../../shared/data-grid';
import { FilterChip, FilterChips } from '../../shared/filter-chips';
import { RecordField, RecordView } from '../../shared/record-view';
import { DIALOG_ANIMATION, FORM_IMPORTS } from '../../shared/syncfusion';

type ActiveFilter = 'ACTIVE' | 'INACTIVE' | 'ALL';

@Component({
  selector: 'app-customers',
  imports: [...FORM_IMPORTS, PageHeader, DataGrid, GridCell, FilterChips, RecordView],
  templateUrl: './customers.html',
  styleUrl: './customers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);

  protected readonly animation = DIALOG_ANIMATION;
  protected readonly columns = computed<GridColumn[]>(() => [
    { field: 'company_name', headerText: 'ชื่อบริษัท', width: 220 },
    { field: 'contact_person', headerText: 'ผู้ติดต่อ', width: 150 },
    { field: 'phone', headerText: 'โทรศัพท์', width: 130 },
    { field: 'email', headerText: 'อีเมล', width: 200 },
    { field: 'level_label', headerText: 'ระดับบริการ', width: 130 },
    { field: 'active_label', headerText: 'สถานะ', width: 110 },
    ...(this.auth.isSuperadmin() ? [{ field: 'tenant_name', headerText: 'กลุ่มลูกค้า', width: 200 }] : []),
  ]);
  protected readonly levelOptions = toOptions(SERVICE_LEVEL_LABELS);

  protected readonly customers = httpResource<Customer[]>(() => '/api/v1/customers', { defaultValue: [] });
  protected readonly tenants = httpResource<Tenant[]>(() => '/api/v1/tenants', { defaultValue: [] });

  private readonly tenantNames = computed(() => new Map(this.tenants.value().map((t) => [t.id, t.name])));
  protected readonly tenantOptions = computed(() => this.tenants.value().map((t) => ({ value: t.id, text: t.name })));
  protected readonly activeFilter = signal<ActiveFilter>('ACTIVE');
  protected readonly filters = computed<FilterChip<ActiveFilter>[]>(() => {
    const all = this.customers.value();
    const active = all.filter((c) => c.is_active).length;
    return [
      { key: 'ACTIVE', label: 'ใช้งาน', count: active },
      { key: 'INACTIVE', label: 'ระงับ', count: all.length - active },
      { key: 'ALL', label: 'ทั้งหมด', count: all.length },
    ];
  });
  protected readonly rows = computed(() => {
    const filter = this.activeFilter();
    return this.customers
      .value()
      .filter((c) => filter === 'ALL' || c.is_active === (filter === 'ACTIVE'))
      .map((c) => ({
        ...c,
        level_label: SERVICE_LEVEL_LABELS[c.service_level],
        active_label: c.is_active ? 'ใช้งาน' : 'ระงับ',
        tenant_name: this.tenantNames().get(c.tenant_id) ?? '-',
      }));
  });

  protected readonly selected = signal<Customer | null>(null);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);

  protected readonly companyName = signal('');
  protected readonly contactPerson = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly serviceLevel = signal<ServiceLevel>('STANDARD');
  protected readonly tenantId = signal<string | null>(null);
  protected readonly formValid = computed(
    () =>
      !!this.companyName().trim() &&
      (this.editingId() !== null || !this.auth.isSuperadmin() || !!this.tenantId()),
  );

  protected readonly rowActions = computed<GridRowActionId[]>(() =>
    this.auth.canWrite() ? ['view', 'edit'] : ['view'],
  );
  protected readonly viewOpen = signal(false);
  protected readonly viewFields = computed<RecordField[]>(() => {
    const c = this.selected();
    if (!c) return [];
    return [
      { label: 'ชื่อบริษัท', value: c.company_name, wide: true },
      { label: 'ผู้ติดต่อ', value: c.contact_person },
      { label: 'โทรศัพท์', value: c.phone },
      { label: 'อีเมล', value: c.email },
      { label: 'ระดับบริการ', value: SERVICE_LEVEL_LABELS[c.service_level] },
      { label: 'สถานะ', value: c.is_active ? 'ใช้งาน' : 'ระงับ' },
      ...(this.auth.isSuperadmin() ? [{ label: 'กลุ่มลูกค้า', value: this.tenantNames().get(c.tenant_id) }] : []),
    ];
  });

  protected onRowSelected(row: { id: string } | null): void {
    this.selected.set(row ? (this.customers.value().find((c) => c.id === row.id) ?? null) : null);
  }

  protected onRowAction({ action, row }: GridRowAction<{ id: string }>): void {
    this.onRowSelected(row);
    if (action === 'edit') this.openEdit();
    else this.viewOpen.set(true);
  }

  protected editRow(row: { id: string }): void {
    this.onRowSelected(row);
    if (this.auth.canWrite()) this.openEdit();
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.companyName.set('');
    this.contactPerson.set('');
    this.phone.set('');
    this.email.set('');
    this.serviceLevel.set('STANDARD');
    this.tenantId.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(): void {
    const c = this.selected();
    if (!c) return;
    this.editingId.set(c.id);
    this.companyName.set(c.company_name);
    this.contactPerson.set(c.contact_person ?? '');
    this.phone.set(c.phone ?? '');
    this.email.set(c.email ?? '');
    this.serviceLevel.set(c.service_level);
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    if (!this.formValid()) return;
    const body: Record<string, unknown> = {
      company_name: this.companyName().trim(),
      contact_person: this.contactPerson().trim() || null,
      phone: this.phone().trim() || null,
      email: this.email().trim() || null,
      service_level: this.serviceLevel(),
    };
    const id = this.editingId();
    await this.run(async () => {
      if (id) {
        await this.api.updateCustomer(id, body);
      } else {
        await this.api.createCustomer({ ...body, tenant_id: this.auth.isSuperadmin() ? this.tenantId() : undefined });
      }
      this.notify.success('บันทึกข้อมูลลูกค้าแล้ว');
      this.formOpen.set(false);
    });
  }

  protected async toggleActive(): Promise<void> {
    const c = this.selected();
    if (!c) return;
    if (c.is_active) {
      const ok = await this.confirm.ask({
        title: 'ยืนยันการระงับลูกค้า',
        message: `ระงับลูกค้า "${c.company_name}" แล้วจะเลือกลูกค้ารายนี้ตอนบันทึกการติดตั้งไม่ได้ ประวัติเดิมยังอยู่ครบ`,
        okText: 'ระงับ',
        danger: true,
      });
      if (!ok) return;
    }
    await this.run(async () => {
      await this.api.setCustomerActive(c.id, !c.is_active);
      this.notify.success(c.is_active ? 'ระงับลูกค้าแล้ว' : 'เปิดใช้งานลูกค้าแล้ว');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.selected.set(null);
      this.customers.reload();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
