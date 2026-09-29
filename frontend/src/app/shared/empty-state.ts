import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Centered icon + message for empty or failed sections; projected content is the call to action. */
@Component({
  selector: 'app-empty-state',
  template: `
    <div class="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div
        class="grid size-14 place-items-center rounded-full text-2xl"
        [class]="
          tone() === 'error'
            ? 'bg-error-container text-on-error-container'
            : 'bg-surface-container text-primary'
        "
      >
        <span [class]="icon()"></span>
      </div>
      <p class="m-0 mt-2 text-base font-semibold text-on-surface">{{ title() }}</p>
      @if (message()) {
        <p class="m-0 max-w-md text-sm text-on-surface-variant">{{ message() }}</p>
      }
      <div class="mt-3 flex flex-wrap justify-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  readonly icon = input('e-icons e-folder-open');
  readonly tone = input<'default' | 'error'>('default');
}
