import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_LABELS, STATUS_TONES, StatusTone } from '../core/labels';
import { DeviceStatus } from '../core/models';

// Full class names so Tailwind's scanner can find them.
const CHIP_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success-container text-on-success-container',
  warning: 'bg-warning-container text-on-warning-container',
  info: 'bg-info-container text-on-info-container',
  error: 'bg-error-container text-on-error-container',
  neutral: 'bg-surface-variant text-on-surface-variant',
  primary: 'bg-primary-container text-on-primary-container',
  tertiary: 'bg-tertiary-container text-on-tertiary-container',
};

const DOT_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  error: 'bg-error',
  neutral: 'bg-outline',
  primary: 'bg-primary',
  tertiary: 'bg-tertiary',
};

/** Material 3 tonal chip: container background, on-container text, solid tone dot. */
@Component({
  selector: 'app-status-chip',
  template: `
    <span
      class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-5"
      [class]="chipClass()"
    >
      <span class="size-1.5 shrink-0 rounded-full" [class]="dotClass()"></span>
      {{ label() }}
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChip {
  /** A device status, or pass `tone` + `text` for other labelled states (audit actions and so on). */
  readonly status = input<DeviceStatus | null>(null);
  readonly tone = input<StatusTone | null>(null);
  readonly text = input<string | null>(null);
  private readonly resolvedTone = computed<StatusTone>(() => {
    const status = this.status();
    return this.tone() ?? (status ? STATUS_TONES[status] : 'neutral');
  });
  protected readonly label = computed(() => {
    const status = this.status();
    return this.text() ?? (status ? STATUS_LABELS[status] : '');
  });
  protected readonly chipClass = computed(() => CHIP_CLASSES[this.resolvedTone()]);
  protected readonly dotClass = computed(() => DOT_CLASSES[this.resolvedTone()]);
}
