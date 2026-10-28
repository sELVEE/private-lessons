import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  type LoginResponse,
  type MeResponse,
  emailSchema,
  forgotPasswordSchema,
  loginMfaSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from '@pl/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Auth, AllowDuringMfaSetup, Public, RateLimit } from '../common/decorators.js';
import { clientIp, type AuthContext, userAgent } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB, type Db } from '../db/db.module.js';
import { AuthService, type RequestMeta } from './auth.service.js';
import { buildMe } from './me.js';
import { SessionService } from './session.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Public()
  @RateLimit({ limit: 5, windowSec: 3600 })
  @Post('register')
  @HttpCode(202)
  async register(@Body(new ZodPipe(registerSchema)) body: z.infer<typeof registerSchema>, @Req() req: Request) {
    await this.auth.register(body, this.meta(req));
    return { status: 'verification_sent' };
  }

  @Public()
  @RateLimit({ limit: 5, windowSec: 900 })
  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(@Body(new ZodPipe(z.object({ email: emailSchema }))) body: { email: string }) {
    await this.auth.resendVerification(body.email);
    return { status: 'ok' };
  }

  @Public()
  @RateLimit({ limit: 20, windowSec: 900 })
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body(new ZodPipe(tokenSchema)) body: { token: string }) {
    return this.auth.verifyEmail(body.token);
  }

  @Public()
  @RateLimit({ limit: 20, windowSec: 900 })
  @Post('parent-consent/inspect')
  @HttpCode(200)
  inspectConsent(@Body(new ZodPipe(tokenSchema)) body: { token: string }) {
    return this.auth.inspectParentConsent(body.token);
  }

  @Public()
  @RateLimit({ limit: 20, windowSec: 900 })
  @Post('parent-consent/confirm')
  @HttpCode(200)
  async confirmConsent(@Body(new ZodPipe(tokenSchema)) body: { token: string }, @Req() req: Request) {
    await this.auth.confirmParentConsent(body.token, clientIp(req));
    return { status: 'ok' };
  }

  @Public()
  @RateLimit({ limit: 10, windowSec: 60 })
  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.auth.login(body, this.meta(req), res);
  }

  @Public()
  @RateLimit({ limit: 10, windowSec: 60 })
  @Post('login/mfa')
  @HttpCode(200)
  loginMfa(
    @Body(new ZodPipe(loginMfaSchema)) body: z.infer<typeof loginMfaSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.auth.loginMfa(body.challengeId, body.code, this.meta(req), res);
  }

  @AllowDuringMfaSetup()
  @Post('logout')
  @HttpCode(204)
  async logout(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth.session.id, auth.user.id, res);
  }

  @Public()
  @RateLimit({ limit: 10, windowSec: 900 })
  @Post('not-me')
  @HttpCode(200)
  async notMe(@Body(new ZodPipe(tokenSchema)) body: { token: string }, @Req() req: Request) {
    await this.auth.reportNotMe(body.token, clientIp(req));
    return { status: 'ok' };
  }

  @Public()
  @RateLimit({ limit: 5, windowSec: 900 })
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body(new ZodPipe(forgotPasswordSchema)) body: { email: string }, @Req() req: Request) {
    await this.auth.forgotPassword(body.email, clientIp(req));
    return { status: 'ok' };
  }

  @Public()
  @RateLimit({ limit: 10, windowSec: 900 })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body(new ZodPipe(resetPasswordSchema)) body: { token: string; password: string }, @Req() req: Request) {
    await this.auth.resetPassword(body.token, body.password, clientIp(req));
    return { status: 'ok' };
  }

  @AllowDuringMfaSetup()
  @Get('me')
  me(@Auth() auth: AuthContext): Promise<MeResponse> {
    return buildMe(this.db, auth.user);
  }

  private meta(req: Request): RequestMeta {
    return { ip: clientIp(req), userAgent: userAgent(req), deviceCookie: req.cookies?.[this.sessions.deviceCookieName] };
  }
}
