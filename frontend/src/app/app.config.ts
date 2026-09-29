import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { APP_CONFIG, AppConfig } from './core/config';

export function buildAppConfig(config: AppConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideZonelessChangeDetection(),
      provideRouter(routes, withComponentInputBinding(), withViewTransitions({ skipInitialTransition: true })),
      // Angular 22 uses the fetch backend by default, so withFetch() is no longer needed.
      provideHttpClient(withInterceptors([authInterceptor])),
      { provide: APP_CONFIG, useValue: config },
      { provide: LOCALE_ID, useValue: 'th' },
    ],
  };
}
