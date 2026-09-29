import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';

/** Failed-load placeholder with a retry button; use `app-empty-state` for "no data yet". */
@Component({
  selector: 'app-error-state',
  imports: [ButtonModule],
  template: `
    <div
      class="flex animate-fade-up flex-col items-center justify-center gap-2 px-4 py-10 text-center"
      role="alert"
    >
      <div
        class="grid size-14 place-items-center rounded-full bg-error-container text-2xl text-on-error-container"
      >
        <span class="e-icons e-warning"></span>
      </div>
      <p class="m-0 mt-2 text-base font-semibold text-on-surface">{{ title() }}</p>
      <p class="m-0 max-w-md text-sm text-on-surface-variant">{{ message() }}</p>
      <button
        ejs-button
        cssClass="e-outline mt-3"
        iconCss="e-icons e-refresh"
        (click)="retry.emit()"
      >
        ลองอีกครั้ง
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorState {
  readonly title = input('โหลดข้อมูลไม่สำเร็จ');
  readonly message = input('ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง');
  readonly retry = output<void>();
}
