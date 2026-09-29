import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Customer, Device, DeviceModel, Installation, Tenant, User } from './models';

const API = '/api/v1';

/** Mutations only; pages read through `httpResource` so results live in signals. */
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
    return this.post<void>('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
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
    return this.post<Device>('/inventory/transfer', { device_id: deviceId, target_tenant_id: targetTenantId, note });
  }
  returnDevice(deviceId: string, note?: string | null) {
    return this.post<Device>('/inventory/return', { device_id: deviceId, note });
  }
  sendRepair(deviceId: string, note?: string | null) {
    return this.post<Device>('/inventory/send-repair', { device_id: deviceId, note });
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
  deleteCustomer(id: string) {
    return this.delete<void>(`/customers/${id}`);
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
}
