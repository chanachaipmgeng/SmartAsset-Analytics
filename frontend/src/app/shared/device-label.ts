import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  BarcodeGeneratorModule,
  QRCodeGeneratorModule,
} from '@syncfusion/ej2-angular-barcode-generator';
import { labelUrl } from '../core/scan-code';

export interface LabelDevice {
  serial_number: string;
  asset_tag?: string | null;
  brand?: string | null;
  model_name?: string | null;
}

/** `sheet`: 70 × 37 mm cell of an A4 3 × 8 label sheet; `single`: 50 × 30 mm roll label. */
export type LabelSize = 'sheet' | 'single';

const SIZES: Record<LabelSize, { qr: number; barWidth: number; barHeight: number }> = {
  sheet: { qr: 112, barWidth: 124, barHeight: 34 },
  single: { qr: 88, barWidth: 80, barHeight: 28 },
};
// The generator still reserves room for the hidden text, so the default 10px top/bottom margins leave no bars.
const BAR_MARGIN = { left: 4, right: 4, top: 0, bottom: 0 };

/** Device label: QR with the scan URL, Code128 of the serial, and the readable serial / model / asset tag. */
@Component({
  selector: 'app-device-label',
  imports: [QRCodeGeneratorModule, BarcodeGeneratorModule],
  template: `
    <div class="qr">
      <ejs-qrcodegenerator
        [value]="url()"
        [width]="dims().qr"
        [height]="dims().qr"
        mode="SVG"
        [displayText]="{ visibility: false }"
      />
    </div>
    <div class="info">
      <div class="serial">{{ device().serial_number }}</div>
      @if (model()) {
        <div class="model">{{ model() }}</div>
      }
      @if (device().asset_tag) {
        <div class="tag">{{ device().asset_tag }}</div>
      }
      <ejs-barcodegenerator
        class="bar"
        type="Code128"
        [value]="device().serial_number"
        [width]="dims().barWidth"
        [height]="dims().barHeight"
        [margin]="barMargin"
        mode="SVG"
        [displayText]="{ visibility: false }"
      />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      box-sizing: border-box;
      align-items: center;
      gap: 2mm;
      overflow: hidden;
      padding: 2mm;
      background: #fff;
      color: #000;
      font-family: 'Sarabun', system-ui, sans-serif;
    }
    :host(.sheet) {
      width: 70mm;
      height: 37.125mm;
    }
    :host(.single) {
      width: 50mm;
      height: 30mm;
      padding: 1.5mm;
      gap: 1.5mm;
    }
    .qr {
      flex: none;
      line-height: 0;
    }
    .info {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 0.5mm;
    }
    .serial {
      font-family: ui-monospace, 'Cascadia Mono', monospace;
      font-size: 10pt;
      font-weight: 700;
      word-break: break-all;
    }
    .model,
    .tag {
      overflow: hidden;
      font-size: 7pt;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bar {
      display: block;
      margin-top: 0.5mm;
      line-height: 0;
    }
    :host(.single) .serial {
      font-size: 8pt;
    }
    :host(.single) .model,
    :host(.single) .tag {
      font-size: 6pt;
    }
  `,
  host: { '[class]': 'size()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceLabel {
  readonly device = input.required<LabelDevice>();
  readonly size = input<LabelSize>('sheet');

  protected readonly url = computed(() => labelUrl(this.device().serial_number));
  protected readonly model = computed(() =>
    [this.device().brand, this.device().model_name].filter(Boolean).join(' '),
  );
  protected readonly dims = computed(() => SIZES[this.size()]);
  protected readonly barMargin = BAR_MARGIN;
}
