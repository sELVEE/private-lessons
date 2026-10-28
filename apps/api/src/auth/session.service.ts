import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lt, ne, or } from 'drizzle-orm';
import type { Response } from 'express';
import { ENV, type Env } from '../config/env.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { DB, type Db } from '../db/db.module.js';
import { sessions, users } from '../db/schema.js';

const IDLE_TIMEOUT_MS = 7 * 24 * 3600_000;
const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 3600_000;
const TOUCH_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class SessionService {
  /** `__Host-` prefix forces Secure, Path=/ and no Domain; unavailable on plain-http dev. */
  readonly cookieName: string;
  readonly deviceCookieName: string;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly crypto: CryptoService,
  ) {
    this.cookieName = env.COOKIE_SECURE ? '__Host-pl_session' : 'pl_session';
    this.deviceCookieName = env.COOKIE_SECURE ? '__Host-pl_device' : 'pl_device';
  }

  async create(userId: string, opts: { userAgent: string | null; mfaVerified: boolean }) {
    const token = this.crypto.randomToken(32);
    const [session] = await this.db
      .insert(sessions)
      .values({
        userId,
        tokenHash: this.crypto.hash(token),
        userAgent: opts.userAgent,
        mfaVerified: opts.mfaVerified,
        expiresAt: new Date(Date.now() + IDLE_TIMEOUT_MS),
      })
      .returning();
    return { token, session: session! };
  }

  /** Resolves a cookie token to a live session, sliding the idle expiry. */
  async validate(token: string) {
    const now = new Date();
    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, this.crypto.hash(token)),
          gt(sessions.expiresAt, now),
          gt(sessions.createdAt, new Date(now.getTime() - ABSOLUTE_TIMEOUT_MS)),
        ),
      );
    if (!row || row.user.status !== 'active') return null;
    if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.db
        .update(sessions)
        .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + IDLE_TIMEOUT_MS) })
        .where(eq(sessions.id, row.session.id));
    }
    return row;
  }

  listForUser(userId: string) {
    return this.db.query.sessions.findMany({
      where: and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())),
      orderBy: (s, { desc }) => desc(s.lastSeenAt),
    });
  }

  async revoke(userId: string, sessionId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .returning({ id: sessions.id });
    return deleted.length > 0;
  }

  /** "Wyloguj ze wszystkich urządzeń"; optionally keeps the current session. */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
    const deleted = await this.db
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
        ),
      )
      .returning({ id: sessions.id });
    return deleted.length;
  }

  async purgeExpired(): Promise<void> {
    await this.db
      .delete(sessions)
      .where(
        or(
          lt(sessions.expiresAt, new Date()),
          lt(sessions.createdAt, new Date(Date.now() - ABSOLUTE_TIMEOUT_MS)),
        ),
      );
  }

  setCookie(res: Response, token: string) {
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: ABSOLUTE_TIMEOUT_MS,
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
    });
  }

  /** Random per-browser id used to detect logins from new devices. */
  ensureDeviceCookie(res: Response, existing: string | undefined): string {
    if (existing && /^[\w-]{20,64}$/.test(existing)) return existing;
    const id = this.crypto.randomToken(24);
    res.cookie(this.deviceCookieName, id, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 400 * 24 * 3600_000,
    });
    return id;
  }
}
