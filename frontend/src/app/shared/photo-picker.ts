import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, model } from '@angular/core';
import { NotifyService } from '../core/notify.service';
import { PHOTO_ACCEPT, checkPhotoFiles } from '../core/photos';

const MAX_PICKED = 10;

/** Picks photos inside a form before the record exists; the parent uploads them after saving. */
@Component({
  selector: 'app-photo-picker',
  template: `
    <div class="picker">
      @for (item of previews(); track item.url; let i = $index) {
        <figure class="preview" [style.--i]="i">
          <img [src]="item.url" [alt]="item.file.name" />
          <button type="button" class="remove" [attr.aria-label]="'เอารูป ' + item.file.name + ' ออก'" (click)="remove(i)">
            <span class="e-icons e-close" aria-hidden="true"></span>
          </button>
        </figure>
      }
      @if (files().length < max) {
        <label class="add">
          <input type="file" [accept]="accept" multiple (change)="onPick($event)" />
          <span class="e-icons e-image" aria-hidden="true"></span>
          <span>แนบรูป</span>
        </label>
      }
    </div>
  `,
  styles: `
    .picker {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .preview,
    .add {
      position: relative;
      width: 72px;
      height: 72px;
      margin: 0;
      overflow: hidden;
      border-radius: 10px;
    }

    .preview {
      border: 1px solid rgba(var(--app-outline-variant), 0.9);
      animation: scale-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
      animation-delay: calc(var(--i, 0) * 30ms);

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .remove {
      position: absolute;
      top: 4px;
      right: 4px;
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: rgba(17, 24, 39, 0.7);
      color: #fff;
      cursor: pointer;

      .e-icons {
        font-size: 10px;
      }

      &:hover {
        background: rgb(var(--app-error));
      }
    }

    .add {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      border: 1.5px dashed rgba(var(--app-primary), 0.45);
      background: rgba(var(--app-primary), 0.04);
      color: rgb(var(--app-primary));
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;

      input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }

      &:hover,
      &:focus-within {
        border-color: rgb(var(--app-primary));
        background: rgba(var(--app-primary), 0.1);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoPicker {
  private readonly notify = inject(NotifyService);

  readonly files = model<File[]>([]);

  protected readonly accept = PHOTO_ACCEPT;
  protected readonly max = MAX_PICKED;
  private urls = new Map<File, string>();

  protected readonly previews = computed(() => {
    const next = new Map<File, string>();
    for (const file of this.files()) next.set(file, this.urls.get(file) ?? URL.createObjectURL(file));
    for (const [file, url] of this.urls) if (!next.has(file)) URL.revokeObjectURL(url);
    this.urls = next;
    return [...next].map(([file, url]) => ({ file, url }));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.urls.forEach((url) => URL.revokeObjectURL(url)));
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const { ok, problem } = checkPhotoFiles(Array.from(input.files ?? []));
    input.value = '';
    if (problem) this.notify.warning(problem);
    const room = MAX_PICKED - this.files().length;
    if (ok.length > room) this.notify.warning(`แนบได้สูงสุด ${MAX_PICKED} รูปต่อครั้ง`);
    if (ok.length) this.files.update((list) => [...list, ...ok.slice(0, room)]);
  }

  protected remove(index: number): void {
    this.files.update((list) => list.filter((_, i) => i !== index));
  }
}
