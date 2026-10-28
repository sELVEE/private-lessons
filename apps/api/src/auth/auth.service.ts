import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { LoginInput, LoginResponse, RegisterInput } from '@pl/shared';
import { DEFAULT_SUBJECT, needsParentConsent } from '@pl/shared';
import { and, eq, or } from 'drizzle-orm';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/errors.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { DB, type Db } from '../db/db.module.js';
import {
  knownDevices,
  memberships,
  organizations,
  parentConsents,
  studentProfiles,
  subjects,
  users,
} from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import { REDIS } from '../redis/redis.module.js';
import { buildMe } from './me.js';
import { MfaService } from './mfa.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  deviceCookie: string | undefined;
}

type User = typeof users.$inferSelect;

/** Consecutive failures per login identifier before an exponential lockout kicks in. */
const FREE_ATTEMPTS = 5;
const MAX_LOCK_SEC = 3600;
const MFA_CHALLENGE_TTL_SEC = 300;
const MFA_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly mfa: MfaService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- registration

  async register(input: RegisterInput, meta: RequestMeta): Promise<void> {
    await this.passwords.assertAcceptable(input.password, [
      input.username,
      input.email.split('@')[0]!,
    ]);

    const existing = await this.db.query.users.findFirst({
      where: or(eq(users.email, input.email), eq(users.username, input.username)),
    });
    if (existing?.email === input.email) {
      // Do not reveal that the address is registered; tell its owner instead.
      await this.mail.send({
        to: input.email,
        subject: 'Próba rejestracji na Twój adres',
        text:
          'Ktoś próbował założyć konto na ten adres e-mail, ale konto już istnieje.\n' +
          `Jeśli to Ty, zaloguj się lub zresetuj hasło: ${this.mail.link('/forgot-password')}\n` +
          'Jeśli to nie Ty, zignoruj tę wiadomość.',
      });
      return;
    }
    if (existing) {
      throw new AppError(HttpStatus.CONFLICT, 'username_taken', 'Ten login jest zajęty', [
        { path: 'username', message: 'Ten login jest zajęty' },
      ]);
    }

    const passwordHash = await this.passwords.hash(input.password);
    const student = input.accountType === 'student' ? input.student! : undefined;
    const requiresParentConsent = student
      ? needsParentConsent(student.birthYear, student.isAtLeast16)
      : false;

    const user = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email: input.email,
          username: input.username,
          passwordHash,
          displayName: input.displayName,
          accountType: input.accountType,
          requiresParentConsent,
        })
        .returning();
      if (student) {
        await tx.insert(studentProfiles).values({
          userId: created!.id,
          schoolLevel: student.schoolLevel,
          grade: student.grade ?? null,
          birthYear: student.birthYear,
        });
      }
      if (input.accountType === 'tutor') {
        const [org] = await tx
          .insert(organizations)
          .values({ name: `Korepetycje — ${input.displayName}` })
          .returning();
        await tx.insert(memberships).values([
          { organizationId: org!.id, userId: created!.id, role: 'owner' },
          { organizationId: org!.id, userId: created!.id, role: 'tutor' },
        ]);
        await tx.insert(subjects).values({ organizationId: org!.id, name: DEFAULT_SUBJECT });
      }
      return created!;
    });

    await this.sendVerification(user);
    if (requiresParentConsent && student?.parentEmail) {
      await this.sendParentConsent(user, student.parentEmail);
    }
    await this.audit.log({
      actorId: user.id,
      action: 'user.registered',
      ip: meta.ip,
      metadata: { accountType: user.accountType },
    });
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, email) });
    if (user && !user.emailVerifiedAt) await this.sendVerification(user);
  }

  async verifyEmail(token: string): Promise<{ parentConsentPending: boolean }> {
    const row = await this.tokens.consume('email_verify', token);
    if (!row) throw Errors.invalidToken();
    const [user] = await this.db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, row.userId))
      .returning();
    await this.audit.log({ actorId: row.userId, action: 'user.email_verified' });
    return { parentConsentPending: !!user && user.requiresParentConsent && !user.parentConsentAt };
  }

  async inspectParentConsent(token: string): Promise<{ studentName: string }> {
    const row = await this.tokens.peek('parent_consent', token);
    if (!row) throw Errors.invalidToken();
    const user = await this.db.query.users.findFirst({ where: eq(users.id, row.userId) });
    if (!user) throw Errors.invalidToken();
    return { studentName: user.displayName };
  }

  async confirmParentConsent(token: string, ip: string | null): Promise<void> {
    const row = await this.tokens.consume('parent_consent', token);
    if (!row) throw Errors.invalidToken();
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ parentConsentAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, row.userId));
      await tx
        .insert(parentConsents)
        .values({ studentId: row.userId, parentEmailHash: row.meta?.parentEmailHash ?? '' });
    });
    await this.audit.log({
      actorId: null,
      action: 'user.parent_consent',
      targetType: 'user',
      targetId: row.userId,
      ip,
    });
  }

  // ---------------------------------------------------------------- login

  async login(input: LoginInput, meta: RequestMeta, res: Response): Promise<LoginResponse> {
    const idKey = this.crypto.hash(input.identifier);
    const locked = await this.redis.ttl(`login:lock:${idKey}`);
    if (locked > 0) throw Errors.tooManyRequests(locked);

    const user = await this.db.query.users.findFirst({
      where: or(eq(users.email, input.identifier), eq(users.username, input.identifier)),
    });
    const ok = await this.passwords.verify(user?.passwordHash ?? null, input.password);
    if (!user || !ok) {
      await this.registerFailure(idKey);
      await this.audit.log({ actorId: user?.id, action: 'auth.login_failed', ip: meta.ip });
      throw Errors.invalidCredentials();
    }
    await this.redis.del(`login:fail:${idKey}`);

    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.db
        .update(users)
        .set({ passwordHash: await this.passwords.hash(input.password) })
        .where(eq(users.id, user.id));
    }
    this.assertCanLogIn(user);

    if (user.mfaEnabledAt) {
      const challengeId = this.crypto.randomToken(24);
      await this.redis.set(`mfa:challenge:${challengeId}`, user.id, 'EX', MFA_CHALLENGE_TTL_SEC);
      return { status: 'mfa_required', challengeId };
    }
    return this.completeLogin(user, meta, res, false);
  }

  async loginMfa(
    challengeId: string,
    code: string,
    meta: RequestMeta,
    res: Response,
  ): Promise<LoginResponse> {
    const key = `mfa:challenge:${challengeId}`;
    const userId = await this.redis.get(key);
    if (!userId)
      throw new AppError(
        HttpStatus.UNAUTHORIZED,
        'mfa_expired',
        'Sesja logowania wygasła — zaloguj się ponownie',
      );
    const attempts = await this.redis.incr(`${key}:attempts`);
    await this.redis.expire(`${key}:attempts`, MFA_CHALLENGE_TTL_SEC);
    if (attempts > MFA_MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw Errors.tooManyRequests(60);
    }
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw Errors.invalidCredentials();
    if (!(await this.mfa.verifyLoginCode(user, code))) {
      await this.audit.log({ actorId: user.id, action: 'auth.mfa_failed', ip: meta.ip });
      throw new AppError(HttpStatus.UNAUTHORIZED, 'invalid_mfa_code', 'Nieprawidłowy kod');
    }
    await this.redis.del(key, `${key}:attempts`);
    this.assertCanLogIn(user);
    return this.completeLogin(user, meta, res, true);
  }

  async logout(sessionId: string, userId: string, res: Response): Promise<void> {
    await this.sessions.revoke(userId, sessionId);
    this.sessions.clearCookie(res);
    await this.audit.log({ actorId: userId, action: 'auth.logout' });
  }

  /** "To nie ja" link from a new-device alert: lock the account and end every session. */
  async reportNotMe(token: string, ip: string | null): Promise<void> {
    const row = await this.tokens.consume('not_me', token);
    if (!row) throw Errors.invalidToken();
    const [user] = await this.db
      .update(users)
      .set({ status: 'locked', updatedAt: new Date() })
      .where(and(eq(users.id, row.userId), eq(users.status, 'active')))
      .returning();
    await this.sessions.revokeAll(row.userId);
    await this.audit.log({ actorId: row.userId, action: 'auth.account_locked_by_user', ip });
    if (user) {
      await this.mail.send({
        to: user.email,
        subject: 'Twoje konto zostało zablokowane',
        text:
          'Na Twoją prośbę zablokowaliśmy konto i wylogowaliśmy wszystkie urządzenia.\n' +
          `Aby je odblokować, ustaw nowe hasło: ${this.mail.link('/forgot-password')}`,
      });
    }
  }

  // ---------------------------------------------------------------- password reset

  async forgotPassword(email: string, ip: string | null): Promise<void> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user || user.status === 'disabled') return;
    const token = await this.tokens.issue(user.id, 'password_reset');
    await this.mail.send({
      to: user.email,
      subject: 'Reset hasła',
      text:
        `Aby ustawić nowe hasło, otwórz link (ważny 30 minut):\n${this.mail.link(`/reset-password?token=${token}`)}\n\n` +
        'Jeśli to nie Ty prosiłeś o reset, zignoruj tę wiadomość — Twoje hasło się nie zmieni.',
    });
    await this.audit.log({ actorId: user.id, action: 'auth.password_reset_requested', ip });
  }

  async resetPassword(token: string, password: string, ip: string | null): Promise<void> {
    const peek = await this.tokens.peek('password_reset', token);
    if (!peek) throw Errors.invalidToken();
    const user = await this.db.query.users.findFirst({ where: eq(users.id, peek.userId) });
    if (!user) throw Errors.invalidToken();
    await this.passwords.assertAcceptable(password, [user.username, user.email.split('@')[0]!]);

    if (!(await this.tokens.consume('password_reset', token))) throw Errors.invalidToken();
    const passwordHash = await this.passwords.hash(password);
    await this.db
      .update(users)
      .set({
        passwordHash,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
        // Reset proves control of the mailbox, so it also unlocks a self-locked account.
        ...(user.status === 'locked' ? { status: 'active' as const } : {}),
        // The link arrived by e-mail, so the address is verified too.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      })
      .where(eq(users.id, user.id));
    await this.sessions.revokeAll(user.id);
    await this.audit.log({ actorId: user.id, action: 'auth.password_reset', ip });
    await this.notifyPasswordChanged(user);
  }

  async changePassword(
    user: User,
    sessionId: string,
    current: string,
    next: string,
    ip: string | null,
  ) {
    if (!(await this.passwords.verify(user.passwordHash, current))) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        'invalid_password',
        'Obecne hasło jest nieprawidłowe',
        [{ path: 'currentPassword', message: 'Nieprawidłowe hasło' }],
      );
    }
    await this.passwords.assertAcceptable(next, [user.username, user.email.split('@')[0]!]);
    await this.db
      .update(users)
      .set({
        passwordHash: await this.passwords.hash(next),
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    await this.sessions.revokeAll(user.id, sessionId);
    await this.audit.log({ actorId: user.id, action: 'auth.password_changed', ip });
    await this.notifyPasswordChanged(user);
  }

  // ---------------------------------------------------------------- helpers

  private assertCanLogIn(user: User) {
    if (user.status !== 'active') {
      throw new AppError(
        HttpStatus.FORBIDDEN,
        'account_locked',
        'Konto jest zablokowane. Aby je odblokować, zresetuj hasło.',
      );
    }
    if (!user.emailVerifiedAt) {
      throw new AppError(
        HttpStatus.FORBIDDEN,
        'email_not_verified',
        'Potwierdź adres e-mail — wysłaliśmy Ci link',
      );
    }
    if (user.requiresParentConsent && !user.parentConsentAt) {
      throw new AppError(
        HttpStatus.FORBIDDEN,
        'parent_consent_pending',
        'Czekamy na zgodę rodzica — poproś go o kliknięcie linku z e-maila',
      );
    }
  }

  private async completeLogin(
    user: User,
    meta: RequestMeta,
    res: Response,
    mfaVerified: boolean,
  ): Promise<LoginResponse> {
    const { token } = await this.sessions.create(user.id, {
      userAgent: meta.userAgent,
      mfaVerified,
    });
    this.sessions.setCookie(res, token);
    await this.trackDevice(user, meta, res);
    await this.audit.log({
      actorId: user.id,
      action: 'auth.login',
      ip: meta.ip,
      metadata: { mfa: mfaVerified },
    });
    return { status: 'ok', user: await buildMe(this.db, user) };
  }

  /** Alerts the user when a browser we have not seen before logs in. */
  private async trackDevice(user: User, meta: RequestMeta, res: Response) {
    const deviceId = this.sessions.ensureDeviceCookie(res, meta.deviceCookie);
    const deviceHash = this.crypto.hash(deviceId);
    const inserted = await this.db
      .insert(knownDevices)
      .values({ userId: user.id, deviceHash })
      .onConflictDoUpdate({
        target: [knownDevices.userId, knownDevices.deviceHash],
        set: { lastSeenAt: new Date() },
      })
      .returning({ createdAt: knownDevices.createdAt, lastSeenAt: knownDevices.lastSeenAt });
    const isNew =
      inserted[0] && inserted[0].createdAt.getTime() === inserted[0].lastSeenAt.getTime();
    if (!isNew) return;
    const known = await this.db.$count(knownDevices, eq(knownDevices.userId, user.id));
    if (known <= 1) return; // first login ever, nothing to compare with

    const token = await this.tokens.issue(user.id, 'not_me');
    await this.mail.send({
      to: user.email,
      subject: 'Nowe logowanie na Twoje konto',
      text:
        `Zalogowano się na Twoje konto z nowego urządzenia (${meta.userAgent ?? 'nieznana przeglądarka'}) ` +
        `o ${new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}.\n\n` +
        'Jeśli to Ty — nic nie musisz robić.\n' +
        `Jeśli to NIE Ty, kliknij, aby zablokować konto i wylogować wszystkie urządzenia:\n${this.mail.link(`/not-me?token=${token}`)}`,
    });
    await this.audit.log({ actorId: user.id, action: 'auth.new_device', ip: meta.ip });
  }

  private async registerFailure(idKey: string) {
    const failKey = `login:fail:${idKey}`;
    const count = await this.redis.incr(failKey);
    await this.redis.expire(failKey, 24 * 3600);
    if (count >= FREE_ATTEMPTS) {
      const lockSec = Math.min(30 * 2 ** (count - FREE_ATTEMPTS), MAX_LOCK_SEC);
      await this.redis.set(`login:lock:${idKey}`, '1', 'EX', lockSec);
    }
  }

  private async sendVerification(user: User) {
    const token = await this.tokens.issue(user.id, 'email_verify');
    await this.mail.send({
      to: user.email,
      subject: 'Potwierdź adres e-mail',
      text: `Cześć ${user.displayName}!\n\nPotwierdź adres e-mail, klikając link:\n${this.mail.link(`/verify-email?token=${token}`)}`,
    });
  }

  private async sendParentConsent(user: User, parentEmail: string) {
    const token = await this.tokens.issue(user.id, 'parent_consent', {
      parentEmailHash: this.crypto.hash(parentEmail),
    });
    await this.mail.send({
      to: parentEmail,
      subject: 'Prośba o zgodę rodzica',
      text:
        `${user.displayName} założył(a) konto na platformie korepetycji i podał(a) Twój adres jako adres rodzica.\n` +
        'Ponieważ ma mniej niż 16 lat, potrzebujemy Twojej zgody na przetwarzanie danych konta.\n\n' +
        `Sprawdź szczegóły i wyraź zgodę: ${this.mail.link(`/parent-consent?token=${token}`)}\n\n` +
        'Nie zapisujemy Twojego adresu e-mail. Jeśli nie znasz tej osoby, zignoruj wiadomość.',
    });
  }

  private async notifyPasswordChanged(user: User) {
    await this.mail.send({
      to: user.email,
      subject: 'Hasło zostało zmienione',
      text:
        'Hasło do Twojego konta zostało zmienione, a pozostałe urządzenia wylogowane.\n' +
        `Jeśli to nie Ty, natychmiast zresetuj hasło: ${this.mail.link('/forgot-password')}`,
    });
  }
}
