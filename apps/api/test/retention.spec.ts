import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, enrollments, users } from '../src/db/schema.js';
import { RetentionService } from '../src/retention/retention.service.js';
import { account, enrol, PASSWORD } from './fixtures.js';
import { client, createHarness, type Harness, uniqueUser } from './harness.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.redis.flushdb();
});

describe('retention', () => {
  it('removes abandoned registrations and old audit entries, keeps the rest', async () => {
    const c = await client(h.app);
    const u = uniqueUser('ghost');
    await c.post('/api/auth/register', {
      accountType: 'tutor',
      ...u,
      password: PASSWORD,
      displayName: 'Ghost',
      acceptTerms: true,
      declaresAdult: true,
    });
    const active = await account(h, 'tutor', 'Anna');
    await h.db
      .update(users)
      .set({ createdAt: new Date(Date.now() - 40 * 86400_000) })
      .where(eq(users.username, u.username));
    await h.db.execute(
      sql`insert into audit_log (action, created_at) values ('old', now() - interval '400 days')`,
    );

    const counts = await h.app.get(RetentionService).run();
    expect(counts['abandonedAccounts']).toBeGreaterThanOrEqual(1);
    expect(counts['audit']).toBeGreaterThanOrEqual(1);
    expect(await h.db.$count(users, eq(users.username, u.username))).toBe(0);
    expect(await h.db.$count(users, eq(users.id, active.id))).toBe(1);
  });
});

describe('account deletion', () => {
  it('requires the password and the confirmation word, then erases the account', async () => {
    const t = await account(h, 'tutor', 'Anna');
    const s = await account(h, 'student', 'Kasia');
    const e = await enrol(t, s);

    expect(
      (await s.c.post('/api/account/delete', { password: 'zle-haslo', confirm: 'USUŃ' })).body.code,
    ).toBe('invalid_password');
    expect(
      (await s.c.post('/api/account/delete', { password: PASSWORD, confirm: 'tak' })).body.code,
    ).toBe('validation_failed');
    expect(
      (await s.c.post('/api/account/delete', { password: PASSWORD, confirm: 'USUŃ' })).status,
    ).toBe(204);

    expect(await h.db.$count(users, eq(users.id, s.id))).toBe(0);
    expect(await h.db.$count(enrollments, eq(enrollments.id, e.id))).toBe(0);
    expect((await s.c.get('/api/auth/me')).status).toBe(401);
    // The audit trail survives, detached from the deleted user.
    expect(
      await h.db.$count(auditLog, eq(auditLog.action, 'account.deleted')),
    ).toBeGreaterThanOrEqual(1);
  });
});
