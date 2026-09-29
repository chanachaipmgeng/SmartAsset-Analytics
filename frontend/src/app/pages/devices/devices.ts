import { DecimalPipe, DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
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
import {
  CountItem,
  Device,
  DeviceModel,
  DeviceStatus,
  Installation,
  InventoryTransaction,
  Photo,
  Supplier,
  Tenant,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { AssetTimeline } from '../../shared/asset-timeline';
import { DataGrid, GridCell, GridColumn, GridQuery, GridRowAction, GridRowActionId } from '../../shared/data-grid';
import { DeviceActionDialogs } from '../../shared/device-action-dialogs';
import { FilterChips } from '../../shared/filter-chips';
import { InstallationMap } from '../../shared/installation-map';
import { PageHeader } from '../../shared/page-header';
import { PhotoGallery } from '../../shared/photo-gallery';
import { StatusChip } from '../../shared/status-chip';
import { DIALOG_ANIMATION, FORM_IMPORTS } from '../../shared/syncfusion';
import { DeviceImport } from './device-import';

type StatusFilter = DeviceStatus | 'ALL';

const WIDE = '(min-width: 768px)';

const COLUMNS: GridColumn[] = [
  { field: 'serial_number', headerText: 'ซีเรียล', width: 150, isPrimaryKey: true },
  { field: 'asset_tag', headerText: 'รหัสทรัพย์สิน', width: 130, hideAtMedia: WIDE },
  { field: 'brand', headerText: 'ยี่ห้อ', width: 110, hideAtMedia: WIDE },
  { field: 'model_name', headerText: 'รุ่น', width: 150 },
  { field: 'status_label', headerText: 'สถานะ', width: 140 },
  { field: 'tenant_label', headerText: 'กลุ่มลูกค้า', width: 200, hideAtMedia: WIDE },
  { field: 'mac_address', headerText: 'MAC', width: 160, hideAtMedia: WIDE },
  { field: 'purchase_date', headerText: 'วันที่ซื้อ', type: 'date', format: 'dd/MM/yyyy', width: 120, hideAtMedia: WIDE },
  { field: 'warranty_end', headerText: 'หมดประกัน', type: 'date', format: 'dd/MM/yyyy', width: 120, hideAtMedia: WIDE },
  { field: 'cost', headerText: 'ต้นทุน', type: 'number', format: 'N2', textAlign: 'Right', width: 120, hideAtMedia: WIDE },
  { field: 'firmware_version', headerText: 'เฟิร์มแวร์', width: 110, hidden: true },
  { field: 'supplier_name', headerText: 'ผู้จำหน่าย', width: 180, hidden: true },
];

/** Grid column field to the `GET /devices?sort=` key; unlisted columns aren't server-sortable. */
const SORT_KEYS: Record<string, string> = {
  serial_number: 'serial_number',
  brand: 'brand',
  model_name: 'model_name',
  status_label: 'status',
  tenant_label: 'tenant_name',
  mac_address: 'mac_address',
  purchase_date: 'purchase_date',
  warranty_end: 'warranty_end',
  cost: 'cost',
  asset_tag: 'asset_tag',
};

function toRow(d: Device) {
  return {
    ...d,
    status_label: STATUS_LABELS[d.status],
    tenant_label: d.tenant_name ?? 'คลังกลาง',
    warranty_end: toDate(d.warranty_end),
    purchase_date: toDate(d.purchase_date),
    cost: d.cost === null ? null : Number(d.cost),
  };
}

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
    DeviceImport,
    FilterChips,
    PhotoGallery,
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
  /** `?status=IN_STOCK` preselects a status chip (dashboard cards). */
  readonly status = input<string>();

  private readonly grid = viewChild(DataGrid);
  private readonly dialogs = viewChild.required(DeviceActionDialogs);

  protected readonly columns = COLUMNS;
  protected readonly animation = DIALOG_ANIMATION;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly levelLabels = SERVICE_LEVEL_LABELS;
  protected readonly detailWidth = 'min(440px, 100vw)';

  // ---- server-paged list ----
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  private readonly gridQuery = signal<GridQuery | null>(null);
  /** Filters shared by the current page and "export all". */
  private readonly listFilters = computed(() => {
    const q = this.gridQuery();
    const status = this.statusFilter();
    const sortKey = q?.sort ? SORT_KEYS[q.sort.field] : undefined;
    const params: Record<string, string> = {};
    if (q?.search) params['search'] = q.search;
    if (status !== 'ALL') params['status'] = status;
    if (q?.sort && sortKey) params['sort'] = (q.sort.descending ? '-' : '') + sortKey;
    return params;
  });
  protected readonly devices = httpResource<Device[]>(() => {
    const q = this.gridQuery();
    if (!q) return undefined;
    return { url: '/api/v1/devices', params: { ...this.listFilters(), skip: q.skip, take: q.take } };
  });
  /** Keeps the previous page on screen while the next one loads. */
  private readonly page = linkedSignal<Device[] | undefined, Device[]>({
    source: () => (this.devices.hasValue() ? this.devices.value() : undefined),
    computation: (value, previous) => value ?? previous?.value ?? [],
  });
  protected readonly total = linkedSignal<string | null | undefined, number>({
    source: () => this.devices.headers()?.get('X-Total-Count'),
    computation: (value, previous) => (value == null ? (previous?.value ?? 0) : Number(value)),
  });
  private readonly statusCounts = httpResource<CountItem[]>(() => '/api/v1/devices/status-counts', {
    defaultValue: [],
  });

  protected readonly models = httpResource<DeviceModel[]>(() => '/api/v1/device-models', { defaultValue: [] });
  protected readonly tenants = httpResource<Tenant[]>(
    () => (this.auth.isSuperadmin() ? '/api/v1/tenants' : undefined),
    { defaultValue: [] },
  );

  protected readonly filters = computed(() => {
    const counts = new Map(this.statusCounts.value().map((c) => [c.key, c.count]));
    const all = this.statusCounts.value().reduce((sum, c) => sum + c.count, 0);
    return [
      { key: 'ALL' as StatusFilter, label: 'ทั้งหมด', count: all },
      ...(Object.keys(STATUS_LABELS) as DeviceStatus[]).map((s) => ({
        key: s as StatusFilter,
        label: STATUS_LABELS[s],
        count: counts.get(s) ?? 0,
      })),
    ];
  });

  protected readonly rows = computed(() => this.page().map(toRow));
  protected readonly exportAll = async () => (await this.api.listDevices(this.listFilters())).map(toRow);

  // ---- selection / detail panel ----
  private readonly detail = httpResource<Device>(() => (this.id() ? `/api/v1/devices/${this.id()}` : undefined));
  protected readonly selected = computed(() => {
    const id = this.id();
    return id && this.detail.hasValue() && this.detail.value().id === id ? this.detail.value() : null;
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
  protected readonly txPhotos = httpResource<Photo[]>(
    () => {
      const ids = this.history.value().map((t) => t.id);
      return ids.length ? { url: '/api/v1/photos', params: { owner_type: 'transaction', owner_id: ids } } : undefined;
    },
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

  protected readonly loanDue = computed(() => {
    const due = toDate(this.selected()?.loan_due_date);
    if (!due) return null;
    const days = Math.ceil((due.getTime() - Date.now()) / DAY_MS);
    if (days < 0) return { tone: 'error', text: `เกินกำหนด ${-days} วัน` };
    if (days <= 3) return { tone: 'warning', text: days === 0 ? 'ครบกำหนดวันนี้' : `เหลือ ${days} วัน` };
    return { tone: 'tertiary', text: `เหลือ ${days} วัน` };
  });

  protected readonly importOpen = signal(false);

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
  protected readonly assetTag = signal('');
  protected readonly firmware = signal('');
  protected readonly supplierId = signal<string | null>(null);
  protected readonly modelOptions = computed(() =>
    this.models.value().map((m) => ({ value: m.id, text: `${m.brand} ${m.name}` })),
  );
  protected readonly suppliers = httpResource<Supplier[]>(() => (this.formOpen() ? '/api/v1/suppliers' : undefined), {
    defaultValue: [],
  });
  protected readonly supplierOptions = computed(() =>
    this.suppliers.value().map((s) => ({ value: s.id, text: s.name })),
  );
  /** Firmware field hint: the chosen model's current version. */
  protected readonly modelFirmware = computed(
    () => this.models.value().find((m) => m.id === this.modelId())?.firmware_version ?? null,
  );
  protected readonly tenantOptions = computed(() => this.tenants.value().map((t) => ({ value: t.id, text: t.name })));
  protected readonly formValid = computed(
    () => (this.editingId() !== null || this.formSerial().trim().length >= 3) && !!this.modelId(),
  );

  constructor() {
    effect(() => {
      const status = this.status();
      if (status && status in STATUS_LABELS) untracked(() => this.onStatusFilter(status as DeviceStatus));
    });

    effect(() => {
      const action = this.action();
      if (!action) return;
      untracked(() => {
        if (action === 'new' && this.auth.canWrite()) this.openCreate(this.serial() ?? '');
        if (action === 'import' && this.auth.canWrite()) this.importOpen.set(true);
        void this.router.navigate([], {
          queryParams: { action: null, serial: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
    });

    // A deep link to a device this user cannot see (or that doesn't exist) falls back to the list.
    effect(() => {
      if (!this.id() || !this.detail.error()) return;
      untracked(() => {
        this.notify.warning('ไม่พบอุปกรณ์ที่ต้องการ');
        void this.router.navigate(['/devices'], { replaceUrl: true });
      });
    });
  }

  protected onQuery(query: GridQuery): void {
    this.gridQuery.set(query);
  }

  protected onStatusFilter(status: StatusFilter): void {
    this.statusFilter.set(status);
    this.gridQuery.update((q) => (q ? { ...q, skip: 0 } : q));
    this.grid()?.firstPage();
  }

  protected readonly rowActions = computed<GridRowActionId[]>(() =>
    this.auth.canWrite() ? ['view', 'edit'] : ['view'],
  );

  protected onRowSelected(row: { id: string } | null): void {
    if (row && row.id !== this.id()) void this.router.navigate(['/devices', row.id]);
  }

  protected onRowAction({ action, row }: GridRowAction<{ id: string }>): void {
    if (action === 'view') {
      this.onRowSelected(row);
      return;
    }
    const device = this.page().find((d) => d.id === row.id);
    if (!device) return;
    if (device.status === 'RETIRED') {
      this.notify.warning('อุปกรณ์ที่ปลดระวางแล้วแก้ไขข้อมูลไม่ได้');
      return;
    }
    this.openEdit(device);
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
    this.statusCounts.reload();
    this.detail.reload();
    this.history.reload();
    this.installations.reload();
  }

  protected onImported(count: number): void {
    this.onStatusFilter('ALL');
    this.devices.reload();
    this.statusCounts.reload();
    this.notify.success(`นำเข้าอุปกรณ์ ${count} เครื่องแล้ว`);
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
    this.assetTag.set('');
    this.firmware.set('');
    this.supplierId.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(d: Device | null = this.selected()): void {
    if (!d) return;
    this.editingId.set(d.id);
    this.formSerial.set(d.serial_number);
    this.modelId.set(d.model_id);
    this.mac.set(d.mac_address ?? '');
    this.purchaseDate.set(toDate(d.purchase_date));
    this.cost.set(d.cost === null ? null : Number(d.cost));
    this.warrantyEnd.set(toDate(d.warranty_end));
    this.notes.set(d.notes ?? '');
    this.assetTag.set(d.asset_tag ?? '');
    this.firmware.set(d.firmware_version ?? '');
    this.supplierId.set(d.supplier_id);
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
      asset_tag: this.assetTag().trim() || null,
      firmware_version: this.firmware().trim() || null,
      supplier_id: this.supplierId(),
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
