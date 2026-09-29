import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface FilterChip<K extends string = string> {
  key: K;
  label: string;
  count?: number;
}

/** Single-choice chip row above a list (status, type, active/inactive). */
@Component({
  selector: 'app-filter-chips',
  template: `
    <div class="chips e-chip-list e-selection" role="radiogroup" [attr.aria-label]="label()">
      @for (f of options(); track f.key) {
        <button
          type="button"
          class="e-chip"
          role="radio"
          [class.e-active]="value() === f.key"
          [attr.aria-checked]="value() === f.key"
          [attr.data-key]="f.key"
          (click)="value.set(f.key)"
        >
          <span class="e-chip-text">{{ f.label }}</span>
          @if (f.count !== undefined) {
            <span class="count">{{ f.count }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 12px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0;
    }
    .e-chip {
      margin: 0;
      gap: 8px;
      cursor: pointer;
      font: inherit;
      transition:
        background-color 150ms ease,
        box-shadow 150ms ease;
    }
    .count {
      min-width: 22px;
      padding: 0 6px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      line-height: 20px;
      text-align: center;
      background: rgb(var(--color-sf-surface-variant));
      color: rgb(var(--color-sf-on-surface-variant));
    }
    .e-chip.e-active .count {
      background: rgb(var(--color-sf-primary));
      color: rgb(var(--color-sf-on-primary));
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterChips<K extends string = string> {
  readonly options = input.required<FilterChip<K>[]>();
  readonly value = model.required<K>();
  readonly label = input('ตัวกรอง');
}
