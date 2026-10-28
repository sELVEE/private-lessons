import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth.store';

/** A 401 from any API call other than the initial check means the session ended. */
export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(AuthStore);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        err.error?.code === 'unauthenticated' &&
        store.isLoggedIn()
      ) {
        store.clear();
      }
      return throwError(() => err);
    }),
  );
};
