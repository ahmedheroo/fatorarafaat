import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { clearSession, readSession } from '../auth-session';

/**
 * Attaches the tenant session token to every API call. The server derives the
 * tenant from this token, so no request ever sends a tenantId itself.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const session = readSession();

  const request =
    session?.token && req.url.includes('/api/')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${session.token}` } })
      : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      const isAuthCall = req.url.includes('/api/auth/login') || req.url.includes('/api/auth/register');
      if (error.status === 401 && !isAuthCall) {
        clearSession();
        if (!router.url.startsWith('/login')) {
          router.navigate(['/login']);
        }
      }
      return throwError(() => error);
    })
  );
};
