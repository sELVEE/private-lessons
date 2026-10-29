import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lessonNotes } from '../src/db/schema.js';
import { type Account, account, enrol, onSlot } from './fixtures.js';
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
  const p = await account(h, 'parent', 'Marek');
  const e = await enrol(t, s);
  const { code } = (await s.c.post('/api/parent-links/code')).body;
  await p.c.post('/api/parent-links/redeem', { code });
  const lesson = (
    await t.c.post('/api/lessons', {
      enrollmentId: e.id,
      startsAt: onSlot(-2),
      durationMin: 60,
    })
  ).body[0] as { id: string };
  return { t, s, p, e, lesson };
}

const put = (a: Account, url: string, body: object) => a.c.put(url, body);

describe('lesson notes', () => {
  it('are shared by tutor and student, versioned and encrypted at rest', async () => {
    const { t, s, lesson } = await setup();
    await put(t, `/api/lessons/${lesson.id}/note`, { content: 'Wzory skróconego mnożenia' });
    const edited = await put(s, `/api/lessons/${lesson.id}/note`, {
      content: 'Wzory skróconego mnożenia\n- pytanie o (a+b)^3',
    });
    expect(edited.body.content).toContain('(a+b)^3');
    expect(edited.body.updatedBy).toBe('Kasia');
    expect(edited.body.revisions).toHaveLength(2);

    const [row] = await h.db.select().from(lessonNotes).where(eq(lessonNotes.lessonId, lesson.id));
    expect(row!.contentEnc).not.toContain('mnożenia');
  });

  it('are not visible to parents or other tutors', async () => {
    const { t, p, lesson } = await setup();
    const other = await account(h, 'tutor', 'Obca');
    await put(t, `/api/lessons/${lesson.id}/note`, { content: 'prywatne' });
    expect((await p.c.get(`/api/lessons/${lesson.id}/note`)).status).toBe(404);
    expect((await other.c.get(`/api/lessons/${lesson.id}/note`)).status).toBe(404);
    expect((await put(p, `/api/lessons/${lesson.id}/note`, { content: 'x' })).status).toBe(404);

    // Even directly in the database the parent's role sees no note rows.
    const rows = await h.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${p.id}, true)`);
      await tx.execute(sql`set local role pl_app`);
      return tx.select().from(lessonNotes);
    });
    expect(rows).toEqual([]);
  });
});

describe('lesson reports', () => {
  it('are written by the tutor, read by student and parent, and e-mailed once', async () => {
    const { t, s, p, e, lesson } = await setup();
    expect((await put(s, `/api/lessons/${lesson.id}/report`, { summary: 'x' })).status).toBe(404);

    const before = h.mail.outbox.length;
    const saved = await put(t, `/api/lessons/${lesson.id}/report`, {
      summary: 'Powtórka funkcji',
      covered: 'funkcja liniowa',
      nextSteps: 'zadania 1–5',
      engagement: 4,
    });
    expect(saved.status).toBe(200);
    const mails = h.mail.outbox.slice(before);
    expect(mails.map((m) => m.to).sort()).toEqual([p.email, s.email].sort());

    await put(t, `/api/lessons/${lesson.id}/report`, { summary: 'Powtórka funkcji (poprawione)' });
    expect(h.mail.outbox.length).toBe(before + 2);

    expect((await s.c.get(`/api/lessons/${lesson.id}/report`)).body.summary).toBe(
      'Powtórka funkcji (poprawione)',
    );
    expect((await p.c.get(`/api/enrollments/${e.id}/reports`)).body).toHaveLength(1);
  });
});
