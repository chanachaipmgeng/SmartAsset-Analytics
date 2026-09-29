import { DecimalPipe, DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SidebarModule } from '@syncfusion/ej2-angular-navigations';
import { DropDownButtonModule, MenuEventArgs } from '@syncfusion/ej2-angular-splitbuttons';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { DeviceActionId, availableActions } from '../../core/device-actions';
import { STATUS_LABELS, SERVICE_LEVEL_LABELS, toDate, toIsoDate } from '../../core/labels';
import { Device, DeviceModel, DeviceStatus, Installation, InventoryTransaction, Tenant } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { AssetTimeline } from '../../shared/asset-timeline';
import { DataGrid, GridCell, GridColumn } from '../../shared/data-grid';
import { DeviceActionDialogs } from '../../shared/device-action-dialogs';
import { InstallationMap } from '../../shared/installation-map';
import { PageHeader } from '../../shared/page-header';
import { StatusChip } from '../../shared/status-chip';
import { DIALOG_ANIMATION, FORM_IMPORTS } from '../../shared/syncfusion';

type StatusFilter = DeviceStatus | 'ALL';

const COLUMNS: GridColumn[] = [
  { field: 'serial_number', headerText: 'ซีเรียล', width: 150, isPrimaryKey: true },
  { field: 'brand', headerText: 'ยี่ห้อ', width: 110 },
  { field: 'model_name', headerText: 'รุ่น', width: 150 },
  { field: 'status_label', headerText: 'สถานะ', width: 140 },
  { field: 'tenant_label', headerText: 'กลุ่มลูกค้า', width: 200 },
  { field: 'mac_address', headerText: 'MAC', width: 160 },
  { field: 'purchase_date', headerText: 'วันที่ซื้อ', type: 'date', format: 'dd/MM/yyyy', width: 120 },
  { field: 'warranty_end', headerText: 'หมดประกัน', type: 'date', format: 'dd/MM/yyyy', width: 120 },
  { field: 'cost', headerText: 'ต้นทุน', type: 'number', format: 'N2', textAlign: 'Right', width: 120 },
];

const WARRANTY_SOON_DAYS = 60;
const DAY_MS = 86_400_000;

@Component({
  selector: 'app-devices',
  imports: [
    ...FORM_IMPORTS,
    DatePipe,
    DecimalPipe,
    RouterLink,
    SidebarModule,
    DropDownButtonModule,
    PageHeader,
    StatusChip,
    DataGrid,
    GridCell,
    AssetTimeline,
    InstallationMap,
    DeviceActionDialogs,
  ],
  templateUrl: './devices.html',
  styleUrl: './devices.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevicesPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  /** Route param from `/devices/:id`; the URL is the source of truth for the open detail panel. */
  readonly id = input<string>();
  /** `?action=new` opens the check-in form (command palette, scan station). */
  readonly action = input<string>();
  /** Prefills the serial for `?action=new`. */
  readonly serial = input<string>();

  private readonly grid = viewChild(DataGrid);
  private readonly dialogs = viewChild.required(DeviceActionDialogs);

  protected readonly columns = COLUMNS;
  protected readonly animation = DIALOG_ANIMATION;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly levelLabels = SERVICE_LEVEL_LABELS;
  protected readonly detailWidth = 'min(440px, 100vw)';

  protected readonly devices = httpResource<Device[]>(() => '/api/v1/devices', { defaultValue: [] });
  protected readonly models = httpResource<DeviceModel[]>(() => '/api/v1/device-models', { defaultValue: [] });
  protected readonly tenants = httpResource<Tenant[]>(
    () => (this.auth.isSuperadmin() ? '/api/v1/tenants' : undefined),
    { defaultValue: [] },
  );

  // ---- status filter ----
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly filters = computed(() => {
    const counts = new Map<DeviceStatus, number>();
    for (const d of this.devices.value()) counts.set(d.status, (counts.get(d.status) ?? 0) + 1);
    return [
      { key: 'ALL' as StatusFilter, label: 'ทั้งหมด', count: this.devices.value().length },
      ...(Object.keys(STATUS_LABELS) as DeviceStatus[]).map((s) => ({
        key: s as StatusFilter,
        label: STATUS_LABELS[s],
        count: counts.get(s) ?? 0,
      })),
    ];
  });

  protected readonly rows = computed(() => {
    const filter = this.statusFilter();
    return this.devices
      .value()
      .filter((d) => filter === 'ALL' || d.status === filter)
      .map((d) => ({
        ...d,
        status_label: STATUS_LABELS[d.status],
        tenant_label: d.tenant_name ?? 'คลังกลาง',
        warranty_end: toDate(d.warranty_end),
        purchase_date: toDate(d.purchase_date),
        cost: d.cost === null ? null : Number(d.cost),
      }));
  });

  // ---- selection / detail panel ----
  protected readonly selected = computed(() => {
    const id = this.id();
    return id ? (this.devices.value().find((d) => d.id === id) ?? null) : null;
  });
  protected readonly detailOpen = computed(() => !!this.selected());

  protected readonly actions = computed(() =>
    availableActions(this.selected(), { canWrite: this.auth.canWrite(), isSuperadmin: this.auth.isSuperadmin() }),
  );
  protected readonly actionItems = computed(() =>
    this.actions().map((a) => ({ id: a.id, text: a.text, iconCss: a.iconCss })),
  );
  protected readonly canEdit = computed(() => this.auth.canWrite() && this.selected()?.status !== 'RETIRED');

  protected readonly history = httpResource<InventoryTransaction[]>(
    () => (this.id() ? `/api/v1/inventory/transactions?device_id=${this.id()}&limit=100` : undefined),
    { defaultValue: [] },
  );
  private readonly installations = httpResource<Installation[]>(
    () => (this.selected()?.status === 'INSTALLED' ? '/api/v1/installations' : undefined),
    { defaultValue: [] },
  );
  protected readonly installation = computed(() => {
    const id = this.id();
    return this.installations.value().find((i) => i.device_id === id && !i.removed_at) ?? null;
  });

  protected readonly warranty = computed(() => {
    const end = toDate(this.selected()?.warranty_end);
    if (!end) return null;
    const days = Math.ceil((end.getTime() - Date.now()) / DAY_MS);
    if (days < 0) return { tone: 'error', text: 'หมดประกันแล้ว' };
    if (days <= WARRANTY_SOON_DAYS) return { tone: 'warning', text: `เหลือ ${days} วัน` };
    return { tone: 'success', text: 'อยู่ในประกัน' };
  });

  // ---- device form ----
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly formSerial = signal('');
  protected readonly modelId = signal<string | null>(null);
  protected readonly tenantId = signal<string | null>(null);
  protected readonly mac = signal('');
  protected readonly purchaseDate = signal<Date | null>(null);
  protected readonly cost = signal<number | null>(null);
  protected readonly warrantyEnd = signal<Date | null>(null);
  protected readonly notes = signal('');
  protected readonly modelOptions = computed(() =>
    this.models.value().map((m) => ({ value: m.id, text: `${m.brand} ${m.name}` })),
  );
  protected readonly tenantOptions = computed(() => this.tenants.value().map((t) => ({ value: t.id, text: t.name })));
  protected readonly formValid = computed(
    () => (this.editingId() !== null || this.formSerial().trim().length >= 3) && !!this.modelId(),
  );

  constructor() {
    effect(() => {
      const action = this.action();
      if (!action) return;
      untracked(() => {
        if (action === 'new' && this.auth.canWrite()) this.openCreate(this.serial() ?? '');
        void this.router.navigate([], {
          queryParams: { action: null, serial: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
    });

    // A deep link to a device this user cannot see (or that doesn't exist) falls back to the list.
    effect(() => {
      const id = this.id();
      if (!id || this.devices.isLoading() || this.devices.error()) return;
      if (!this.devices.value().some((d) => d.id === id)) {
        untracked(() => {
          this.notify.warning('ไม่พบอุปกรณ์ที่ต้องการ');
          void this.router.navigate(['/devices'], { replaceUrl: true });
        });
      }
    });
  }

  protected onRowSelected(row: { id: string } | null): void {
    if (row && row.id !== this.id()) void this.router.navigate(['/devices', row.id]);
  }

  protected closeDetail(): void {
    this.grid()?.clearSelection();
    if (this.id()) void this.router.navigate(['/devices']);
  }

  protected onActionSelect(args: MenuEventArgs): void {
    if (args.item.id) this.runAction(args.item.id as DeviceActionId);
  }

  protected runAction(action: DeviceActionId): void {
    const d = this.selected();
    if (d) this.dialogs().open(action, d);
  }

  protected onActionDone(): void {
    this.devices.reload();
    this.history.reload();
    this.installations.reload();
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.notify.info('คัดลอกลิงก์อุปกรณ์แล้ว');
    } catch {
      this.notify.warning('คัดลอกลิงก์ไม่สำเร็จ');
    }
  }

  protected openCreate(serial = ''): void {
    this.editingId.set(null);
    this.formSerial.set(serial);
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
    this.formSerial.set(d.serial_number);
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
    this.busy.set(true);
    try {
      if (id) {
        await this.api.updateDevice(id, body);
        this.notify.success('บันทึกข้อมูลอุปกรณ์แล้ว');
      } else {
        const created = await this.api.checkIn({
          ...body,
          serial_number: this.formSerial().trim(),
          tenant_id: this.auth.isSuperadmin() ? this.tenantId() : undefined,
        });
        this.notify.success('รับอุปกรณ์เข้าคลังแล้ว');
        void this.router.navigate(['/devices', created.id]);
      }
      this.formOpen.set(false);
      this.onActionDone();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
