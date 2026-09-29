export type Role = 'superadmin' | 'tenant_admin' | 'staff' | 'viewer';
export type DeviceStatus =
  | 'IN_STOCK'
  | 'CHECKED_OUT'
  | 'INSTALLED'
  | 'ON_LOAN'
  | 'UNDER_QC'
  | 'IN_REPAIR'
  | 'RETIRED';
export type TransactionType =
  | 'CHECK_IN'
  | 'TRANSFER'
  | 'CHECK_OUT'
  | 'INSTALL'
  | 'LOAN'
  | 'RETURN'
  | 'QC_PASS'
  | 'QC_FAIL'
  | 'SEND_REPAIR'
  | 'REPAIR_DONE'
  | 'RETIRE'
  | 'EDIT';
export type ServiceLevel = 'BASIC' | 'STANDARD' | 'PREMIUM';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  tenant_id: string | null;
  is_active: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface Tenant {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export interface DeviceModel {
  id: string;
  brand: string;
  name: string;
  device_type: string;
  firmware_version: string | null;
  description: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface Device {
  id: string;
  serial_number: string;
  mac_address: string | null;
  model_id: string;
  model_name: string;
  brand: string;
  tenant_id: string | null;
  tenant_name: string | null;
  status: DeviceStatus;
  purchase_date: string | null;
  cost: string | null;
  warranty_end: string | null;
  notes: string | null;
  loan_due_date: string | null;
  created_at: string;
}

export interface InventoryTransaction {
  id: string;
  device_id: string;
  serial_number: string;
  transaction_type: TransactionType;
  from_status: DeviceStatus | null;
  to_status: DeviceStatus;
  tenant_id: string | null;
  tenant_name: string | null;
  customer_name: string | null;
  supplier_name: string | null;
  user_name: string;
  note: string | null;
  occurred_at: string;
}

export interface Customer {
  id: string;
  tenant_id: string;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  service_level: ServiceLevel;
  is_active: boolean;
}

export interface Installation {
  id: string;
  device_id: string;
  serial_number: string;
  model_name: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  service_level: ServiceLevel;
  install_date: string;
  latitude: number;
  longitude: number;
  address: string | null;
  removed_at: string | null;
  distance_m: number | null;
}

export interface CountItem {
  key: string;
  label: string;
  count: number;
}

export interface ImportRow {
  row: number;
  serial_number: string | null;
  model: string | null;
  mac_address: string | null;
  purchase_date: string | null;
  cost: string | null;
  warranty_end: string | null;
  notes: string | null;
  tenant_code: string | null;
  errors: string[];
}

export interface ImportResult {
  total: number;
  valid: number;
  invalid: number;
  committed: boolean;
  rows: ImportRow[];
}

export interface ActivityDay {
  day: string;
  counts: Partial<Record<TransactionType, number>>;
  total: number;
}

export interface DashboardSummary {
  total_devices: number;
  by_status: CountItem[];
  by_model: CountItem[];
  warranty_expiring: Device[];
  installations: Installation[];
  activity_30d: ActivityDay[];
  recent_transactions: InventoryTransaction[];
  pending_qc: number;
  loan_overdue: Device[];
  repair_aging: AgedDevice[];
}

export interface AgedDevice {
  device: Device;
  since: string;
  days: number;
}
