import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, model, output, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { SelectedEventArgs, UploaderModule } from '@syncfusion/ej2-angular-inputs';
import { StepperModule } from '@syncfusion/ej2-angular-navigations';
import { DialogModule } from '@syncfusion/ej2-angular-popups';
import { ApiService } from '../../core/api.service';
import { ImportResult } from '../../core/models';
import { NotifyService, errorMessage } from '../../core/notify.service';
import { DIALOG_ANIMATION } from '../../shared/syncfusion';

const MAX_BYTES = 2 * 1024 * 1024;

/** Bulk check-in: pick a file, review the server's dry-run row by row, then commit all rows at once. */
@Component({
  selector: 'app-device-import',
  imports: [DecimalPipe, ButtonModule, DialogModule, UploaderModule, StepperModule],
  templateUrl: './device-import.html',
  styleUrl: './device-import.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceImport {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  readonly open = model(false);
  /** Emits how many devices were created. */
  readonly imported = output<number>();

  protected readonly animation = DIALOG_ANIMATION;
  protected readonly steps = [
    { label: 'เลือกไฟล์', iconCss: 'e-icons e-upload-1', readOnly: true },
    { label: 'ตรวจสอบ', iconCss: 'e-icons e-table-2', readOnly: true },
    { label: 'เสร็จสิ้น', iconCss: 'e-icons e-check', readOnly: true },
  ];
  protected readonly maxBytes = MAX_BYTES;

  protected readonly step = signal(0);
  protected readonly file = signal<File | null>(null);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly busy = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly errorsOnly = signal(false);

  protected readonly visibleRows = computed(() => {
    const rows = this.result()?.rows ?? [];
    return this.errorsOnly() ? rows.filter((r) => r.errors.length) : rows;
  });
  protected readonly canCommit = computed(() => {
    const r = this.result();
    return !!r && r.total > 0 && r.invalid === 0 && !this.busy();
  });

  protected onOpen(): void {
    this.reset();
  }

  protected close(): void {
    this.open.set(false);
  }

  protected reset(): void {
    this.step.set(0);
    this.file.set(null);
    this.result.set(null);
    this.uploadError.set(null);
    this.errorsOnly.set(false);
  }

  protected async downloadTemplate(): Promise<void> {
    try {
      const blob = await this.api.importTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'device-import-template.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      this.notify.error(err);
    }
  }

  protected onSelected(args: SelectedEventArgs): void {
    // We upload through ApiService (auth header, dry-run flag), not the uploader's own XHR.
    args.cancel = true;
    const raw = args.filesData?.[0]?.rawFile;
    if (!(raw instanceof File)) return;
    if (!/\.(xlsx|csv)$/i.test(raw.name)) {
      this.uploadError.set('รองรับเฉพาะไฟล์ .xlsx หรือ .csv');
      return;
    }
    if (raw.size > MAX_BYTES) {
      this.uploadError.set('ไฟล์ต้องมีขนาดไม่เกิน 2 MB');
      return;
    }
    void this.preview(raw);
  }

  private async preview(file: File): Promise<void> {
    this.file.set(file);
    this.uploadError.set(null);
    this.busy.set(true);
    try {
      const result = await this.api.importDevices(file, true);
      this.result.set(result);
      this.errorsOnly.set(result.invalid > 0);
      this.step.set(1);
    } catch (err) {
      this.uploadError.set(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async commit(): Promise<void> {
    const file = this.file();
    if (!file || !this.canCommit()) return;
    this.busy.set(true);
    try {
      const result = await this.api.importDevices(file, false);
      this.result.set(result);
      this.step.set(2);
      this.imported.emit(result.valid);
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
