import { InjectionToken } from '@angular/core';

export interface AppConfig {
  /** Empty means same origin (dev server proxies /api to FastAPI). */
  apiBaseUrl: string;
  syncfusionLicense: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

/** `app-config.json` is git-ignored so the Syncfusion key never lands in source control. */
export async function loadAppConfig(): Promise<AppConfig> {
  const fallback: AppConfig = { apiBaseUrl: '', syncfusionLicense: '' };
  try {
    const res = await fetch('/app-config.json', { cache: 'no-store' });
    if (!res.ok) return fallback;
    return { ...fallback, ...(await res.json()) };
  } catch {
    return fallback;
  }
}
