import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ToastComponent } from '@syncfusion/ej2-angular-notifications';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private toast: ToastComponent | null = null;

  register(toast: ToastComponent): void {
    this.toast = toast;
  }

  success(content: string): void {
    this.toast?.show({ title: 'สำเร็จ', content, cssClass: 'e-toast-success', icon: 'e-success toast-icons' });
  }

  error(err: unknown): void {
    this.toast?.show({
      title: 'เกิดข้อผิดพลาด',
      content: errorMessage(err),
      cssClass: 'e-toast-danger',
      icon: 'e-error toast-icons',
      timeOut: 6000,
    });
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    const detail = err.error?.detail;
    if (typeof detail === 'string') return detail;
    return `คำขอล้มเหลว (${err.status})`;
  }
  return err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}
