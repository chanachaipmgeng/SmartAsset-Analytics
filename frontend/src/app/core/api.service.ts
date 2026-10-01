import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  BulkResult,
  Customer,
  CustomerImportResult,
  Device,
  DeviceModel,
  Document,
  DocumentOwner,
  ImportResult,
  Installation,
  InstallationImportResult,
  InventoryTransaction,
  Photo,
  PhotoOwner,
  RepairOrder,
  Supplier,
  Tenant,
  User,
} from './models';

const API = '/api/v1';

/** Mutations and one-off reads (exports); pages read through `httpResource` so results live in signals. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(`${API}${path}`, body));
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(`${API}${path}`, body));
  }

  private delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(`${API}${path}`));
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.post<void>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  /** Every device matching the filters, e.g. to export all pages of the server-paged list. */
  listDevices(params: Record<string, string>) {
    return firstValueFrom(this.http.get<Device[]>(`${API}/devices`, { params }));
  }

  checkIn(body: Record<string, unknown>) {
    return this.post<Device>('/inventory/check-in', body);
  }
  updateDevice(id: string, body: Record<string, unknown>) {
    return this.patch<Device>(`/devices/${id}`, body);
  }
  checkOut(deviceId: string, note?: string | null) {
    return this.post<Device>('/inventory/check-out', { device_id: deviceId, note });
  }
  transfer(deviceId: string, targetTenantId: string | null, note?: string | null) {
    return this.post<Device>('/inventory/transfer', {
      device_id: deviceId,
      target_tenant_id: targetTenantId,
      note,
    });
  }
  returnDevice(deviceId: string, note?: string | null) {
    return this.post<Device>('/inventory/return', { device_id: deviceId, note });
  }
  loan(deviceId: string, dueDate: string, note?: string | null) {
    return this.post<Device>('/inventory/loan', { device_id: deviceId, due_date: dueDate, note });
  }
  qcPass(deviceId: string, note?: string | null) {
    return this.post<Device>('/inventory/qc-pass', { device_id: deviceId, note });
  }
  qcFail(deviceId: string, note: string) {
    return this.post<Device>('/inventory/qc-fail', { device_id: deviceId, note });
  }
  /** All-or-nothing; a 422 carries `failures` (serial + reason) when any device cannot move. */
  bulk(body: {
    action: string;
    device_ids: string[];
    note?: string | null;
    target_tenant_id?: string | null;
    supplier_id?: string | null;
    due_date?: string | null;
  }) {
    return this.post<BulkResult>('/inventory/bulk', body);
  }
  importDevices(file: File, dryRun: boolean) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.post<ImportResult>(`/inventory/import?dry_run=${dryRun}`, form);
  }
  importTemplate() {
    return firstValueFrom(
      this.http.get(`${API}/inventory/import/template`, { responseType: 'blob' }),
    );
  }
  importCustomers(file: File, dryRun: boolean) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.post<CustomerImportResult>(`/customers/import?dry_run=${dryRun}`, form);
  }
  customerImportTemplate() {
    return firstValueFrom(
      this.http.get(`${API}/customers/import/template`, { responseType: 'blob' }),
    );
  }
  importInstallations(file: File, dryRun: boolean) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.post<InstallationImportResult>(`/installations/import?dry_run=${dryRun}`, form);
  }
  installationImportTemplate() {
    return firstValueFrom(
      this.http.get(`${API}/installations/import/template`, { responseType: 'blob' }),
    );
  }

  listRepairOrders(params: Record<string, string>) {
    return firstValueFrom(this.http.get<RepairOrder[]>(`${API}/repair-orders`, { params }));
  }
  updateRepairOrder(id: string, body: Record<string, unknown>) {
    return this.patch<RepairOrder>(`/repair-orders/${id}`, body);
  }
  cancelRepairOrder(id: string) {
    return this.post<RepairOrder>(`/repair-orders/${id}/cancel`, {});
  }

  uploadDocument(ownerType: DocumentOwner, ownerId: string, file: File, caption?: string | null) {
    const form = new FormData();
    form.append('owner_type', ownerType);
    form.append('owner_id', ownerId);
    if (caption) form.append('caption', caption);
    form.append('file', file, file.name);
    return this.post<Document>(`/documents`, form);
  }
  deleteDocument(id: string) {
    return this.delete<void>(`/documents/${id}`);
  }

  sendRepair(deviceId: string, note?: string | null, supplierId?: string | null) {
    return this.post<Device>('/inventory/send-repair', {
      device_id: deviceId,
      note,
      supplier_id: supplierId,
    });
  }
  repairDone(deviceId: string, qcNote: string) {
    return this.post<Device>('/inventory/repair-done', { device_id: deviceId, qc_note: qcNote });
  }
  retireDevice(deviceId: string, note?: string | null) {
    const query = note ? `?note=${encodeURIComponent(note)}` : '';
    return this.delete<Device>(`/devices/${deviceId}${query}`);
  }

  createCustomer(body: Record<string, unknown>) {
    return this.post<Customer>('/customers', body);
  }
  updateCustomer(id: string, body: Record<string, unknown>) {
    return this.patch<Customer>(`/customers/${id}`, body);
  }
  setCustomerActive(id: string, active: boolean) {
    return active
      ? this.patch<Customer>(`/customers/${id}`, { is_active: true })
      : this.delete<Customer>(`/customers/${id}`);
  }

  install(body: Record<string, unknown>) {
    return this.post<Installation>('/installations', body);
  }
  updateInstallation(id: string, body: Record<string, unknown>) {
    return this.patch<Installation>(`/installations/${id}`, body);
  }

  createTenant(body: Record<string, unknown>) {
    return this.post<Tenant>('/tenants', body);
  }
  updateTenant(id: string, body: Record<string, unknown>) {
    return this.patch<Tenant>(`/tenants/${id}`, body);
  }

  createUser(body: Record<string, unknown>) {
    return this.post<User>('/users', body);
  }
  updateUser(id: string, body: Record<string, unknown>) {
    return this.patch<User>(`/users/${id}`, body);
  }

  createDeviceModel(body: Record<string, unknown>) {
    return this.post<DeviceModel>('/device-models', body);
  }
  updateDeviceModel(id: string, body: Record<string, unknown>) {
    return this.patch<DeviceModel>(`/device-models/${id}`, body);
  }
  deleteDeviceModel(id: string) {
    return this.delete<void>(`/device-models/${id}`);
  }

  createSupplier(body: Record<string, unknown>) {
    return this.post<Supplier>('/suppliers', body);
  }
  updateSupplier(id: string, body: Record<string, unknown>) {
    return this.patch<Supplier>(`/suppliers/${id}`, body);
  }
  deleteSupplier(id: string) {
    return this.delete<void>(`/suppliers/${id}`);
  }

  latestTransaction(deviceId: string) {
    return firstValueFrom(
      this.http.get<InventoryTransaction[]>(`${API}/inventory/transactions`, {
        params: { device_id: deviceId, limit: 1 },
      }),
    ).then((rows) => rows[0] ?? null);
  }

  uploadPhoto(ownerType: PhotoOwner, ownerId: string, file: File, caption?: string | null) {
    const form = new FormData();
    form.append('owner_type', ownerType);
    form.append('owner_id', ownerId);
    if (caption) form.append('caption', caption);
    form.append('file', file, file.name);
    return this.post<Photo>('/photos', form);
  }
  /** Sequential; files before a failing one stay saved. */
  async uploadPhotos(ownerType: PhotoOwner, ownerId: string, files: File[]): Promise<number> {
    let saved = 0;
    for (const file of files) {
      await this.uploadPhoto(ownerType, ownerId, file);
      saved++;
    }
    return saved;
  }
  deletePhoto(id: string) {
    return this.delete<void>(`/photos/${id}`);
  }
}
