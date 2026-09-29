import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RadioButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DeviceLabel, LabelDevice, LabelSize } from './device-label';
import { DIALOG_ANIMATION, FORM_IMPORTS } from './syncfusion';

const SHEET_PER_PAGE = 24;
const PREVIEW_MAX = 6;
const PAGE_RULES: Record<LabelSize, string> = {
  sheet: '@page { size: A4 portrait; margin: 0; }',
  single: '@page { size: 50mm 30mm; margin: 0; }',
};

/** Print QR / Code128 labels for one or many devices, as A4 3 × 8 sheets or single 50 × 30 mm labels. */
@Component({
  selector: 'app-label-print-dialog',
  imports: [...FORM_IMPORTS, RadioButtonModule, DeviceLabel],
  template: `
    <ejs-dialog
      [visible]="devices().length > 0"
      (close)="devices.set([])"
      header="พิมพ์ฉลากอุปกรณ์"
      [isModal]="true"
      [showCloseIcon]="true"
      [animationSettings]="animation"
      width="560px"
      target="body"
    >
      <ng-template #content>
        <div class="flex flex-col gap-4">
          <div class="layouts" role="radiogroup" aria-label="รูปแบบฉลาก">
            <ejs-radiobutton
              name="label-size"
              label="แผ่น A4 (3 × 8 ดวง, 70 × 37 มม.)"
              [checked]="size() === 'sheet'"
              (change)="size.set('sheet')"
            />
            <ejs-radiobutton
              name="label-size"
              label="ฉลากม้วน (ดวงละ 50 × 30 มม.)"
              [checked]="size() === 'single'"
              (change)="size.set('single')"
            />
          </div>
          <div class="muted">
            {{ devices().length }} ดวง
            @if (size() === 'sheet') {
              · {{ pages() }} แผ่น
            }
            · สแกน QR ด้วยกล้องมือถือเพื่อเปิดหน้าอุปกรณ์ได้ทันที
          </div>
          <div class="preview">
            @for (d of preview(); track d.serial_number) {
              <app-device-label [device]="d" [size]="size()" />
            }
          </div>
          @if (devices().length > preview().length) {
            <div class="muted">แสดงตัวอย่าง {{ preview().length }} จาก {{ devices().length }} ดวง</div>
          }
        </div>
      </ng-template>
      <ng-template #footerTemplate>
        <button ejs-button (click)="devices.set([])">ยกเลิก</button>
        <button ejs-button [isPrimary]="true" iconCss="e-icons e-print" (click)="print()">พิมพ์</button>
      </ng-template>
    </ejs-dialog>

    <div #printRoot class="label-print-root" [class]="size()">
      @if (size() === 'sheet') {
        @for (sheet of sheets(); track $index) {
          <div class="label-sheet">
            @for (d of sheet; track d.serial_number) {
              <app-device-label [device]="d" size="sheet" />
            }
          </div>
        }
      } @else {
        @for (d of devices(); track d.serial_number) {
          <app-device-label [device]="d" size="single" />
        }
      }
    </div>
  `,
  styles: `
    .layouts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
    }
    .muted {
      font-size: 13px;
      color: rgb(var(--app-on-surface-variant));
    }
    .preview {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      max-height: 340px;
      overflow-y: auto;
      padding: 12px;
      border-radius: 12px;
      background: rgb(var(--app-surface-variant));
    }
    .preview app-device-label {
      outline: 1px dashed rgb(var(--app-outline));
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelPrintDialog {
  protected readonly animation = DIALOG_ANIMATION;
  protected readonly devices = signal<LabelDevice[]>([]);
  protected readonly size = signal<LabelSize>('sheet');
  protected readonly preview = computed(() => this.devices().slice(0, PREVIEW_MAX));
  protected readonly sheets = computed(() => {
    const all = this.devices();
    return Array.from({ length: Math.ceil(all.length / SHEET_PER_PAGE) }, (_, i) =>
      all.slice(i * SHEET_PER_PAGE, (i + 1) * SHEET_PER_PAGE),
    );
  });
  protected readonly pages = computed(() => this.sheets().length);

  private readonly printRoot = viewChild.required<ElementRef<HTMLElement>>('printRoot');

  constructor() {
    // The print root must be a direct child of <body> so print CSS can hide the rest of the app.
    afterNextRender(() => document.body.appendChild(this.printRoot().nativeElement));
    inject(DestroyRef).onDestroy(() => this.printRoot().nativeElement.remove());
  }

  open(devices: readonly LabelDevice[]): void {
    const seen = new Set<string>();
    this.devices.set(devices.filter((d) => !seen.has(d.serial_number) && seen.add(d.serial_number)));
  }

  protected print(): void {
    const page = document.createElement('style');
    page.textContent = PAGE_RULES[this.size()];
    document.head.appendChild(page);
    document.body.classList.add('printing-labels');
    const cleanup = () => {
      document.body.classList.remove('printing-labels');
      page.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }
}
