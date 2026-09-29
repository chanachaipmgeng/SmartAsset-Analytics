import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { DeviceModel } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { PageHeader } from '../../shared/page-header';
import { DIALOG_ANIMATION, FORM_IMPORTS, GRID_DEFAULTS, GRID_IMPORTS, GRID_PROVIDERS } from '../../shared/syncfusion';

@Component({
  selector: 'app-device-models',
  imports: [...GRID_IMPORTS, ...FORM_IMPORTS, PageHeader],
  providers: [...GRID_PROVIDERS],
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
        <ejs-grid
          [dataSource]="models.value()"
          [allowPaging]="true"
          [allowSorting]="true"
          [pageSettings]="grid.pageSettings"
          [toolbar]="grid.toolbar"
          (rowSelected)="onRowSelected($event)"
          (rowDeselected)="selected.set(null)"
        >
          <e-columns>
            <e-column field="brand" headerText="ยี่ห้อ" width="140"></e-column>
            <e-column field="name" headerText="รุ่น" width="180"></e-column>
            <e-column field="device_type" headerText="ประเภท" width="150"></e-column>
            <e-column field="firmware_version" headerText="เฟิร์มแวร์" width="120"></e-column>
            <e-column field="description" headerText="รายละเอียด" width="260"></e-column>
          </e-columns>
        </ejs-grid>
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

  protected readonly grid = GRID_DEFAULTS;
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

  protected onRowSelected(event: { data: DeviceModel }): void {
    this.selected.set(event.data);
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
