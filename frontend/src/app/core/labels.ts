import { cssColor } from './theme.service';
import { DeviceStatus, Role, ServiceLevel, TransactionType } from './models';

export const STATUS_LABELS: Record<DeviceStatus, string> = {
  IN_STOCK: 'อยู่ในคลัง',
  CHECKED_OUT: 'เบิกออก',
  INSTALLED: 'ติดตั้งแล้ว',
  RETIRED: 'ปลดระวาง',
};

export type StatusTone = 'success' | 'warning' | 'info' | 'neutral';

export const STATUS_TONES: Record<DeviceStatus, StatusTone> = {
  IN_STOCK: 'success',
  CHECKED_OUT: 'warning',
  INSTALLED: 'info',
  RETIRED: 'neutral',
};

const TONE_TOKENS: Record<StatusTone, string> = {
  success: '--color-sf-success',
  warning: '--color-sf-warning',
  info: '--color-sf-info',
  neutral: '--color-sf-outline',
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
  RETURN: 'รับคืน',
  RETIRE: 'ปลดระวาง',
};

export const TX_ICONS: Record<TransactionType, string> = {
  CHECK_IN: 'e-icons e-import',
  TRANSFER: 'e-icons e-transform-right',
  CHECK_OUT: 'e-icons e-export',
  INSTALL: 'e-icons e-location',
  RETURN: 'e-icons e-undo',
  RETIRE: 'e-icons e-close',
};

export const TX_TONES: Record<TransactionType, StatusTone> = {
  CHECK_IN: 'success',
  TRANSFER: 'info',
  CHECK_OUT: 'warning',
  INSTALL: 'info',
  RETURN: 'success',
  RETIRE: 'neutral',
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
