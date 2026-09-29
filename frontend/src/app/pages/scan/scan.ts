import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../core/auth.store';
import { DeviceActionId, availableActions, commonBulkActions, isBulkAction } from '../../core/device-actions';
import { relativeTime } from '../../core/labels';
import { Device, DeviceStatus } from '../../core/models';
import { errorMessage } from '../../core/notify.service';
import { parseScanCode } from '../../core/scan-code';
import { scanMiss, scanSuccess } from '../../core/scan-feedback';
import { DeviceActionDialogs } from '../../shared/device-action-dialogs';
import { EmptyState } from '../../shared/empty-state';
import { LabelPrintDialog } from '../../shared/label-print-dialog';
import { PageHeader } from '../../shared/page-header';
import { SkeletonBlock } from '../../shared/skeleton-block';
import { StatusChip } from '../../shared/status-chip';

/** Minimal typing for the Shape Detection API (Chrome/Edge/Android); not in lib.dom yet. */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

type Lookup =
  | { kind: 'idle' }
  | { kind: 'loading'; serial: string }
  | { kind: 'found'; serial: string; device: Device }
  | { kind: 'missing'; serial: string }
  | { kind: 'error'; serial: string; message: string };

interface HistoryEntry {
  serial: string;
  at: string;
  deviceId: string | null;
  status: DeviceStatus | null;
}

const HISTORY_KEY = 'inventory.scan-history';
const HISTORY_MAX = 50;
const CAMERA_INTERVAL_MS = 300;
/** The camera sees the same code many times per second; ignore repeats for this long. */
const REPEAT_WINDOW_MS = 2500;

function readHistory(): HistoryEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryEntry[];
  } catch {
    return [];
  }
}

function barcodeDetector(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return ctor && typeof navigator.mediaDevices?.getUserMedia === 'function' ? ctor : null;
}

@Component({
  selector: 'app-scan',
  imports: [DatePipe, RouterLink, ButtonModule, CheckBoxModule, PageHeader, StatusChip, EmptyState, SkeletonBlock, DeviceActionDialogs, LabelPrintDialog],
  templateUrl: './scan.html',
  styleUrl: './scan.scss',
  host: { '(document:keydown)': 'captureWedge($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanPage {
  protected readonly auth = inject(AuthStore);
  private readonly http = inject(HttpClient);

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('scanInput');
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly dialogs = viewChild.required(DeviceActionDialogs);
  protected readonly labels = viewChild.required(LabelPrintDialog);
  private readonly router = inject(Router);

  /** `?serial=` from a scanned label QR (see core/scan-code.ts); looked up once, then removed from the URL. */
  readonly serialParam = input<string>(undefined, { alias: 'serial' });

  protected readonly text = signal('');
  protected readonly lookup = signal<Lookup>({ kind: 'idle' });
  protected readonly history = signal<HistoryEntry[]>(readHistory());
  protected readonly foundCount = computed(() => this.history().filter((h) => h.deviceId).length);
  protected readonly relative = relativeTime;

  protected readonly serial = computed(() => {
    const l = this.lookup();
    return l.kind === 'idle' ? '' : l.serial;
  });
  protected readonly device = computed(() => {
    const l = this.lookup();
    return l.kind === 'found' ? l.device : null;
  });
  protected readonly errorText = computed(() => {
    const l = this.lookup();
    return l.kind === 'error' ? l.message : null;
  });
  protected readonly actions = computed(() =>
    availableActions(this.device(), { canWrite: this.auth.canWrite(), isSuperadmin: this.auth.isSuperadmin() }),
  );

  /** Continuous mode: every device found is queued for one bulk action. */
  protected readonly batchMode = signal(false);
  protected readonly batch = signal<Device[]>([]);
  protected readonly batchActions = computed(() =>
    commonBulkActions(this.batch(), { canWrite: this.auth.canWrite(), isSuperadmin: this.auth.isSuperadmin() }),
  );

  protected readonly cameraSupported = barcodeDetector() !== null;
  protected readonly cameraOn = signal(false);
  protected readonly cameraError = signal<string | null>(null);
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastCode = { value: '', at: 0 };

  constructor() {
    afterNextRender(() => this.focusInput());

    effect(() => {
      const serial = this.serialParam();
      if (!serial) return;
      untracked(() => {
        void this.scan(serial);
        void this.router.navigate([], { queryParams: { serial: null }, queryParamsHandling: 'merge', replaceUrl: true });
      });
    });
    inject(DestroyRef).onDestroy(() => this.stopCamera());
  }

  /** Barcode wedges type like a keyboard; send stray keystrokes to the scan box. */
  protected captureWedge(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    if (target?.closest('input, textarea, [contenteditable], .e-dialog, .e-popup')) return;
    this.focusInput();
  }

  protected submit(): void {
    void this.scan(this.input().nativeElement.value);
  }

  protected async scan(raw: string, record = true): Promise<void> {
    const serial = parseScanCode(raw);
    if (!serial) return;
    this.text.set('');
    this.lookup.set({ kind: 'loading', serial });
    try {
      const device = await firstValueFrom(
        this.http.get<Device>(`/api/v1/devices/by-serial/${encodeURIComponent(serial)}`),
      );
      this.lookup.set({ kind: 'found', serial, device });
      if (record) {
        scanSuccess();
        this.remember({ serial, at: new Date().toISOString(), deviceId: device.id, status: device.status });
        if (this.batchMode()) this.addToBatch(device);
      } else {
        this.updateHistoryStatus(device);
        this.batch.update((list) => list.map((d) => (d.id === device.id ? device : d)));
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.lookup.set({ kind: 'missing', serial });
        if (record) this.remember({ serial, at: new Date().toISOString(), deviceId: null, status: null });
      } else {
        this.lookup.set({ kind: 'error', serial, message: errorMessage(err) });
      }
      if (record) scanMiss();
    } finally {
      this.focusInput();
    }
  }

  protected runAction(action: DeviceActionId): void {
    const device = this.device();
    if (device) this.dialogs().open(action, device);
  }

  protected onActionDone(): void {
    if (this.device()) void this.scan(this.serial(), false);
  }

  protected setBatchMode(on: boolean): void {
    this.batchMode.set(on);
    if (!on) this.batch.set([]);
    this.focusInput();
  }

  protected removeFromBatch(id: string): void {
    this.batch.update((list) => list.filter((d) => d.id !== id));
    this.focusInput();
  }

  protected clearBatch(): void {
    this.batch.set([]);
    this.focusInput();
  }

  protected runBatch(action: DeviceActionId): void {
    if (isBulkAction(action) && this.batch().length) this.dialogs().openBulk(action, this.batch());
  }

  protected onBulkDone(devices: Device[]): void {
    this.batch.set([]);
    devices.forEach((d) => this.updateHistoryStatus(d));
    const current = this.device();
    if (current && devices.some((d) => d.id === current.id)) void this.scan(this.serial(), false);
    this.focusInput();
  }

  private addToBatch(device: Device): void {
    this.batch.update((list) =>
      list.some((d) => d.id === device.id) ? list.map((d) => (d.id === device.id ? device : d)) : [device, ...list],
    );
  }

  protected clearHistory(): void {
    this.history.set([]);
    sessionStorage.removeItem(HISTORY_KEY);
    this.focusInput();
  }

  protected async toggleCamera(): Promise<void> {
    if (this.cameraOn()) {
      this.stopCamera();
      return;
    }
    const Detector = barcodeDetector();
    const video = this.video()?.nativeElement;
    if (!Detector || !video) return;
    this.cameraError.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = this.stream;
      await video.play();
      const detector = new Detector({ formats: await Detector.getSupportedFormats() });
      this.cameraOn.set(true);
      this.timer = setInterval(() => void this.detectFrame(detector, video), CAMERA_INTERVAL_MS);
    } catch {
      this.stopCamera();
      this.cameraError.set('เปิดกล้องไม่ได้ ตรวจสอบสิทธิ์การใช้กล้องของเบราว์เซอร์');
    }
  }

  private async detectFrame(detector: BarcodeDetectorLike, video: HTMLVideoElement): Promise<void> {
    if (video.readyState < 2 || this.lookup().kind === 'loading') return;
    try {
      const [code] = await detector.detect(video);
      const value = code?.rawValue?.trim();
      if (!value) return;
      const now = Date.now();
      if (value === this.lastCode.value && now - this.lastCode.at < REPEAT_WINDOW_MS) return;
      this.lastCode = { value, at: now };
      await this.scan(value);
    } catch {
      // A frame that fails to decode is normal; keep polling.
    }
  }

  private stopCamera(): void {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const video = this.video()?.nativeElement;
    if (video) video.srcObject = null;
    this.cameraOn.set(false);
  }

  private remember(entry: HistoryEntry): void {
    this.history.update((list) => [entry, ...list].slice(0, HISTORY_MAX));
    this.persist();
  }

  private updateHistoryStatus(device: Device): void {
    this.history.update((list) => list.map((h) => (h.deviceId === device.id ? { ...h, status: device.status } : h)));
    this.persist();
  }

  private persist(): void {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(this.history()));
    } catch {
      // Storage unavailable: history lasts until the page is left.
    }
  }

  private focusInput(): void {
    this.input().nativeElement.focus({ preventScroll: true });
  }
}
