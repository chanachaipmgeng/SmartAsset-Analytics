import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { Tenant } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { PageHeader } from '../../shared/page-header';
import { DataGrid, GridCell, GridColumn } from '../../shared/data-grid';
import { DIALOG_ANIMATION, FORM_IMPORTS } from '../../shared/syncfusion';

const COLUMNS: GridColumn[] = [
  { field: 'code', headerText: 'รหัส', width: 140 },
  { field: 'name', headerText: 'ชื่อกลุ่มลูกค้า', width: 300 },
  { field: 'active_label', headerText: 'สถานะ', width: 120 },
];

@Component({
  selector: 'app-tenants',
  imports: [...FORM_IMPORTS, PageHeader, DataGrid, GridCell],
  template: `
    <div class="page">
      <app-page-header title="กลุ่มลูกค้า" subtitle="องค์กรที่ใช้ระบบ แต่ละกลุ่มเห็นเฉพาะอุปกรณ์และข้อมูลของตนเอง">
        <button ejs-button [isPrimary]="true" iconCss="e-icons e-plus" (click)="openCreate()">เพิ่มกลุ่มลูกค้า</button>
        <button ejs-button iconCss="e-icons e-edit" [disabled]="!selected()" (click)="openEdit()">แก้ไข</button>
      </app-page-header>
      <div class="panel">
        <app-data-grid
          [data]="rows()"
          [columns]="columns"
          perspectiveKey="tenants"
          exportName="tenants"
          [loading]="tenants.isLoading()"
          [error]="tenants.error()"
          emptyTitle="ยังไม่มีกลุ่มลูกค้า"
          (selectionChange)="onRowSelected($event)"
          (rowDoubleClick)="onRowSelected($event); openEdit()"
          (retry)="tenants.reload()"
        >
          <ng-template gridCell="active_label" let-row>
            <span class="tone-chip" [attr.data-tone]="row.is_active ? 'success' : null">{{ row.active_label }}</span>
          </ng-template>
        </app-data-grid>
      </div>
    </div>

    <ejs-dialog
      [visible]="formOpen()"
      (close)="formOpen.set(false)"
      [header]="editingId() ? 'แก้ไขกลุ่มลูกค้า' : 'เพิ่มกลุ่มลูกค้า'"
      [isModal]="true"
      [showCloseIcon]="true"
      [animationSettings]="animation"
      width="480px"
      target="body"
    >
      <ng-template #content>
        <div class="form-grid">
          <div class="full">
            <label>ชื่อกลุ่มลูกค้า *</label>
            <ejs-textbox [(value)]="name" [liveValue]="name"></ejs-textbox>
          </div>
          <div class="full">
            <label>รหัส (A-Z, 0-9) *</label>
            <ejs-textbox [(value)]="code" [liveValue]="code"></ejs-textbox>
          </div>
          @if (editingId()) {
            <div class="full">
              <ejs-checkbox label="เปิดใช้งาน" [(checked)]="isActive"></ejs-checkbox>
            </div>
          }
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
export class TenantsPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly columns = COLUMNS;
  protected readonly animation = DIALOG_ANIMATION;
  protected readonly tenants = httpResource<Tenant[]>(() => '/api/v1/tenants', { defaultValue: [] });
  protected readonly rows = computed(() =>
    this.tenants.value().map((t) => ({ ...t, active_label: t.is_active ? 'ใช้งาน' : 'ระงับ' })),
  );

  protected readonly selected = signal<Tenant | null>(null);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly code = signal('');
  protected readonly isActive = signal(true);
  protected readonly formValid = computed(
    () => !!this.name().trim() && /^[A-Za-z0-9_-]{2,20}$/.test(this.code().trim()),
  );

  protected onRowSelected(row: { id: string } | null): void {
    this.selected.set(row ? (this.tenants.value().find((t) => t.id === row.id) ?? null) : null);
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.name.set('');
    this.code.set('');
    this.isActive.set(true);
    this.formOpen.set(true);
  }

  protected openEdit(): void {
    const t = this.selected();
    if (!t) return;
    this.editingId.set(t.id);
    this.name.set(t.name);
    this.code.set(t.code);
    this.isActive.set(t.is_active);
    this.formOpen.set(true);
  }

  protected async save(): Promise<void> {
    if (!this.formValid()) return;
    this.busy.set(true);
    try {
      const id = this.editingId();
      const body = { name: this.name().trim(), code: this.code().trim() };
      if (id) await this.api.updateTenant(id, { ...body, is_active: this.isActive() });
      else await this.api.createTenant(body);
      this.notify.success('บันทึกกลุ่มลูกค้าแล้ว');
      this.formOpen.set(false);
      this.selected.set(null);
      this.tenants.reload();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
