import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { CryptoService } from '../crypto/crypto.service.js';
import { DB, type Db } from '../db/db.module.js';
import { userTokens } from '../db/schema.js';

type Purpose = (typeof userTokens.$inferSelect)['purpose'];

const TTL_MS: Record<Purpose, number> = {
  email_verify: 48 * 3600_000,
  password_reset: 30 * 60_000,
  parent_consent: 14 * 24 * 3600_000,
  not_me: 7 * 24 * 3600_000,
};

/** Single-use e-mail tokens. The raw token only ever exists in the e-mail link. */
@Injectable()
export class TokenService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: CryptoService,
  ) {}

  /** Issues a token, replacing earlier unused tokens of the same purpose. */
  async issue(userId: string, purpose: Purpose, meta?: Record<string, string>): Promise<string> {
    const token = this.crypto.randomToken(32);
    await this.db.transaction(async (tx) => {
      if (purpose !== 'not_me') {
        await tx.delete(userTokens).where(and(eq(userTokens.userId, userId), eq(userTokens.purpose, purpose)));
      }
      await tx.insert(userTokens).values({
        userId,
        purpose,
        tokenHash: this.crypto.hash(token),
        meta,
        expiresAt: new Date(Date.now() + TTL_MS[purpose]),
      });
    });
    return token;
  }

  /** Atomically deletes and returns a valid token, so it can be used exactly once. */
  async consume(purpose: Purpose, token: string) {
    const [row] = await this.db
      .delete(userTokens)
      .where(this.match(purpose, token))
      .returning();
    return row ?? null;
  }

  async peek(purpose: Purpose, token: string) {
    const [row] = await this.db.select().from(userTokens).where(this.match(purpose, token));
    return row ?? null;
  }

  private match(purpose: Purpose, token: string) {
    return and(
      eq(userTokens.tokenHash, this.crypto.hash(token)),
      eq(userTokens.purpose, purpose),
      gt(userTokens.expiresAt, new Date()),
    );
  }
}
