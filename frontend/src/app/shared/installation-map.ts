import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MapsModule, MapsTooltipService, MarkerService, ZoomService } from '@syncfusion/ej2-angular-maps';
import { SERVICE_LEVEL_LABELS } from '../core/labels';
import { Installation } from '../core/models';

const THAILAND_CENTER = { latitude: 13.2, longitude: 101.0 };

/** OpenStreetMap tiles with Syncfusion marker clustering for dense installation areas. */
@Component({
  selector: 'app-installation-map',
  imports: [MapsModule],
  providers: [MarkerService, ZoomService, MapsTooltipService],
  template: `
    <ejs-maps
      theme="Material3"
      [height]="height()"
      width="100%"
      [layers]="layers()"
      [zoomSettings]="zoomSettings()"
      [centerPosition]="center()"
    ></ejs-maps>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallationMap {
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
          fill: '#4f46e5',
          height: 34,
          width: 34,
          labelStyle: { color: '#ffffff', size: '13px' },
        },
        markerSettings: [
          {
            visible: true,
            dataSource: points,
            shape: 'Balloon',
            fill: '#dc2626',
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
