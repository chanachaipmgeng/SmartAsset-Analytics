import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.isAuthenticated() || inject(Router).parseUrl('/login');
};

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
