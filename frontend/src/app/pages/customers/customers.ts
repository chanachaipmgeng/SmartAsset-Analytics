import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { SERVICE_LEVEL_LABELS, toOptions } from '../../core/labels';
import { Customer, ServiceLevel, Tenant } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { PageHeader } from '../../shared/page-header';
import { DIALOG_ANIMATION, FORM_IMPORTS, GRID_DEFAULTS, GRID_IMPORTS, GRID_PROVIDERS } from '../../shared/syncfusion';

@Component({
  selector: 'app-customers',
  imports: [...GRID_IMPORTS, ...FORM_IMPORTS, PageHeader],
  providers: [...GRID_PROVIDERS],
  templateUrl: './customers.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly grid = GRID_DEFAULTS;
  protected readonly animation = DIALOG_ANIMATION;
  protected readonly levelOptions = toOptions(SERVICE_LEVEL_LABELS);

  protected readonly customers = httpResource<Customer[]>(() => '/api/v1/customers', { defaultValue: [] });
  protected readonly tenants = httpResource<Tenant[]>(() => '/api/v1/tenants', { defaultValue: [] });

  private readonly tenantNames = computed(() => new Map(this.tenants.value().map((t) => [t.id, t.name])));
  protected readonly tenantOptions = computed(() => this.tenants.value().map((t) => ({ value: t.id, text: t.name })));
  protected readonly rows = computed(() =>
    this.customers.value().map((c) => ({
      ...c,
      level_label: SERVICE_LEVEL_LABELS[c.service_level],
      tenant_name: this.tenantNames().get(c.tenant_id) ?? '-',
    })),
  );

  protected readonly selected = signal<Customer | null>(null);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly confirmDelete = signal(false);
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

  protected onRowSelected(event: { data: Customer }): void {
    this.selected.set(this.customers.value().find((c) => c.id === event.data.id) ?? null);
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

  protected async remove(): Promise<void> {
    const c = this.selected();
    if (!c) return;
    await this.run(async () => {
      await this.api.deleteCustomer(c.id);
      this.notify.success('ลบลูกค้าแล้ว');
      this.confirmDelete.set(false);
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
