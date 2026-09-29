import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { AuthStore } from '../../core/auth.store';
import { errorMessage } from '../../core/notify.service';
import { LiveValue } from '../../shared/live-value';

const REMEMBER_KEY = 'inventory.login-email';

function savedEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

@Component({
  selector: 'app-login',
  imports: [TextBoxModule, ButtonModule, CheckBoxModule, MessageModule, LiveValue],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly features = [
    { icon: 'e-icons e-box', title: 'สต็อกรายเครื่อง', detail: 'รู้สถานะและที่อยู่ของทุกซีเรียลแบบเรียลไทม์' },
    { icon: 'e-icons e-location', title: 'แผนที่จุดติดตั้ง', detail: 'ดูตำแหน่งเครื่องที่ติดตั้งและค้นหาในรัศมี' },
    { icon: 'e-icons e-changes-track', title: 'ประวัติตรวจสอบย้อนหลัง', detail: 'ทุกการรับเข้า เบิก โอน และคืน ถูกบันทึกไว้' },
  ];

  protected readonly email = signal(savedEmail());
  protected readonly password = signal('');
  protected readonly remember = signal(!!savedEmail());
  protected readonly showPassword = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canSubmit = computed(() => !!this.email().trim() && !!this.password() && !this.loading());

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
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
