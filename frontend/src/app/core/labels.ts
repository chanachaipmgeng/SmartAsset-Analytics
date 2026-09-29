import { cssColor } from './theme.service';
import { DeviceStatus, Role, ServiceLevel, TransactionType } from './models';

export const STATUS_LABELS: Record<DeviceStatus, string> = {
  IN_STOCK: 'อยู่ในคลัง',
  CHECKED_OUT: 'เบิกออก',
  INSTALLED: 'ติดตั้งแล้ว',
  ON_LOAN: 'ยืม',
  UNDER_QC: 'รอตรวจสอบ (QC)',
  IN_REPAIR: 'ส่งซ่อม',
  RETIRED: 'ปลดระวาง',
};

export type StatusTone = 'success' | 'warning' | 'info' | 'error' | 'neutral' | 'primary' | 'tertiary';

export const STATUS_TONES: Record<DeviceStatus, StatusTone> = {
  IN_STOCK: 'success',
  CHECKED_OUT: 'warning',
  INSTALLED: 'info',
  ON_LOAN: 'tertiary',
  UNDER_QC: 'primary',
  // Not `warning`: that is already CHECKED_OUT, and the status donut needs distinct colours.
  IN_REPAIR: 'error',
  RETIRED: 'neutral',
};

const TONE_TOKENS: Record<StatusTone, string> = {
  success: '--color-sf-success',
  warning: '--color-sf-warning',
  info: '--color-sf-info',
  error: '--color-sf-error',
  neutral: '--color-sf-outline',
  primary: '--color-sf-primary',
  tertiary: '--color-sf-tertiary',
};

/** Concrete colour for charts; call again after a theme change. */
export function statusColor(status: DeviceStatus): string {
  return cssColor(TONE_TOKENS[STATUS_TONES[status]]);
}

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'ผู้ดูแลแพลตฟอร์ม',
  tenant_admin: 'ผู้ดูแลกลุ่มลูกค้า',
  staff: 'เจ้าหน้าที่',
  viewer: 'ผู้ดูข้อมูล',
};

export const TX_LABELS: Record<TransactionType, string> = {
  CHECK_IN: 'รับเข้า',
  TRANSFER: 'โอนย้าย',
  CHECK_OUT: 'เบิกออก',
  INSTALL: 'ติดตั้ง',
  LOAN: 'ให้ยืม',
  RETURN: 'รับคืน',
  QC_PASS: 'QC ผ่าน',
  QC_FAIL: 'QC ไม่ผ่าน',
  SEND_REPAIR: 'ส่งซ่อม',
  REPAIR_DONE: 'ซ่อมเสร็จ (QC ผ่าน)',
  RETIRE: 'ปลดระวาง',
  EDIT: 'แก้ไขข้อมูล',
};

export const TX_ICONS: Record<TransactionType, string> = {
  CHECK_IN: 'e-icons e-import',
  TRANSFER: 'e-icons e-transform-right',
  CHECK_OUT: 'e-icons e-export',
  INSTALL: 'e-icons e-location',
  LOAN: 'e-icons e-clock',
  RETURN: 'e-icons e-undo',
  QC_PASS: 'e-icons e-check-box',
  QC_FAIL: 'e-icons e-warning',
  SEND_REPAIR: 'e-icons e-settings',
  REPAIR_DONE: 'e-icons e-check',
  RETIRE: 'e-icons e-close',
  EDIT: 'e-icons e-edit',
};

export const TX_TONES: Record<TransactionType, StatusTone> = {
  CHECK_IN: 'success',
  TRANSFER: 'info',
  CHECK_OUT: 'warning',
  INSTALL: 'info',
  LOAN: 'tertiary',
  RETURN: 'primary',
  QC_PASS: 'success',
  QC_FAIL: 'error',
  SEND_REPAIR: 'error',
  REPAIR_DONE: 'success',
  RETIRE: 'neutral',
  EDIT: 'neutral',
};

const RELATIVE = new Intl.RelativeTimeFormat('th', { numeric: 'auto' });
const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Infinity],
];

/** "3 ชั่วโมงที่ผ่านมา" style text for an ISO timestamp. */
export function relativeTime(iso: string, now = Date.now()): string {
  let value = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) return RELATIVE.format(Math.round(value), unit);
    value /= size;
  }
  return '';
}

export const SERVICE_LEVEL_LABELS: Record<ServiceLevel, string> = {
  BASIC: 'พื้นฐาน',
  STANDARD: 'มาตรฐาน',
  PREMIUM: 'พรีเมียม',
};

export function toOptions<K extends string>(labels: Record<K, string>): { value: K; text: string }[] {
  return (Object.keys(labels) as K[]).map((value) => ({ value, text: labels[value] }));
}

/** Syncfusion date columns need Date objects; API sends ISO strings. */
export function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : null;
}

export function toIsoDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
