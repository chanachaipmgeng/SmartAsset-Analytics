import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { Supplier } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { AuditHistory } from '../../shared/audit-history';
import { ConfirmService } from '../../shared/confirm.service';
import { PageHeader } from '../../shared/page-header';
import { DataGrid, GridColumn, GridRowAction, GridRowActionId } from '../../shared/data-grid';
import { RecordField, RecordView } from '../../shared/record-view';
import { DIALOG_ANIMATION, FORM_IMPORTS } from '../../shared/syncfusion';

const WIDE = '(min-width: 768px)';

const COLUMNS: GridColumn[] = [
  { field: 'name', headerText: 'ชื่อผู้จำหน่าย / ผู้ซ่อม', width: 220 },
  { field: 'contact_person', headerText: 'ผู้ติดต่อ', width: 150 },
  { field: 'phone', headerText: 'โทรศัพท์', width: 130 },
  { field: 'email', headerText: 'อีเมล', width: 200, hideAtMedia: WIDE },
  { field: 'notes', headerText: 'หมายเหตุ', width: 240, hideAtMedia: WIDE },
];

@Component({
  selector: 'app-suppliers',
  imports: [...FORM_IMPORTS, PageHeader, DataGrid, RecordView, AuditHistory],
  template: `
    <div class="page">
      <app-page-header
        title="ผู้จำหน่าย / ผู้ซ่อม"
        [subtitle]="auth.isSuperadmin() ? 'รายชื่อร้านซ่อมและผู้จำหน่ายที่ใช้ร่วมกันทุกกลุ่มลูกค้า เลือกได้ตอนส่งซ่อม' : 'รายชื่อจัดการโดยผู้ดูแลแพลตฟอร์ม เลือกได้ตอนส่งซ่อม'"
      >
        @if (auth.isSuperadmin()) {
          <button ejs-button [isPrimary]="true" iconCss="e-icons e-plus" (click)="openCreate()">เพิ่มผู้จำหน่าย</button>
          <button ejs-button iconCss="e-icons e-edit" [disabled]="!selected()" (click)="openEdit()">แก้ไข</button>
          <button ejs-button cssClass="e-danger" iconCss="e-icons e-trash" [disabled]="!selected() || busy()" (click)="remove()">ลบ</button>
        }
      </app-page-header>
      <div class="panel">
        <app-data-grid
          [data]="suppliers.value()"
          [columns]="columns"
          perspectiveKey="suppliers"
          exportName="suppliers"
          [loading]="suppliers.isLoading()"
          [error]="suppliers.error()"
          emptyTitle="ยังไม่มีผู้จำหน่าย / ผู้ซ่อม"
          (selectionChange)="selected.set($event)"
          [rowActions]="rowActions()"
          (rowAction)="onRowAction($event)"
          (retry)="suppliers.reload()"
        />
      </div>
    </div>

    <app-record-view
      [(open)]="viewOpen"
      [header]="selected()?.name ?? 'ผู้จำหน่าย / ผู้ซ่อม'"
      [fields]="viewFields()"
      [editable]="auth.isSuperadmin()"
      (edit)="openEdit()"
    >
      <app-audit-history entityType="supplier" [entityId]="selected()?.id" [active]="viewOpen()" />
    </app-record-view>

    <ejs-dialog
      [visible]="formOpen()"
      (close)="formOpen.set(false)"
      [header]="editingId() ? 'แก้ไขผู้จำหน่าย / ผู้ซ่อม' : 'เพิ่มผู้จำหน่าย / ผู้ซ่อม'"
      [isModal]="true"
      [showCloseIcon]="true"
      [animationSettings]="animation"
      width="560px"
      target="body"
    >
      <ng-template #content>
        <div class="form-grid">
          <div class="full">
            <label>ชื่อ *</label>
            <ejs-textbox [(value)]="name" [liveValue]="name" placeholder="เช่น ศูนย์บริการ ZKTeco"></ejs-textbox>
          </div>
          <div>
            <label>ผู้ติดต่อ</label>
            <ejs-textbox [(value)]="contact" [liveValue]="contact"></ejs-textbox>
          </div>
          <div>
            <label>โทรศัพท์</label>
            <ejs-textbox [(value)]="phone" [liveValue]="phone"></ejs-textbox>
          </div>
          <div class="full">
            <label>อีเมล</label>
            <ejs-textbox type="email" [(value)]="email" [liveValue]="email"></ejs-textbox>
          </div>
          <div class="full">
            <label>หมายเหตุ</label>
            <ejs-textarea [(value)]="notes" [liveValue]="notes" rows="2" placeholder="เช่น รับซ่อมเฉพาะ ZKTeco, ระยะเวลาซ่อมโดยประมาณ"></ejs-textarea>
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
export class SuppliersPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);

  protected readonly columns = COLUMNS;
  protected readonly animation = DIALOG_ANIMATION;
  protected readonly suppliers = httpResource<Supplier[]>(() => '/api/v1/suppliers', { defaultValue: [] });

  protected readonly selected = signal<Supplier | null>(null);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly contact = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly notes = signal('');
  protected readonly formValid = computed(() => {
    const email = this.email().trim();
    return !!this.name().trim() && (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  });

  protected readonly rowActions = computed<GridRowActionId[]>(() =>
    this.auth.isSuperadmin() ? ['view', 'edit'] : ['view'],
  );
  protected readonly viewOpen = signal(false);
  protected readonly viewFields = computed<RecordField[]>(() => {
    const s = this.selected();
    if (!s) return [];
    return [
      { label: 'ชื่อ', value: s.name, wide: true },
      { label: 'ผู้ติดต่อ', value: s.contact_person },
      { label: 'โทรศัพท์', value: s.phone },
      { label: 'อีเมล', value: s.email, wide: true },
      { label: 'หมายเหตุ', value: s.notes, wide: true },
    ];
  });

  protected onRowAction({ action, row }: GridRowAction<Supplier>): void {
    this.selected.set(row);
    if (action === 'edit') this.openEdit();
    else this.viewOpen.set(true);
  }

  protected openCreate(): void {
    this.fill(null);
    this.formOpen.set(true);
  }

  protected openEdit(): void {
    const s = this.selected();
    if (!s) return;
    this.fill(s);
    this.formOpen.set(true);
  }

  private fill(s: Supplier | null): void {
    this.editingId.set(s?.id ?? null);
    this.name.set(s?.name ?? '');
    this.contact.set(s?.contact_person ?? '');
    this.phone.set(s?.phone ?? '');
    this.email.set(s?.email ?? '');
    this.notes.set(s?.notes ?? '');
  }

  protected async save(): Promise<void> {
    if (!this.formValid()) return;
    const body = {
      name: this.name().trim(),
      contact_person: this.contact().trim() || null,
      phone: this.phone().trim() || null,
      email: this.email().trim() || null,
      notes: this.notes().trim() || null,
    };
    const id = this.editingId();
    await this.run(async () => {
      if (id) await this.api.updateSupplier(id, body);
      else await this.api.createSupplier(body);
      this.notify.success('บันทึกผู้จำหน่าย / ผู้ซ่อมแล้ว');
      this.formOpen.set(false);
    });
  }

  protected async remove(): Promise<void> {
    const s = this.selected();
    if (!s) return;
    const ok = await this.confirm.ask({
      title: 'ยืนยันการลบผู้จำหน่าย / ผู้ซ่อม',
      message: `ต้องการลบ "${s.name}" ใช่หรือไม่`,
      okText: 'ลบ',
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      await this.api.deleteSupplier(s.id);
      this.notify.success('ลบผู้จำหน่าย / ผู้ซ่อมแล้ว');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.selected.set(null);
      this.suppliers.reload();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
