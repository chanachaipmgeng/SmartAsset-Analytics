import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { SERVICE_LEVEL_LABELS, toDate, toIsoDate } from '../../core/labels';
import { Installation } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { InstallationMap } from '../../shared/installation-map';
import { PageHeader } from '../../shared/page-header';
import { DataGrid, GridCell, GridColumn } from '../../shared/data-grid';
import { DIALOG_ANIMATION, FORM_IMPORTS } from '../../shared/syncfusion';

interface NearbyQuery {
  lat: number;
  lng: number;
  radius: number;
}

@Component({
  selector: 'app-installations',
  imports: [...FORM_IMPORTS, InstallationMap, PageHeader, DataGrid, GridCell],
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
  protected readonly searchRadiusKm = signal<number | null>(10);

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

  protected onRowSelected(row: { id: string } | null): void {
    this.selected.set(row ? (this.displayed().find((i) => i.id === row.id) ?? null) : null);
  }

  protected openEdit(): void {
    const i = this.selected();
    if (!i) return;
    this.editDate.set(toDate(i.install_date));
    this.editLat.set(i.latitude);
    this.editLng.set(i.longitude);
    this.editAddress.set(i.address ?? '');
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
