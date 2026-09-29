import { Device } from './models';

export type DeviceActionId =
  | 'transfer'
  | 'checkout'
  | 'install'
  | 'loan'
  | 'return'
  | 'qc_pass'
  | 'qc_fail'
  | 'send_repair'
  | 'repair_done'
  | 'retire';

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
    id: 'loan',
    text: 'ให้ยืม',
    title: 'ให้ยืมอุปกรณ์',
    iconCss: 'e-icons e-clock',
    allowed: (d, p) => p.canWrite && d.status === 'IN_STOCK' && d.tenant_id !== null,
  },
  {
    id: 'return',
    text: 'รับคืน',
    title: 'รับคืนเพื่อตรวจสอบ (QC)',
    iconCss: 'e-icons e-import',
    allowed: (d, p) => p.canWrite && ['CHECKED_OUT', 'INSTALLED', 'ON_LOAN'].includes(d.status),
  },
  {
    id: 'qc_pass',
    text: 'QC ผ่าน',
    title: 'ผ่านการตรวจสอบ กลับเข้าคลัง',
    iconCss: 'e-icons e-check-box',
    allowed: (d, p) => p.canWrite && d.status === 'UNDER_QC',
  },
  {
    id: 'qc_fail',
    text: 'QC ไม่ผ่าน',
    title: 'ไม่ผ่านการตรวจสอบ ส่งซ่อม',
    iconCss: 'e-icons e-warning',
    allowed: (d, p) => p.canWrite && d.status === 'UNDER_QC',
  },
  {
    id: 'transfer',
    text: 'โอน',
    title: 'โอนอุปกรณ์ให้กลุ่มลูกค้า',
    iconCss: 'e-icons e-transform-right',
    allowed: (d, p) => p.isSuperadmin && d.status === 'IN_STOCK',
  },
  {
    id: 'send_repair',
    text: 'ส่งซ่อม',
    title: 'ส่งอุปกรณ์ซ่อม',
    iconCss: 'e-icons e-settings',
    allowed: (d, p) => p.canWrite && ['IN_STOCK', 'CHECKED_OUT', 'INSTALLED'].includes(d.status),
  },
  {
    id: 'repair_done',
    text: 'ซ่อมเสร็จ / QC',
    title: 'บันทึกผลซ่อมและ QC',
    iconCss: 'e-icons e-check',
    allowed: (d, p) => p.canWrite && d.status === 'IN_REPAIR',
  },
  {
    id: 'retire',
    text: 'ปลดระวาง',
    title: 'ปลดระวางอุปกรณ์',
    iconCss: 'e-icons e-close',
    danger: true,
    allowed: (d, p) => p.canWrite && ['IN_STOCK', 'IN_REPAIR', 'UNDER_QC'].includes(d.status),
  },
];

/** Actions the current user may run on `device` in its current status. */
export function availableActions(
  device: Device | null | undefined,
  perms: Permissions,
): DeviceAction[] {
  if (!device) return [];
  return RULES.filter((r) => r.allowed(device, perms)).map(({ allowed: _, ...action }) => action);
}

export function actionTitle(id: DeviceActionId): string {
  return RULES.find((r) => r.id === id)!.title;
}

/** Actions `POST /inventory/bulk` accepts, keyed by the UI action id (see backend/app/application/bulk.py). */
export const BULK_ACTIONS = {
  transfer: 'transfer',
  checkout: 'check_out',
  loan: 'loan',
  return: 'return',
  qc_pass: 'qc_pass',
  send_repair: 'send_repair',
  retire: 'retire',
} as const satisfies Partial<Record<DeviceActionId, string>>;

export type BulkActionId = keyof typeof BULK_ACTIONS;

export function isBulkAction(id: DeviceActionId): id is BulkActionId {
  return id in BULK_ACTIONS;
}

type StatusFields = Pick<Device, 'status' | 'tenant_id'>;

/** Bulk actions allowed for every one of `devices` (the intersection of each device's actions). */
export function commonBulkActions(
  devices: readonly StatusFields[],
  perms: Permissions,
): DeviceAction[] {
  if (!devices.length) return [];
  return RULES.filter(
    (r) => isBulkAction(r.id) && devices.every((d) => r.allowed(d as Device, perms)),
  ).map(({ allowed: _, ...action }) => action);
}
