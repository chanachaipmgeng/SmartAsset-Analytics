import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { PhotoSrcPipe } from '../core/photos';

/** Round profile picture with the name's first letter as fallback (no photo, or it failed to load). */
@Component({
  selector: 'app-avatar',
  imports: [PhotoSrcPipe],
  template: `
    @if (src() && !failed()) {
      <img
        [src]="src() | photoSrc"
        [alt]="name()"
        loading="lazy"
        decoding="async"
        (error)="failed.set(true)"
      />
    } @else {
      <span aria-hidden="true">{{ initial() }}</span>
    }
  `,
  host: {
    '[style.--size.px]': 'size()',
    '[attr.title]': 'name()',
  },
  styles: `
    :host {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: var(--size);
      height: var(--size);
      overflow: hidden;
      border-radius: 50%;
      font-size: calc(var(--size) * 0.42);
      font-weight: 700;
      line-height: 1;
      color: rgb(var(--app-on-primary));
      background: linear-gradient(135deg, rgb(var(--app-primary)), rgb(var(--app-tertiary)));
      box-shadow: 0 0 0 2px rgb(var(--app-surface));
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      animation: fade-in 240ms ease-out both;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avatar {
  readonly name = input('');
  /** `thumb_url` of the user's photo. */
  readonly src = input<string | null | undefined>(null);
  readonly size = input(32);

  protected readonly failed = linkedSignal({ source: this.src, computation: () => false });
  protected readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase() || '?');
}
