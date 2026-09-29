import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  if (auth.isAuthenticated()) return true;
  const router = inject(Router);
  const returnUrl = state.url && state.url !== '/' ? state.url : null;
  return router.createUrlTree(['/login'], { queryParams: returnUrl ? { returnUrl } : {} });
};

/** In-app path to open after login; ignores anything that isn't a same-origin absolute path. */
export function safeReturnUrl(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/login')
    ? value
    : '/dashboard';
}

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return !auth.isAuthenticated() || inject(Router).parseUrl('/dashboard');
};

export const superadminGuard: CanActivateFn = () => {
  return inject(AuthStore).isSuperadmin() || inject(Router).parseUrl('/dashboard');
};

export const adminGuard: CanActivateFn = () => {
  return inject(AuthStore).isAdmin() || inject(Router).parseUrl('/dashboard');
};
