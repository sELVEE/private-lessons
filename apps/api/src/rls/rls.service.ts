import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface RlsContext {
  /** HMAC of an invite code the user presented (lets them read/use that one invite). */
  inviteCodeHash?: string;
  /** HMAC of a parent link code the user presented. */
  linkCodeHash?: string;
}

/**
 * Runs queries on teaching data as the restricted `pl_app` role with the acting user set, so
 * Postgres row-level security filters every statement. This is the second line of defence after
 * the per-endpoint checks in the services.
 */
@Injectable()
export class RlsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(userId: string, fn: (tx: Tx) => Promise<T>, ctx: RlsContext = {}): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`
        select set_config('app.user_id', ${userId}, true),
               set_config('app.invite_code_hash', ${ctx.inviteCodeHash ?? ''}, true),
               set_config('app.link_code_hash', ${ctx.linkCodeHash ?? ''}, true)`);
      await tx.execute(sql`set local role pl_app`);
      return fn(tx);
    });
  }

  /**
   * Temporarily leaves the restricted role inside a `run` transaction, for writes to tables the
   * app role may not touch (e.g. memberships). Callers must have authorised the write already.
   */
  async asOwner<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
    await tx.execute(sql`reset role`);
    try {
      return await fn();
    } finally {
      await tx.execute(sql`set local role pl_app`);
    }
  }
}
