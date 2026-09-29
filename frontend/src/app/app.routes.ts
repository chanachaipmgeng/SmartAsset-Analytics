import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { adminGuard, authGuard, guestGuard, superadminGuard } from './core/guards';

export function devicesMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments[0]?.path !== 'devices' || segments.length > 2) return null;
  return { consumed: segments, posParams: segments[1] ? { id: segments[1] } : {} };
}

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'เข้าสู่ระบบ',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'แดชบอร์ด',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        // One route for `/devices` and `/devices/:id` so opening a device keeps the list mounted.
        matcher: devicesMatcher,
        title: 'อุปกรณ์',
        loadComponent: () => import('./pages/devices/devices').then((m) => m.DevicesPage),
      },
      {
        path: 'scan',
        title: 'สถานีสแกน',
        loadComponent: () => import('./pages/scan/scan').then((m) => m.ScanPage),
      },
      {
        path: 'transactions',
        title: 'ความเคลื่อนไหวสต็อก',
        loadComponent: () => import('./pages/transactions/transactions').then((m) => m.TransactionsPage),
      },
      {
        path: 'customers',
        title: 'ลูกค้า',
        loadComponent: () => import('./pages/customers/customers').then((m) => m.CustomersPage),
      },
      {
        path: 'installations',
        title: 'จุดติดตั้ง',
        loadComponent: () => import('./pages/installations/installations').then((m) => m.InstallationsPage),
      },
      {
        path: 'admin/tenants',
        title: 'กลุ่มลูกค้า',
        canActivate: [superadminGuard],
        loadComponent: () => import('./pages/admin/tenants').then((m) => m.TenantsPage),
      },
      {
        path: 'admin/device-models',
        title: 'รุ่นอุปกรณ์',
        loadComponent: () => import('./pages/admin/device-models').then((m) => m.DeviceModelsPage),
      },
      {
        path: 'admin/suppliers',
        title: 'ผู้จำหน่าย / ผู้ซ่อม',
        loadComponent: () => import('./pages/admin/suppliers').then((m) => m.SuppliersPage),
      },
      {
        path: 'admin/users',
        title: 'ผู้ใช้งาน',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/users').then((m) => m.UsersPage),
      },
      {
        path: 'profile',
        title: 'โปรไฟล์',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
