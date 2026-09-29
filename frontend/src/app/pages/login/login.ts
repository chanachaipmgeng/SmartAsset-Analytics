import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { AuthStore } from '../../core/auth.store';
import { safeReturnUrl } from '../../core/guards';
import { errorMessage } from '../../core/notify.service';
import { ThemeService } from '../../core/theme.service';
import { LiveValue } from '../../shared/live-value';
import { LoginShowcase } from './login-showcase';

const REMEMBER_KEY = 'inventory.login-email';
const SHAKE_MS = 600;

function savedEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

function motionAllowed(): boolean {
  return (
    typeof matchMedia === 'function' &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches &&
    matchMedia('(pointer: fine)').matches
  );
}

@Component({
  selector: 'app-login',
  imports: [TextBoxModule, ButtonModule, CheckBoxModule, MessageModule, LiveValue, LoginShowcase],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(pointermove)': 'onPointer($event)' },
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly theme = inject(ThemeService);

  /** Set by `authGuard` when a deep link (e.g. a label QR) needed a login first. */
  readonly returnUrl = input<string>();

  protected readonly features = [
    {
      icon: 'e-icons e-box',
      title: 'สต็อกรายเครื่อง',
      detail: 'รู้สถานะและที่อยู่ของทุกซีเรียลแบบเรียลไทม์',
    },
    {
      icon: 'e-icons e-location',
      title: 'แผนที่จุดติดตั้ง',
      detail: 'ดูตำแหน่งเครื่องที่ติดตั้งและค้นหาในรัศมี',
    },
    {
      icon: 'e-icons e-changes-track',
      title: 'ประวัติตรวจสอบย้อนหลัง',
      detail: 'ทุกการรับเข้า เบิก โอน และคืน ถูกบันทึกไว้',
    },
  ];

  protected readonly email = signal(savedEmail());
  protected readonly password = signal('');
  protected readonly remember = signal(!!savedEmail());
  protected readonly showPassword = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly shake = signal(false);
  protected readonly canSubmit = computed(
    () => !!this.email().trim() && !!this.password() && !this.loading(),
  );

  private readonly parallax = motionAllowed();
  private frame = 0;
  private shakeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      clearTimeout(this.shakeTimer);
    });
  }

  /** Feeds `--mx`/`--my` (-1…1) to the stylesheet for the hero parallax. */
  protected onPointer(event: PointerEvent): void {
    if (!this.parallax || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      this.host.style.setProperty('--mx', x.toFixed(3));
      this.host.style.setProperty('--my', y.toFixed(3));
    });
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.loading.set(true);
    this.error.set(null);
    const email = this.email().trim();
    try {
      await this.auth.login(email, this.password());
      try {
        if (this.remember()) localStorage.setItem(REMEMBER_KEY, email);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        // Storage unavailable; remembering is best-effort.
      }
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (err) {
      this.error.set(errorMessage(err));
      this.shakeCard();
    } finally {
      this.loading.set(false);
    }
  }

  private shakeCard(): void {
    clearTimeout(this.shakeTimer);
    this.shake.set(true);
    this.shakeTimer = setTimeout(() => this.shake.set(false), SHAKE_MS);
  }
}
