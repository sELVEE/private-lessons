import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_MFA_SETUP, IS_PUBLIC } from '../common/decorators.js';
import { AppError, Errors } from '../common/errors.js';
import type { AppRequest } from '../common/request.js';
import { SessionService } from './session.service.js';

/**
 * Global guard: every route requires a valid session unless marked @Public().
 * Admins without MFA may only reach routes marked @AllowDuringMfaSetup().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);

    const token: string | undefined = req.cookies?.[this.sessions.cookieName];
    const auth = token ? await this.sessions.validate(token) : null;
    if (auth) req.auth = auth;
    if (isPublic) return true;
    if (!auth) throw Errors.unauthenticated();

    if (mfaSetupRequired(auth.user) && !this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_SETUP, targets)) {
      throw new AppError(HttpStatus.FORBIDDEN, 'mfa_setup_required', 'Administrator musi włączyć weryfikację dwuetapową');
    }
    return true;
  }
}

export function mfaSetupRequired(user: { isPlatformAdmin: boolean; mfaEnabledAt: Date | null }): boolean {
  return user.isPlatformAdmin && !user.mfaEnabledAt;
}
