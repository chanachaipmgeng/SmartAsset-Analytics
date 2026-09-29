import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import {
  AppBarModule,
  BreadcrumbItemModel,
  BreadcrumbModule,
  SidebarComponent,
  SidebarModule,
} from '@syncfusion/ej2-angular-navigations';
import { ToastComponent, ToastModule } from '@syncfusion/ej2-angular-notifications';
import { DropDownButtonModule, ItemModel, MenuEventArgs } from '@syncfusion/ej2-angular-splitbuttons';
import { filter, map } from 'rxjs';
import { AuthStore } from '../core/auth.store';
import { ROLE_LABELS } from '../core/labels';
import { NotifyService } from '../core/notify.service';
import { ThemeMode, ThemeService } from '../core/theme.service';
import { BackToTop } from '../shared/back-to-top';
import { CommandPalette, PaletteCommand } from '../shared/command-palette';

interface MenuItem {
  path: string;
  label: string;
  icon: string;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const DESKTOP_QUERY = '(min-width: 1024px)';
const SIDEBAR_KEY = 'inventory.sidebar-expanded';
const ACCOUNT_PAGES: MenuItem[] = [{ path: '/profile', label: 'โปรไฟล์', icon: 'e-icons e-user' }];

const THEME_ITEMS: { mode: ThemeMode; text: string }[] = [
  { mode: 'light', text: 'ธีมสว่าง' },
  { mode: 'dark', text: 'ธีมมืด' },
  { mode: 'system', text: 'ตามระบบ' },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    AppBarModule,
    BreadcrumbModule,
    SidebarModule,
    ButtonModule,
    DropDownButtonModule,
    ToastModule,
    BackToTop,
    CommandPalette,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly auth = inject(AuthStore);
  protected readonly theme = inject(ThemeService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly toast = viewChild.required<ToastComponent>('toast');
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly sidebar = viewChild.required(SidebarComponent);

  private readonly desktopQuery = matchMedia(DESKTOP_QUERY);
  protected readonly isDesktop = signal(this.desktopQuery.matches);
  /** Desktop: expanded vs docked to icons (remembered). Mobile: drawer open vs closed. */
  protected readonly sidebarOpen = signal(this.isDesktop() && localStorage.getItem(SIDEBAR_KEY) !== 'false');
  protected readonly docked = computed(() => this.isDesktop() && !this.sidebarOpen());

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly roleLabel = computed(() => {
    const role = this.auth.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  protected readonly initials = computed(() => {
    const name = this.auth.user()?.full_name.trim() ?? '';
    return name ? name.slice(0, 1).toUpperCase() : '?';
  });

  protected readonly menu = computed<MenuGroup[]>(() => {
    const settings: MenuItem[] = [];
    settings.push({ path: '/admin/device-models', label: 'รุ่นอุปกรณ์', icon: 'e-icons e-settings' });
    settings.push({ path: '/admin/suppliers', label: 'ผู้จำหน่าย / ผู้ซ่อม', icon: 'e-icons e-repeat' });
    if (this.auth.isSuperadmin()) {
      settings.push({ path: '/admin/tenants', label: 'กลุ่มลูกค้า', icon: 'e-icons e-grid-view' });
    }
    if (this.auth.isAdmin()) {
      settings.push({ path: '/admin/users', label: 'ผู้ใช้งาน', icon: 'e-icons e-user' });
    }
    return [
      {
        label: 'ภาพรวม',
        items: [
          { path: '/dashboard', label: 'แดชบอร์ด', icon: 'e-icons e-chart' },
          { path: '/reports', label: 'รายงาน', icon: 'e-icons e-table-2' },
        ],
      },
      {
        label: 'คลังอุปกรณ์',
        items: [
          { path: '/devices', label: 'อุปกรณ์', icon: 'e-icons e-box' },
          { path: '/scan', label: 'สถานีสแกน', icon: 'e-icons e-zoom-in' },
          { path: '/transactions', label: 'ความเคลื่อนไหวสต็อก', icon: 'e-icons e-changes-track' },
        ],
      },
      {
        label: 'ลูกค้าและจุดติดตั้ง',
        items: [
          { path: '/customers', label: 'ลูกค้า', icon: 'e-icons e-people' },
          { path: '/installations', label: 'จุดติดตั้ง / แผนที่', icon: 'e-icons e-location' },
        ],
      },
      { label: 'ตั้งค่า', items: settings },
    ];
  });

  protected readonly breadcrumb = computed<BreadcrumbItemModel[]>(() => {
    const path = this.url().split(/[?#]/)[0];
    const groups = [...this.menu(), { label: 'บัญชี', items: ACCOUNT_PAGES }];
    const home: BreadcrumbItemModel = { text: 'หน้าหลัก', iconCss: 'e-icons e-home', url: '/dashboard' };
    for (const group of groups) {
      const item = group.items.find((i) => path === i.path || path.startsWith(`${i.path}/`));
      if (item) return [home, { text: group.label }, { text: item.label, url: item.path }];
    }
    return [home];
  });

  protected readonly paletteOpen = signal(false);
  protected readonly toastAnimation = {
    show: { effect: 'SlideRightIn', duration: 260, easing: 'ease-out' },
    hide: { effect: 'FadeOut', duration: 180, easing: 'ease-in' },
  } as const;

  protected readonly commands = computed<PaletteCommand[]>(() => {
    const go = (path: string, queryParams?: Record<string, string>) => () =>
      this.router.navigate([path], { queryParams });
    const pages = [...this.menu().flatMap((g) => g.items), ...ACCOUNT_PAGES].map((item) => ({
      id: `nav:${item.path}`,
      label: item.label,
      group: 'ไปที่หน้า',
      icon: item.icon,
      keywords: item.path,
      run: go(item.path),
    }));
    const actions: PaletteCommand[] = [];
    if (this.auth.canWrite()) {
      actions.push(
        { id: 'new-device', label: 'รับอุปกรณ์เข้าคลัง', group: 'คำสั่งด่วน', icon: 'e-icons e-plus', keywords: 'check in new รับเข้า', run: go('/devices', { action: 'new' }) },
        { id: 'import', label: 'นำเข้าอุปกรณ์จาก Excel', group: 'คำสั่งด่วน', icon: 'e-icons e-upload-1', keywords: 'import excel csv', run: go('/devices', { action: 'import' }) },
      );
    }
    actions.push(
      { id: 'scan', label: 'เปิดสถานีสแกน', group: 'คำสั่งด่วน', icon: 'e-icons e-zoom-in', keywords: 'scan barcode qr สแกน', run: go('/scan') },
      {
        id: 'theme',
        label: this.theme.isDark() ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด',
        group: 'คำสั่งด่วน',
        icon: 'e-icons e-contrast',
        keywords: 'theme dark light ธีม',
        run: () => this.theme.toggle(),
      },
      { id: 'logout', label: 'ออกจากระบบ', group: 'คำสั่งด่วน', icon: 'e-icons e-export', keywords: 'logout sign out', run: () => this.auth.logout() },
    );
    return [...actions, ...pages];
  });

  protected readonly userMenu = computed<ItemModel[]>(() => {
    const user = this.auth.user();
    const mode = this.theme.mode();
    return [
      { text: user?.email ?? '', disabled: true },
      { separator: true },
      { id: 'profile', text: 'โปรไฟล์และรหัสผ่าน', iconCss: 'e-icons e-user' },
      { separator: true },
      ...THEME_ITEMS.map((t) => ({
        id: `theme:${t.mode}`,
        text: t.text,
        iconCss: mode === t.mode ? 'e-icons e-check' : 'e-icons',
      })),
      { separator: true },
      { id: 'logout', text: 'ออกจากระบบ', iconCss: 'e-icons e-export' },
    ];
  });

  constructor() {
    effect(() => this.notify.register(this.toast()));

    const destroyRef = inject(DestroyRef);
    const onMedia = (e: MediaQueryListEvent) => {
      this.isDesktop.set(e.matches);
      this.sidebarOpen.set(e.matches && localStorage.getItem(SIDEBAR_KEY) !== 'false');
    };
    this.desktopQuery.addEventListener('change', onMedia);
    destroyRef.onDestroy(() => this.desktopQuery.removeEventListener('change', onMedia));

    // Switching type/dock at runtime leaves the Syncfusion sidebar visually open,
    // so re-apply the open state once the new mode has been rendered.
    let lastDesktop = this.isDesktop();
    afterRenderEffect(() => {
      const desktop = this.isDesktop();
      if (desktop === lastDesktop) return;
      lastDesktop = desktop;
      if (untracked(this.sidebarOpen)) this.sidebar().show();
      else this.sidebar().hide();
    });

    // The mobile drawer overlays content, so close it after each navigation.
    effect(() => {
      this.url();
      if (!this.isDesktop()) this.sidebarOpen.set(false);
    });

    // Syncfusion charts, maps and dashboard layout only re-measure on window resize,
    // so forward content-area size changes (sidebar toggle, initial push margin) as one.
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
    const open = !this.sidebarOpen();
    this.sidebarOpen.set(open);
    if (this.isDesktop()) localStorage.setItem(SIDEBAR_KEY, String(open));
  }

  /** Keeps the signal in sync when Syncfusion closes the drawer itself (backdrop click). */
  protected onSidebarClose(): void {
    if (!this.isDesktop()) this.sidebarOpen.set(false);
  }

  protected onCrumb(args: { item: BreadcrumbItemModel }): void {
    if (args.item.url) this.router.navigateByUrl(args.item.url);
  }

  protected onUserMenu(args: MenuEventArgs): void {
    const id = args.item.id ?? '';
    if (id === 'profile') this.router.navigateByUrl('/profile');
    else if (id === 'logout') this.auth.logout();
    else if (id.startsWith('theme:')) this.theme.setMode(id.slice(6) as ThemeMode);
  }
}
