import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, viewChild } from '@angular/core';
import {
  MapsComponent,
  MapsModule,
  MapsTooltipService,
  MarkerService,
  PolygonService,
  ZoomService,
} from '@syncfusion/ej2-angular-maps';
import { SERVICE_LEVEL_LABELS } from '../core/labels';
import { Installation } from '../core/models';
import { ThemeService, cssColor } from '../core/theme.service';

export interface LatLng {
  latitude: number;
  longitude: number;
}

const THAILAND_CENTER: LatLng = { latitude: 13.2, longitude: 101.0 };
const OVERVIEW_ZOOM = 5;
const FOCUS_ZOOM = 12;
const EARTH_RADIUS_M = 6_371_000;
const CIRCLE_SEGMENTS = 64;
const PICK_TOLERANCE_PX = 5;

/** Polygon approximating a circle on the map; accurate enough for the radii used in nearby search. */
function circlePoints(center: LatLng, radiusM: number): LatLng[] {
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.cos((center.latitude * Math.PI) / 180);
  return Array.from({ length: CIRCLE_SEGMENTS + 1 }, (_, i) => {
    const angle = (i / CIRCLE_SEGMENTS) * 2 * Math.PI;
    return { latitude: center.latitude + dLat * Math.sin(angle), longitude: center.longitude + dLng * Math.cos(angle) };
  });
}

/**
 * OpenStreetMap tiles with Syncfusion marker clustering for dense installation areas.
 * With `pickable`, clicking the map emits `pick` with the clicked coordinates; `pin` and
 * `radiusKm` draw the chosen point and a search circle around it.
 */
@Component({
  selector: 'app-installation-map',
  imports: [MapsModule],
  providers: [MarkerService, ZoomService, MapsTooltipService, PolygonService],
  template: `
    <!-- Maps cache theme colours on first render, so rebuild when the theme flips. -->
    @for (mapTheme of [theme.chartTheme()]; track mapTheme) {
      <div [class.pickable]="pickable()" (pointerdown)="onPointerDown($event)" (click)="onClick($event)">
        <ejs-maps
          [theme]="mapTheme"
          [height]="height()"
          width="100%"
          [layers]="layers()"
          [zoomSettings]="zoomSettings()"
          [centerPosition]="view().center"
        ></ejs-maps>
      </div>
    }
  `,
  styles: `
    .pickable {
      cursor: crosshair;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallationMap {
  protected readonly theme = inject(ThemeService);

  readonly installations = input<Installation[]>([]);
  readonly height = input('420px');
  readonly focus = input<LatLng | null>(null);
  readonly pin = input<LatLng | null>(null);
  readonly radiusKm = input<number | null>(null);
  readonly pickable = input(false);
  readonly pick = output<LatLng>();

  private readonly maps = viewChild(MapsComponent);

  /**
   * Follows `focus`: fits the search circle when a radius is set, otherwise keeps the user's
   * zoom when they are already closer than the focus zoom.
   */
  protected readonly view = linkedSignal<
    { focus: LatLng | null; radiusKm: number | null },
    { center: LatLng; zoom: number }
  >({
    source: () => ({ focus: this.focus(), radiusKm: this.radiusKm() }),
    computation: ({ focus, radiusKm }, previous) => {
      if (!focus) return { center: THAILAND_CENTER, zoom: OVERVIEW_ZOOM };
      const zoom = radiusKm
        ? this.zoomToFit(focus.latitude, radiusKm)
        : Math.max(previous?.value.zoom ?? 0, FOCUS_ZOOM);
      return { center: focus, zoom };
    },
  });

  protected readonly zoomSettings = computed(() => ({
    enable: true,
    zoomFactor: this.view().zoom,
    toolbarSettings: { buttonSettings: { toolbarItems: ['ZoomIn', 'ZoomOut', 'Reset'] } },
  }));

  protected readonly layers = computed(() => {
    this.theme.isDark();
    const points = this.installations().map((i) => ({
      latitude: i.latitude,
      longitude: i.longitude,
      title: `${i.serial_number} (${i.model_name})`,
      customer: i.customer_name,
      level: SERVICE_LEVEL_LABELS[i.service_level],
      address: i.address ?? '-',
    }));
    const pin = this.pin();
    const radiusKm = this.radiusKm();
    const primary = cssColor('--color-sf-primary');
    return [
      {
        urlTemplate: 'https://tile.openstreetmap.org/level/tileX/tileY.png',
        markerClusterSettings: {
          allowClustering: true,
          allowClusterExpand: true,
          shape: 'Circle',
          fill: primary,
          height: 34,
          width: 34,
          labelStyle: { color: cssColor('--color-sf-on-primary'), size: '13px' },
        },
        markerSettings: [
          {
            visible: true,
            dataSource: points,
            shape: 'Balloon',
            fill: cssColor('--color-sf-error'),
            height: 28,
            width: 22,
            latitudeValuePath: 'latitude',
            longitudeValuePath: 'longitude',
            tooltipSettings: {
              visible: true,
              valuePath: 'title',
              format: '<b>${title}</b><br/>ลูกค้า: ${customer}<br/>ระดับบริการ: ${level}<br/>${address}',
            },
          },
          {
            visible: !!pin,
            dataSource: pin ? [{ ...pin, title: 'จุดที่เลือก' }] : [],
            shape: 'Balloon',
            fill: primary,
            height: 36,
            width: 28,
            border: { color: cssColor('--color-sf-on-primary'), width: 2 },
            latitudeValuePath: 'latitude',
            longitudeValuePath: 'longitude',
            tooltipSettings: { visible: true, valuePath: 'title' },
          },
        ],
        polygonSettings: {
          polygons:
            pin && radiusKm
              ? [
                  {
                    points: circlePoints(pin, radiusKm * 1000),
                    fill: primary,
                    opacity: 0.12,
                    borderColor: primary,
                    borderWidth: 2,
                    borderOpacity: 0.8,
                  },
                ]
              : [],
        },
      },
    ];
  });

  /** Largest tile zoom at which a circle of `radiusKm` still fits inside the map height. */
  private zoomToFit(latitude: number, radiusKm: number): number {
    const heightPx = parseFloat(this.height()) || 400;
    const metresPerPxAtZoom0 = 156_543 * Math.cos((latitude * Math.PI) / 180);
    const zoom = Math.floor(Math.log2((metresPerPxAtZoom0 * heightPx * 0.8) / (2 * radiusKm * 1000)));
    return Math.min(Math.max(zoom, 3), 16);
  }

  private pressedAt: { x: number; y: number } | null = null;

  protected onPointerDown(event: PointerEvent): void {
    this.pressedAt = { x: event.clientX, y: event.clientY };
  }

  /** Uses the DOM click because the Maps `click` event does not fire on tile layers. */
  protected onClick(event: MouseEvent): void {
    const maps = this.maps();
    if (!this.pickable() || !maps) return;
    const start = this.pressedAt;
    // A drag pans the map; only a stationary press picks a point.
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > PICK_TOLERANCE_PX) return;
    const target = event.target as Element | null;
    if (target?.closest('[id*="_Zooming_"], [id*="_MarkerIndex_"], [id*="_cluster_"]')) return;
    const rect = maps.element.getBoundingClientRect();
    const { latitude, longitude } = maps.getTileGeoLocation(event.clientX - rect.left, event.clientY - rect.top) ?? {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const point = { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
    this.view.set({ center: point, zoom: maps.tileZoomLevel ?? this.view().zoom });
    this.pick.emit(point);
  }
}
