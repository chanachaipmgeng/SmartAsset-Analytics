import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ToastComponent } from '@syncfusion/ej2-angular-notifications';

type Tone = 'success' | 'error' | 'info' | 'warning';

const TOASTS: Record<Tone, { title: string; icon: string; timeOut: number }> = {
  success: { title: 'สำเร็จ', icon: 'e-icons e-check', timeOut: 3500 },
  error: { title: 'เกิดข้อผิดพลาด', icon: 'e-icons e-circle-close', timeOut: 6000 },
  info: { title: 'แจ้งให้ทราบ', icon: 'e-icons e-circle-info', timeOut: 4000 },
  warning: { title: 'โปรดตรวจสอบ', icon: 'e-icons e-warning', timeOut: 5000 },
};

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private toast: ToastComponent | null = null;

  register(toast: ToastComponent): void {
    this.toast = toast;
  }

  success(content: string): void {
    this.show('success', content);
  }

  info(content: string): void {
    this.show('info', content);
  }

  warning(content: string): void {
    this.show('warning', content);
  }

  error(err: unknown): void {
    this.show('error', errorMessage(err));
  }

  private show(tone: Tone, content: string): void {
    const t = TOASTS[tone];
    this.toast?.show({
      title: t.title,
      content,
      icon: t.icon,
      timeOut: t.timeOut,
      cssClass: `m3-toast m3-toast-${tone}`,
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
