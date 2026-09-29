import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TX_ICONS, TX_LABELS, TX_TONES, relativeTime } from '../core/labels';
import { InventoryTransaction, Photo } from '../core/models';
import { PhotoSrcPipe } from '../core/photos';
import { EmptyState } from './empty-state';
import { SkeletonBlock } from './skeleton-block';

/** Vertical history of stock movements, newest first. */
@Component({
  selector: 'app-asset-timeline',
  imports: [DatePipe, RouterLink, EmptyState, SkeletonBlock, PhotoSrcPipe],
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
                @if (tx.supplier_name) {
                  · ผู้ซ่อม {{ tx.supplier_name }}
                } @else if (tx.customer_name) {
                  · {{ tx.customer_name }}
                } @else if (tx.tenant_name && tx.transaction_type === 'TRANSFER') {
                  · ไปยัง {{ tx.tenant_name }}
                }
              </div>
              @if (tx.note && !compact()) {
                <p class="note">{{ tx.note }}</p>
              }
              @if (photosByTx().get(tx.id); as txPhotos) {
                <div class="tx-photos">
                  @for (p of txPhotos; track p.id) {
                    <a [href]="p.url | photoSrc" target="_blank" rel="noopener" [title]="p.caption ?? 'เปิดรูปขนาดเต็ม'">
                      <img [src]="p.thumb_url | photoSrc" alt="รูปประกอบรายการ" loading="lazy" decoding="async" />
                    </a>
                  }
                </div>
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
      --tone: var(--app-outline);
      --tone-container: var(--app-surface-variant);
      --on-tone-container: var(--app-on-surface-variant);
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
        background: rgb(var(--app-outline-variant));
      }
    }
    @each $tone in success, warning, info, error, primary, tertiary {
      .item[data-tone='#{$tone}'] {
        --tone-container: var(--app-#{$tone}-container);
        --on-tone-container: var(--app-on-#{$tone}-container);
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
        color: rgb(var(--app-on-surface-variant));
        white-space: nowrap;
      }
    }
    .serial {
      font-family: ui-monospace, monospace;
      font-size: 13px;
      color: rgb(var(--app-primary));
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
    .meta {
      margin-top: 2px;
      font-size: 12px;
      color: rgb(var(--app-on-surface-variant));
    }
    .note {
      margin: 6px 0 0;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 13px;
      background: color-mix(in srgb, rgb(var(--app-surface)) 90%, rgb(var(--app-primary)));
      white-space: pre-line;
    }
    .tx-photos {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;

      a {
        display: block;
        width: 56px;
        height: 56px;
        overflow: hidden;
        border: 1px solid rgba(var(--app-outline-variant), 0.9);
        border-radius: 8px;
        transition:
          transform 160ms ease,
          box-shadow 160ms ease;

        &:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px -10px rgba(var(--app-primary), 0.7);
        }
      }

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
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
  /** Photos attached to these transactions (`owner_type` transaction). */
  readonly photos = input<Photo[]>([]);

  protected readonly photosByTx = computed(() => {
    const map = new Map<string, Photo[]>();
    for (const p of this.photos()) map.set(p.owner_id, [...(map.get(p.owner_id) ?? []), p]);
    return map;
  });

  protected readonly labels = TX_LABELS;
  protected readonly icons = TX_ICONS;
  protected readonly tones = TX_TONES;
  protected readonly relative = relativeTime;
}
