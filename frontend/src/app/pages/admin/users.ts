import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { ROLE_LABELS, toOptions } from '../../core/labels';
import { Photo, Role, Tenant, User } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { Avatar } from '../../shared/avatar';
import { AuditHistory } from '../../shared/audit-history';
import { ConfirmService } from '../../shared/confirm.service';
import { PageHeader } from '../../shared/page-header';
import {
  DataGrid,
  GridCell,
  GridColumn,
  GridRowAction,
  GridRowActionId,
} from '../../shared/data-grid';
import { RecordField, RecordView } from '../../shared/record-view';
import { DIALOG_ANIMATION, FORM_IMPORTS } from '../../shared/syncfusion';

@Component({
  selector: 'app-users',
  imports: [...FORM_IMPORTS, PageHeader, DataGrid, GridCell, RecordView, Avatar, AuditHistory],
  styles: `
    .user-cell {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
  `,
  template: `
    <div class="page">
      <app-page-header title="ผู้ใช้งาน" subtitle="บัญชีผู้ใช้ บทบาท และการระงับการใช้งาน">
        <button ejs-button [isPrimary]="true" iconCss="e-icons e-plus" (click)="openCreate()">
          เพิ่มผู้ใช้
        </button>
        <button ejs-button iconCss="e-icons e-edit" [disabled]="!selected()" (click)="openEdit()">
        แก้ไข
      </button>
      @if (auth.isAdmin()) {
        @if (selected()?.is_active === false) {
          <button ejs-button iconCss="e-icons e-check" [disabled]="busy()" (click)="toggleActive()">
            เปิดใช้งาน
          </button>
        } @else {
          <button
            ejs-button
            cssClass="e-danger"
            iconCss="e-icons e-trash"
            [disabled]="!selected() || busy()"
            (click)="toggleActive()"
          >
            ระงับ
          </button>
        }
      }
      <button
        ejs-button
        cssClass="e-outline"
        iconCss="e-icons e-lock"
        [disabled]="!selected()"
        (click)="openResetPassword()"
      >
        ตั้งรหัสผ่านใหม่
      </button>
    </app-page-header>
      <div class="panel">
        <app-data-grid
          [data]="rows()"
          [columns]="columns()"
          perspectiveKey="users"
          exportName="users"
          [loading]="users.isLoading()"
          [error]="users.error()"
          emptyTitle="ยังไม่มีผู้ใช้"
          (selectionChange)="onRowSelected($event)"
          (rowDoubleClick)="onRowSelected($event); openEdit()"
          [rowActions]="rowActions()"
          (rowAction)="onRowAction($event)"
          (retry)="users.reload()"
        >
          <ng-template gridCell="full_name" let-row>
            <span class="user-cell">
              <app-avatar [name]="row.full_name" [src]="row.avatar" [size]="28" />
              {{ row.full_name }}
            </span>
          </ng-template>
          <ng-template gridCell="role_label" let-row>
            <span class="tone-chip" [attr.data-tone]="roleTone[row.role]">{{
              row.role_label
            }}</span>
          </ng-template>
          <ng-template gridCell="active_label" let-row>
            <span class="tone-chip" [attr.data-tone]="row.is_active ? 'success' : null">{{
              row.active_label
            }}</span>
          </ng-template>
        </app-data-grid>
      </div>
    </div>

    <app-record-view
      [(open)]="viewOpen"
      [header]="selected()?.full_name ?? 'ผู้ใช้'"
      [fields]="viewFields()"
      [editable]="true"
      (edit)="openEdit()"
    >
      <app-audit-history entityType="user" [entityId]="selected()?.id" [active]="viewOpen()" />
    </app-record-view>

    <ejs-dialog
      [visible]="formOpen()"
      (close)="formOpen.set(false)"
      [header]="editingId() ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'"
      [isModal]="true"
      [showCloseIcon]="true"
      [animationSettings]="animation"
      width="580px"
      target="body"
    >
      <ng-template #content>
        <div class="form-grid">
          <div>
            <label>ชื่อ-นามสกุล *</label>
            <ejs-textbox [(value)]="fullName" [liveValue]="fullName"></ejs-textbox>
          </div>
          <div>
            <label>อีเมล *</label>
            <ejs-textbox
              type="email"
              [(value)]="email"
              [liveValue]="email"
              [readonly]="!!editingId()"
            ></ejs-textbox>
          </div>
          <div>
            <label>บทบาท *</label>
            <ejs-dropdownlist
              [dataSource]="roleOptions()"
              [fields]="{ value: 'value', text: 'text' }"
              [(value)]="role"
            ></ejs-dropdownlist>
          </div>
          <div>
            <label>{{
              editingId()
                ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)'
                : 'รหัสผ่าน (อย่างน้อย 8 ตัว) *'
            }}</label>
            <ejs-textbox
              type="password"
              [(value)]="password"
              [liveValue]="password"
              [placeholder]="editingId() ? 'กรอกเมื่อต้องการรีเซ็ตรหัสผ่านให้ผู้ใช้' : ''"
            ></ejs-textbox>
            @if (editingId() && password().length > 0 && password().length < 8) {
              <div class="mt-1 text-xs text-error">รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร</div>
            }
          </div>
          @if (auth.isSuperadmin() && role() !== 'superadmin') {
            <div class="full">
              <label>กลุ่มลูกค้า *</label>
              <ejs-dropdownlist
                [dataSource]="tenantOptions()"
                [fields]="{ value: 'value', text: 'text' }"
                [(value)]="tenantId"
                placeholder="เลือกกลุ่มลูกค้า"
              ></ejs-dropdownlist>
            </div>
          }
          @if (editingId()) {
            <div class="full">
              <ejs-checkbox label="เปิดใช้งาน" [(checked)]="isActive"></ejs-checkbox>
            </div>
          }
        </div>
      </ng-template>
      <ng-template #footerTemplate>
        <button ejs-button (click)="formOpen.set(false)">ยกเลิก</button>
        <button ejs-button [isPrimary]="true" [disabled]="!formValid() || busy()" (click)="save()">
          บันทึก
        </button>
      </ng-template>
    </ejs-dialog>

    <ejs-dialog
      [visible]="resetOpen()"
      (close)="resetOpen.set(false)"
      header="ตั้งรหัสผ่านใหม่"
      [isModal]="true"
      [showCloseIcon]="true"
      [animationSettings]="animation"
      width="440px"
      target="body"
    >
      <ng-template #content>
        <p class="mb-3 text-sm text-on-surface-variant">
          ตั้งรหัสผ่านใหม่ให้
          <strong>{{ selected()?.full_name }}</strong> ({{ selected()?.email }})
          แล้วแจ้งรหัสนี้ให้ผู้ใช้ด้วยตนเอง
        </p>
        <div>
          <label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว) *</label>
          <ejs-textbox
            type="password"
            [(value)]="resetPassword"
            [liveValue]="resetPassword"
          ></ejs-textbox>
        </div>
      </ng-template>
      <ng-template #footerTemplate>
        <button ejs-button (click)="resetOpen.set(false)">ยกเลิก</button>
        <button
          ejs-button
          [isPrimary]="true"
          [disabled]="resetPassword().length < 8 || busy()"
          (click)="saveResetPassword()"
        >
          ตั้งรหัสผ่าน
        </button>
      </ng-template>
    </ejs-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);

  protected readonly animation = DIALOG_ANIMATION;
  protected readonly roleTone: Record<string, string | null> = {
    superadmin: 'error',
    tenant_admin: 'warning',
    staff: 'info',
    viewer: null,
  };
  protected readonly columns = computed<GridColumn[]>(() => [
    { field: 'full_name', headerText: 'ชื่อ-นามสกุล', width: 220 },
    { field: 'email', headerText: 'อีเมล', width: 230 },
    { field: 'role_label', headerText: 'บทบาท', width: 160 },
    ...(this.auth.isSuperadmin()
      ? [{ field: 'tenant_name', headerText: 'กลุ่มลูกค้า', width: 220 }]
      : []),
    { field: 'active_label', headerText: 'สถานะ', width: 110 },
  ]);
  protected readonly users = httpResource<User[]>(() => '/api/v1/users', { defaultValue: [] });
  protected readonly tenants = httpResource<Tenant[]>(() => '/api/v1/tenants', {
    defaultValue: [],
  });
  private readonly userPhotos = httpResource<Photo[]>(
    () => ({ url: '/api/v1/photos', params: { owner_type: 'user' } }),
    { defaultValue: [] },
  );
  private readonly avatars = computed(
    () => new Map(this.userPhotos.value().map((p) => [p.owner_id, p.thumb_url])),
  );

  private readonly tenantNames = computed(
    () => new Map(this.tenants.value().map((t) => [t.id, t.name])),
  );
  protected readonly tenantOptions = computed(() =>
    this.tenants.value().map((t) => ({ value: t.id, text: t.name })),
  );
  protected readonly roleOptions = computed(() =>
    toOptions(ROLE_LABELS).filter((o) => this.auth.isSuperadmin() || o.value !== 'superadmin'),
  );
  protected readonly rows = computed(() =>
    this.users.value().map((u) => ({
      ...u,
      role_label: ROLE_LABELS[u.role],
      tenant_name: u.tenant_id ? (this.tenantNames().get(u.tenant_id) ?? '-') : 'แพลตฟอร์ม',
      active_label: u.is_active ? 'ใช้งาน' : 'ระงับ',
      avatar: this.avatars().get(u.id) ?? null,
    })),
  );

  protected readonly selected = signal<User | null>(null);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly resetOpen = signal(false);
  protected readonly resetPassword = signal('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly role = signal<Role>('staff');
  protected readonly password = signal('');
  protected readonly tenantId = signal<string | null>(null);
  protected readonly isActive = signal(true);
  protected readonly formValid = computed(() => {
    const creating = this.editingId() === null;
    const pw = this.password();
    const pwOk = creating ? pw.length >= 8 : pw.length === 0 || pw.length >= 8;
    const tenantOk = !this.auth.isSuperadmin() || this.role() === 'superadmin' || !!this.tenantId();
    return !!this.fullName().trim() && !!this.email().trim() && pwOk && tenantOk;
  });

  protected readonly rowActions = computed<GridRowActionId[]>(() =>
    this.auth.isAdmin() ? ['view', 'edit', 'delete'] : ['view', 'edit'],
  );
  protected readonly viewOpen = signal(false);
  protected readonly viewFields = computed<RecordField[]>(() => {
    const u = this.selected();
    if (!u) return [];
    return [
      { label: 'ชื่อ-นามสกุล', value: u.full_name },
      { label: 'อีเมล', value: u.email },
      { label: 'บทบาท', value: ROLE_LABELS[u.role] },
      { label: 'สถานะ', value: u.is_active ? 'ใช้งาน' : 'ระงับ' },
      ...(this.auth.isSuperadmin()
        ? [
            {
              label: 'กลุ่มลูกค้า',
              value: u.tenant_id ? this.tenantNames().get(u.tenant_id) : 'แพลตฟอร์ม',
              wide: true,
            },
          ]
        : []),
    ];
  });

  protected onRowSelected(row: { id: string } | null): void {
    this.selected.set(row ? (this.users.value().find((u) => u.id === row.id) ?? null) : null);
  }

  protected onRowAction({ action, row }: GridRowAction<{ id: string }>): void {
    this.onRowSelected(row);
    if (action === 'edit') this.openEdit();
    else if (action === 'delete') void this.toggleActive();
    else this.viewOpen.set(true);
  }

  protected async toggleActive(): Promise<void> {
    const u = this.selected();
    if (!u) return;
    if (u.id === this.auth.user()?.id && u.is_active) {
      this.notify.warning('ไม่สามารถระงับบัญชีของตนเองได้');
      return;
    }
    if (u.is_active) {
      const ok = await this.confirm.ask({
        title: 'ยืนยันการระงับผู้ใช้',
        message: `ระงับ "${u.full_name}" แล้วจะเข้าสู่ระบบไม่ได้`,
        okText: 'ระงับ',
        danger: true,
      });
      if (!ok) return;
    }
    this.busy.set(true);
    try {
      await this.api.updateUser(u.id, { is_active: !u.is_active });
      this.notify.success(u.is_active ? 'ระงับผู้ใช้แล้ว' : 'เปิดใช้งานผู้ใช้แล้ว');
      this.selected.set(null);
      this.users.reload();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.fullName.set('');
    this.email.set('');
    this.role.set('staff');
    this.password.set('');
    this.tenantId.set(null);
    this.isActive.set(true);
    this.formOpen.set(true);
  }

  protected openEdit(): void {
    const u = this.selected();
    if (!u) return;
    this.editingId.set(u.id);
    this.fullName.set(u.full_name);
    this.email.set(u.email);
    this.role.set(u.role);
    this.password.set('');
    this.tenantId.set(u.tenant_id);
    this.isActive.set(u.is_active);
    this.formOpen.set(true);
  }

  protected openResetPassword(): void {
    if (!this.selected()) return;
    this.resetPassword.set('');
    this.resetOpen.set(true);
  }

  protected async saveResetPassword(): Promise<void> {
    const u = this.selected();
    const pw = this.resetPassword();
    if (!u || pw.length < 8) return;
    this.busy.set(true);
    try {
      await this.api.updateUser(u.id, { password: pw });
      this.notify.success('ตั้งรหัสผ่านใหม่แล้ว');
      this.resetOpen.set(false);
      this.resetPassword.set('');
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (!this.formValid()) return;
    const tenant = this.role() === 'superadmin' ? null : this.tenantId();
    this.busy.set(true);
    try {
      const id = this.editingId();
      if (id) {
        const body: Record<string, unknown> = {
          full_name: this.fullName().trim(),
          role: this.role(),
          is_active: this.isActive(),
        };
        if (this.password()) body['password'] = this.password();
        if (this.auth.isSuperadmin()) body['tenant_id'] = tenant;
        await this.api.updateUser(id, body);
      } else {
        await this.api.createUser({
          email: this.email().trim(),
          full_name: this.fullName().trim(),
          role: this.role(),
          password: this.password(),
          tenant_id: this.auth.isSuperadmin() ? tenant : undefined,
        });
      }
      this.notify.success('บันทึกผู้ใช้แล้ว');
      this.formOpen.set(false);
      this.selected.set(null);
      this.users.reload();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
