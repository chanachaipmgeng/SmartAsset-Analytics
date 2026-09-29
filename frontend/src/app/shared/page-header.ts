import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Page title row; projected content becomes the right-aligned action group (wraps below on mobile). */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-3">
          <span class="title-accent"></span>
          <h1 class="m-0 text-2xl font-semibold leading-tight text-on-surface">{{ title() }}</h1>
        </div>
        @if (subtitle()) {
          <p class="m-0 mt-1.5 text-sm text-on-surface-variant" style="padding-left: 15px;">
            {{ subtitle() }}
          </p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    .title-accent {
      display: inline-block;
      width: 4px;
      height: 24px;
      border-radius: 2px;
      background: linear-gradient(180deg, rgb(var(--app-primary)), rgb(var(--app-tertiary)));
      flex-shrink: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
}
