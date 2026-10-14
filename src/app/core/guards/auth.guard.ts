import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Logged in (any role). */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() || inject(Router).createUrlTree(['/auth/login']);
};

/** IT side: main admin + IT team members. */
export const itTeamGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isItTeam() || inject(Router).createUrlTree([auth.homeUrl()]);
};

/** Main IT admin only (projects, team, logs). */
export const adminOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAdmin() || inject(Router).createUrlTree([auth.homeUrl()]);
};

/** Client portal: project accounts. */
export const clientGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isClient() || inject(Router).createUrlTree([auth.homeUrl()]);
};

/** Department accounts (Finance, Marketing…). */
export const deptGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isDept() || inject(Router).createUrlTree([auth.homeUrl()]);
};

/** Login page: only when logged out. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return !auth.isLoggedIn() || inject(Router).createUrlTree([auth.homeUrl()]);
};