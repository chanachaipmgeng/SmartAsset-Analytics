import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { DeviceModel } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ConfirmService } from '../../shared/confirm.service';
import { PageHeader } from '../../shared/page-header';
import { DataGrid, GridColumn } from '../../shared/data-grid';
import { DIALOG_ANIMATION, FORM_IMPORTS } from '../../shared/syncfusion';

const COLUMNS: GridColumn[] = [
  { field: 'brand', headerText: 'ยี่ห้อ', width: 140 },
  { field: 'name', headerText: 'รุ่น', width: 180 },
  { field: 'device_type', headerText: 'ประเภท', width: 150 },
  { field: 'firmware_version', headerText: 'เฟิร์มแวร์', width: 120 },
  { field: 'description', headerText: 'รายละเอียด', width: 260 },
];

@Component({
  selector: 'app-device-models',
  imports: [...FORM_IMPORTS, PageHeader, DataGrid],
  template: `
    <div class="page">
      <app-page-header
        title="รุ่นอุปกรณ์"
        [subtitle]="auth.isSuperadmin() ? 'ยี่ห้อ รุ่น และเวอร์ชันเฟิร์มแวร์ที่ใช้ร่วมกันทุกกลุ่มลูกค้า' : 'รุ่นอุปกรณ์จัดการโดยผู้ดูแลแพลตฟอร์มเท่านั้น'"
      >
        @if (auth.isSuperadmin()) {
          <button ejs-button [isPrimary]="true" iconCss="e-icons e-plus" (click)="openCreate()">เพิ่มรุ่น</button>
          <button ejs-button iconCss="e-icons e-edit" [disabled]="!selected()" (click)="openEdit()">แก้ไข</button>
          <button ejs-button cssClass="e-danger" iconCss="e-icons e-trash" [disabled]="!selected() || busy()" (click)="remove()">ลบ</button>
        }
      </app-page-header>
      <div class="panel">
        <app-data-grid
          [data]="models.value()"
          [columns]="columns"
          perspectiveKey="device-models"
          exportName="device-models"
          [loading]="models.isLoading()"
          [error]="models.error()"
          emptyTitle="ยังไม่มีรุ่นอุปกรณ์"
          (selectionChange)="onRowSelected($event)"
          (retry)="models.reload()"
        />

      </div>
    </div>

    <ejs-dialog
      [visible]="formOpen()"
      (close)="formOpen.set(false)"
      [header]="editingId() ? 'แก้ไขรุ่นอุปกรณ์' : 'เพิ่มรุ่นอุปกรณ์'"
      [isModal]="true"
      [showCloseIcon]="true"
      [animationSettings]="animation"
      width="560px"
      target="body"
    >
      <ng-template #content>
        <div class="form-grid">
          <div>
            <label>ยี่ห้อ *</label>
            <ejs-textbox [(value)]="brand" [liveValue]="brand"></ejs-textbox>
          </div>
          <div>
            <label>ชื่อรุ่น *</label>
            <ejs-textbox [(value)]="name" [liveValue]="name"></ejs-textbox>
          </div>
          <div>
            <label>ประเภท *</label>
            <ejs-textbox [(value)]="deviceType" [liveValue]="deviceType" placeholder="เช่น สแกนใบหน้า"></ejs-textbox>
          </div>
          <div>
            <label>เวอร์ชันเฟิร์มแวร์</label>
            <ejs-textbox [(value)]="firmware" [liveValue]="firmware"></ejs-textbox>
          </div>
          <div class="full">
            <label>รายละเอียด</label>
            <ejs-textarea [(value)]="description" [liveValue]="description" rows="2"></ejs-textarea>
          </div>
        </div>
      </ng-template>
      <ng-template #footerTemplate>
        <button ejs-button (click)="formOpen.set(false)">ยกเลิก</button>
        <button ejs-button [isPrimary]="true" [disabled]="!formValid() || busy()" (click)="save()">บันทึก</button>
      </ng-template>
    </ejs-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceModelsPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);

  protected readonly columns = COLUMNS;
  protected readonly animation = DIALOG_ANIMATION;
  protected readonly models = httpResource<DeviceModel[]>(() => '/api/v1/device-models', { defaultValue: [] });

  protected readonly selected = signal<DeviceModel | null>(null);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly brand = signal('');
  protected readonly name = signal('');
  protected readonly deviceType = signal('');
  protected readonly firmware = signal('');
  protected readonly description = signal('');
  protected readonly formValid = computed(
    () => !!this.brand().trim() && !!this.name().trim() && !!this.deviceType().trim(),
  );

  protected onRowSelected(row: DeviceModel | null): void {
    this.selected.set(row);
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.brand.set('');
    this.name.set('');
    this.deviceType.set('');
    this.firmware.set('');
    this.description.set('');
    this.formOpen.set(true);
  }

  protected openEdit(): void {
    const m = this.selected();
    if (!m) return;
    this.editingId.set(m.id);
    this.brand.set(m.brand);
    this.name.set(m.name);
    this.deviceType.set(m.device_type);
    this.firmware.set(m.firmware_version ?? '');
    this.description.set(m.description ?? '');
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    if (!this.formValid()) return;
    const body = {
      brand: this.brand().trim(),
      name: this.name().trim(),
      device_type: this.deviceType().trim(),
      firmware_version: this.firmware().trim() || null,
      description: this.description().trim() || null,
    };
    const id = this.editingId();
    await this.run(async () => {
      if (id) await this.api.updateDeviceModel(id, body);
      else await this.api.createDeviceModel(body);
      this.notify.success('บันทึกรุ่นอุปกรณ์แล้ว');
      this.formOpen.set(false);
    });
  }

  protected async remove(): Promise<void> {
    const m = this.selected();
    if (!m) return;
    const ok = await this.confirm.ask({
      title: 'ยืนยันการลบรุ่นอุปกรณ์',
      message: `ต้องการลบรุ่น "${m.brand} ${m.name}" ใช่หรือไม่`,
      okText: 'ลบ',
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      await this.api.deleteDeviceModel(m.id);
      this.notify.success('ลบรุ่นอุปกรณ์แล้ว');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.selected.set(null);
      this.models.reload();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
