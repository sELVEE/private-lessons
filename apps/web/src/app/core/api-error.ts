import { HttpErrorResponse } from '@angular/common/http';
import type { AbstractControl } from '@angular/forms';
import type { ApiError } from '@pl/shared';

export function toApiError(err: unknown): ApiError {
  if (
    err instanceof HttpErrorResponse &&
    err.error &&
    typeof err.error === 'object' &&
    'code' in err.error
  ) {
    return err.error as ApiError;
  }
  if (err instanceof HttpErrorResponse && err.status === 0) {
    return {
      statusCode: 0,
      code: 'offline',
      message: 'Brak połączenia z serwerem. Sprawdź internet.',
    };
  }
  return { statusCode: 500, code: 'unknown', message: 'Coś poszło nie tak. Spróbuj ponownie.' };
}

/** Puts field-level server messages onto the matching form controls. Returns the general message. */
export function applyServerErrors(form: AbstractControl, err: unknown): string {
  const apiError = toApiError(err);
  for (const issue of apiError.issues ?? []) {
    const control = form.get(issue.path);
    if (control) {
      control.setErrors({ ...control.errors, server: issue.message });
      control.markAsTouched();
    }
  }
  return apiError.message;
}
