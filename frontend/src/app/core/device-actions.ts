import { Device } from './models';

export type DeviceActionId = 'transfer' | 'checkout' | 'install' | 'return' | 'retire';

export interface DeviceAction {
  id: DeviceActionId;
  text: string;
  iconCss: string;
  /** Dialog title and success-toast prefix. */
  title: string;
  danger?: boolean;
}

interface Permissions {
  canWrite: boolean;
  isSuperadmin: boolean;
}

interface Rule extends DeviceAction {
  allowed(device: Device, perms: Permissions): boolean;
}

// Mirrors backend/app/domain/rules.py ALLOWED_TRANSITIONS plus the role checks in application/inventory.py.
const RULES: Rule[] = [
  {
    id: 'checkout',
    text: 'เบิกออก',
    title: 'เบิกอุปกรณ์ออก',
    iconCss: 'e-icons e-export',
    allowed: (d, p) => p.canWrite && d.status === 'IN_STOCK' && d.tenant_id !== null,
  },
  {
    id: 'install',
    text: 'ติดตั้ง',
    title: 'บันทึกการติดตั้ง',
    iconCss: 'e-icons e-location',
    allowed: (d, p) => p.canWrite && d.status === 'CHECKED_OUT',
  },
  {
    id: 'return',
    text: 'รับคืน',
    title: 'รับคืนเข้าคลัง',
    iconCss: 'e-icons e-import',
    allowed: (d, p) => p.canWrite && (d.status === 'CHECKED_OUT' || d.status === 'INSTALLED'),
  },
  {
    id: 'transfer',
    text: 'โอน',
    title: 'โอนอุปกรณ์ให้กลุ่มลูกค้า',
    iconCss: 'e-icons e-transform-right',
    allowed: (d, p) => p.isSuperadmin && d.status === 'IN_STOCK',
  },
  {
    id: 'retire',
    text: 'ปลดระวาง',
    title: 'ปลดระวางอุปกรณ์',
    iconCss: 'e-icons e-close',
    danger: true,
    allowed: (d, p) => p.canWrite && d.status === 'IN_STOCK',
  },
];

/** Actions the current user may run on `device` in its current status. */
export function availableActions(device: Device | null | undefined, perms: Permissions): DeviceAction[] {
  if (!device) return [];
  return RULES.filter((r) => r.allowed(device, perms)).map(({ allowed: _, ...action }) => action);
}

export function actionTitle(id: DeviceActionId): string {
  return RULES.find((r) => r.id === id)!.title;
}
