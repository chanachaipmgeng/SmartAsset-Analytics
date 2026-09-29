import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_LABELS } from '../core/labels';
import { DeviceStatus } from '../core/models';

@Component({
  selector: 'app-status-chip',
  template: `<span class="status-chip" [class]="status()">{{ label() }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChip {
  readonly status = input.required<DeviceStatus>();
  protected readonly label = computed(() => STATUS_LABELS[this.status()]);
}
