import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AppRequest, AuthContext } from './request.js';
import { Errors } from './errors.js';

export const IS_PUBLIC = 'isPublic';
/** Route does not require a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ALLOW_MFA_SETUP = 'allowMfaSetup';
/** Route is reachable by an admin who still has to enrol MFA. */
export const AllowDuringMfaSetup = () => SetMetadata(ALLOW_MFA_SETUP, true);

export interface RateLimitOptions {
  /** Requests allowed per window and IP. */
  limit: number;
  windowSec: number;
}
export const RATE_LIMIT = 'rateLimit';
/** Stricter per-IP limit for sensitive routes (on top of the global one). */
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(RATE_LIMIT, opts);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw Errors.unauthenticated();
  return req.auth;
});
