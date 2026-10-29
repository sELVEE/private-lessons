import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { account, enrol, firstSubject } from './fixtures.js';
import { createHarness, type Harness } from './harness.js';

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

async function setup() {
  const t = await account(h, 'tutor', 'Anna');
  const s = await account(h, 'student', 'Kasia');
  const other = await account(h, 'student', 'Zosia');
  const p = await account(h, 'parent', 'Marek');
  const e = await enrol(t, s);
  const e2 = await enrol(t, other);
  const { code } = (await s.c.post('/api/parent-links/code')).body;
  await p.c.post('/api/parent-links/redeem', { code });
  return { t, s, other, p, e, e2, subject: await firstSubject(t) };
}

describe('materials', () => {
  it('are private until shared, then visible to that student and their parent only', async () => {
    const { t, s, other, p, e, subject } = await setup();
    const m = (
      await t.c.post('/api/materials', {
        title: 'Wzory Viète’a',
        body: 'Dla $ax^2+bx+c=0$: $$x_1+x_2=-\\frac{b}{a}$$',
        subjectId: subject.id,
      })
    ).body;
    expect(m.subject.name).toBe('Matematyka');
    expect((await s.c.get('/api/materials')).body).toEqual([]);
    expect((await s.c.get(`/api/materials/${m.id}`)).status).toBe(404);

    const shared = (await t.c.put(`/api/materials/${m.id}/shares`, { enrollmentIds: [e.id] })).body;
    expect(shared.sharedWith).toEqual([e.id]);
    expect((await s.c.get('/api/materials')).body[0].body).toContain('\\frac');
    expect((await s.c.get('/api/materials')).body[0].sharedWith).toEqual([]);
    expect((await p.c.get('/api/materials')).body).toHaveLength(1);
    expect((await other.c.get('/api/materials')).body).toEqual([]);
    expect(
      (await s.c.put(`/api/materials/${m.id}`, { title: 'Zmiana', subjectId: subject.id })).status,
    ).toBe(403);
  });

  it('cannot be shared with another tutor’s students', async () => {
    const { t, subject } = await setup();
    await h.redis.flushdb(); // registration is rate limited per IP
    const t2 = await account(h, 'tutor', 'Obca');
    const s2 = await account(h, 'student', 'Ola');
    const foreign = await enrol(t2, s2);
    const m = (await t.c.post('/api/materials', { title: 'Test', subjectId: subject.id })).body;
    expect(
      (await t.c.put(`/api/materials/${m.id}/shares`, { enrollmentIds: [foreign.id] })).status,
    ).toBe(404);
  });
});

describe('homework', () => {
  it('goes assigned → submitted → reviewed with the right people allowed at each step', async () => {
    const { t, s, other, p, e } = await setup();
    const hw = (
      await t.c.post('/api/homework', {
        enrollmentId: e.id,
        title: 'Zadania 1–5',
        instructions: 'Rozwiąż $x^2=4$',
        dueAt: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
      })
    ).body;
    expect(hw.status).toBe('assigned');
    expect(h.mail.outbox.at(-1)).toMatchObject({ to: s.email });

    expect((await other.c.post(`/api/homework/${hw.id}/submit`, { submission: 'x' })).status).toBe(
      404,
    );
    expect((await p.c.post(`/api/homework/${hw.id}/submit`, { submission: 'x' })).status).toBe(404);
    const sub = (
      await s.c.post(`/api/homework/${hw.id}/submit`, { submission: '$x=2$ lub $x=-2$' })
    ).body;
    expect(sub.status).toBe('submitted');
    expect(h.mail.outbox.at(-1)).toMatchObject({ to: t.email });

    expect(
      (await s.c.post(`/api/homework/${hw.id}/review`, { feedback: 'ok', grade: '6' })).status,
    ).toBe(404);
    const rev = (
      await t.c.post(`/api/homework/${hw.id}/review`, { feedback: 'Świetnie!', grade: '5+' })
    ).body;
    expect(rev).toMatchObject({ status: 'reviewed', grade: '5+' });
    expect(
      (await s.c.post(`/api/homework/${hw.id}/submit`, { submission: 'zmiana' })).body.code,
    ).toBe('homework_reviewed');

    expect((await p.c.get('/api/homework')).body).toHaveLength(1);
    expect((await other.c.get('/api/homework')).body).toEqual([]);
  });
});
