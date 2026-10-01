import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { ApiService } from '../core/api.service';
import { APP_CONFIG } from '../core/config';
import { Document, DocumentOwner } from '../core/models';
import { NotifyService } from '../core/notify.service';
import { ConfirmService } from './confirm.service';

export const DOCUMENT_ACCEPT =
  '.pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function checkDocumentFiles(files: File[]): { ok: File[]; problem: string | null } {
  const ok: File[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const lower = file.name.toLowerCase();
    const typeOk =
      ALLOWED_TYPES.has(file.type) ||
      lower.endsWith('.pdf') ||
      lower.endsWith('.docx') ||
      lower.endsWith('.xlsx');
    if (!typeOk) problems.push(`${file.name}: รองรับเฉพาะ PDF, DOCX หรือ XLSX`);
    else if (file.size > MAX_DOCUMENT_BYTES) problems.push(`${file.name}: ขนาดเกิน 10 MB`);
    else ok.push(file);
  }
  return { ok, problem: problems.length ? problems.join('\n') : null };
}

function fileIcon(contentType: string, fileName: string): string {
  const lower = fileName.toLowerCase();
  if (contentType.includes('pdf') || lower.endsWith('.pdf')) return 'e-icons e-file-document';
  if (contentType.includes('word') || lower.endsWith('.docx')) return 'e-icons e-file-word';
  if (contentType.includes('sheet') || lower.endsWith('.xlsx')) return 'e-icons e-file-excel';
  return 'e-icons e-file';
}

/** Attachments (PDF/DOCX/XLSX) for one owner record: list, upload, download, delete. */
@Component({
  selector: 'app-document-list',
  imports: [ButtonModule, DecimalPipe],
  template: `
    <div
      class="docs"
      [class.dragging]="dragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      @for (d of documents(); track d.id) {
        <div class="row">
          <span class="icon" [class]="iconFor(d)" aria-hidden="true"></span>
          <div class="meta">
            <a class="name" [href]="href(d)" target="_blank" rel="noopener" [title]="d.file_name">{{
              d.file_name
            }}</a>
            <div class="sub">
              {{ d.size_bytes / 1024 | number: '1.0-0' }} KB
              @if (d.caption) {
                · {{ d.caption }}
              }
            </div>
          </div>
          <a
            ejs-button
            cssClass="e-flat e-small"
            iconCss="e-icons e-download"
            [href]="href(d)"
            target="_blank"
            rel="noopener"
            title="ดาวน์โหลด"
            aria-label="ดาวน์โหลด"
          ></a>
          @if (editable()) {
            <button
              ejs-button
              cssClass="e-flat e-small e-danger"
              iconCss="e-icons e-trash"
              [disabled]="deleting() === d.id"
              title="ลบ"
              aria-label="ลบ"
              (click)="remove(d)"
            ></button>
          }
        </div>
      }
      @if (editable()) {
        <label class="add" [class.busy]="uploading()" [attr.aria-disabled]="uploading()">
          <input
            type="file"
            [accept]="accept"
            multiple
            [disabled]="uploading()"
            (change)="onPick($event)"
          />
          @if (uploading()) {
            <span class="spinner" aria-hidden="true"></span>
            <span>กำลังอัปโหลด…</span>
          } @else {
            <span class="e-icons e-plus" aria-hidden="true"></span>
            <span>เพิ่มเอกสาร</span>
          }
        </label>
      }
      @if (!documents().length && !editable() && !resource.isLoading()) {
        <p class="empty">ยังไม่มีเอกสาร</p>
      }
    </div>
    @if (editable()) {
      <p class="hint">PDF, DOCX หรือ XLSX ไม่เกิน 10 MB · ลากไฟล์มาวางได้</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .docs {
      display: flex;
      flex-direction: column;
      gap: 6px;
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

    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: 1px solid rgb(var(--app-outline-variant));
      border-radius: 10px;
      background: rgb(var(--app-surface));
    }

    .icon {
      font-size: 20px;
      color: rgb(var(--app-primary));
    }

    .meta {
      flex: 1;
      min-width: 0;
    }

    .name {
      display: block;
      overflow: hidden;
      color: rgb(var(--app-on-surface));
      font-weight: 600;
      font-size: 13px;
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;

      &:hover {
        color: rgb(var(--app-primary));
        text-decoration: underline;
      }
    }

    .sub {
      font-size: 12px;
      color: rgb(var(--app-on-surface-variant));
    }

    .add {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px;
      border: 1.5px dashed rgba(var(--app-primary), 0.45);
      border-radius: 10px;
      background: rgba(var(--app-primary), 0.04);
      color: rgb(var(--app-primary));
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;

      input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }

      &.busy {
        cursor: progress;
      }
    }

    .spinner {
      width: 16px;
      height: 16px;
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

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentList {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly config = inject(APP_CONFIG);

  readonly ownerType = input.required<DocumentOwner>();
  readonly ownerId = input<string | null | undefined>(null);
  readonly editable = input(false);
  readonly changed = output<void>();

  protected readonly accept = DOCUMENT_ACCEPT;

  protected readonly resource = httpResource<Document[]>(
    () => {
      const id = this.ownerId();
      return id
        ? { url: '/api/v1/documents', params: { owner_type: this.ownerType(), owner_id: id } }
        : undefined;
    },
    { defaultValue: [] },
  );
  protected readonly documents = computed(() =>
    this.resource.hasValue() ? this.resource.value() : [],
  );

  protected readonly uploading = signal(false);
  protected readonly deleting = signal<string | null>(null);
  protected readonly dragging = signal(false);

  protected href(doc: Document): string {
    return `${this.config.apiBaseUrl}${doc.url}`;
  }

  protected iconFor(doc: Document): string {
    return fileIcon(doc.content_type, doc.file_name);
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
    const { ok, problem } = checkDocumentFiles(files);
    if (problem) this.notify.warning(problem);
    if (!ok.length) return;
    this.uploading.set(true);
    let saved = 0;
    try {
      for (const file of ok) {
        await this.api.uploadDocument(this.ownerType(), id, file);
        saved++;
      }
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.uploading.set(false);
      if (saved) {
        this.notify.success(`อัปโหลดเอกสารแล้ว ${saved} ไฟล์`);
        this.resource.reload();
        this.changed.emit();
      }
    }
  }

  protected async remove(doc: Document): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'ยืนยันการลบเอกสาร',
      message: `ต้องการลบ "${doc.file_name}" ใช่หรือไม่ ลบแล้วกู้คืนไม่ได้`,
      okText: 'ลบ',
      danger: true,
    });
    if (!ok) return;
    this.deleting.set(doc.id);
    try {
      await this.api.deleteDocument(doc.id);
      this.notify.success('ลบเอกสารแล้ว');
      this.resource.reload();
      this.changed.emit();
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.deleting.set(null);
    }
  }
}
