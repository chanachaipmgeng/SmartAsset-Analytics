import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TX_ICONS, TX_LABELS, TX_TONES, relativeTime } from '../core/labels';
import { InventoryTransaction } from '../core/models';
import { EmptyState } from './empty-state';
import { SkeletonBlock } from './skeleton-block';

/** Vertical history of stock movements, newest first. */
@Component({
  selector: 'app-asset-timeline',
  imports: [DatePipe, RouterLink, EmptyState, SkeletonBlock],
  template: `
    @if (loading() && !items().length) {
      <div class="flex flex-col gap-3">
        @for (i of [1, 2, 3]; track i) {
          <app-skeleton-block height="52px" />
        }
      </div>
    } @else if (!items().length) {
      <app-empty-state icon="e-icons e-history" title="ยังไม่มีประวัติ" />
    } @else {
      <ol class="timeline stagger">
        @for (tx of items(); track tx.id) {
          <li class="item" [attr.data-tone]="tones[tx.transaction_type]">
            <span class="dot"><span [class]="icons[tx.transaction_type]"></span></span>
            <div class="body">
              <div class="head">
                <b>{{ labels[tx.transaction_type] }}</b>
                @if (showDevice()) {
                  <a class="serial" [routerLink]="['/devices', tx.device_id]">{{ tx.serial_number }}</a>
                }
                <time [attr.datetime]="tx.occurred_at" [title]="tx.occurred_at | date: 'd MMM y HH:mm'">
                  {{ relative(tx.occurred_at) }}
                </time>
              </div>
              <div class="meta">
                {{ tx.user_name }}
                @if (tx.customer_name) {
                  · {{ tx.customer_name }}
                } @else if (tx.tenant_name && tx.transaction_type === 'TRANSFER') {
                  · ไปยัง {{ tx.tenant_name }}
                }
              </div>
              @if (tx.note && !compact()) {
                <p class="note">{{ tx.note }}</p>
              }
            </div>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .timeline {
      position: relative;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .item {
      --tone: var(--color-sf-outline);
      --tone-container: var(--color-sf-surface-variant);
      --on-tone-container: var(--color-sf-on-surface-variant);
      position: relative;
      display: flex;
      gap: 12px;
      padding-bottom: 16px;

      &:not(:last-child)::before {
        content: '';
        position: absolute;
        left: 15px;
        top: 34px;
        bottom: 2px;
        width: 2px;
        border-radius: 1px;
        background: rgb(var(--color-sf-outline-variant));
      }
    }
    @each $tone in success, warning, info, error {
      .item[data-tone='#{$tone}'] {
        --tone-container: var(--color-sf-#{$tone}-container);
        --on-tone-container: var(--color-sf-on-#{$tone}-container);
      }
    }
    .dot {
      display: grid;
      flex: none;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-size: 14px;
      background: rgb(var(--tone-container));
      color: rgb(var(--on-tone-container));
    }
    .body {
      min-width: 0;
      flex: 1;
      padding-top: 5px;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 8px;
      font-size: 14px;

      time {
        margin-left: auto;
        font-size: 12px;
        color: rgb(var(--color-sf-on-surface-variant));
        white-space: nowrap;
      }
    }
    .serial {
      font-family: ui-monospace, monospace;
      font-size: 13px;
      color: rgb(var(--color-sf-primary));
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
    .meta {
      margin-top: 2px;
      font-size: 12px;
      color: rgb(var(--color-sf-on-surface-variant));
    }
    .note {
      margin: 6px 0 0;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 13px;
      background: color-mix(in srgb, rgb(var(--color-sf-surface)) 90%, rgb(var(--color-sf-primary)));
      white-space: pre-line;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetTimeline {
  readonly items = input.required<InventoryTransaction[]>();
  readonly loading = input(false);
  /** Show each row's serial as a link; used where rows mix devices (dashboard). */
  readonly showDevice = input(false);
  /** Hide notes for a denser list. */
  readonly compact = input(false);

  protected readonly labels = TX_LABELS;
  protected readonly icons = TX_ICONS;
  protected readonly tones = TX_TONES;
  protected readonly relative = relativeTime;
}
