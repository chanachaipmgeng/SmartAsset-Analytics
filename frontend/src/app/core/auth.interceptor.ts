import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth.store';
import { APP_CONFIG } from './config';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const config = inject(APP_CONFIG);
  const url = req.url.startsWith('/api') ? `${config.apiBaseUrl}${req.url}` : req.url;
  const isAuthCall = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');

  const withToken = (r: HttpRequest<unknown>, token: string | null) =>
    r.clone({ url, setHeaders: token && !isAuthCall ? { Authorization: `Bearer ${token}` } : {} });

  return next(withToken(req, auth.accessToken())).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !isAuthCall &&
        auth.hasRefreshToken()
      ) {
        return auth.refresh().pipe(
          switchMap((token) => next(withToken(req, token))),
          catchError((refreshErr) => {
            auth.logout();
            return throwError(() => refreshErr);
          }),
        );
      }
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        req.url.includes('/auth/refresh')
      ) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
