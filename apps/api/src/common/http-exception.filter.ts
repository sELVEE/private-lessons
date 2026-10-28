import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@pl/shared';

/** Normalises every error to `ApiError` and never leaks internals (stack traces, SQL) to clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let body: ApiError;
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      body =
        typeof r === 'object' && r !== null && 'code' in r
          ? (r as ApiError)
          : { statusCode: status, code: status === 404 ? 'not_found' : 'http_error', message: exception.message };
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      body = { statusCode: 500, code: 'internal_error', message: 'Wystąpił nieoczekiwany błąd' };
    }
    res.status(body.statusCode).json(body);
  }
}
