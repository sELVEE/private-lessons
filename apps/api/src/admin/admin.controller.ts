import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { type AdminUserRow, adminSetStatusSchema, adminUserQuerySchema } from '@pl/shared';
import { desc, eq, ilike, or } from 'drizzle-orm';
import type { Request } from 'express';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { SessionService } from '../auth/session.service.js';
import { Auth } from '../common/decorators.js';
import { AppError } from '../common/errors.js';
import { type AuthContext, clientIp } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB, type Db } from '../db/db.module.js';
import { users } from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';

/** Platform admin, MFA-verified in this session. */
function requireAdmin({ user, session }: AuthContext) {
  if (!user.isPlatformAdmin)
    throw new AppError(HttpStatus.FORBIDDEN, 'forbidden', 'Brak uprawnień');
  if (!session.mfaVerified) {
    throw new AppError(
      HttpStatus.FORBIDDEN,
      'mfa_reauth_required',
      'Zaloguj się ponownie z kodem weryfikacji dwuetapowej',
    );
  }
}

/**
 * Deliberately narrow: account lookup and locking. Admins get no access to lessons, notes or
 * payments, and every lookup records who looked, what for and why.
 */
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
  ) {}

  @Get('users')
  async users(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(adminUserQuerySchema)) q: z.infer<typeof adminUserQuerySchema>,
    @Req() req: Request,
  ): Promise<AdminUserRow[]> {
    requireAdmin(auth);
    const pattern = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`;
    const rows = await this.db
      .select()
      .from(users)
      .where(
        q.q
          ? or(
              ilike(users.email, pattern),
              ilike(users.username, pattern),
              ilike(users.displayName, pattern),
            )
          : undefined,
      )
      .orderBy(desc(users.createdAt))
      .limit(50);
    await this.audit.log({
      actorId: auth.user.id,
      action: 'admin.users_viewed',
      ip: clientIp(req),
      metadata: { query: q.q, reason: q.reason, results: rows.length },
    });
    return rows.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      accountType: u.accountType,
      isPlatformAdmin: u.isPlatformAdmin,
      status: u.status,
      mfaEnabled: !!u.mfaEnabledAt,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  @Patch('users/:id/status')
  @HttpCode(204)
  async setStatus(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(adminSetStatusSchema)) b: z.infer<typeof adminSetStatusSchema>,
    @Req() req: Request,
  ) {
    requireAdmin(auth);
    if (id === auth.user.id) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        'cannot_change_self',
        'Nie możesz zmienić statusu własnego konta',
      );
    }
    const [target] = await this.db
      .update(users)
      .set({ status: b.status, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!target) throw new AppError(HttpStatus.NOT_FOUND, 'not_found', 'Nie znaleziono konta');
    if (b.status !== 'active') await this.sessions.revokeAll(id);
    await this.audit.log({
      actorId: auth.user.id,
      action: 'admin.user_status_changed',
      targetType: 'user',
      targetId: id,
      ip: clientIp(req),
      metadata: { status: b.status, reason: b.reason },
    });
    await this.mail.send({
      to: target.email,
      subject: b.status === 'active' ? 'Konto zostało odblokowane' : 'Konto zostało zablokowane',
      text:
        b.status === 'active'
          ? 'Administrator odblokował Twoje konto. Możesz się zalogować.'
          : 'Administrator zablokował Twoje konto i wylogował wszystkie urządzenia. W razie pytań odpowiedz na tę wiadomość.',
    });
  }
}
