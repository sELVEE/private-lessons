import { HttpStatus, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ENV, type Env } from '../config/env.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { AppError } from './errors.js';

export const CSRF_COOKIE = 'pl_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth on top of SameSite cookies:
 * 1. state-changing requests must come from our own origin (Origin / Sec-Fetch-Site),
 * 2. double-submit token: the readable `pl_csrf` cookie must be echoed in `X-CSRF-Token`
 *    (Angular's HttpClient does this automatically).
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly appOrigin: string;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly crypto: CryptoService,
  ) {
    this.appOrigin = new URL(env.APP_URL).origin;
  }

  use(req: Request, res: Response, next: NextFunction) {
    let token: string | undefined = req.cookies?.[CSRF_COOKIE];
    if (!token) {
      token = this.crypto.randomToken(24);
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: this.env.COOKIE_SECURE,
        sameSite: 'strict',
        path: '/',
      });
    }
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');
    if (origin && origin !== this.appOrigin) throw this.reject();
    if (req.get('sec-fetch-site') === 'cross-site') throw this.reject();

    const header = req.get(CSRF_HEADER);
    if (
      !header ||
      !req.cookies?.[CSRF_COOKIE] ||
      !this.crypto.safeEqual(header, req.cookies[CSRF_COOKIE])
    ) {
      throw this.reject();
    }
    next();
  }

  private reject() {
    return new AppError(
      HttpStatus.FORBIDDEN,
      'csrf_failed',
      'Żądanie odrzucone (CSRF). Odśwież stronę.',
    );
  }
}
