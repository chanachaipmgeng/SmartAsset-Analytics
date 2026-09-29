import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

const THRESHOLD_PX = 400;

/** Floating button that appears once `target` has scrolled past a screenful. */
@Component({
  selector: 'app-back-to-top',
  template: `
    @if (visible()) {
      <button
        type="button"
        class="back-to-top animate-scale-in"
        aria-label="กลับขึ้นด้านบน"
        title="กลับขึ้นด้านบน"
        (click)="scrollTop()"
      >
        <span class="e-icons e-chevron-up"></span>
      </button>
    }
  `,
  styles: `
    .back-to-top {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 40;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border: 0;
      border-radius: 16px;
      cursor: pointer;
      font-size: 18px;
      background: rgb(var(--app-primary-container));
      color: rgb(var(--app-on-primary-container));
      box-shadow: 0 6px 20px -8px rgba(var(--app-primary), 0.6);
      transition: transform 160ms ease;

      &:hover {
        transform: translateY(-2px);
      }

      &:focus-visible {
        outline: 2px solid rgb(var(--app-primary));
        outline-offset: 2px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackToTop {
  readonly target = input.required<HTMLElement>();
  protected readonly visible = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect((onCleanup) => {
      const el = this.target();
      const onScroll = () => this.visible.set(el.scrollTop > THRESHOLD_PX);
      el.addEventListener('scroll', onScroll, { passive: true });
      onCleanup(() => el.removeEventListener('scroll', onScroll));
    });
    destroyRef.onDestroy(() => this.visible.set(false));
  }

  protected scrollTop(): void {
    this.target().scrollTo({ top: 0, behavior: 'smooth' });
  }
}
