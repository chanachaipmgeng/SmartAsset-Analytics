import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CountUp } from './count-up';

export type StatVariant = 'gradient' | 'success' | 'warning' | 'info' | 'error' | 'neutral';

/** KPI tile: icon, animated number, optional hint and 7-day trend. Clickable when `link` is set. */
@Component({
  selector: 'app-stat-card',
  imports: [RouterLink, CountUp],
  template: `
    <a class="card lift" [attr.data-variant]="variant()" [routerLink]="link()" [queryParams]="queryParams()" [class.static]="!link()">
      <div class="top">
        <span class="label">{{ label() }}</span>
        <span class="icon"><span [class]="icon()"></span></span>
      </div>
      <div class="value" [countUp]="value()"></div>
      <div class="foot">
        @if (trend() !== null) {
          <span class="trend" [class.up]="trend()! > 0">
            {{ trend()! > 0 ? '+' : '' }}{{ trend() }}
          </span>
          <span>{{ trendLabel() }}</span>
        } @else if (hint()) {
          <span>{{ hint() }}</span>
        }
      </div>
    </a>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .card {
      --bg: rgb(var(--color-sf-surface));
      --fg: rgb(var(--color-sf-on-surface));
      --muted: rgb(var(--color-sf-on-surface-variant));
      --icon-bg: rgb(var(--color-sf-surface-variant));
      --icon-fg: rgb(var(--color-sf-on-surface-variant));
      position: relative;
      display: flex;
      height: 100%;
      flex-direction: column;
      gap: 4px;
      overflow: hidden;
      padding: 16px;
      border: 1px solid rgb(var(--color-sf-outline-variant));
      border-radius: 20px;
      background: var(--bg);
      color: var(--fg);
      text-decoration: none;
      box-sizing: border-box;

      &.static {
        pointer-events: none;
      }
    }
    @each $tone in success, warning, info, error {
      .card[data-variant='#{$tone}'] {
        --icon-bg: rgb(var(--color-sf-#{$tone}-container));
        --icon-fg: rgb(var(--color-sf-on-#{$tone}-container));
      }
    }
    .card[data-variant='gradient'] {
      --fg: rgb(var(--color-sf-on-primary));
      --muted: rgba(var(--color-sf-on-primary), 0.8);
      --icon-bg: rgba(var(--color-sf-on-primary), 0.18);
      --icon-fg: rgb(var(--color-sf-on-primary));
      border-color: transparent;
      background:
        radial-gradient(120% 140% at 100% 0%, rgba(var(--color-sf-tertiary), 0.9), transparent 60%),
        linear-gradient(135deg, rgb(var(--color-sf-primary)), color-mix(in srgb, rgb(var(--color-sf-primary)) 70%, rgb(var(--color-sf-tertiary))));

      &::after {
        content: '';
        position: absolute;
        right: -40px;
        bottom: -60px;
        width: 160px;
        height: 160px;
        border-radius: 50%;
        background: rgba(var(--color-sf-on-primary), 0.08);
      }
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .label {
      overflow: hidden;
      font-size: 14px;
      color: var(--muted);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 12px;
      font-size: 18px;
      background: var(--icon-bg);
      color: var(--icon-fg);
    }
    .value {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.15;
      font-variant-numeric: tabular-nums;
    }
    .foot {
      display: flex;
      min-height: 18px;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
    }
    .trend {
      padding: 0 6px;
      border-radius: 999px;
      font-weight: 700;
      background: var(--icon-bg);
      color: var(--icon-fg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly icon = input('e-icons e-chart');
  readonly variant = input<StatVariant>('neutral');
  readonly hint = input<string | null>(null);
  /** Change over the trend window; `null` hides the trend and shows `hint` instead. */
  readonly trend = input<number | null>(null);
  readonly trendLabel = input('ใน 7 วัน');
  readonly link = input<string | null>(null);
  readonly query = input<Record<string, string> | null>(null);

  protected readonly queryParams = computed(() => this.query() ?? undefined);
}
