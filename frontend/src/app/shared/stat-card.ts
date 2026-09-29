import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CountUp } from './count-up';

export type StatVariant = 'gradient' | 'success' | 'warning' | 'info' | 'error' | 'neutral' | 'primary' | 'tertiary';

/** KPI tile: icon, animated number, optional hint and 7-day trend. Clickable when `link` is set. */
@Component({
  selector: 'app-stat-card',
  imports: [RouterLink, CountUp],
  template: `
    <a class="card lift" [attr.data-variant]="variant()" [routerLink]="link()" [queryParams]="queryParams()" [class.static]="!link()">
      <span class="card-glow"></span>
      <span class="card-noise"></span>
      <div class="top">
        <span class="label">{{ label() }}</span>
        <span class="icon">
          <span [class]="icon()"></span>
          <span class="icon-ring"></span>
        </span>
      </div>
      <div class="value" [countUp]="value()"></div>
      <div class="foot">
        @if (trend() !== null) {
          <span class="trend" [class.up]="trend()! > 0" [class.down]="trend()! < 0">
            <span class="trend-arrow">{{ trend()! > 0 ? '↑' : trend()! < 0 ? '↓' : '' }}</span>
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
      --bg: rgb(var(--app-surface));
      --fg: rgb(var(--app-on-surface));
      --muted: rgb(var(--app-on-surface-variant));
      --icon-bg: rgb(var(--app-surface-variant));
      --icon-fg: rgb(var(--app-on-surface-variant));
      position: relative;
      display: flex;
      height: 100%;
      flex-direction: column;
      gap: 6px;
      overflow: hidden;
      padding: 18px;
      border: 1px solid rgba(var(--app-outline-variant), 0.6);
      border-radius: 20px;
      background: var(--bg);
      color: var(--fg);
      text-decoration: none;
      box-sizing: border-box;

      &.static {
        pointer-events: none;
      }
    }

    .card-glow {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: radial-gradient(
        ellipse 80% 80% at 80% 120%,
        rgba(var(--app-primary), 0.06),
        transparent
      );
      pointer-events: none;
      transition: opacity 300ms ease;
    }

    .card:hover .card-glow {
      opacity: 1.5;
    }

    .card-noise {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");
      pointer-events: none;
    }

    @each $tone in success, warning, info, error, primary, tertiary {
      .card[data-variant='#{$tone}'] {
        --icon-bg: rgb(var(--app-#{$tone}-container));
        --icon-fg: rgb(var(--app-on-#{$tone}-container));
      }
    }
    .card[data-variant='gradient'] {
      --fg: rgb(var(--app-on-primary));
      --muted: rgba(var(--app-on-primary), 0.85);
      --icon-bg: rgba(var(--app-on-primary), 0.18);
      --icon-fg: rgb(var(--app-on-primary));
      border-color: transparent;
      background:
        radial-gradient(120% 140% at 100% 0%, rgba(var(--app-tertiary), 0.85), transparent 60%),
        linear-gradient(135deg, rgb(var(--app-primary)), color-mix(in srgb, rgb(var(--app-primary)) 65%, rgb(var(--app-tertiary))));
      background-size: 200% 200%;
      animation: gradient-shift 8s ease infinite;

      &::after {
        content: '';
        position: absolute;
        right: -30px;
        bottom: -50px;
        width: 140px;
        height: 140px;
        border-radius: 50%;
        background: rgba(var(--app-on-primary), 0.08);
        filter: blur(2px);
      }

      .card-glow {
        background: radial-gradient(
          circle at 20% 80%,
          rgba(var(--app-on-primary), 0.1),
          transparent 60%
        );
      }
    }

    @keyframes gradient-shift {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .label {
      overflow: hidden;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.01em;
      color: var(--muted);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .icon {
      position: relative;
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      font-size: 18px;
      background: var(--icon-bg);
      color: var(--icon-fg);
    }

    .icon-ring {
      position: absolute;
      inset: -2px;
      border-radius: inherit;
      border: 2px solid var(--icon-fg);
      opacity: 0;
      transition: opacity 300ms ease, transform 300ms ease;
      transform: scale(0.9);
      pointer-events: none;
    }

    .card:hover .icon-ring {
      opacity: 0.2;
      transform: scale(1);
    }

    .value {
      font-size: 34px;
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.02em;
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
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 1px 8px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 11px;
      background: var(--icon-bg);
      color: var(--icon-fg);

      &.up {
        background: rgba(var(--app-success), 0.15);
        color: rgb(var(--app-success));
      }

      &.down {
        background: rgba(var(--app-error), 0.15);
        color: rgb(var(--app-error));
      }
    }

    .trend-arrow {
      font-size: 13px;
      line-height: 1;
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
