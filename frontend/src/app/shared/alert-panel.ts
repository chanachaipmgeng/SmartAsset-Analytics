import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DashboardSummary, Device, DeviceStatus } from '../core/models';

interface AlertItem {
  id: string;
  tone: 'warning' | 'error' | 'info' | 'primary';
  icon: string;
  title: string;
  detail: string;
  link: string | string[];
  queryParams?: Record<string, string>;
}

/** Bell menu fed by the same backlog numbers as the dashboard summary. */
@Component({
  selector: 'app-alert-panel',
  imports: [ButtonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="alert-wrap" #wrap>
      <button
        ejs-button
        cssClass="e-flat e-round nav-btn alert-btn"
        iconCss="e-icons e-notification"
        (click)="toggle($event)"
        [attr.aria-expanded]="open()"
        aria-haspopup="true"
        aria-label="งานค้างและการแจ้งเตือน"
        title="งานค้างและการแจ้งเตือน"
      ></button>
      @if (count() > 0) {
        <span class="badge" aria-hidden="true">{{ count() > 99 ? '99+' : count() }}</span>
      }

      @if (open()) {
        <div class="panel" role="menu" aria-label="งานค้าง">
          <div class="panel-head">
            <span class="font-semibold">งานค้าง</span>
            <button
              ejs-button
              cssClass="e-flat e-small"
              iconCss="e-icons e-refresh"
              [disabled]="summary.isLoading()"
              (click)="summary.reload()"
              aria-label="รีเฟรช"
            ></button>
          </div>

          @if (summary.isLoading() && !summary.hasValue()) {
            <div class="empty">กำลังโหลด…</div>
          } @else if (summary.error()) {
            <div class="empty error">โหลดการแจ้งเตือนไม่สำเร็จ</div>
          } @else if (items().length === 0) {
            <div class="empty">ไม่มีงานค้าง</div>
          } @else {
            <ul class="list">
              @for (item of items(); track item.id) {
                <li>
                  <a
                    class="item"
                    [attr.data-tone]="item.tone"
                    [routerLink]="item.link"
                    [queryParams]="item.queryParams ?? null"
                    (click)="open.set(false)"
                  >
                    <span class="item-icon" [class]="item.icon"></span>
                    <span class="item-body">
                      <span class="item-title">{{ item.title }}</span>
                      <span class="item-detail">{{ item.detail }}</span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          }

          <a class="footer-link" routerLink="/dashboard" (click)="open.set(false)">
            ไปที่แดชบอร์ด
          </a>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
    .alert-wrap {
      position: relative;
    }
    .badge {
      position: absolute;
      top: 2px;
      right: 2px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: rgb(var(--app-error));
      color: rgb(var(--app-on-error));
      font-size: 10px;
      font-weight: 700;
      line-height: 18px;
      text-align: center;
      pointer-events: none;
    }
    .panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 200;
      display: flex;
      width: min(360px, calc(100vw - 24px));
      max-height: min(480px, 70vh);
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgb(var(--app-outline-variant));
      border-radius: 12px;
      background: rgb(var(--app-surface-container-lowest));
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid rgb(var(--app-outline-variant));
    }
    .list {
      margin: 0;
      padding: 6px;
      overflow: auto;
      list-style: none;
    }
    .item {
      display: flex;
      gap: 10px;
      padding: 10px;
      border-radius: 10px;
      color: inherit;
      text-decoration: none;
      transition: background 120ms ease;
    }
    .item:hover {
      background: rgba(var(--app-primary), 0.08);
    }
    .item-icon {
      display: grid;
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      place-items: center;
      border-radius: 8px;
      background: rgba(var(--app-primary), 0.12);
      color: rgb(var(--app-primary));
      font-size: 16px;
    }
    .item[data-tone='warning'] .item-icon {
      background: rgba(var(--app-warning), 0.14);
      color: rgb(var(--app-warning));
    }
    .item[data-tone='error'] .item-icon {
      background: rgba(var(--app-error), 0.14);
      color: rgb(var(--app-error));
    }
    .item[data-tone='info'] .item-icon {
      background: rgba(var(--app-info), 0.14);
      color: rgb(var(--app-info));
    }
    .item-body {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
    }
    .item-title {
      font-size: 13px;
      font-weight: 600;
    }
    .item-detail {
      color: rgb(var(--app-on-surface-variant));
      font-size: 12px;
    }
    .empty {
      padding: 28px 16px;
      color: rgb(var(--app-on-surface-variant));
      font-size: 13px;
      text-align: center;
    }
    .empty.error {
      color: rgb(var(--app-error));
    }
    .footer-link {
      padding: 10px 14px;
      border-top: 1px solid rgb(var(--app-outline-variant));
      color: rgb(var(--app-primary));
      font-size: 13px;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
    }
    .footer-link:hover {
      background: rgba(var(--app-primary), 0.06);
    }
  `,
})
export class AlertPanel {
  private readonly wrap = viewChild.required<ElementRef<HTMLElement>>('wrap');
  private ignoreDocClick = false;

  protected readonly open = signal(false);
  protected readonly summary = httpResource<DashboardSummary>(() => '/api/v1/dashboard/summary');

  protected readonly items = computed(() => this.buildItems(this.summary.value()));
  protected readonly count = computed(() => this.items().length);

  protected toggle(event?: Event): void {
    event?.stopPropagation();
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.ignoreDocClick = true;
      queueMicrotask(() => {
        this.ignoreDocClick = false;
      });
      this.summary.reload();
    }
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(event: MouseEvent): void {
    if (!this.open() || this.ignoreDocClick) return;
    if (!this.wrap().nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }

  private buildItems(data: DashboardSummary | undefined): AlertItem[] {
    if (!data) return [];
    const items: AlertItem[] = [];

    if (data.pending_qc > 0) {
      items.push({
        id: 'qc',
        tone: 'primary',
        icon: 'e-icons e-check-box',
        title: `รอตรวจสอบ (QC) ${data.pending_qc} เครื่อง`,
        detail: 'กดเพื่อกรองอุปกรณ์ที่รอ QC',
        link: '/devices',
        queryParams: { status: 'UNDER_QC' satisfies DeviceStatus },
      });
    }

    for (const device of data.loan_overdue.slice(0, 5)) {
      items.push(this.deviceAlert(device, 'loan', 'warning', 'e-icons e-clock', 'ยืมเกินกำหนดคืน'));
    }
    if (data.loan_overdue.length > 5) {
      items.push({
        id: 'loan-more',
        tone: 'warning',
        icon: 'e-icons e-clock',
        title: `ยืมเกินกำหนดอีก ${data.loan_overdue.length - 5} เครื่อง`,
        detail: 'ดูทั้งหมดบนแดชบอร์ด',
        link: '/dashboard',
      });
    }

    for (const row of data.repair_aging.slice(0, 5)) {
      items.push({
        id: `repair-${row.device.id}`,
        tone: 'error',
        icon: 'e-icons e-settings',
        title: `${row.device.serial_number} ส่งซ่อมนาน ${row.days} วัน`,
        detail: `${row.device.brand} ${row.device.model_name}`,
        link: ['/devices', row.device.id],
      });
    }
    if (data.repair_aging.length > 5) {
      items.push({
        id: 'repair-more',
        tone: 'error',
        icon: 'e-icons e-settings',
        title: `ส่งซ่อมนานอีก ${data.repair_aging.length - 5} เครื่อง`,
        detail: 'ดูทั้งหมดบนแดชบอร์ด',
        link: '/dashboard',
      });
    }

    for (const device of data.warranty_expiring.slice(0, 5)) {
      items.push(
        this.deviceAlert(device, 'warranty', 'info', 'e-icons e-circle-info', 'ประกันใกล้หมด'),
      );
    }
    if (data.warranty_expiring.length > 5) {
      items.push({
        id: 'warranty-more',
        tone: 'info',
        icon: 'e-icons e-circle-info',
        title: `ประกันใกล้หมดอีก ${data.warranty_expiring.length - 5} เครื่อง`,
        detail: 'ดูรายงานประกัน',
        link: '/reports',
        queryParams: { tab: 'warranty' },
      });
    }

    return items;
  }

  private deviceAlert(
    device: Device,
    kind: string,
    tone: AlertItem['tone'],
    icon: string,
    title: string,
  ): AlertItem {
    return {
      id: `${kind}-${device.id}`,
      tone,
      icon,
      title: `${device.serial_number} — ${title}`,
      detail: `${device.brand} ${device.model_name}`,
      link: ['/devices', device.id],
    };
  }
}
