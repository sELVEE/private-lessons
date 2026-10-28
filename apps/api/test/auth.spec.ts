import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hotp } from '../src/auth/totp.js';
import { users } from '../src/db/schema.js';
import { client, createHarness, type Harness, tokenFromMail, uniqueUser } from './harness.js';

const PASSWORD = 'Wiosna-nad-Wisla-2026';

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

async function registerTutor(extra: Partial<Record<string, unknown>> = {}) {
  const u = uniqueUser('tutor');
  const c = await client(h.app);
  const res = await c.post('/api/auth/register', {
    accountType: 'tutor',
    ...u,
    password: PASSWORD,
    displayName: 'Jan Tutor',
    acceptTerms: true,
    declaresAdult: true,
    ...extra,
  });
  expect(res.status).toBe(202);
  return { ...u, c };
}

async function verifiedTutor() {
  const t = await registerTutor();
  const token = tokenFromMail(h.mail, t.email, '/verify-email');
  expect((await t.c.post('/api/auth/verify-email', { token })).status).toBe(200);
  return t;
}

async function loggedInTutor() {
  const t = await verifiedTutor();
  const res = await t.c.post('/api/auth/login', { identifier: t.username, password: PASSWORD });
  expect(res.body.status).toBe('ok');
  return t;
}

describe('registration and e-mail verification', () => {
  it('registers a tutor with their own organization after verifying e-mail', async () => {
    const t = await registerTutor();
    const early = await t.c.post('/api/auth/login', { identifier: t.email, password: PASSWORD });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe('email_not_verified');

    const token = tokenFromMail(h.mail, t.email, '/verify-email');
    await t.c.post('/api/auth/verify-email', { token });
    expect((await t.c.post('/api/auth/verify-email', { token })).body.code).toBe('invalid_token');

    const login = await t.c.post('/api/auth/login', { identifier: t.email.toUpperCase(), password: PASSWORD });
    expect(login.status).toBe(200);
    const me = await t.c.get('/api/auth/me');
    expect(me.body.accountType).toBe('tutor');
    expect(me.body.memberships.map((m: { role: string }) => m.role).sort()).toEqual(['owner', 'tutor']);
  });

  it('does not reveal that an e-mail is already registered', async () => {
    const t = await registerTutor();
    const again = await registerTutor({ email: t.email });
    expect(again).toBeDefined();
    expect(h.mail.outbox.at(-1)?.subject).toBe('Próba rejestracji na Twój adres');
  });

  it('rejects a taken username', async () => {
    const t = await registerTutor();
    const c = await client(h.app);
    const res = await c.post('/api/auth/register', {
      accountType: 'tutor',
      email: uniqueUser().email,
      username: t.username,
      password: PASSWORD,
      displayName: 'Ktoś',
      acceptTerms: true,
      declaresAdult: true,
    });
    expect(res.status).toBe(409);
  });

  it('validates input on the server and does not store a password containing the login', async () => {
    const c = await client(h.app);
    const bad = await c.post('/api/auth/register', { accountType: 'admin', email: 'x', password: 'a' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('validation_failed');

    const u = uniqueUser('weak');
    const weak = await c.post('/api/auth/register', {
      accountType: 'tutor',
      ...u,
      password: `${u.username}-123456`,
      displayName: 'Weak',
      acceptTerms: true,
      declaresAdult: true,
    });
    expect(weak.body.code).toBe('weak_password');
  });

  it('requires parental consent for students under 16', async () => {
    const u = uniqueUser('kid');
    const parentEmail = `parent-${u.email}`;
    const c = await client(h.app);
    const res = await c.post('/api/auth/register', {
      accountType: 'student',
      ...u,
      password: PASSWORD,
      displayName: 'Ola',
      acceptTerms: true,
      student: { schoolLevel: 'primary', grade: 7, birthYear: new Date().getFullYear() - 13, parentEmail },
    });
    expect(res.status).toBe(202);
    await c.post('/api/auth/verify-email', { token: tokenFromMail(h.mail, u.email, '/verify-email') });

    const blocked = await c.post('/api/auth/login', { identifier: u.username, password: PASSWORD });
    expect(blocked.body.code).toBe('parent_consent_pending');

    const consent = tokenFromMail(h.mail, parentEmail, '/parent-consent');
    expect((await c.post('/api/auth/parent-consent/inspect', { token: consent })).body.studentName).toBe('Ola');
    expect((await c.post('/api/auth/parent-consent/confirm', { token: consent })).status).toBe(200);

    const ok = await c.post('/api/auth/login', { identifier: u.username, password: PASSWORD });
    expect(ok.body.user.student).toMatchObject({ schoolLevel: 'primary', grade: 7 });
  });
});

describe('login protection', () => {
  it('locks an identifier after repeated failures, even for unknown users', async () => {
    const c = await client(h.app);
    for (let i = 0; i < 5; i++) {
      const r = await c.post('/api/auth/login', { identifier: 'nobody', password: 'wrong-password' });
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('invalid_credentials');
    }
    const locked = await c.post('/api/auth/login', { identifier: 'nobody', password: 'wrong-password' });
    expect(locked.status).toBe(429);
  });

  it('rejects state-changing requests without a CSRF token or from another origin', async () => {
    const c = await client(h.app);
    const noToken = await c.agent.post('/api/auth/login').send({ identifier: 'a', password: 'b' });
    expect(noToken.body.code).toBe('csrf_failed');
    const foreign = await c.post('/api/auth/login', { identifier: 'a', password: 'b' }).set('origin', 'https://evil.example');
    expect(foreign.body.code).toBe('csrf_failed');
  });

  it('sets a hardened session cookie and never exposes the token in the body', async () => {
    const t = await verifiedTutor();
    const res = await t.c.post('/api/auth/login', { identifier: t.username, password: PASSWORD });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/pl_session=[^;]+; Max-Age=\d+; Path=\/; Expires=[^;]+; HttpOnly; SameSite=Lax/);
    expect(JSON.stringify(res.body)).not.toContain(/pl_session=([^;]+)/.exec(cookie)![1]);
  });
});

describe('sessions', () => {
  it('lists sessions and logs out everywhere', async () => {
    const t = await loggedInTutor();
    const other = await client(h.app);
    await other.post('/api/auth/login', { identifier: t.username, password: PASSWORD });

    const list = await t.c.get('/api/account/sessions');
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    expect((await t.c.post('/api/account/sessions/revoke-all')).status).toBe(204);
    expect((await t.c.get('/api/auth/me')).status).toBe(401);
    expect((await other.get('/api/auth/me')).status).toBe(401);
  });

  it('cannot revoke another user\'s session', async () => {
    const a = await loggedInTutor();
    const b = await loggedInTutor();
    const [bSession] = (await b.c.get('/api/account/sessions')).body;
    expect((await a.c.delete(`/api/account/sessions/${bSession.id}`)).status).toBe(404);
    expect((await b.c.get('/api/auth/me')).status).toBe(200);
  });

  it('alerts about a new device and lets the owner lock the account', async () => {
    const t = await loggedInTutor();
    const elsewhere = await client(h.app);
    await elsewhere.post('/api/auth/login', { identifier: t.username, password: PASSWORD });
    const token = tokenFromMail(h.mail, t.email, '/not-me');

    expect((await elsewhere.post('/api/auth/not-me', { token })).status).toBe(200);
    expect((await elsewhere.get('/api/auth/me')).status).toBe(401);
    const login = await t.c.post('/api/auth/login', { identifier: t.username, password: PASSWORD });
    expect(login.body.code).toBe('account_locked');
  });
});

describe('password reset', () => {
  it('resets the password once, revokes sessions and unlocks the account', async () => {
    const t = await loggedInTutor();
    const anon = await client(h.app);
    expect((await anon.post('/api/auth/forgot-password', { email: 'missing@example.com' })).status).toBe(202);
    expect((await anon.post('/api/auth/forgot-password', { email: t.email })).status).toBe(202);
    const token = tokenFromMail(h.mail, t.email, '/reset-password');

    const newPassword = 'Zupelnie-Nowe-Haslo-77';
    expect((await anon.post('/api/auth/reset-password', { token, password: newPassword })).status).toBe(200);
    expect((await anon.post('/api/auth/reset-password', { token, password: newPassword })).body.code).toBe('invalid_token');
    expect((await t.c.get('/api/auth/me')).status).toBe(401);

    expect((await anon.post('/api/auth/login', { identifier: t.username, password: PASSWORD })).status).toBe(401);
    expect((await anon.post('/api/auth/login', { identifier: t.username, password: newPassword })).status).toBe(200);
  });
});

describe('MFA', () => {
  const codeFor = (secret: string, offsetSteps = 0) => hotp(secret, Math.floor(Date.now() / 30000) + offsetSteps);

  it('enrols TOTP, requires it on login and accepts a backup code once', async () => {
    const t = await loggedInTutor();
    const setup = await t.c.post('/api/account/mfa/setup');
    expect(setup.body.otpauthUri).toContain('otpauth://totp/');
    const [stored] = await h.db.select().from(users).where(eq(users.username, t.username));
    expect(stored!.mfaSecretEnc).not.toContain(setup.body.secret);

    const enable = await t.c.post('/api/account/mfa/enable', { code: codeFor(setup.body.secret) });
    expect(enable.body.backupCodes).toHaveLength(10);

    const c = await client(h.app);
    const first = await c.post('/api/auth/login', { identifier: t.username, password: PASSWORD });
    expect(first.body.status).toBe('mfa_required');
    expect((await c.get('/api/auth/me')).status).toBe(401);

    const wrong = await c.post('/api/auth/login/mfa', { challengeId: first.body.challengeId, code: '000000' });
    expect(wrong.status).toBe(401);
    const ok = await c.post('/api/auth/login/mfa', { challengeId: first.body.challengeId, code: codeFor(setup.body.secret, 1) });
    expect(ok.body.status).toBe('ok');

    const backup = enable.body.backupCodes[0];
    const c2 = await client(h.app);
    const ch = (await c2.post('/api/auth/login', { identifier: t.username, password: PASSWORD })).body.challengeId;
    expect((await c2.post('/api/auth/login/mfa', { challengeId: ch, code: backup })).body.status).toBe('ok');
    const c3 = await client(h.app);
    const ch3 = (await c3.post('/api/auth/login', { identifier: t.username, password: PASSWORD })).body.challengeId;
    expect((await c3.post('/api/auth/login/mfa', { challengeId: ch3, code: backup })).status).toBe(401);
  });

  it('forces platform admins to enrol MFA before anything else', async () => {
    const t = await loggedInTutor();
    await h.db.update(users).set({ isPlatformAdmin: true }).where(eq(users.username, t.username));

    const me = await t.c.get('/api/auth/me');
    expect(me.body.mfaSetupRequired).toBe(true);
    const blocked = await t.c.get('/api/account/sessions');
    expect(blocked.body.code).toBe('mfa_setup_required');

    const setup = await t.c.post('/api/account/mfa/setup');
    await t.c.post('/api/account/mfa/enable', { code: codeFor(setup.body.secret) });
    expect((await t.c.get('/api/account/sessions')).status).toBe(200);
    const disable = await t.c.post('/api/account/mfa/disable', { password: PASSWORD, code: codeFor(setup.body.secret, 1) });
    expect(disable.body.code).toBe('mfa_required_for_admin');
  });
});

describe('audit log', () => {
  it('is append-only', async () => {
    await loggedInTutor();
    const cause = (q: Promise<unknown>) => q.then(() => null, (e: Error) => String((e.cause as Error)?.message));
    expect(await cause(h.db.execute(sql`update audit_log set action = 'x'`))).toMatch(/append-only/);
    expect(await cause(h.db.execute(sql`delete from audit_log`))).toMatch(/append-only/);
  });
});
