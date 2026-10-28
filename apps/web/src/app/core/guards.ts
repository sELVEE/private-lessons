import { inject } from '@angular/core';
import type { CanActivateFn, CanMatchFn } from '@angular/router';
import { Router } from '@angular/router';
import { AuthStore } from './auth.store';

/** UI convenience only — every permission is enforced again by the API. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  await store.ensureLoaded();
  const me = store.me();
  if (!me) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (me.mfaSetupRequired && !state.url.startsWith('/app/account')) {
    return router.createUrlTree(['/app/account'], { queryParams: { mfa: 'required' } });
  }
  return true;
};

export const guestGuard: CanActivateFn = async () => {
  const store = inject(AuthStore);
  await store.ensureLoaded();
  return store.isLoggedIn() ? inject(Router).createUrlTree(['/app']) : true;
};

/** Matches a route only for the given roles (admin counts as its own role). */
export const roleMatch =
  (...roles: string[]): CanMatchFn =>
  async () => {
    const store = inject(AuthStore);
    await store.ensureLoaded();
    const role = store.role();
    return role !== null && roles.includes(role);
  };
