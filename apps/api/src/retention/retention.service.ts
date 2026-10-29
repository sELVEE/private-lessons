import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { and, isNull, lt, or, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { parentLinkCodes, sessions, userTokens, users } from '../db/schema.js';
import { REDIS } from '../redis/redis.module.js';

const DAY_MS = 24 * 3600_000;

/** Retention periods. Documented in docs/PLAN.md (Bezpieczeństwo → Dane osobowe). */
export const RETENTION = {
  /** Accounts that never confirmed their e-mail. */
  unverifiedAccountDays: 30,
  /** Students under 16 whose parent never consented. */
  noConsentAccountDays: 30,
  /** Security log (logins, admin actions). */
  auditDays: 365,
};

/**
 * Hourly clean-up of data we no longer need: expired sessions and e-mail tokens, abandoned
 * registrations and old audit entries. Redis lock keeps it to one instance.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () => void this.run().catch((e: Error) => this.logger.error(e.message)),
      3600_000,
    );
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<Record<string, number>> {
    if (!(await this.redis.set('lock:retention', '1', 'EX', 3000, 'NX'))) return {};
    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const counts: Record<string, number> = {};

    counts['sessions'] = (
      await this.db
        .delete(sessions)
        .where(lt(sessions.expiresAt, now))
        .returning({ id: sessions.id })
    ).length;
    counts['tokens'] = (
      await this.db
        .delete(userTokens)
        .where(lt(userTokens.expiresAt, now))
        .returning({ id: userTokens.id })
    ).length;
    counts['parentCodes'] = (
      await this.db
        .delete(parentLinkCodes)
        .where(lt(parentLinkCodes.expiresAt, now))
        .returning({ id: parentLinkCodes.id })
    ).length;
    counts['abandonedAccounts'] = (
      await this.db
        .delete(users)
        .where(
          or(
            and(
              isNull(users.emailVerifiedAt),
              lt(users.createdAt, ago(RETENTION.unverifiedAccountDays)),
            ),
            and(
              sql`${users.requiresParentConsent}`,
              isNull(users.parentConsentAt),
              lt(users.createdAt, ago(RETENTION.noConsentAccountDays)),
            ),
          ),
        )
        .returning({ id: users.id })
    ).length;
    counts['audit'] = await this.db.transaction(async (tx) => {
      await tx.execute(sql`set local app.audit_purge = 'on'`);
      const r = await tx.execute(
        sql`delete from audit_log where created_at < ${ago(RETENTION.auditDays)}`,
      );
      return r.rowCount ?? 0;
    });
    this.logger.log(`retention: ${JSON.stringify(counts)}`);
    return counts;
  }
}
