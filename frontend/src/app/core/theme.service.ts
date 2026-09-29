import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

/** Keep in sync with the pre-boot script in index.html. */
const STORAGE_KEY = 'inventory.theme';
const DARK_CLASS = 'e-dark-mode';

function readMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Syncfusion Tailwind 3 ships its dark palette under `.e-dark-mode`, and Tailwind's `dark:`
 * variant is bound to the same class, so toggling it on <html> switches the whole UI.
 * Charts and maps render SVG with their own palette and need `chartTheme` passed explicitly.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(readMode());

  private readonly media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  private readonly systemDark = signal(this.media?.matches ?? false);

  readonly isDark = computed(() => this.mode() === 'dark' || (this.mode() === 'system' && this.systemDark()));
  readonly chartTheme = computed(() => (this.isDark() ? 'Tailwind3Dark' : 'Tailwind3'));

  constructor() {
    const onChange = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
    this.media?.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', onChange));

    effect(() => {
      document.documentElement.classList.toggle(DARK_CLASS, this.isDark());
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cssColor('--app-surface'));
    });
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    try {
      if (mode === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Private mode: the choice just lasts for this session.
    }
  }

  toggle(): void {
    this.setMode(this.isDark() ? 'light' : 'dark');
  }
}

/** Resolves an app `--app-*` RGB triplet to a concrete colour for SVG renderers. */
export function cssColor(token: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value ? `rgb(${value})` : '#888';
}
