import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import argon2 from 'argon2';
import { ENV, type Env } from '../config/env.js';
import { AppError } from '../common/errors.js';

/** OWASP-recommended Argon2id parameters (64 MiB, 3 iterations). */
export const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;
const TEST_ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 8192,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly opts: typeof ARGON_OPTS | typeof TEST_ARGON_OPTS;
  /** Verifying against this keeps response time equal when the user does not exist. */
  private dummyHash?: Promise<string>;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.opts = env.NODE_ENV === 'test' ? TEST_ARGON_OPTS : ARGON_OPTS;
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, this.opts);
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    if (!hash) {
      this.dummyHash ??= this.hash('dummy-password-for-timing');
      await argon2.verify(await this.dummyHash, password);
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, this.opts);
  }

  /** Rejects passwords containing the login data or found in known breaches. */
  async assertAcceptable(password: string, context: string[]): Promise<void> {
    const lower = password.toLowerCase();
    if (context.some((c) => c.length >= 3 && lower.includes(c.toLowerCase()))) {
      throw weak('Hasło nie może zawierać loginu ani adresu e-mail');
    }
    if (new Set(password).size < 5) throw weak('Hasło jest zbyt przewidywalne');
    if (await this.isBreached(password)) {
      throw weak('To hasło wyciekło w znanych wyciekach danych — wybierz inne');
    }
  }

  /** Have I Been Pwned range API: only the first 5 hex chars of the SHA-1 leave the server. */
  private async isBreached(password: string): Promise<boolean> {
    if (!this.env.HIBP_ENABLED) return false;
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return false;
      const suffix = sha1.slice(5);
      return (await res.text()).split('\n').some((line) => {
        const [hashSuffix, count] = line.trim().split(':');
        return hashSuffix === suffix && Number(count) > 0;
      });
    } catch (err) {
      // Fail open: an outage of the external service must not block registration.
      this.logger.warn(`HIBP check skipped: ${(err as Error).message}`);
      return false;
    }
  }
}

function weak(message: string) {
  return new AppError(HttpStatus.BAD_REQUEST, 'weak_password', message, [
    { path: 'password', message },
  ]);
}
