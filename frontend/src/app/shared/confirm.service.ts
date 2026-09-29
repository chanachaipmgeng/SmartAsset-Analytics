import { Injectable } from '@angular/core';
import { DialogUtility } from '@syncfusion/ej2-angular-popups';

export interface ConfirmOptions {
  title: string;
  message: string;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Promise-based confirm on top of Syncfusion's DialogUtility: `if (await confirm.ask({...})) ...`. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      let confirmed = false;
      const dialog = DialogUtility.confirm({
        title: escapeHtml(options.title),
        content: `<div class="confirm-message">${escapeHtml(options.message)}</div>`,
        width: '420px',
        cssClass: 'confirm-dialog',
        showCloseIcon: true,
        closeOnEscape: true,
        position: { X: 'center', Y: 'center' },
        animationSettings: { effect: 'Zoom', duration: 180 },
        okButton: {
          text: options.okText ?? 'ยืนยัน',
          cssClass: options.danger ? 'e-danger' : 'e-primary',
          click: () => {
            confirmed = true;
            dialog.hide();
          },
        },
        cancelButton: { text: options.cancelText ?? 'ยกเลิก', click: () => dialog.hide() },
        close: () => resolve(confirmed),
      });
    });
  }
}
