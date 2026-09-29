import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { STATUS_LABELS, toDate, toIsoDate } from '../../core/labels';
import { Customer, Device, DeviceModel, Tenant } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { StatusChip } from '../../shared/status-chip';
import { DIALOG_ANIMATION, FORM_IMPORTS, GRID_DEFAULTS, GRID_IMPORTS, GRID_PROVIDERS } from '../../shared/syncfusion';

type Movement = 'checkout' | 'return' | 'retire' | 'transfer';

const MOVEMENT_TITLES: Record<Movement, string> = {
  checkout: 'เบิกอุปกรณ์ออก',
  return: 'รับคืนเข้าคลัง',
  retire: 'ปลดระวางอุปกรณ์',
  transfer: 'โอนอุปกรณ์ให้กลุ่มลูกค้า',
};

const CENTRAL_STOCK = '__central__';

@Component({
  selector: 'app-devices',
  imports: [...GRID_IMPORTS, ...FORM_IMPORTS, StatusChip],
  providers: [...GRID_PROVIDERS],
  templateUrl: './devices.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevicesPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly grid = GRID_DEFAULTS;
  protected readonly animation = DIALOG_ANIMATION;
  protected readonly movementTitles = MOVEMENT_TITLES;

  protected readonly devices = httpResource<Device[]>(() => '/api/v1/devices', { defaultValue: [] });
  protected readonly models = httpResource<DeviceModel[]>(() => '/api/v1/device-models', { defaultValue: [] });
  protected readonly tenants = httpResource<Tenant[]>(() => '/api/v1/tenants', { defaultValue: [] });
  protected readonly customers = httpResource<Customer[]>(() => '/api/v1/customers', { defaultValue: [] });

  protected readonly rows = computed(() =>
    this.devices.value().map((d) => ({
      ...d,
      status_label: STATUS_LABELS[d.status],
      tenant_label: d.tenant_name ?? 'คลังกลาง',
      warranty_end: toDate(d.warranty_end),
      purchase_date: toDate(d.purchase_date),
      cost: d.cost === null ? null : Number(d.cost),
    })),
  );
  protected readonly modelOptions = computed(() =>
    this.models.value().map((m) => ({ value: m.id, text: `${m.brand} ${m.name}` })),
  );
  protected readonly tenantOptions = computed(() => this.tenants.value().map((t) => ({ value: t.id, text: t.name })));
  protected readonly transferOptions = computed(() => [
    { value: CENTRAL_STOCK, text: 'คลังกลาง (แพลตฟอร์ม)' },
    ...this.tenantOptions(),
  ]);

  protected readonly selected = signal<Device | null>(null);
  protected readonly busy = signal(false);

  protected readonly canTransfer = computed(() => this.auth.isSuperadmin() && this.selected()?.status === 'IN_STOCK');
  protected readonly canCheckOut = computed(() => {
    const d = this.selected();
    return this.auth.canWrite() && d?.status === 'IN_STOCK' && d.tenant_id !== null;
  });
  protected readonly canInstall = computed(() => this.auth.canWrite() && this.selected()?.status === 'CHECKED_OUT');
  protected readonly canReturn = computed(() => {
    const s = this.selected()?.status;
    return this.auth.canWrite() && (s === 'CHECKED_OUT' || s === 'INSTALLED');
  });
  protected readonly canRetire = computed(() => this.auth.canWrite() && this.selected()?.status === 'IN_STOCK');
  protected readonly canEdit = computed(() => this.auth.canWrite() && this.selected() !== null);

  // ---- device form ----
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly serial = signal('');
  protected readonly modelId = signal<string | null>(null);
  protected readonly tenantId = signal<string | null>(null);
  protected readonly mac = signal('');
  protected readonly purchaseDate = signal<Date | null>(null);
  protected readonly cost = signal<number | null>(null);
  protected readonly warrantyEnd = signal<Date | null>(null);
  protected readonly notes = signal('');
  protected readonly formValid = computed(
    () => (this.editingId() !== null || this.serial().trim().length >= 3) && !!this.modelId(),
  );

  // ---- movement dialog ----
  protected readonly movement = signal<Movement | null>(null);
  protected readonly movementNote = signal('');
  protected readonly transferTarget = signal<string | null>(null);

  // ---- install dialog ----
  protected readonly installOpen = signal(false);
  protected readonly installCustomer = signal<string | null>(null);
  protected readonly installDate = signal<Date | null>(new Date());
  protected readonly latitude = signal<number | null>(null);
  protected readonly longitude = signal<number | null>(null);
  protected readonly address = signal('');
  protected readonly installCustomerOptions = computed(() => {
    const tenant = this.selected()?.tenant_id;
    return this.customers
      .value()
      .filter((c) => c.tenant_id === tenant)
      .map((c) => ({ value: c.id, text: c.company_name }));
  });
  protected readonly installValid = computed(
    () =>
      !!this.installCustomer() &&
      !!this.installDate() &&
      this.latitude() !== null &&
      this.longitude() !== null &&
      Math.abs(this.latitude()!) <= 90 &&
      Math.abs(this.longitude()!) <= 180,
  );

  protected onRowSelected(event: { data: Device }): void {
    this.selected.set(this.devices.value().find((d) => d.id === event.data.id) ?? null);
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.serial.set('');
    this.modelId.set(null);
    this.tenantId.set(null);
    this.mac.set('');
    this.purchaseDate.set(new Date());
    this.cost.set(null);
    this.warrantyEnd.set(null);
    this.notes.set('');
    this.formOpen.set(true);
  }

  protected openEdit(): void {
    const d = this.selected();
    if (!d) return;
    this.editingId.set(d.id);
    this.serial.set(d.serial_number);
    this.modelId.set(d.model_id);
    this.mac.set(d.mac_address ?? '');
    this.purchaseDate.set(toDate(d.purchase_date));
    this.cost.set(d.cost === null ? null : Number(d.cost));
    this.warrantyEnd.set(toDate(d.warranty_end));
    this.notes.set(d.notes ?? '');
    this.formOpen.set(true);
  }

  protected async saveDevice(): Promise<void> {
    if (!this.formValid()) return;
    const body: Record<string, unknown> = {
      model_id: this.modelId(),
      mac_address: this.mac().trim() || null,
      purchase_date: toIsoDate(this.purchaseDate()),
      cost: this.cost(),
      warranty_end: toIsoDate(this.warrantyEnd()),
      notes: this.notes().trim() || null,
    };
    const id = this.editingId();
    await this.run(async () => {
      if (id) {
        await this.api.updateDevice(id, body);
        this.notify.success('บันทึกข้อมูลอุปกรณ์แล้ว');
      } else {
        await this.api.checkIn({
          ...body,
          serial_number: this.serial().trim(),
          tenant_id: this.auth.isSuperadmin() ? this.tenantId() : undefined,
        });
        this.notify.success('รับอุปกรณ์เข้าคลังแล้ว');
      }
      this.formOpen.set(false);
    });
  }

  protected openMovement(kind: Movement): void {
    this.movementNote.set('');
    this.transferTarget.set(null);
    this.movement.set(kind);
  }

  protected async confirmMovement(): Promise<void> {
    const d = this.selected();
    const kind = this.movement();
    if (!d || !kind) return;
    const note = this.movementNote().trim() || null;
    await this.run(async () => {
      if (kind === 'checkout') await this.api.checkOut(d.id, note);
      if (kind === 'return') await this.api.returnDevice(d.id, note);
      if (kind === 'retire') await this.api.retireDevice(d.id);
      if (kind === 'transfer') {
        const target = this.transferTarget();
        await this.api.transfer(d.id, target === CENTRAL_STOCK ? null : target, note);
      }
      this.notify.success(`${MOVEMENT_TITLES[kind]} สำเร็จ`);
      this.movement.set(null);
    });
  }

  protected openInstall(): void {
    this.installCustomer.set(null);
    this.installDate.set(new Date());
    this.latitude.set(null);
    this.longitude.set(null);
    this.address.set('');
    this.installOpen.set(true);
  }

  protected useMyLocation(): void {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        this.latitude.set(Number(pos.coords.latitude.toFixed(6)));
        this.longitude.set(Number(pos.coords.longitude.toFixed(6)));
      },
      () => this.notify.error(new Error('ไม่สามารถอ่านตำแหน่งปัจจุบันได้')),
    );
  }

  protected async confirmInstall(): Promise<void> {
    const d = this.selected();
    if (!d || !this.installValid()) return;
    await this.run(async () => {
      await this.api.install({
        device_id: d.id,
        customer_id: this.installCustomer(),
        install_date: toIsoDate(this.installDate()),
        latitude: this.latitude(),
        longitude: this.longitude(),
        address: this.address().trim() || null,
      });
      this.notify.success('บันทึกการติดตั้งแล้ว');
      this.installOpen.set(false);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.selected.set(null);
      this.devices.reload();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
