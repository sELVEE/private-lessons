import { randomInt } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { MfaEnableResponse, MfaSetupResponse } from '@pl/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { DB, type Db } from '../db/db.module.js';
import { mfaBackupCodes, users } from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import { generateSecret, otpauthUri, verifyTotp } from './totp.js';

type User = typeof users.$inferSelect;

const ISSUER = 'Korepetycje';
const BACKUP_CODE_COUNT = 10;
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

@Injectable()
export class MfaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  /** Starts enrolment: stores a new (not yet active) secret and returns it for the QR code. */
  async setup(user: User): Promise<MfaSetupResponse> {
    if (user.mfaEnabledAt)
      throw new AppError(
        HttpStatus.CONFLICT,
        'mfa_already_enabled',
        'Weryfikacja dwuetapowa jest już włączona',
      );
    const secret = generateSecret();
    await this.db
      .update(users)
      .set({
        mfaSecretEnc: this.crypto.encrypt(secret, user.id),
        mfaLastStep: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    return { secret, otpauthUri: otpauthUri(secret, user.email, ISSUER) };
  }

  async enable(user: User, code: string): Promise<MfaEnableResponse> {
    if (user.mfaEnabledAt)
      throw new AppError(
        HttpStatus.CONFLICT,
        'mfa_already_enabled',
        'Weryfikacja dwuetapowa jest już włączona',
      );
    if (!user.mfaSecretEnc)
      throw new AppError(HttpStatus.BAD_REQUEST, 'mfa_not_started', 'Najpierw zeskanuj kod QR');
    const step = verifyTotp(this.crypto.decrypt(user.mfaSecretEnc, user.id), code, null);
    if (step === null) throw invalidCode();

    const codes = this.generateBackupCodes();
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ mfaEnabledAt: new Date(), mfaLastStep: step, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await tx.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, user.id));
      await tx
        .insert(mfaBackupCodes)
        .values(codes.map((c) => ({ userId: user.id, codeHash: this.crypto.hash(c) })));
    });
    await this.audit.log({ actorId: user.id, action: 'auth.mfa_enabled' });
    await this.mail.send({
      to: user.email,
      subject: 'Włączono weryfikację dwuetapową',
      text: 'Na Twoim koncie włączono weryfikację dwuetapową. Jeśli to nie Ty, natychmiast zresetuj hasło.',
    });
    return { backupCodes: codes };
  }

  async disable(user: User, code: string): Promise<void> {
    if (user.isPlatformAdmin)
      throw new AppError(
        HttpStatus.FORBIDDEN,
        'mfa_required_for_admin',
        'Administrator nie może wyłączyć MFA',
      );
    if (!user.mfaEnabledAt) return;
    if (!(await this.verifyLoginCode(user, code))) throw invalidCode();
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ mfaEnabledAt: null, mfaSecretEnc: null, mfaLastStep: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await tx.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, user.id));
    });
    await this.audit.log({ actorId: user.id, action: 'auth.mfa_disabled' });
    await this.mail.send({
      to: user.email,
      subject: 'Wyłączono weryfikację dwuetapową',
      text: 'Na Twoim koncie wyłączono weryfikację dwuetapową. Jeśli to nie Ty, natychmiast zresetuj hasło.',
    });
  }

  async regenerateBackupCodes(user: User, code: string): Promise<MfaEnableResponse> {
    if (!user.mfaEnabledAt || !(await this.verifyLoginCode(user, code))) throw invalidCode();
    const codes = this.generateBackupCodes();
    await this.db.transaction(async (tx) => {
      await tx.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, user.id));
      await tx
        .insert(mfaBackupCodes)
        .values(codes.map((c) => ({ userId: user.id, codeHash: this.crypto.hash(c) })));
    });
    await this.audit.log({ actorId: user.id, action: 'auth.mfa_backup_codes_regenerated' });
    return { backupCodes: codes };
  }

  /** Accepts a TOTP code (once per time step) or an unused backup code. */
  async verifyLoginCode(user: User, code: string): Promise<boolean> {
    if (!user.mfaSecretEnc || !user.mfaEnabledAt) return false;
    if (/^\d{6}$/.test(code)) {
      const step = verifyTotp(
        this.crypto.decrypt(user.mfaSecretEnc, user.id),
        code,
        user.mfaLastStep,
      );
      if (step === null) return false;
      await this.db.update(users).set({ mfaLastStep: step }).where(eq(users.id, user.id));
      return true;
    }
    const used = await this.db
      .update(mfaBackupCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(mfaBackupCodes.userId, user.id),
          eq(mfaBackupCodes.codeHash, this.crypto.hash(code.toLowerCase())),
          isNull(mfaBackupCodes.usedAt),
        ),
      )
      .returning({ id: mfaBackupCodes.id });
    if (used.length)
      await this.audit.log({ actorId: user.id, action: 'auth.mfa_backup_code_used' });
    return used.length > 0;
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, () => {
      const raw = Array.from(
        { length: 10 },
        () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)],
      ).join('');
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
  }
}

function invalidCode() {
  return new AppError(HttpStatus.BAD_REQUEST, 'invalid_mfa_code', 'Nieprawidłowy kod', [
    { path: 'code', message: 'Nieprawidłowy kod' },
  ]);
}
