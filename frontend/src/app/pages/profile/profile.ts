import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { ROLE_LABELS } from '../../core/labels';
import { Tenant } from '../../core/models';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { ThemeMode, ThemeService } from '../../core/theme.service';
import { LiveValue } from '../../shared/live-value';
import { PageHeader } from '../../shared/page-header';

const MIN_PASSWORD = 8;

@Component({
  selector: 'app-profile',
  imports: [ButtonModule, TextBoxModule, MessageModule, LiveValue, PageHeader],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  protected readonly auth = inject(AuthStore);
  protected readonly theme = inject(ThemeService);

  protected readonly user = this.auth.user;
  protected readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });
  protected readonly initials = computed(() =>
    (this.user()?.full_name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );

  private readonly tenants = httpResource<Tenant[]>(() => (this.user()?.tenant_id ? '/api/v1/tenants' : undefined), {
    defaultValue: [],
  });
  protected readonly tenantName = computed(() => {
    const id = this.user()?.tenant_id;
    if (!id) return 'ส่วนกลาง (ทุกกลุ่มลูกค้า)';
    return this.tenants.value().find((t) => t.id === id)?.name ?? '—';
  });

  protected readonly themeOptions: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'light', label: 'สว่าง', icon: 'e-icons e-brightness' },
    { mode: 'dark', label: 'มืด', icon: 'e-icons e-contrast' },
    { mode: 'system', label: 'ตามระบบ', icon: 'e-icons e-settings' },
  ];

  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly newTooShort = computed(() => !!this.newPassword() && this.newPassword().length < MIN_PASSWORD);
  protected readonly mismatch = computed(() => !!this.confirmPassword() && this.confirmPassword() !== this.newPassword());
  protected readonly canSubmit = computed(
    () =>
      !!this.currentPassword() &&
      this.newPassword().length >= MIN_PASSWORD &&
      this.confirmPassword() === this.newPassword() &&
      !this.saving(),
  );

  protected async changePassword(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.changePassword(this.currentPassword(), this.newPassword());
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.notify.success('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
