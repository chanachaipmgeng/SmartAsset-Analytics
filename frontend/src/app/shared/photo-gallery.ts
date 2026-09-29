import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { DialogModule } from '@syncfusion/ej2-angular-popups';
import { ApiService } from '../core/api.service';
import { Photo, PhotoOwner } from '../core/models';
import { NotifyService } from '../core/notify.service';
import { PHOTO_ACCEPT, PhotoSrcPipe, checkPhotoFiles } from '../core/photos';
import { ConfirmService } from './confirm.service';
import { DIALOG_ANIMATION } from './syncfusion';

/** Thumbnails of one record's photos with upload (picker or drag-and-drop), a lightbox and delete. */
@Component({
  selector: 'app-photo-gallery',
  imports: [ButtonModule, DialogModule, PhotoSrcPipe],
  template: `
    <div
      class="gallery"
      [class.dragging]="dragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      @for (p of photos(); track p.id; let i = $index) {
        <button type="button" class="thumb" [style.--i]="i" [title]="p.caption ?? 'ดูรูป'" (click)="openAt(i)">
          <img [src]="p.thumb_url | photoSrc" [alt]="p.caption ?? 'รูปภาพ'" loading="lazy" decoding="async" />
        </button>
      }
      @if (editable()) {
        <label class="add" [class.busy]="uploading()" [attr.aria-disabled]="uploading()">
          <input type="file" [accept]="accept" multiple [disabled]="uploading()" (change)="onPick($event)" />
          @if (uploading()) {
            <span class="spinner" aria-hidden="true"></span>
            <span>กำลังอัปโหลด…</span>
          } @else {
            <span class="e-icons e-plus" aria-hidden="true"></span>
            <span>เพิ่มรูป</span>
          }
        </label>
      }
      @if (!photos().length && !editable() && !resource.isLoading()) {
        <p class="empty">ยังไม่มีรูปภาพ</p>
      }
    </div>
    @if (editable()) {
      <p class="hint">JPG, PNG หรือ WebP ไม่เกิน 8 MB · ลากไฟล์มาวางได้</p>
    }

    <ejs-dialog
      [visible]="current() !== null"
      (close)="index.set(null)"
      [header]="lightboxTitle()"
      [isModal]="true"
      [showCloseIcon]="true"
      [closeOnEscape]="true"
      [animationSettings]="animation"
      width="min(960px, 96vw)"
      cssClass="photo-lightbox"
      target="body"
    >
      <ng-template #content>
        @if (current(); as p) {
          <div class="stage" (keydown.arrowleft)="step(-1)" (keydown.arrowright)="step(1)" tabindex="0">
            @for (key of [p.id]; track key) {
              <img [src]="p.url | photoSrc" [alt]="p.caption ?? 'รูปภาพ'" />
            }
            @if (photos().length > 1) {
              <button type="button" class="nav prev" aria-label="รูปก่อนหน้า" (click)="step(-1)">
                <span class="e-icons e-chevron-left"></span>
              </button>
              <button type="button" class="nav next" aria-label="รูปถัดไป" (click)="step(1)">
                <span class="e-icons e-chevron-right"></span>
              </button>
            }
          </div>
          @if (p.caption) {
            <p class="caption">{{ p.caption }}</p>
          }
        }
      </ng-template>
      <ng-template #footerTemplate>
        @if (editable()) {
          <button ejs-button cssClass="e-danger e-flat" iconCss="e-icons e-trash" [disabled]="deleting()" (click)="removeCurrent()">
            ลบรูปนี้
          </button>
        }
        @if (current(); as p) {
          <a ejs-button cssClass="e-flat" iconCss="e-icons e-open-link" [href]="p.url | photoSrc" target="_blank" rel="noopener">เปิดขนาดเต็ม</a>
        }
        <button ejs-button [isPrimary]="true" (click)="index.set(null)">ปิด</button>
      </ng-template>
    </ejs-dialog>
  `,
  styles: `
    :host {
      display: block;
    }

    .gallery {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(var(--thumb, 88px), 1fr));
      gap: 8px;
      padding: 4px;
      border: 1px dashed transparent;
      border-radius: 12px;
      transition:
        border-color 160ms ease,
        background-color 160ms ease;

      &.dragging {
        border-color: rgb(var(--app-primary));
        background: rgba(var(--app-primary), 0.06);
      }
    }

    .thumb,
    .add {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: 10px;
    }

    .thumb {
      padding: 0;
      border: 1px solid rgba(var(--app-outline-variant), 0.9);
      background: rgb(var(--app-surface-variant));
      cursor: zoom-in;
      animation: thumb-in 320ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
      animation-delay: calc(min(var(--i, 0), 12) * 40ms);
      transition:
        transform 180ms ease,
        box-shadow 180ms ease;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 300ms ease;
      }

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 22px -12px rgba(var(--app-primary), 0.7);

        img {
          transform: scale(1.06);
        }
      }

      &:focus-visible {
        outline: 2px solid rgb(var(--app-primary));
        outline-offset: 2px;
      }
    }

    .add {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      border: 1.5px dashed rgba(var(--app-primary), 0.45);
      background: rgba(var(--app-primary), 0.04);
      color: rgb(var(--app-primary));
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition:
        background-color 160ms ease,
        border-color 160ms ease;

      input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }

      .e-icons {
        font-size: 18px;
      }

      &:hover,
      &:focus-within {
        border-color: rgb(var(--app-primary));
        background: rgba(var(--app-primary), 0.1);
      }

      &.busy {
        cursor: progress;
      }
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(var(--app-primary), 0.25);
      border-top-color: rgb(var(--app-primary));
      border-radius: 50%;
      animation: spin 700ms linear infinite;
    }

    .empty,
    .hint {
      margin: 4px 0 0;
      font-size: 12.5px;
      color: rgb(var(--app-on-surface-variant));
    }

    .empty {
      grid-column: 1 / -1;
    }

    .stage {
      position: relative;
      display: grid;
      place-items: center;
      min-height: 240px;
      border-radius: 12px;
      background:
        radial-gradient(circle at 50% 40%, rgba(var(--app-primary), 0.08), transparent 70%),
        rgba(var(--app-on-surface), 0.04);
      outline: none;

      img {
        max-width: 100%;
        max-height: 72vh;
        object-fit: contain;
        border-radius: 8px;
        animation: scale-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
    }

    .nav {
      position: absolute;
      top: 50%;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: rgba(var(--app-surface), 0.88);
      color: rgb(var(--app-on-surface));
      box-shadow: 0 6px 18px -8px rgba(0, 0, 0, 0.45);
      cursor: pointer;
      translate: 0 -50%;
      transition: transform 160ms ease;

      &:hover {
        transform: scale(1.08);
        color: rgb(var(--app-primary));
      }

      &.prev {
        left: 10px;
      }

      &.next {
        right: 10px;
      }
    }

    .caption {
      margin: 10px 0 0;
      text-align: center;
      color: rgb(var(--app-on-surface-variant));
    }

    @keyframes thumb-in {
      from {
        opacity: 0;
        transform: scale(0.92);
      }
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .thumb {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoGallery {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);

  readonly ownerType = input.required<PhotoOwner>();
  readonly ownerId = input<string | null | undefined>(null);
  readonly editable = input(false);
  /** Emits after an upload or delete, e.g. so a parent can refresh thumbnails elsewhere. */
  readonly changed = output<void>();

  protected readonly accept = PHOTO_ACCEPT;
  protected readonly animation = DIALOG_ANIMATION;

  protected readonly resource = httpResource<Photo[]>(
    () => {
      const id = this.ownerId();
      return id ? { url: '/api/v1/photos', params: { owner_type: this.ownerType(), owner_id: id } } : undefined;
    },
    { defaultValue: [] },
  );
  protected readonly photos = computed(() => (this.resource.hasValue() ? this.resource.value() : []));

  protected readonly uploading = signal(false);
  protected readonly deleting = signal(false);
  protected readonly dragging = signal(false);
  protected readonly index = signal<number | null>(null);
  protected readonly current = computed(() => {
    const i = this.index();
    return i === null ? null : (this.photos()[i] ?? null);
  });
  protected readonly lightboxTitle = computed(() => {
    const i = this.index();
    return i === null ? '' : `รูปที่ ${i + 1} / ${this.photos().length}`;
  });

  protected openAt(i: number): void {
    this.index.set(i);
  }

  protected step(delta: number): void {
    const n = this.photos().length;
    this.index.update((i) => (i === null || !n ? i : (i + delta + n) % n));
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.upload(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.editable() || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    if (!this.editable()) return;
    event.preventDefault();
    this.dragging.set(false);
    void this.upload(Array.from(event.dataTransfer?.files ?? []));
  }

  private async upload(files: File[]): Promise<void> {
    const id = this.ownerId();
    if (!id || !files.length || this.uploading()) return;
    const { ok, problem } = checkPhotoFiles(files);
    if (problem) this.notify.warning(problem);
    if (!ok.length) return;
    this.uploading.set(true);
    let saved = 0;
    try {
      for (const file of ok) {
        await this.api.uploadPhoto(this.ownerType(), id, file);
        saved++;
      }
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.uploading.set(false);
      if (saved) {
        this.notify.success(`อัปโหลดรูปแล้ว ${saved} รูป`);
        this.resource.reload();
        this.changed.emit();
      }
    }
  }

  protected async removeCurrent(): Promise<void> {
    const photo = this.current();
    if (!photo) return;
    const ok = await this.confirm.ask({
      title: 'ยืนยันการลบรูป',
      message: 'ต้องการลบรูปนี้ใช่หรือไม่ ลบแล้วกู้คืนไม่ได้',
      okText: 'ลบ',
      danger: true,
    });
    if (!ok) return;
    this.deleting.set(true);
    try {
      await this.api.deletePhoto(photo.id);
      this.notify.success('ลบรูปแล้ว');
      const remaining = this.photos().length - 1;
      this.index.update((i) => (remaining <= 0 || i === null ? null : Math.min(i, remaining - 1)));
      this.resource.reload();
      this.changed.emit();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.deleting.set(false);
    }
  }
}
