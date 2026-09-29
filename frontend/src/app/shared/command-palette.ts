import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DialogModule } from '@syncfusion/ej2-angular-popups';
import { STATUS_LABELS } from '../core/labels';
import { Device } from '../core/models';

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  icon: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

interface PaletteItem {
  key: string;
  label: string;
  sub?: string;
  icon: string;
  hint?: string;
  group: string;
  index: number;
  run: () => void;
}

const MAX_DEVICES = 6;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Ctrl+K / Cmd+K launcher: jump to pages, run quick commands, or find a device by serial, model or MAC.
 * Devices load on first open and are filtered client-side (the API already scopes them by tenant).
 */
@Component({
  selector: 'app-command-palette',
  imports: [DialogModule],
  host: { '(document:keydown)': 'onGlobalKey($event)' },
  template: `
    <ejs-dialog
      [visible]="open()"
      (close)="onClose()"
      (open)="focusInput()"
      [isModal]="true"
      [closeOnEscape]="true"
      [showCloseIcon]="false"
      [position]="{ X: 'center', Y: 72 }"
      [animationSettings]="{ effect: 'FadeZoom', duration: 160 }"
      width="640px"
      cssClass="command-palette"
      target="body"
    >
      <ng-template #content>
        <div class="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
          <span class="e-icons e-search text-lg text-on-surface-variant"></span>
          <input
            class="palette-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="ค้นหาเมนู คำสั่ง หรือซีเรียลอุปกรณ์..."
            aria-label="ค้นหา"
            role="combobox"
            aria-controls="palette-results"
            [attr.aria-activedescendant]="activeId()"
            [value]="query()"
            (input)="onInput($event)"
            (keydown)="onKey($event)"
          />
          <kbd class="palette-kbd">Esc</kbd>
        </div>

        <div id="palette-results" class="max-h-[60vh] overflow-y-auto py-2" role="listbox">
          @for (group of grouped(); track group.name) {
            <div class="px-4 pb-1 pt-2 text-xs font-semibold text-on-surface-variant">{{ group.name }}</div>
            @for (item of group.items; track item.key) {
              <button
                type="button"
                role="option"
                class="palette-item"
                [id]="'palette-' + item.index"
                [class.active]="item.index === active()"
                [attr.aria-selected]="item.index === active()"
                (mouseenter)="active.set(item.index)"
                (click)="execute(item)"
              >
                <span class="palette-icon" [class]="item.icon"></span>
                <span class="min-w-0 flex-1 text-left">
                  <span class="block truncate text-sm font-medium text-on-surface">{{ item.label }}</span>
                  @if (item.sub) {
                    <span class="block truncate text-xs text-on-surface-variant">{{ item.sub }}</span>
                  }
                </span>
                @if (item.hint) {
                  <span class="text-xs text-on-surface-variant">{{ item.hint }}</span>
                }
              </button>
            }
          } @empty {
            <div class="px-4 py-10 text-center text-sm text-on-surface-variant">
              @if (devices.isLoading()) {
                กำลังค้นหาอุปกรณ์...
              } @else {
                ไม่พบรายการที่ตรงกับ "{{ query() }}"
              }
            </div>
          }
        </div>

        <div class="flex items-center gap-4 border-t border-outline-variant px-4 py-2 text-xs text-on-surface-variant">
          <span><kbd class="palette-kbd">↑</kbd> <kbd class="palette-kbd">↓</kbd> เลื่อน</span>
          <span><kbd class="palette-kbd">Enter</kbd> เลือก</span>
          <span class="ml-auto hidden sm:inline"><kbd class="palette-kbd">Ctrl</kbd> + <kbd class="palette-kbd">K</kbd> เปิดได้ทุกหน้า</span>
        </div>
      </ng-template>
    </ejs-dialog>
  `,
  styles: `
    ::ng-deep .command-palette.e-dialog {
      border-radius: 20px;
      overflow: hidden;

      .e-dlg-content {
        padding: 0;
      }
    }

    .palette-input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: rgb(var(--color-sf-on-surface));
      font: inherit;
      font-size: 16px;

      &::placeholder {
        color: rgb(var(--color-sf-on-surface-variant));
      }
    }

    .palette-kbd {
      display: inline-block;
      min-width: 22px;
      padding: 1px 6px;
      border: 1px solid rgb(var(--color-sf-outline-variant));
      border-bottom-width: 2px;
      border-radius: 6px;
      font: inherit;
      font-size: 11px;
      text-align: center;
      color: rgb(var(--color-sf-on-surface-variant));
    }

    .palette-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: calc(100% - 16px);
      margin: 0 8px;
      padding: 8px 12px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      cursor: pointer;
      font: inherit;
      transition: background-color 100ms ease;

      &.active {
        background: rgb(var(--color-sf-secondary-container));
      }
    }

    .palette-icon {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: rgb(var(--color-sf-primary-container));
      color: rgb(var(--color-sf-on-primary-container));
      font-size: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandPalette {
  private readonly router = inject(Router);

  readonly open = model(false);
  readonly commands = input.required<PaletteCommand[]>();

  protected readonly query = signal('');
  protected readonly active = signal(0);
  private readonly everOpened = signal(false);

  protected readonly devices = httpResource<Device[]>(() => (this.everOpened() ? '/api/v1/devices' : undefined), {
    defaultValue: [],
  });

  private readonly items = computed<PaletteItem[]>(() => {
    const q = normalize(this.query());
    const list: Omit<PaletteItem, 'index'>[] = [];

    for (const c of this.commands()) {
      if (!q || normalize(`${c.label} ${c.keywords ?? ''}`).includes(q)) {
        list.push({ key: `c:${c.id}`, label: c.label, icon: c.icon, hint: c.hint, group: c.group, run: c.run });
      }
    }

    if (q.length >= 2) {
      const matches = this.devices
        .value()
        .filter((d) => normalize(`${d.serial_number} ${d.brand} ${d.model_name} ${d.mac_address ?? ''}`).includes(q))
        .slice(0, MAX_DEVICES);
      for (const d of matches) {
        list.push({
          key: `d:${d.id}`,
          label: d.serial_number,
          sub: `${d.brand} ${d.model_name} · ${STATUS_LABELS[d.status]}${d.tenant_name ? ` · ${d.tenant_name}` : ''}`,
          icon: 'e-icons e-box',
          group: 'อุปกรณ์',
          run: () => this.router.navigate(['/devices', d.id]),
        });
      }
    }
    return list.map((item, index) => ({ ...item, index }));
  });

  protected readonly grouped = computed(() => {
    const groups = new Map<string, PaletteItem[]>();
    for (const item of this.items()) {
      groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
    }
    return [...groups].map(([name, items]) => ({ name, items }));
  });

  protected readonly activeId = computed(() => (this.items().length ? `palette-${this.active()}` : null));

  protected onGlobalKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.open.set(!this.open());
    }
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
    if (this.query().trim().length >= 2) this.everOpened.set(true);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.items().length;
    if (!count) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      this.active.set((this.active() + delta + count) % count);
      document.getElementById(`palette-${this.active()}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.items()[this.active()];
      if (item) this.execute(item);
    }
  }

  protected execute(item: PaletteItem): void {
    this.open.set(false);
    item.run();
  }

  protected focusInput(): void {
    this.everOpened.set(true);
    document.querySelector<HTMLInputElement>('.command-palette .palette-input')?.focus();
  }

  protected onClose(): void {
    this.open.set(false);
    this.query.set('');
    this.active.set(0);
  }
}
