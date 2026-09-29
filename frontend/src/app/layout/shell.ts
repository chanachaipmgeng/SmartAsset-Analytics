import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { SidebarModule } from '@syncfusion/ej2-angular-navigations';
import { ToastComponent, ToastModule } from '@syncfusion/ej2-angular-notifications';
import { AuthStore } from '../core/auth.store';
import { ROLE_LABELS } from '../core/labels';
import { NotifyService } from '../core/notify.service';

interface MenuItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SidebarModule, ButtonModule, ToastModule],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly auth = inject(AuthStore);
  private readonly notify = inject(NotifyService);
  private readonly toast = viewChild.required<ToastComponent>('toast');
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');

  protected readonly sidebarOpen = signal(true);
  protected readonly roleLabel = computed(() => {
    const role = this.auth.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  protected readonly mainMenu: MenuItem[] = [
    { path: '/dashboard', label: 'แดชบอร์ด', icon: 'e-icons e-chart' },
    { path: '/devices', label: 'อุปกรณ์', icon: 'e-icons e-table' },
    { path: '/transactions', label: 'ความเคลื่อนไหวสต็อก', icon: 'e-icons e-changes-track' },
    { path: '/customers', label: 'ลูกค้า', icon: 'e-icons e-people' },
    { path: '/installations', label: 'จุดติดตั้ง / แผนที่', icon: 'e-icons e-location' },
  ];

  protected readonly adminMenu = computed<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (this.auth.isSuperadmin()) {
      items.push({ path: '/admin/tenants', label: 'กลุ่มลูกค้า', icon: 'e-icons e-grid-view' });
    }
    items.push({ path: '/admin/device-models', label: 'รุ่นอุปกรณ์', icon: 'e-icons e-settings' });
    if (this.auth.isAdmin()) {
      items.push({ path: '/admin/users', label: 'ผู้ใช้งาน', icon: 'e-icons e-user' });
    }
    return items;
  });

  constructor() {
    effect(() => this.notify.register(this.toast()));

    // Syncfusion charts, maps and dashboard layout only re-measure on window resize,
    // so forward content-area size changes (sidebar toggle, initial push margin) as one.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const observer = new ResizeObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
      });
      observer.observe(this.content().nativeElement);
      destroyRef.onDestroy(() => {
        clearTimeout(timer);
        observer.disconnect();
      });
    });
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }
}
