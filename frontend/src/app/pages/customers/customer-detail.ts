import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { AuthStore } from '../../core/auth.store';
import { SERVICE_LEVEL_LABELS, STATUS_TONES, toDate } from '../../core/labels';
import {
  CountItem,
  Customer,
  DeviceStatus,
  Installation,
  InventoryTransaction,
  Photo,
  Tenant,
} from '../../core/models';
import { PhotoSrcPipe } from '../../core/photos';
import { AssetTimeline } from '../../shared/asset-timeline';
import { AuditHistory } from '../../shared/audit-history';
import { DataGrid, GridCell, GridColumn, GridRowAction } from '../../shared/data-grid';
import { EmptyState } from '../../shared/empty-state';
import { ErrorState } from '../../shared/error-state';
import { InstallationMap, fitPoints } from '../../shared/installation-map';
import { PageHeader } from '../../shared/page-header';
import { SkeletonBlock } from '../../shared/skeleton-block';
import { StatCard } from '../../shared/stat-card';
import { StatusChip } from '../../shared/status-chip';

export interface CustomerDetail extends Customer {
  summary: {
    active_installations: number;
    total_installations: number;
    devices_by_status: CountItem[];
    under_warranty: number;
  };
}

const TIMELINE_LIMIT = 200;
const WIDE = '(min-width: 768px)';

const INSTALL_COLUMNS: GridColumn[] = [
  { field: 'serial_number', headerText: 'ซีเรียล', width: 150 },
  { field: 'model_name', headerText: 'รุ่น', width: 150 },
  { field: 'state_label', headerText: 'สถานะ', width: 110 },
  {
    field: 'install_date',
    headerText: 'วันที่ติดตั้ง',
    type: 'date',
    format: 'dd/MM/yyyy',
    width: 120,
  },
  { field: 'address', headerText: 'ที่อยู่', width: 240, hideAtMedia: WIDE },
  { field: 'site_contact', headerText: 'ผู้ติดต่อหน้างาน', width: 150, hideAtMedia: WIDE },
  { field: 'site_phone', headerText: 'โทรศัพท์หน้างาน', width: 130, hidden: true },
  {
    field: 'removed_at',
    headerText: 'วันที่ถอน',
    type: 'date',
    format: 'dd/MM/yyyy',
    width: 120,
    hideAtMedia: WIDE,
  },
  { field: 'removal_reason', headerText: 'เหตุผลที่ถอน', width: 200, hideAtMedia: WIDE },
];

/** One customer: contact details, KPIs, active sites on a map, every installation and the movement history. */
@Component({
  selector: 'app-customer-detail',
  imports: [
    DatePipe,
    RouterLink,
    ButtonModule,
    PageHeader,
    StatCard,
    StatusChip,
    InstallationMap,
    DataGrid,
    GridCell,
    AssetTimeline,
    AuditHistory,
    EmptyState,
    ErrorState,
    SkeletonBlock,
    PhotoSrcPipe,
  ],
  templateUrl: './customer-detail.html',
  styleUrl: './customer-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailPage {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly columns = INSTALL_COLUMNS;
  protected readonly levelLabels = SERVICE_LEVEL_LABELS;

  protected readonly customer = httpResource<CustomerDetail>(
    () => `/api/v1/customers/${this.id()}`,
  );
  private readonly tenants = httpResource<Tenant[]>(
    () => (this.auth.isSuperadmin() ? '/api/v1/tenants' : undefined),
    {
      defaultValue: [],
    },
  );
  protected readonly tenantName = computed(() => {
    const c = this.customer.value();
    return c ? (this.tenants.value().find((t) => t.id === c.tenant_id)?.name ?? null) : null;
  });

  protected readonly installations = httpResource<Installation[]>(
    () => ({
      url: '/api/v1/installations',
      params: { customer_id: this.id(), active_only: 'false' },
    }),
    { defaultValue: [] },
  );
  protected readonly activeInstallations = computed(() =>
    this.installations.value().filter((i) => !i.removed_at),
  );
  protected readonly mapFit = computed(() => fitPoints(this.activeInstallations()));
  protected readonly installRows = computed(() =>
    this.installations.value().map((i) => ({
      ...i,
      install_date: toDate(i.install_date),
      removed_at: toDate(i.removed_at),
      state_label: i.removed_at ? 'ถอนแล้ว' : 'ใช้งาน',
      state_tone: i.removed_at ? 'neutral' : 'success',
    })),
  );

  protected readonly transactions = httpResource<InventoryTransaction[]>(
    () => ({
      url: '/api/v1/inventory/transactions',
      params: { customer_id: this.id(), limit: String(TIMELINE_LIMIT) },
    }),
    { defaultValue: [] },
  );
  protected readonly txPhotos = httpResource<Photo[]>(
    () => {
      const ids = this.transactions.value().map((t) => t.id);
      return ids.length
        ? { url: '/api/v1/photos', params: { owner_type: 'transaction', owner_id: ids } }
        : undefined;
    },
    { defaultValue: [] },
  );

  protected readonly sitePhotos = httpResource<Photo[]>(
    () => {
      const ids = this.activeInstallations().map((i) => i.id);
      return ids.length
        ? { url: '/api/v1/photos', params: { owner_type: 'installation', owner_id: ids } }
        : undefined;
    },
    { defaultValue: [] },
  );
  protected readonly photoGroups = computed(() => {
    const byOwner = new Map<string, Photo[]>();
    for (const p of this.sitePhotos.value())
      byOwner.set(p.owner_id, [...(byOwner.get(p.owner_id) ?? []), p]);
    return this.activeInstallations()
      .filter((i) => byOwner.has(i.id))
      .map((i) => ({ installation: i, photos: byOwner.get(i.id)! }));
  });

  protected readonly repairCount = computed(() => this.statusCount('IN_REPAIR'));
  protected readonly statusChips = computed(() =>
    (this.customer.value()?.summary.devices_by_status ?? []).map((c) => ({
      ...c,
      tone: STATUS_TONES[c.key as DeviceStatus],
    })),
  );

  private statusCount(status: DeviceStatus): number {
    return (
      this.customer.value()?.summary.devices_by_status.find((c) => c.key === status)?.count ?? 0
    );
  }

  protected onInstallAction({ row }: GridRowAction<{ device_id: string }>): void {
    void this.router.navigate(['/devices', row.device_id]);
  }
}
