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
      @for (f of options(); track f.key; let i = $index) {
        <button
          type="button"
          class="e-chip"
          role="radio"
          [style.--i]="i"
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
      position: relative;
      overflow: hidden;
      display: inline-flex;
      align-items: center;
      height: 32px;
      margin: 0;
      padding: 0 12px;
      gap: 6px;
      border: 1px solid rgba(var(--app-outline-variant), 0.9);
      border-radius: 999px;
      background: rgba(var(--app-surface), 0.72);
      color: rgb(var(--app-on-surface-variant));
      box-shadow: none;
      cursor: pointer;
      font: inherit;
      font-size: 13.5px;
      font-weight: 500;
      animation: chip-in 360ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
      animation-delay: calc(min(var(--i, 0), 14) * 30ms);
      transition:
        transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
        border-color 180ms ease,
        color 180ms ease,
        background-color 180ms ease,
        box-shadow 220ms ease;
    }
    .e-chip .e-chip-text {
      color: inherit;
      font-weight: inherit;
    }
    .e-chip:hover {
      transform: translateY(-1px);
      border-color: rgba(var(--app-primary), 0.5);
      background: rgba(var(--app-primary), 0.06);
      color: rgb(var(--app-primary));
      box-shadow: 0 6px 16px -10px rgba(var(--app-primary), 0.6);
    }
    .e-chip:active {
      transform: scale(0.96);
    }
    .e-chip:focus-visible {
      outline: 2px solid rgb(var(--app-primary));
      outline-offset: 2px;
    }
    .e-chip.e-active {
      border-color: transparent;
      background: linear-gradient(
        135deg,
        rgb(var(--app-primary)),
        color-mix(in srgb, rgb(var(--app-primary)) 60%, rgb(var(--app-tertiary)))
      );
      color: rgb(var(--app-on-primary));
      font-weight: 600;
      box-shadow: 0 8px 20px -10px rgba(var(--app-primary), 0.85);
    }
    /* Light sweep across the chip when it becomes active. */
    .e-chip.e-active::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        105deg,
        transparent 35%,
        rgb(255 255 255 / 0.35) 50%,
        transparent 65%
      );
      transform: translateX(-100%);
      animation: chip-sweep 700ms ease-out 80ms both;
      pointer-events: none;
    }
    .count {
      min-width: 22px;
      padding: 0 6px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      line-height: 20px;
      text-align: center;
      background: rgba(var(--app-on-surface-variant), 0.1);
      color: inherit;
      font-variant-numeric: tabular-nums;
    }
    .e-chip.e-active .count {
      background: rgb(255 255 255 / 0.22);
      color: rgb(var(--app-on-primary));
    }
    @keyframes chip-in {
      from {
        opacity: 0;
        transform: translateY(6px) scale(0.96);
      }
    }
    @keyframes chip-sweep {
      to {
        transform: translateX(100%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .e-chip,
      .e-chip.e-active::after {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterChips<K extends string = string> {
  readonly options = input.required<FilterChip<K>[]>();
  readonly value = model.required<K>();
  readonly label = input('ตัวกรอง');
}
