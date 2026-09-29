import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { ROLE_LABELS, toOptions } from '../../core/labels';
import { Role, Tenant, User } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DIALOG_ANIMATION, FORM_IMPORTS, GRID_DEFAULTS, GRID_IMPORTS, GRID_PROVIDERS } from '../../shared/syncfusion';

@Component({
  selector: 'app-users',
  imports: [...GRID_IMPORTS, ...FORM_IMPORTS],
  providers: [...GRID_PROVIDERS],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>ผู้ใช้งาน</h1>
        <div class="actions">
          <button ejs-button [isPrimary]="true" iconCss="e-icons e-plus" (click)="openCreate()">เพิ่มผู้ใช้</button>
          <button ejs-button iconCss="e-icons e-edit" [disabled]="!selected()" (click)="openEdit()">แก้ไข</button>
        </div>
      </div>
      <div class="panel">
        <ejs-grid
          [dataSource]="rows()"
          [allowPaging]="true"
          [allowSorting]="true"
          [allowFiltering]="true"
          [pageSettings]="grid.pageSettings"
          [filterSettings]="grid.filterSettings"
          [toolbar]="grid.toolbar"
          (rowSelected)="onRowSelected($event)"
          (rowDeselected)="selected.set(null)"
        >
          <e-columns>
            <e-column field="full_name" headerText="ชื่อ-นามสกุล" width="200"></e-column>
            <e-column field="email" headerText="อีเมล" width="230"></e-column>
            <e-column field="role_label" headerText="บทบาท" width="160"></e-column>
            <e-column field="tenant_name" headerText="กลุ่มลูกค้า" width="220" [visible]="auth.isSuperadmin()"></e-column>
            <e-column field="active_label" headerText="สถานะ" width="110"></e-column>
          </e-columns>
        </ejs-grid>
      </div>
    </div>

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
            <ejs-textbox type="email" [(value)]="email" [liveValue]="email" [readonly]="!!editingId()"></ejs-textbox>
          </div>
          <div>
            <label>บทบาท *</label>
            <ejs-dropdownlist [dataSource]="roleOptions()" [fields]="{ value: 'value', text: 'text' }" [(value)]="role"></ejs-dropdownlist>
          </div>
          <div>
            <label>{{ editingId() ? 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน (อย่างน้อย 8 ตัว) *' }}</label>
            <ejs-textbox type="password" [(value)]="password" [liveValue]="password"></ejs-textbox>
          </div>
          @if (auth.isSuperadmin() && role() !== 'superadmin') {
            <div class="full">
              <label>กลุ่มลูกค้า *</label>
              <ejs-dropdownlist [dataSource]="tenantOptions()" [fields]="{ value: 'value', text: 'text' }" [(value)]="tenantId" placeholder="เลือกกลุ่มลูกค้า"></ejs-dropdownlist>
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
        <button ejs-button [isPrimary]="true" [disabled]="!formValid() || busy()" (click)="save()">บันทึก</button>
      </ng-template>
    </ejs-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly grid = GRID_DEFAULTS;
  protected readonly animation = DIALOG_ANIMATION;
  protected readonly users = httpResource<User[]>(() => '/api/v1/users', { defaultValue: [] });
  protected readonly tenants = httpResource<Tenant[]>(() => '/api/v1/tenants', { defaultValue: [] });

  private readonly tenantNames = computed(() => new Map(this.tenants.value().map((t) => [t.id, t.name])));
  protected readonly tenantOptions = computed(() => this.tenants.value().map((t) => ({ value: t.id, text: t.name })));
  protected readonly roleOptions = computed(() =>
    toOptions(ROLE_LABELS).filter((o) => this.auth.isSuperadmin() || o.value !== 'superadmin'),
  );
  protected readonly rows = computed(() =>
    this.users.value().map((u) => ({
      ...u,
      role_label: ROLE_LABELS[u.role],
      tenant_name: u.tenant_id ? (this.tenantNames().get(u.tenant_id) ?? '-') : 'แพลตฟอร์ม',
      active_label: u.is_active ? 'ใช้งาน' : 'ระงับ',
    })),
  );

  protected readonly selected = signal<User | null>(null);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
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

  protected onRowSelected(event: { data: User }): void {
    this.selected.set(this.users.value().find((u) => u.id === event.data.id) ?? null);
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
