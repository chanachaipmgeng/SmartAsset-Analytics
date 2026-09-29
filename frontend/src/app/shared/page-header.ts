import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Page title row; projected content becomes the right-aligned action group (wraps below on mobile). */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <h1 class="m-0 text-2xl font-semibold leading-tight text-on-surface">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="m-0 mt-1 text-sm text-on-surface-variant">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
}
