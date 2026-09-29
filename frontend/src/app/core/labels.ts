import { DeviceStatus, Role, ServiceLevel, TransactionType } from './models';

export const STATUS_LABELS: Record<DeviceStatus, string> = {
  IN_STOCK: 'อยู่ในคลัง',
  CHECKED_OUT: 'เบิกออก',
  INSTALLED: 'ติดตั้งแล้ว',
  RETIRED: 'ปลดระวาง',
};

export const STATUS_COLORS: Record<DeviceStatus, string> = {
  IN_STOCK: '#16a34a',
  CHECKED_OUT: '#d97706',
  INSTALLED: '#2563eb',
  RETIRED: '#6b7280',
};

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
