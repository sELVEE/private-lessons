import { HttpException, HttpStatus } from '@nestjs/common';

/** Error with a stable machine-readable `code`; the message is safe to show to the user. */
export class AppError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, issues?: { path: string; message: string }[]) {
    super({ statusCode: status, code, message, issues }, status);
  }
}

export const Errors = {
  unauthenticated: () => new AppError(HttpStatus.UNAUTHORIZED, 'unauthenticated', 'Zaloguj się, aby kontynuować'),
  forbidden: () => new AppError(HttpStatus.FORBIDDEN, 'forbidden', 'Brak uprawnień'),
  invalidCredentials: () =>
    new AppError(HttpStatus.UNAUTHORIZED, 'invalid_credentials', 'Nieprawidłowy login lub hasło'),
  tooManyRequests: (retryAfter: number) =>
    new AppError(
      HttpStatus.TOO_MANY_REQUESTS,
      'rate_limited',
      `Zbyt wiele prób. Spróbuj ponownie za ${Math.max(1, Math.ceil(retryAfter / 60))} min.`,
    ),
  invalidToken: () => new AppError(HttpStatus.BAD_REQUEST, 'invalid_token', 'Link jest nieprawidłowy lub wygasł'),
};
