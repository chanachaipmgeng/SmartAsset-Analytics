import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MapsModule, MapsTooltipService, MarkerService, ZoomService } from '@syncfusion/ej2-angular-maps';
import { SERVICE_LEVEL_LABELS } from '../core/labels';
import { Installation } from '../core/models';
import { ThemeService, cssColor } from '../core/theme.service';

const THAILAND_CENTER = { latitude: 13.2, longitude: 101.0 };

/** OpenStreetMap tiles with Syncfusion marker clustering for dense installation areas. */
@Component({
  selector: 'app-installation-map',
  imports: [MapsModule],
  providers: [MarkerService, ZoomService, MapsTooltipService],
  template: `
    <!-- Maps cache theme colours on first render, so rebuild when the theme flips. -->
    @for (mapTheme of [theme.chartTheme()]; track mapTheme) {
      <ejs-maps
        [theme]="mapTheme"
        [height]="height()"
        width="100%"
        [layers]="layers()"
        [zoomSettings]="zoomSettings()"
        [centerPosition]="center()"
      ></ejs-maps>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallationMap {
  protected readonly theme = inject(ThemeService);

  readonly installations = input.required<Installation[]>();
  readonly height = input('420px');
  readonly focus = input<{ latitude: number; longitude: number } | null>(null);

  protected readonly center = computed(() => this.focus() ?? THAILAND_CENTER);

  protected readonly zoomSettings = computed(() => ({
    enable: true,
    zoomFactor: this.focus() ? 12 : 5,
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
    return [
      {
        urlTemplate: 'https://tile.openstreetmap.org/level/tileX/tileY.png',
        markerClusterSettings: {
          allowClustering: true,
          allowClusterExpand: true,
          shape: 'Circle',
          fill: cssColor('--color-sf-primary'),
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
        ],
      },
    ];
  });
}
