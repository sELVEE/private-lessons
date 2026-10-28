import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  type MfaEnableResponse,
  type MfaSetupResponse,
  type SessionInfo,
  changePasswordSchema,
  mfaCodeSchema,
  mfaDisableSchema,
  mfaEnableSchema,
} from '@pl/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AllowDuringMfaSetup, Auth, RateLimit } from '../common/decorators.js';
import { AppError } from '../common/errors.js';
import { type AuthContext, clientIp } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuthService } from './auth.service.js';
import { MfaService } from './mfa.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

/** Self-service security settings for the logged-in user. */
@Controller('account')
export class AccountController {
  constructor(
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  @Get('sessions')
  async listSessions(@Auth() { user, session }: AuthContext): Promise<SessionInfo[]> {
    const rows = await this.sessions.listForUser(user.id);
    return rows.map((s) => ({
      id: s.id,
      current: s.id === session.id,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    }));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@Auth() { user }: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.sessions.revoke(user.id, id))) {
      throw new AppError(HttpStatus.NOT_FOUND, 'not_found', 'Nie znaleziono sesji');
    }
    await this.audit.log({
      actorId: user.id,
      action: 'auth.session_revoked',
      targetType: 'session',
      targetId: id,
    });
  }

  /** "Wyloguj ze wszystkich urządzeń", including this one. */
  @AllowDuringMfaSetup()
  @Post('sessions/revoke-all')
  @HttpCode(204)
  async revokeAll(
    @Auth() { user }: AuthContext,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const count = await this.sessions.revokeAll(user.id);
    this.sessions.clearCookie(res);
    await this.audit.log({
      actorId: user.id,
      action: 'auth.sessions_revoked_all',
      ip: clientIp(req),
      metadata: { count },
    });
  }

  @RateLimit({ limit: 5, windowSec: 900 })
  @Post('password')
  @HttpCode(204)
  async changePassword(
    @Auth() { user, session }: AuthContext,
    @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
    @Req() req: Request,
  ) {
    await this.auth.changePassword(
      user,
      session.id,
      body.currentPassword,
      body.newPassword,
      clientIp(req),
    );
  }

  @AllowDuringMfaSetup()
  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@Auth() { user }: AuthContext): Promise<MfaSetupResponse> {
    return this.mfa.setup(user);
  }

  @AllowDuringMfaSetup()
  @RateLimit({ limit: 10, windowSec: 300 })
  @Post('mfa/enable')
  @HttpCode(200)
  mfaEnable(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(mfaEnableSchema)) body: { code: string },
  ): Promise<MfaEnableResponse> {
    return this.mfa.enable(user, body.code);
  }

  @RateLimit({ limit: 5, windowSec: 300 })
  @Post('mfa/disable')
  @HttpCode(204)
  async mfaDisable(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(mfaDisableSchema)) body: z.infer<typeof mfaDisableSchema>,
  ) {
    if (!(await this.passwords.verify(user.passwordHash, body.password))) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'invalid_password', 'Nieprawidłowe hasło', [
        { path: 'password', message: 'Nieprawidłowe hasło' },
      ]);
    }
    await this.mfa.disable(user, body.code);
  }

  @RateLimit({ limit: 5, windowSec: 300 })
  @Post('mfa/backup-codes')
  @HttpCode(200)
  regenerateBackupCodes(
    @Auth() { user }: AuthContext,
    @Body(new ZodPipe(z.object({ code: mfaCodeSchema }))) body: { code: string },
  ): Promise<MfaEnableResponse> {
    return this.mfa.regenerateBackupCodes(user, body.code);
  }
}
