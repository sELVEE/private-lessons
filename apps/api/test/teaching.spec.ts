import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hotp } from '../src/auth/totp.js';
import { enrollments, memberships, subjects, users } from '../src/db/schema.js';
import { RlsService } from '../src/rls/rls.service.js';
import {
  type Client,
  client,
  createHarness,
  type Harness,
  tokenFromMail,
  uniqueUser,
} from './harness.js';

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

interface Account {
  c: Client;
  id: string;
  email: string;
  username: string;
}

async function account(
  accountType: 'tutor' | 'student' | 'parent',
  displayName: string,
): Promise<Account> {
  const u = uniqueUser(accountType);
  const c = await client(h.app);
  const res = await c.post('/api/auth/register', {
    accountType,
    ...u,
    password: PASSWORD,
    displayName,
    acceptTerms: true,
    ...(accountType === 'student'
      ? {
          student: { schoolLevel: 'secondary', grade: 2, birthYear: new Date().getFullYear() - 17 },
        }
      : { declaresAdult: true }),
  });
  expect(res.status).toBe(202);
  await c.post('/api/auth/verify-email', {
    token: tokenFromMail(h.mail, u.email, '/verify-email'),
  });
  const login = await c.post('/api/auth/login', { identifier: u.username, password: PASSWORD });
  expect(login.body.status).toBe('ok');
  return { c, id: login.body.user.id, ...u };
}

async function firstSubject(t: Account) {
  const res = await t.c.get('/api/subjects');
  expect(res.status).toBe(200);
  return res.body[0] as { id: string; name: string };
}

async function enrol(t: Account, s: Account) {
  const subject = await firstSubject(t);
  const invite = await t.c.post('/api/invites', { subjectId: subject.id });
  expect(invite.status).toBe(201);
  const res = await s.c.post('/api/invites/redeem', { code: invite.body.code });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

describe('subjects', () => {
  it('gives a new tutor a default subject and lets them manage topics', async () => {
    const t = await account('tutor', 'Anna');
    const [math] = (await t.c.get('/api/subjects')).body;
    expect(math.name).toBe('Matematyka');

    expect((await t.c.post('/api/subjects', { name: 'Fizyka' })).status).toBe(201);
    expect((await t.c.post('/api/subjects', { name: 'Fizyka' })).body.code).toBe('subject_exists');
    expect((await t.c.post(`/api/subjects/${math.id}/topics`, { name: 'Funkcje' })).status).toBe(
      204,
    );
    const list = (await t.c.get('/api/subjects')).body;
    expect(list.map((s: { name: string }) => s.name)).toEqual(['Fizyka', 'Matematyka']);
    expect(list[1].topics[0].name).toBe('Funkcje');
  });

  it('hides and protects subjects of other tutors', async () => {
    const a = await account('tutor', 'Ala');
    const b = await account('tutor', 'Bea');
    const subjectB = await firstSubject(b);
    expect((await a.c.delete(`/api/subjects/${subjectB.id}`)).status).toBe(404);
    expect((await a.c.post(`/api/subjects/${subjectB.id}/topics`, { name: 'X' })).status).toBe(404);
    expect((await b.c.get('/api/subjects')).body).toHaveLength(1);
  });

  it('is tutor-only', async () => {
    const s = await account('student', 'Ola');
    expect((await s.c.get('/api/subjects')).body.code).toBe('not_a_tutor');
  });
});

describe('invites and enrollments', () => {
  it('lets a student join with a code and shows the cooperation to both sides', async () => {
    const t = await account('tutor', 'Anna');
    const s = await account('student', 'Kasia');
    const subject = await firstSubject(t);
    const invite = (await t.c.post('/api/invites', { subjectId: subject.id })).body;
    expect(invite.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(invite.link).toContain('/join?code=');

    const preview = await s.c.post('/api/invites/preview', { code: invite.code.toLowerCase() });
    expect(preview.body).toEqual({
      tutorName: 'Anna',
      subjectName: 'Matematyka',
      alreadyEnrolled: false,
    });

    const joined = await s.c.post('/api/invites/redeem', { code: invite.code });
    expect(joined.body.tutor.displayName).toBe('Anna');
    expect(joined.body.student).toMatchObject({
      displayName: 'Kasia',
      schoolLevel: 'secondary',
      grade: 2,
    });

    // Single use by default.
    const other = await account('student', 'Zosia');
    expect((await other.c.post('/api/invites/redeem', { code: invite.code })).body.code).toBe(
      'invalid_invite',
    );

    const tutorView = (await t.c.get('/api/enrollments')).body;
    expect(tutorView).toHaveLength(1);
    const detail = (await t.c.get(`/api/enrollments/${joined.body.id}`)).body;
    expect(detail.studentEmail).toBe(s.email);
    expect(detail.events[0].type).toBe('joined');

    const studentDetail = (await s.c.get(`/api/enrollments/${joined.body.id}`)).body;
    expect(studentDetail.studentEmail).toBeNull();
    const me = (await s.c.get('/api/auth/me')).body;
    expect(me.memberships[0].role).toBe('student');
  });

  it('restricts e-mail invites to the invited address and does not reveal the code to the tutor', async () => {
    const t = await account('tutor', 'Anna');
    const invited = await account('student', 'Kasia');
    const stranger = await account('student', 'Obcy');
    const subject = await firstSubject(t);
    const invite = await t.c.post('/api/invites', { subjectId: subject.id, email: invited.email });
    expect(invite.body.code).toBeUndefined();
    const code = /Kod zaproszenia: ([A-Z2-9-]+)/.exec(h.mail.outbox.at(-1)!.text)![1]!;

    expect((await stranger.c.post('/api/invites/redeem', { code })).body.code).toBe(
      'invalid_invite',
    );
    expect((await invited.c.post('/api/invites/redeem', { code })).status).toBe(201);
  });

  it('lets only the own tutor update goals and status, with history', async () => {
    const t = await account('tutor', 'Anna');
    const s = await account('student', 'Kasia');
    const other = await account('tutor', 'Obca');
    const e = await enrol(t, s);

    expect((await other.c.patch(`/api/enrollments/${e.id}`, { goals: 'x' })).status).toBe(404);
    expect((await s.c.patch(`/api/enrollments/${e.id}`, { goals: 'x' })).status).toBe(404);

    const updated = await t.c.patch(`/api/enrollments/${e.id}`, {
      goals: 'Matura rozszerzona',
      status: 'paused',
    });
    expect(updated.body.goals).toBe('Matura rozszerzona');
    expect(updated.body.events.map((ev: { type: string }) => ev.type)).toEqual(
      expect.arrayContaining(['goals_updated', 'paused', 'joined']),
    );
    const ended = await t.c.patch(`/api/enrollments/${e.id}`, { status: 'ended' });
    expect(ended.body.endedAt).not.toBeNull();
  });

  it('never shows one tutor the students of another — also in the same organization', async () => {
    const a = await account('tutor', 'Ala');
    const b = await account('tutor', 'Bea');
    const s = await account('student', 'Kasia');
    const e = await enrol(a, s);

    expect((await b.c.get('/api/enrollments')).body).toEqual([]);
    expect((await b.c.get(`/api/enrollments/${e.id}`)).status).toBe(404);

    // Put B in A's organization as a second tutor: still no access to A's students.
    const [orgA] = await h.db.select().from(memberships).where(eq(memberships.userId, a.id));
    await h.db
      .insert(memberships)
      .values({ organizationId: orgA!.organizationId, userId: b.id, role: 'tutor' });
    expect((await b.c.get(`/api/enrollments/${e.id}`)).status).toBe(404);
  });
});

describe('row-level security in the database', () => {
  it('filters rows even for queries without any WHERE clause', async () => {
    const a = await account('tutor', 'Ala');
    const b = await account('tutor', 'Bea');
    const s = await account('student', 'Kasia');
    await enrol(a, s);
    const rls = h.app.get(RlsService);

    const seenByB = await rls.run(b.id, (tx) => tx.select().from(enrollments));
    expect(seenByB).toEqual([]);
    const subjectsSeenByB = await rls.run(b.id, (tx) => tx.select().from(subjects));
    expect(subjectsSeenByB.every((x) => x.name === 'Matematyka')).toBe(true);
    expect(subjectsSeenByB).toHaveLength(1);

    // Writing a row for someone else is rejected by the policy itself.
    const [subjectA] = await h.db
      .select()
      .from(subjects)
      .innerJoin(memberships, eq(memberships.organizationId, subjects.organizationId))
      .where(eq(memberships.userId, a.id));
    await expect(
      rls.run(b.id, (tx) =>
        tx.insert(enrollments).values({
          organizationId: subjectA!.subjects.organizationId,
          tutorId: a.id,
          studentId: s.id,
          subjectId: subjectA!.subjects.id,
        }),
      ),
    ).rejects.toThrow();
  });

  it('cannot read password hashes as the application role', async () => {
    const a = await account('tutor', 'Ala');
    const rls = h.app.get(RlsService);
    await expect(
      rls.run(a.id, (tx) => tx.execute(sql`select password_hash from users`)),
    ).rejects.toThrow();
    await expect(
      rls.run(a.id, (tx) => tx.select({ id: users.id }).from(users).limit(1)),
    ).resolves.toHaveLength(1);
  });
});

describe('parents', () => {
  it('links a parent with a code from the student and shows the child', async () => {
    const t = await account('tutor', 'Anna');
    const s = await account('student', 'Kasia');
    const p = await account('parent', 'Marek');
    await enrol(t, s);

    expect((await p.c.post('/api/parent-links/code')).body.code).toBe('forbidden');
    const { code } = (await s.c.post('/api/parent-links/code')).body;
    const link = await p.c.post('/api/parent-links/redeem', { code });
    expect(link.status).toBe(201);
    expect(h.mail.outbox.at(-1)!.subject).toBe('Rodzic połączył konto z Twoim');
    expect((await p.c.post('/api/parent-links/redeem', { code })).body.code).toBe('invalid_code');

    const children = (await p.c.get('/api/children')).body;
    expect(children[0].displayName).toBe('Kasia');
    expect(children[0].enrollments[0].tutor.displayName).toBe('Anna');
    expect((await p.c.get('/api/enrollments')).body).toHaveLength(1);
    expect(
      (await p.c.patch(`/api/enrollments/${children[0].enrollments[0].id}`, { goals: 'x' })).status,
    ).toBe(404);

    // The student can remove the link; the parent loses access immediately.
    const [l] = (await s.c.get('/api/parent-links')).body;
    expect((await s.c.delete(`/api/parent-links/${l.id}`)).status).toBe(204);
    expect((await p.c.get('/api/children')).body).toEqual([]);
    expect((await p.c.get('/api/enrollments')).body).toEqual([]);
  });

  it('does not let other parents see a child', async () => {
    const t = await account('tutor', 'Anna');
    const s = await account('student', 'Kasia');
    const stranger = await account('parent', 'Obcy');
    await enrol(t, s);
    expect((await stranger.c.get('/api/enrollments')).body).toEqual([]);
    expect((await stranger.c.get('/api/children')).body).toEqual([]);
  });
});

describe('student profile', () => {
  it('lets a student update school level and grade', async () => {
    const s = await account('student', 'Kasia');
    expect(
      (await s.c.patch('/api/account/profile', { schoolLevel: 'vocational', grade: 5 })).status,
    ).toBe(400);
    expect(
      (await s.c.patch('/api/account/profile', { schoolLevel: 'vocational', grade: 3 })).status,
    ).toBe(204);
    expect((await s.c.get('/api/auth/me')).body.student).toMatchObject({
      schoolLevel: 'vocational',
      grade: 3,
    });
  });
});

describe('admin', () => {
  it('requires an MFA-verified admin, a reason, and logs every lookup', async () => {
    const admin = await account('tutor', 'Admin');
    const target = await account('student', 'Kasia');
    expect((await admin.c.get('/api/admin/users?reason=sprawdzenie')).body.code).toBe('forbidden');

    await h.db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, admin.id));
    const setup = (await admin.c.post('/api/account/mfa/setup')).body;
    await admin.c.post('/api/account/mfa/enable', {
      code: hotp(setup.secret, Math.floor(Date.now() / 30000)),
    });

    expect((await admin.c.get('/api/admin/users')).body.code).toBe('validation_failed');
    const found = await admin.c.get(
      `/api/admin/users?q=${target.username}&reason=zgłoszenie od rodzica`,
    );
    expect(found.body).toHaveLength(1);
    expect(found.body[0]).not.toHaveProperty('passwordHash');

    const lock = await admin.c.patch(`/api/admin/users/${target.id}/status`, {
      status: 'locked',
      reason: 'podejrzana aktywność',
    });
    expect(lock.status).toBe(204);
    expect((await target.c.get('/api/auth/me')).status).toBe(401);
    expect(
      (
        await admin.c.patch(`/api/admin/users/${admin.id}/status`, {
          status: 'locked',
          reason: 'test test',
        })
      ).status,
    ).toBe(400);

    const audit = await h.db.execute(
      sql`select action, metadata from audit_log where actor_id = ${admin.id} and action like 'admin.%'`,
    );
    expect(audit.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['admin.users_viewed', 'admin.user_status_changed']),
    );
  });
});
