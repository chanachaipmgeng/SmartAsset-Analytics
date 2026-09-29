import { HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { ApiService } from '../core/api.service';
import { BULK_ACTIONS, BulkActionId, DeviceActionId, actionTitle } from '../core/device-actions';
import { toIsoDate } from '../core/labels';
import { BulkFailure, Customer, Device, Supplier, Tenant } from '../core/models';
import { NotifyService, errorMessage } from '../core/notify.service';
import { InstallationMap, LatLng } from './installation-map';
import { PhotoPicker } from './photo-picker';
import { DIALOG_ANIMATION, FORM_IMPORTS } from './syncfusion';

type Movement = Exclude<DeviceActionId, 'install'>;

export type BulkDevice = Pick<Device, 'id' | 'serial_number' | 'status' | 'tenant_id'>;

const CENTRAL_STOCK = '__central__';
/** Movements whose transaction can carry photos (condition on return, repair and QC evidence). */
const PHOTO_MOVEMENTS: ReadonlySet<Movement> = new Set([
  'return',
  'send_repair',
  'repair_done',
  'qc_pass',
  'qc_fail',
]);

/** Movement and install dialogs shared by the devices page and the scan station. */
@Component({
  selector: 'app-device-action-dialogs',
  imports: [...FORM_IMPORTS, InstallationMap, PhotoPicker],
  template: `
    <ejs-dialog
      [visible]="movement() !== null"
      (close)="movement.set(null)"
      [header]="movement() ? title(movement()!) : ''"
      [isModal]="true"
      [showCloseIcon]="true"
      [animationSettings]="animation"
      width="480px"
      target="body"
    >
      <ng-template #content>
        <div class="form-grid">
          <div class="full">
            อุปกรณ์: <b>{{ device()?.serial_number }}</b>
          </div>
          @if (movement() === 'transfer') {
            <div class="full">
              <label>ปลายทาง *</label>
              <ejs-dropdownlist
                [dataSource]="transferOptions()"
                [fields]="{ value: 'value', text: 'text' }"
                [(value)]="transferTarget"
                placeholder="เลือกปลายทาง"
              ></ejs-dropdownlist>
            </div>
          }
          @if (movement() === 'loan') {
            <div class="full">
              <label>วันครบกำหนดคืน *</label>
              <ejs-datepicker
                [(value)]="dueDate"
                [min]="today"
                format="dd/MM/yyyy"
              ></ejs-datepicker>
            </div>
          }
          @if (movement() === 'return') {
            <div class="full muted">
              เครื่องจะอยู่สถานะ "รอตรวจสอบ (QC)" จนกว่าจะบันทึกผล QC ผ่านหรือไม่ผ่าน
            </div>
          }
          @if (movement() === 'retire') {
            <div class="full muted">อุปกรณ์ที่ปลดระวางจะไม่นับรวมในสต็อก แต่ประวัติยังคงอยู่</div>
          }
          @if (movement() === 'send_repair') {
            <div class="full">
              <label>ผู้ซ่อม / ผู้จำหน่าย</label>
              <ejs-dropdownlist
                [dataSource]="supplierOptions()"
                [fields]="{ value: 'value', text: 'text' }"
                [(value)]="supplier"
                [allowFiltering]="true"
                [showClearButton]="true"
                placeholder="ไม่ระบุ (ซ่อมเอง)"
              ></ejs-dropdownlist>
            </div>
          }
          @if (movement() === 'send_repair' && device()?.status === 'INSTALLED') {
            <div class="full muted">เครื่องนี้ติดตั้งอยู่ ระบบจะปิดจุดติดตั้งเดิมให้อัตโนมัติ</div>
          }
          <div class="full">
            <label>{{ noteLabel() }}</label>
            <ejs-textarea
              [(value)]="note"
              [liveValue]="note"
              rows="3"
              [placeholder]="notePlaceholder()"
            ></ejs-textarea>
          </div>
          @if (movementTakesPhotos()) {
            <div class="full">
              <label>รูปประกอบ <span class="muted">เช่น สภาพเครื่อง ใบรับซ่อม ผล QC</span></label>
              <app-photo-picker [(files)]="photoFiles" />
            </div>
          }
        </div>
      </ng-template>
      <ng-template #footerTemplate>
        <button ejs-button (click)="movement.set(null)">ยกเลิก</button>
        <button
          ejs-button
          [isPrimary]="movement() !== 'retire'"
          [cssClass]="movement() === 'retire' ? 'e-danger' : ''"
          [disabled]="!movementValid() || busy()"
          (click)="confirmMovement()"
        >
          ยืนยัน
        </button>
      </ng-template>
    </ejs-dialog>

    <ejs-dialog
      [visible]="bulkAction() !== null"
      (close)="bulkAction.set(null)"
      [header]="bulkAction() ? title(bulkAction()!) + ' ' + bulkDevices().length + ' เครื่อง' : ''"
      [isModal]="true"
      [showCloseIcon]="true"
      [animationSettings]="animation"
      width="560px"
      target="body"
    >
      <ng-template #content>
        <div class="form-grid">
          <div class="full">
            <div class="bulk-serials">
              @for (d of bulkDevices(); track d.id) {
                <span class="mono">{{ d.serial_number }}</span>
              }
            </div>
            <p class="muted">
              บันทึกแบบทั้งหมดหรือไม่บันทึกเลย ถ้ามีเครื่องใดทำรายการไม่ได้
              จะไม่มีการบันทึกเครื่องใดเลย
            </p>
          </div>
          @if (bulkAction() === 'transfer') {
            <div class="full">
              <label>ปลายทาง *</label>
              <ejs-dropdownlist
                [dataSource]="transferOptions()"
                [fields]="{ value: 'value', text: 'text' }"
                [(value)]="transferTarget"
                placeholder="เลือกปลายทาง"
              ></ejs-dropdownlist>
            </div>
          }
          @if (bulkAction() === 'loan') {
            <div class="full">
              <label>วันครบกำหนดคืน *</label>
              <ejs-datepicker
                [(value)]="dueDate"
                [min]="today"
                format="dd/MM/yyyy"
              ></ejs-datepicker>
            </div>
          }
          @if (bulkAction() === 'send_repair') {
            <div class="full">
              <label>ผู้ซ่อม / ผู้จำหน่าย</label>
              <ejs-dropdownlist
                [dataSource]="supplierOptions()"
                [fields]="{ value: 'value', text: 'text' }"
                [(value)]="supplier"
                [allowFiltering]="true"
                [showClearButton]="true"
                placeholder="ไม่ระบุ (ซ่อมเอง)"
              ></ejs-dropdownlist>
            </div>
          }
          <div class="full">
            <label>หมายเหตุ (ใช้กับทุกเครื่อง)</label>
            <ejs-textarea [(value)]="note" [liveValue]="note" rows="2"></ejs-textarea>
          </div>
          @if (bulkTakesPhotos()) {
            <div class="full">
              <label>รูปประกอบ <span class="muted">แนบรูปชุดเดียวกันกับทุกรายการ</span></label>
              <app-photo-picker [(files)]="photoFiles" />
            </div>
          }
          @if (bulkFailures().length) {
            <div class="full bulk-failures" role="alert">
              <b>ทำรายการไม่ได้ {{ bulkFailures().length }} เครื่อง</b>
              <ul>
                @for (f of bulkFailures(); track f.device_id) {
                  <li>
                    <span class="mono">{{ f.serial_number }}</span> — {{ f.reason }}
                  </li>
                }
              </ul>
            </div>
          }
        </div>
      </ng-template>
      <ng-template #footerTemplate>
        <button ejs-button (click)="bulkAction.set(null)">ยกเลิก</button>
        <button
          ejs-button
          [isPrimary]="bulkAction() !== 'retire'"
          [cssClass]="bulkAction() === 'retire' ? 'e-danger' : ''"
          [disabled]="!bulkValid() || busy()"
          (click)="confirmBulk()"
        >
          ยืนยัน {{ bulkDevices().length }} เครื่อง
        </button>
      </ng-template>
    </ejs-dialog>

    <ejs-dialog
      [visible]="installOpen()"
      (close)="installOpen.set(false)"
      header="บันทึกการติดตั้ง"
      [isModal]="true"
      [showCloseIcon]="true"
      [animationSettings]="animation"
      width="620px"
      target="body"
    >
      <ng-template #content>
        <div class="form-grid">
          <div class="full">
            อุปกรณ์: <b>{{ device()?.serial_number }}</b> — {{ device()?.tenant_name }}
          </div>
          <div>
            <label>ลูกค้า *</label>
            <ejs-dropdownlist
              [dataSource]="customerOptions()"
              [fields]="{ value: 'value', text: 'text' }"
              [(value)]="customer"
              [allowFiltering]="true"
              placeholder="เลือกลูกค้า"
            ></ejs-dropdownlist>
          </div>
          <div>
            <label>วันที่ติดตั้ง *</label>
            <ejs-datepicker [(value)]="installDate" format="dd/MM/yyyy"></ejs-datepicker>
          </div>
          <div class="full">
            <label>ตำแหน่งติดตั้ง * <span class="muted">คลิกบนแผนที่เพื่อปักหมุด</span></label>
            @if (installOpen()) {
              <app-installation-map
                [pin]="installPin()"
                [focus]="installPin()"
                [pickable]="true"
                (pick)="onPickInstall($event)"
                height="260px"
              />
            }
          </div>
          <div>
            <label>ละติจูด *</label>
            <ejs-numerictextbox
              [(value)]="latitude"
              [min]="-90"
              [max]="90"
              format="N6"
              [decimals]="6"
              [showSpinButton]="false"
            ></ejs-numerictextbox>
          </div>
          <div>
            <label>ลองจิจูด *</label>
            <ejs-numerictextbox
              [(value)]="longitude"
              [min]="-180"
              [max]="180"
              format="N6"
              [decimals]="6"
              [showSpinButton]="false"
            ></ejs-numerictextbox>
          </div>
          <div class="full">
            <button
              ejs-button
              cssClass="e-flat"
              iconCss="e-icons e-location"
              [disabled]="locating()"
              (click)="useMyLocation()"
            >
              {{ locating() ? 'กำลังหาตำแหน่ง…' : 'ใช้ตำแหน่งปัจจุบัน' }}
            </button>
          </div>
          <div class="full">
            <label>ที่อยู่จุดติดตั้ง</label>
            <ejs-textarea [(value)]="address" [liveValue]="address" rows="2"></ejs-textarea>
          </div>
          <div>
            <label>ผู้ติดต่อหน้างาน</label>
            <ejs-textbox [(value)]="siteContact" [liveValue]="siteContact"></ejs-textbox>
          </div>
          <div>
            <label>โทรศัพท์หน้างาน</label>
            <ejs-textbox [(value)]="sitePhone" [liveValue]="sitePhone"></ejs-textbox>
          </div>
          <div class="full">
            <label>หมายเหตุการติดตั้ง</label>
            <ejs-textarea
              [(value)]="installNotes"
              [liveValue]="installNotes"
              rows="2"
            ></ejs-textarea>
          </div>
          <div class="full">
            <label>รูปหน้างาน <span class="muted">จุดติดตั้ง การเดินสาย ป้ายหน้าอาคาร</span></label>
            <app-photo-picker [(files)]="photoFiles" />
          </div>
        </div>
      </ng-template>
      <ng-template #footerTemplate>
        <button ejs-button (click)="installOpen.set(false)">ยกเลิก</button>
        <button
          ejs-button
          [isPrimary]="true"
          [disabled]="!installValid() || busy()"
          (click)="confirmInstall()"
        >
          บันทึก
        </button>
      </ng-template>
    </ejs-dialog>
  `,
  styles: `
    .bulk-serials {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 10px;
      max-height: 96px;
      overflow-y: auto;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .mono {
      font-family: ui-monospace, 'Cascadia Mono', monospace;
    }
    .muted {
      font-size: 12px;
      color: rgb(var(--app-on-surface-variant));
    }
    .bulk-failures {
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
      background: rgb(var(--app-error-container));
      color: rgb(var(--app-on-error-container));

      ul {
        margin: 6px 0 0;
        padding-left: 18px;
        max-height: 160px;
        overflow-y: auto;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceActionDialogs {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  /** Emits the updated device after a successful action. */
  readonly done = output<Device>();
  /** Emits every moved device after a successful bulk action. */
  readonly bulkDone = output<Device[]>();

  protected readonly animation = DIALOG_ANIMATION;
  protected readonly title = actionTitle;
  protected readonly device = signal<Device | null>(null);
  protected readonly busy = signal(false);

  // Lookups load on first use so pages that never open a dialog skip the requests.
  private readonly needTenants = signal(false);
  private readonly needCustomers = signal(false);
  private readonly needSuppliers = signal(false);
  private readonly suppliers = httpResource<Supplier[]>(
    () => (this.needSuppliers() ? '/api/v1/suppliers' : undefined),
    { defaultValue: [] },
  );
  protected readonly supplierOptions = computed(() =>
    this.suppliers.value().map((s) => ({ value: s.id, text: s.name })),
  );
  protected readonly supplier = signal<string | null>(null);
  private readonly tenants = httpResource<Tenant[]>(
    () => (this.needTenants() ? '/api/v1/tenants' : undefined),
    {
      defaultValue: [],
    },
  );
  private readonly customers = httpResource<Customer[]>(
    () => (this.needCustomers() ? '/api/v1/customers' : undefined),
    { defaultValue: [] },
  );

  protected readonly movement = signal<Movement | null>(null);
  protected readonly movementTakesPhotos = computed(() => {
    const kind = this.movement();
    return kind !== null && PHOTO_MOVEMENTS.has(kind);
  });
  protected readonly photoFiles = signal<File[]>([]);
  protected readonly note = signal('');
  protected readonly transferTarget = signal<string | null>(null);
  protected readonly noteLabel = computed(() => {
    switch (this.movement()) {
      case 'send_repair':
        return 'อาการ / สาเหตุที่ส่งซ่อม';
      case 'repair_done':
        return 'ผลการซ่อมและ QC *';
      case 'qc_fail':
        return 'อาการ / สาเหตุที่ไม่ผ่าน QC *';
      case 'loan':
        return 'ผู้ยืม / วัตถุประสงค์';
      case 'retire':
        return 'เหตุผล';
      default:
        return 'หมายเหตุ';
    }
  });
  protected readonly notePlaceholder = computed(() => {
    switch (this.movement()) {
      case 'repair_done':
        return 'เช่น เปลี่ยนจอ ทดสอบสแกนหน้า 20 ครั้งผ่าน';
      case 'qc_fail':
        return 'เช่น สแกนนิ้วไม่ติด จอมีรอยร้าว';
      case 'loan':
        return 'เช่น บริษัท ก. ทดลองใช้ 2 สัปดาห์';
      default:
        return '';
    }
  });
  protected readonly today = new Date(new Date().setHours(0, 0, 0, 0));
  protected readonly dueDate = signal<Date | null>(null);
  protected readonly movementValid = computed(() => {
    const kind = this.movement();
    if (kind === 'transfer') return !!this.transferTarget();
    if (kind === 'repair_done' || kind === 'qc_fail') return !!this.note().trim();
    if (kind === 'loan') return !!this.dueDate();
    return kind !== null;
  });
  /** Tenants the device(s) being transferred are in now; a destination equal to all of them is pointless. */
  private readonly sourceTenants = computed(() => {
    const d = this.device();
    return new Set(
      this.bulkAction() ? this.bulkDevices().map((b) => b.tenant_id) : d ? [d.tenant_id] : [],
    );
  });
  protected readonly transferOptions = computed(() => {
    const sources = this.sourceTenants();
    const only = sources.size === 1 ? [...sources][0] : undefined;
    return [
      ...(only !== null ? [{ value: CENTRAL_STOCK, text: 'คลังกลาง (แพลตฟอร์ม)' }] : []),
      ...this.tenants
        .value()
        .filter((t) => t.id !== only)
        .map((t) => ({ value: t.id, text: t.name })),
    ];
  });

  protected readonly bulkAction = signal<BulkActionId | null>(null);
  protected readonly bulkDevices = signal<BulkDevice[]>([]);
  protected readonly bulkFailures = signal<BulkFailure[]>([]);
  protected readonly bulkTakesPhotos = computed(() => {
    const kind = this.bulkAction();
    return kind !== null && PHOTO_MOVEMENTS.has(kind);
  });
  protected readonly bulkValid = computed(() => {
    const kind = this.bulkAction();
    if (kind === 'transfer') return !!this.transferTarget();
    if (kind === 'loan') return !!this.dueDate();
    return kind !== null && this.bulkDevices().length > 0;
  });

  protected readonly installOpen = signal(false);
  protected readonly customer = signal<string | null>(null);
  protected readonly installDate = signal<Date | null>(new Date());
  protected readonly latitude = signal<number | null>(null);
  protected readonly longitude = signal<number | null>(null);
  protected readonly address = signal('');
  protected readonly siteContact = signal('');
  protected readonly sitePhone = signal('');
  protected readonly installNotes = signal('');
  protected readonly locating = signal(false);
  protected readonly installPin = computed(() => {
    const latitude = this.latitude();
    const longitude = this.longitude();
    return latitude === null || longitude === null ? null : { latitude, longitude };
  });
  protected readonly customerOptions = computed(() => {
    const tenant = this.device()?.tenant_id;
    return this.customers
      .value()
      .filter((c) => c.tenant_id === tenant && c.is_active)
      .map((c) => ({ value: c.id, text: c.company_name }));
  });
  protected readonly installValid = computed(() => {
    const lat = this.latitude();
    const lng = this.longitude();
    return (
      !!this.customer() &&
      !!this.installDate() &&
      lat !== null &&
      lng !== null &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    );
  });

  open(action: DeviceActionId, device: Device): void {
    this.device.set(device);
    this.photoFiles.set([]);
    if (action === 'install') {
      this.needCustomers.set(true);
      this.customer.set(null);
      this.installDate.set(new Date());
      this.latitude.set(null);
      this.longitude.set(null);
      this.address.set('');
      this.siteContact.set('');
      this.sitePhone.set('');
      this.installNotes.set('');
      this.installOpen.set(true);
      return;
    }
    if (action === 'transfer') this.needTenants.set(true);
    if (action === 'send_repair') this.needSuppliers.set(true);
    this.supplier.set(null);
    this.note.set('');
    this.transferTarget.set(null);
    this.dueDate.set(new Date(Date.now() + 14 * 86_400_000));
    this.movement.set(action);
  }

  openBulk(action: BulkActionId, devices: BulkDevice[]): void {
    this.bulkDevices.set(devices);
    this.bulkFailures.set([]);
    this.photoFiles.set([]);
    if (action === 'transfer') this.needTenants.set(true);
    if (action === 'send_repair') this.needSuppliers.set(true);
    this.supplier.set(null);
    this.note.set('');
    this.transferTarget.set(null);
    this.dueDate.set(new Date(Date.now() + 14 * 86_400_000));
    this.bulkAction.set(action);
  }

  protected async confirmBulk(): Promise<void> {
    const kind = this.bulkAction();
    const devices = this.bulkDevices();
    if (!kind || !devices.length) return;
    const target = this.transferTarget();
    this.busy.set(true);
    this.bulkFailures.set([]);
    try {
      const result = await this.api.bulk({
        action: BULK_ACTIONS[kind],
        device_ids: devices.map((d) => d.id),
        note: this.note().trim() || null,
        target_tenant_id: kind === 'transfer' && target !== CENTRAL_STOCK ? target : null,
        supplier_id: kind === 'send_repair' ? this.supplier() : null,
        due_date: kind === 'loan' ? toIsoDate(this.dueDate()) : null,
      });
      this.notify.success(`${actionTitle(kind)} สำเร็จ ${result.count} เครื่อง`);
      const files = this.photoFiles();
      if (PHOTO_MOVEMENTS.has(kind) && files.length) {
        await this.attachPhotos(async () => {
          let saved = 0;
          for (const item of result.items)
            saved += await this.api.uploadPhotos('transaction', item.transaction_id, files);
          return saved;
        });
      }
      this.bulkAction.set(null);
      this.bulkDone.emit(result.items.map((i) => i.device));
    } catch (err) {
      const failures =
        err instanceof HttpErrorResponse
          ? (err.error?.failures as BulkFailure[] | undefined)
          : undefined;
      if (failures?.length) this.bulkFailures.set(failures);
      else this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected onPickInstall(point: LatLng): void {
    this.latitude.set(point.latitude);
    this.longitude.set(point.longitude);
  }

  protected useMyLocation(): void {
    if (!navigator.geolocation) {
      this.notify.warning('เบราว์เซอร์นี้ไม่รองรับการอ่านตำแหน่ง');
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.latitude.set(Number(pos.coords.latitude.toFixed(6)));
        this.longitude.set(Number(pos.coords.longitude.toFixed(6)));
        this.locating.set(false);
      },
      () => {
        this.locating.set(false);
        this.notify.warning('ไม่สามารถอ่านตำแหน่งปัจจุบันได้');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  protected async confirmMovement(): Promise<void> {
    const d = this.device();
    const kind = this.movement();
    if (!d || !kind) return;
    const note = this.note().trim() || null;
    await this.run(async () => {
      let updated: Device;
      if (kind === 'checkout') updated = await this.api.checkOut(d.id, note);
      else if (kind === 'return') updated = await this.api.returnDevice(d.id, note);
      else if (kind === 'retire') updated = await this.api.retireDevice(d.id, note);
      else if (kind === 'send_repair')
        updated = await this.api.sendRepair(d.id, note, this.supplier());
      else if (kind === 'repair_done') updated = await this.api.repairDone(d.id, note ?? '');
      else if (kind === 'loan')
        updated = await this.api.loan(d.id, toIsoDate(this.dueDate())!, note);
      else if (kind === 'qc_pass') updated = await this.api.qcPass(d.id, note);
      else if (kind === 'qc_fail') updated = await this.api.qcFail(d.id, note ?? '');
      else {
        const target = this.transferTarget();
        updated = await this.api.transfer(d.id, target === CENTRAL_STOCK ? null : target, note);
      }
      this.notify.success(`${actionTitle(kind)} สำเร็จ`);
      if (PHOTO_MOVEMENTS.has(kind) && this.photoFiles().length) {
        const files = this.photoFiles();
        await this.attachPhotos(async () => {
          const tx = await this.api.latestTransaction(d.id);
          return tx ? this.api.uploadPhotos('transaction', tx.id, files) : 0;
        });
      }
      this.movement.set(null);
      return updated;
    });
  }

  /** The movement is already saved, so a failed upload is a warning, not a failed action. */
  private async attachPhotos(upload: () => Promise<number>): Promise<void> {
    try {
      const saved = await upload();
      if (saved) this.notify.info(`แนบรูปแล้ว ${saved} รูป`);
    } catch (err) {
      this.notify.warning(`บันทึกรายการแล้ว แต่แนบรูปไม่สำเร็จ: ${errorMessage(err)}`);
    }
  }

  protected async confirmInstall(): Promise<void> {
    const d = this.device();
    if (!d || !this.installValid()) return;
    await this.run(async () => {
      const installation = await this.api.install({
        device_id: d.id,
        customer_id: this.customer(),
        install_date: toIsoDate(this.installDate()),
        latitude: this.latitude(),
        longitude: this.longitude(),
        address: this.address().trim() || null,
        site_contact: this.siteContact().trim() || null,
        site_phone: this.sitePhone().trim() || null,
        notes: this.installNotes().trim() || null,
      });
      this.notify.success('บันทึกการติดตั้งแล้ว');
      const files = this.photoFiles();
      if (files.length)
        await this.attachPhotos(() =>
          this.api.uploadPhotos('installation', installation.id, files),
        );
      this.installOpen.set(false);
      return { ...d, status: 'INSTALLED' as const };
    });
  }

  private async run(action: () => Promise<Device>): Promise<void> {
    this.busy.set(true);
    try {
      this.done.emit(await action());
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
