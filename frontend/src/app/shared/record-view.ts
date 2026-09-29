import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DialogModule } from '@syncfusion/ej2-angular-popups';
import { DIALOG_ANIMATION } from './syncfusion';

export interface RecordField {
  label: string;
  value: string | number | null | undefined;
  /** Spans both columns (long text such as addresses and notes). */
  wide?: boolean;
  mono?: boolean;
}

/** Read-only details of one grid row, opened by the grid's "view" action; extra content is projected below. */
@Component({
  selector: 'app-record-view',
  imports: [DialogModule, ButtonModule],
  template: `
    <ejs-dialog
      [visible]="open()"
      (close)="open.set(false)"
      [header]="header()"
      [isModal]="true"
      [showCloseIcon]="true"
      [animationSettings]="animation"
      width="600px"
      target="body"
    >
      <ng-template #content>
        <dl class="record-facts">
          @for (f of fields(); track f.label) {
            <div [class.wide]="f.wide">
              <dt>{{ f.label }}</dt>
              <dd [class.mono]="f.mono">
                {{ f.value === null || f.value === undefined || f.value === '' ? '-' : f.value }}
              </dd>
            </div>
          }
        </dl>
        <ng-content />
      </ng-template>
      <ng-template #footerTemplate>
        @if (editable()) {
          <button ejs-button iconCss="e-icons e-edit" (click)="open.set(false); edit.emit()">
            แก้ไข
          </button>
        }
        <button ejs-button [isPrimary]="true" (click)="open.set(false)">ปิด</button>
      </ng-template>
    </ejs-dialog>
  `,
  styles: `
    .record-facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 20px;
      margin: 0;

      > div {
        min-width: 0;
        padding: 10px 12px;
        border: 1px solid rgba(var(--app-outline-variant), 0.8);
        border-radius: 10px;
        background: color-mix(in srgb, rgb(var(--app-surface)) 96%, rgb(var(--app-primary)));
        animation: fade-up 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }

      .wide {
        grid-column: 1 / -1;
      }

      dt {
        font-size: 12px;
        color: rgb(var(--app-on-surface-variant));
      }

      dd {
        margin: 2px 0 0;
        font-weight: 500;
        overflow-wrap: anywhere;
        white-space: pre-line;
        color: rgb(var(--app-on-surface));
      }

      .mono {
        font-family: ui-monospace, 'Cascadia Mono', monospace;
      }
    }

    @media (max-width: 520px) {
      .record-facts {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordView {
  readonly open = model(false);
  readonly header = input('รายละเอียด');
  readonly fields = input<RecordField[]>([]);
  readonly editable = input(false);
  readonly edit = output<void>();

  protected readonly animation = DIALOG_ANIMATION;
}
