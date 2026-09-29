import { httpResource } from '@angular/common/http';
import { Injectable, Pipe, PipeTransform, computed, inject } from '@angular/core';
import { AuthStore } from './auth.store';
import { APP_CONFIG } from './config';
import { Photo } from './models';

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Splits picked files into uploadable ones and a Thai message for the rest (type or size). */
export function checkPhotoFiles(files: File[]): { ok: File[]; problem: string | null } {
  const ok: File[] = [];
  const problems: string[] = [];
  for (const file of files) {
    if (!PHOTO_ACCEPT.split(',').includes(file.type)) problems.push(`${file.name}: รองรับเฉพาะ JPG, PNG หรือ WebP`);
    else if (file.size > MAX_PHOTO_BYTES) problems.push(`${file.name}: ขนาดเกิน 8 MB`);
    else ok.push(file);
  }
  return { ok, problem: problems.length ? problems.join('\n') : null };
}

/** Photo links from the API are same-origin paths; `<img>` bypasses the HTTP interceptor, so add the base here. */
@Pipe({ name: 'photoSrc' })
export class PhotoSrcPipe implements PipeTransform {
  private readonly config = inject(APP_CONFIG);

  transform(path: string | null | undefined): string | null {
    return path ? `${this.config.apiBaseUrl}${path}` : null;
  }
}

/** The signed-in user's avatar, shared by the app bar and the profile page. */
@Injectable({ providedIn: 'root' })
export class AvatarStore {
  private readonly auth = inject(AuthStore);
  private readonly photos = httpResource<Photo[]>(
    () => {
      const id = this.auth.user()?.id;
      return id ? { url: '/api/v1/photos', params: { owner_type: 'user', owner_id: id } } : undefined;
    },
    { defaultValue: [] },
  );

  readonly photo = computed(() => (this.photos.hasValue() ? (this.photos.value()[0] ?? null) : null));

  reload(): void {
    this.photos.reload();
  }
}
