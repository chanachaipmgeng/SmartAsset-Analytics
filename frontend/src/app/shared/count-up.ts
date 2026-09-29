import { DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';

const DURATION_MS = 700;
const formatter = new Intl.NumberFormat('th-TH');

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Animates a number from its previous value to the new one: `<span [countUp]="total"></span>`. */
@Directive({ selector: '[countUp]' })
export class CountUp {
  readonly countUp = input.required<number>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private current = 0;
  private frame = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));

    effect(() => {
      const target = this.countUp() ?? 0;
      cancelAnimationFrame(this.frame);
      if (reducedMotion() || typeof requestAnimationFrame !== 'function') {
        this.render(target);
        return;
      }
      const from = this.current;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / DURATION_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        this.render(Math.round(from + (target - from) * eased));
        if (t < 1) this.frame = requestAnimationFrame(step);
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  private render(value: number): void {
    this.current = value;
    this.el.textContent = formatter.format(value);
  }
}
