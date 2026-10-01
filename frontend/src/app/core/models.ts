export type Role = 'superadmin' | 'tenant_admin' | 'staff' | 'viewer';
export type DeviceStatus =
  'IN_STOCK' | 'CHECKED_OUT' | 'INSTALLED' | 'ON_LOAN' | 'UNDER_QC' | 'IN_REPAIR' | 'RETIRED';
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
export type PhotoOwner = 'device' | 'installation' | 'transaction' | 'user' | 'device_model';
export type DocumentOwner = 'device' | 'customer' | 'repair_order';
export type RepairOrderStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type RiskLevel = 'low' | 'medium' | 'high';
export type AuditEntity =
  'tenant' | 'user' | 'device_model' | 'supplier' | 'customer' | 'installation' | 'photo' | 'document';
export type AuditAction = 'create' | 'update' | 'delete' | 'deactivate';

export interface AuditEntry {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  user_id: string;
  user_name: string;
  entity_type: AuditEntity;
  entity_id: string;
  entity_label: string | null;
  action: AuditAction;
  /** field -> [old, new]; secrets appear as the string "changed" instead of a pair. */
  changes: Record<string, [unknown, unknown] | string>;
  occurred_at: string;
}

export interface Photo {
  id: string;
  owner_type: PhotoOwner;
  owner_id: string;
  caption: string | null;
  width: number;
  height: number;
  size_bytes: number;
  uploaded_by: string;
  created_at: string | null;
  /** Signed, same-origin paths usable in <img> without the bearer token. */
  url: string;
  thumb_url: string;
}

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
  asset_tag: string | null;
  firmware_version: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
}

export interface BulkResult {
  count: number;
  items: { device: Device; transaction_id: string }[];
}

export interface BulkFailure {
  device_id: string;
  serial_number: string;
  reason: string;
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
  customer_id: string | null;
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
  address: string | null;
  tax_id: string | null;
  notes: string | null;
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
  site_contact: string | null;
  site_phone: string | null;
  notes: string | null;
  removal_reason: string | null;
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
  asset_tag: string | null;
  firmware_version: string | null;
  supplier: string | null;
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

export interface DeviceRisk {
  device: Device;
  score: number;
  level: RiskLevel;
  factors: string[];
}

export interface RepairRateRow {
  model_id: string;
  brand: string;
  model_name: string;
  device_count: number;
  repair_events: number;
  rate: number;
}

export interface StockForecastRow {
  model_id: string;
  brand: string;
  model_name: string;
  in_stock: number;
  outflow_events: number;
  avg_per_month: number;
  months_of_stock: number | null;
}

export interface IssueGroup {
  category: string;
  count: number;
  sample_notes: string[];
}

export interface WarrantyRow {
  device: Device;
  days_remaining: number;
}

export interface RepairTatRow {
  supplier_name: string;
  count: number;
  avg_days: number;
  min_days: number;
  max_days: number;
}

export interface MonthlyMovementRow {
  month: string;
  counts: Partial<Record<TransactionType, number>>;
  total: number;
}

export interface FirmwareDriftRow {
  device: Device;
  model_firmware: string;
  device_firmware: string;
}

export interface DepreciationRow {
  device: Device;
  cost: string;
  purchase_date: string;
  age_years: number;
  book_value: string;
  useful_years: number;
}

export interface RepairOrder {
  id: string;
  tenant_id: string | null;
  device_id: string;
  serial_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  opened_by: string;
  opened_by_name: string;
  opened_tx_id: string | null;
  closed_tx_id: string | null;
  status: RepairOrderStatus;
  defect_note: string;
  parts: string | null;
  labor_cost: string | null;
  parts_cost: string | null;
  due_date: string | null;
  assignee_name: string | null;
  closed_at: string | null;
  qc_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  owner_type: DocumentOwner;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  caption: string | null;
  uploaded_by: string;
  created_at: string | null;
  /** Signed, same-origin path usable without the bearer token. */
  url: string;
}

export interface CustomerImportRow {
  row: number;
  company_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  service_level: ServiceLevel | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
  tenant_code: string | null;
  errors: string[];
}

export interface CustomerImportResult {
  total: number;
  valid: number;
  invalid: number;
  committed: boolean;
  rows: CustomerImportRow[];
}

export interface InstallationImportRow {
  row: number;
  serial_number: string | null;
  customer: string | null;
  install_date: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  site_contact: string | null;
  site_phone: string | null;
  notes: string | null;
  errors: string[];
}

export interface InstallationImportResult {
  total: number;
  valid: number;
  invalid: number;
  committed: boolean;
  rows: InstallationImportRow[];
}
