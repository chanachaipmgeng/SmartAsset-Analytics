import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SliderModule } from '@syncfusion/ej2-angular-inputs';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { SERVICE_LEVEL_LABELS, toDate, toIsoDate } from '../../core/labels';
import { Installation } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { AuditHistory } from '../../shared/audit-history';
import { InstallationMap, LatLng } from '../../shared/installation-map';
import { PageHeader } from '../../shared/page-header';
import { DataGrid, GridCell, GridColumn, GridRowAction, GridRowActionId } from '../../shared/data-grid';
import { PhotoGallery } from '../../shared/photo-gallery';
import { RecordField, RecordView } from '../../shared/record-view';
import { DIALOG_ANIMATION, FORM_IMPORTS } from '../../shared/syncfusion';

interface NearbyQuery {
  lat: number;
  lng: number;
  radius: number;
}

@Component({
  selector: 'app-installations',
  imports: [
    ...FORM_IMPORTS,
    RouterLink,
    SliderModule,
    InstallationMap,
    PageHeader,
    DataGrid,
    GridCell,
    RecordView,
    PhotoGallery,
    AuditHistory,
  ],
  templateUrl: './installations.html',
  styleUrl: './installations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallationsPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly animation = DIALOG_ANIMATION;

  protected readonly showRemoved = signal(false);
  protected readonly installations = httpResource<Installation[]>(
    () => ({ url: '/api/v1/installations', params: { active_only: !this.showRemoved() } }),
    { defaultValue: [] },
  );

  // Nearby search runs only after the user submits, so the resource request is undefined until then.
  protected readonly nearbyQuery = signal<NearbyQuery | null>(null);
  protected readonly nearby = httpResource<Installation[]>(() => {
    const q = this.nearbyQuery();
    return q
      ? { url: '/api/v1/installations/nearby', params: { lat: q.lat, lng: q.lng, radius_m: q.radius } }
      : undefined;
  });

  protected readonly searchLat = signal<number | null>(13.7563);
  protected readonly searchLng = signal<number | null>(100.5018);
  protected readonly searchRadiusKm = signal(10);
  protected readonly radiusTooltip = { isVisible: true, placement: 'Before' as const, format: 'N0' };
  protected readonly searchPin = computed(() => {
    const latitude = this.searchLat();
    const longitude = this.searchLng();
    return latitude === null || longitude === null ? null : { latitude, longitude };
  });

  protected readonly displayed = computed(() =>
    this.nearbyQuery() ? (this.nearby.value() ?? []) : this.installations.value(),
  );
  protected readonly mapPoints = computed(() => this.displayed().filter((i) => !i.removed_at));
  protected readonly mapFocus = computed(() => {
    const q = this.nearbyQuery();
    return q ? { latitude: q.lat, longitude: q.lng } : null;
  });
  protected readonly columns = computed<GridColumn[]>(() => [
    { field: 'serial_number', headerText: 'ซีเรียล', width: 150 },
    { field: 'model_name', headerText: 'รุ่น', width: 140 },
    { field: 'customer_name', headerText: 'ลูกค้า', width: 200 },
    { field: 'level_label', headerText: 'ระดับบริการ', width: 110 },
    { field: 'install_date', headerText: 'วันที่ติดตั้ง', type: 'date', format: 'dd/MM/yyyy', width: 120 },
    ...(this.nearbyQuery()
      ? [{ field: 'distance_km', headerText: 'ระยะ (กม.)', type: 'number' as const, format: 'N2', width: 110 }]
      : []),
    { field: 'state_label', headerText: 'สถานะ', width: 150 },
    { field: 'latitude', headerText: 'ละติจูด', type: 'number', format: 'N6', width: 120, hidden: true },
    { field: 'longitude', headerText: 'ลองจิจูด', type: 'number', format: 'N6', width: 120, hidden: true },
    { field: 'address', headerText: 'ที่อยู่', width: 260 },
    { field: 'site_contact', headerText: 'ผู้ติดต่อหน้างาน', width: 160, hidden: true },
    { field: 'site_phone', headerText: 'โทรหน้างาน', width: 130, hidden: true },
    { field: 'removal_reason', headerText: 'เหตุผลที่ถอน', width: 200, hidden: true },
  ]);

  protected readonly rows = computed(() =>
    this.displayed().map((i) => ({
      ...i,
      install_date: toDate(i.install_date),
      removed_at: toDate(i.removed_at),
      level_label: SERVICE_LEVEL_LABELS[i.service_level],
      distance_km: i.distance_m === null ? null : i.distance_m / 1000,
      state_label: i.removed_at ? 'ถอนการติดตั้งแล้ว' : 'ใช้งานอยู่',
    })),
  );

  protected readonly selected = signal<Installation | null>(null);
  protected readonly busy = signal(false);
  protected readonly editOpen = signal(false);
  protected readonly editDate = signal<Date | null>(null);
  protected readonly editLat = signal<number | null>(null);
  protected readonly editLng = signal<number | null>(null);
  protected readonly editAddress = signal('');
  protected readonly editContact = signal('');
  protected readonly editPhone = signal('');
  protected readonly editNotes = signal('');
  protected readonly editPin = computed(() => {
    const latitude = this.editLat();
    const longitude = this.editLng();
    return latitude === null || longitude === null ? null : { latitude, longitude };
  });
  protected readonly editValid = computed(
    () => !!this.editDate() && this.editLat() !== null && this.editLng() !== null,
  );

  protected searchNearby(): void {
    const lat = this.searchLat();
    const lng = this.searchLng();
    const km = this.searchRadiusKm();
    if (lat === null || lng === null || !km) {
      this.notify.error(new Error('กรุณากรอกพิกัดและรัศมีให้ครบ'));
      return;
    }
    this.nearbyQuery.set({ lat, lng, radius: km * 1000 });
  }

  protected clearNearby(): void {
    this.nearbyQuery.set(null);
  }

  protected onPick(point: LatLng): void {
    this.searchLat.set(point.latitude);
    this.searchLng.set(point.longitude);
    this.refreshNearby();
  }

  /** Re-runs an active nearby search after the centre or radius changes. */
  protected refreshNearby(): void {
    if (this.nearbyQuery()) this.searchNearby();
  }

  protected readonly rowActions = computed<GridRowActionId[]>(() =>
    this.auth.canWrite() ? ['view', 'edit'] : ['view'],
  );
  protected readonly canEditSelected = computed(
    () => this.auth.canWrite() && !!this.selected() && !this.selected()?.removed_at,
  );
  protected readonly viewOpen = signal(false);
  protected readonly viewFields = computed<RecordField[]>(() => {
    const i = this.selected();
    if (!i) return [];
    const date = (value: string | null) => toDate(value)?.toLocaleDateString('th-TH', { dateStyle: 'medium' });
    return [
      { label: 'ซีเรียล', value: i.serial_number, mono: true },
      { label: 'รุ่น', value: i.model_name },
      { label: 'ลูกค้า', value: i.customer_name },
      { label: 'ระดับบริการ', value: SERVICE_LEVEL_LABELS[i.service_level] },
      { label: 'วันที่ติดตั้ง', value: date(i.install_date) },
      { label: 'สถานะ', value: i.removed_at ? `ถอนการติดตั้งแล้ว (${date(i.removed_at)})` : 'ใช้งานอยู่' },
      { label: 'พิกัด', value: `${i.latitude.toFixed(6)}, ${i.longitude.toFixed(6)}`, mono: true, wide: true },
      { label: 'ที่อยู่', value: i.address, wide: true },
      { label: 'ผู้ติดต่อหน้างาน', value: i.site_contact },
      { label: 'โทรศัพท์หน้างาน', value: i.site_phone },
      { label: 'หมายเหตุ', value: i.notes, wide: true },
      ...(i.removed_at ? [{ label: 'เหตุผลที่ถอน', value: i.removal_reason, wide: true }] : []),
    ];
  });

  protected onRowSelected(row: { id: string } | null): void {
    this.selected.set(row ? (this.displayed().find((i) => i.id === row.id) ?? null) : null);
  }

  protected onRowAction({ action, row }: GridRowAction<{ id: string }>): void {
    this.onRowSelected(row);
    if (action === 'view') {
      this.viewOpen.set(true);
    } else if (this.canEditSelected()) {
      this.openEdit();
    } else {
      this.notify.warning('จุดติดตั้งที่ถอนแล้วแก้ไขไม่ได้');
    }
  }

  protected onPickEdit(point: LatLng): void {
    this.editLat.set(point.latitude);
    this.editLng.set(point.longitude);
  }

  protected openEdit(): void {
    const i = this.selected();
    if (!i) return;
    this.editDate.set(toDate(i.install_date));
    this.editLat.set(i.latitude);
    this.editLng.set(i.longitude);
    this.editAddress.set(i.address ?? '');
    this.editContact.set(i.site_contact ?? '');
    this.editPhone.set(i.site_phone ?? '');
    this.editNotes.set(i.notes ?? '');
    this.editOpen.set(true);
  }

  protected async saveEdit(): Promise<void> {
    const i = this.selected();
    if (!i || !this.editValid()) return;
    this.busy.set(true);
    try {
      await this.api.updateInstallation(i.id, {
        install_date: toIsoDate(this.editDate()),
        latitude: this.editLat(),
        longitude: this.editLng(),
        address: this.editAddress().trim() || null,
        site_contact: this.editContact().trim() || null,
        site_phone: this.editPhone().trim() || null,
        notes: this.editNotes().trim() || null,
      });
      this.notify.success('บันทึกจุดติดตั้งแล้ว');
      this.editOpen.set(false);
      this.selected.set(null);
      this.installations.reload();
      this.nearby.reload();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
