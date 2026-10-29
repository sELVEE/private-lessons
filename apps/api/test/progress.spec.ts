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

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000).toISOString().slice(0, 10);

async function setup() {
  const t = await account(h, 'tutor', 'Anna');
  const s = await account(h, 'student', 'Kasia');
  const p = await account(h, 'parent', 'Marek');
  const e = await enrol(t, s);
  const { code } = (await s.c.post('/api/parent-links/code')).body;
  await p.c.post('/api/parent-links/redeem', { code });
  const subject = await firstSubject(t);
  await t.c.post(`/api/subjects/${subject.id}/topics`, { name: 'Funkcje' });
  await t.c.post(`/api/subjects/${subject.id}/topics`, { name: 'Ciągi' });
  return { t, s, p, e };
}

describe('progress', () => {
  it('tracks assessments, topics and goals with a trend in the summary', async () => {
    const { t, s, p, e } = await setup();
    await t.c.post(`/api/progress/${e.id}/assessments`, {
      title: 'Sprawdzian 1',
      kind: 'test',
      score: 30,
      maxScore: 50,
      takenAt: daysAgo(60),
    });
    const after = await t.c.post(`/api/progress/${e.id}/assessments`, {
      title: 'Sprawdzian 2',
      kind: 'test',
      score: 40,
      maxScore: 50,
      takenAt: daysAgo(3),
    });
    expect(after.body.assessments[0].percent).toBe(80);
    expect(after.body.summary).toMatchObject({ averagePercent: 80, trend: 20 });

    const [funkcje, ciagi] = after.body.topics;
    await t.c.put(`/api/progress/${e.id}/topics/${funkcje.topicId}`, { status: 'mastered' });
    const topics = (
      await t.c.put(`/api/progress/${e.id}/topics/${ciagi.topicId}`, { status: 'review' })
    ).body;
    expect(topics.summary).toMatchObject({ mastered: 1, toReview: ['Ciągi'] });

    const withGoal = (
      await t.c.post(`/api/progress/${e.id}/goals`, {
        title: 'Matura 80%',
        targetDate: '2027-05-10',
      })
    ).body;
    await t.c.patch(`/api/progress/goals/${withGoal.goals[0].id}`, { achieved: true });

    const studentView = (await s.c.get(`/api/progress/${e.id}`)).body;
    expect(studentView.summary.goalsAchieved).toBe(1);
    expect((await p.c.get(`/api/progress/${e.id}`)).body.assessments).toHaveLength(2);
  });

  it('is written only by the tutor and invisible to strangers', async () => {
    const { s, p, e } = await setup();
    const other = await account(h, 'tutor', 'Obca');
    const body = { title: 'X test', kind: 'quiz', grade: '5', takenAt: daysAgo(1) };
    expect((await s.c.post(`/api/progress/${e.id}/assessments`, body)).status).toBe(404);
    expect((await p.c.post(`/api/progress/${e.id}/goals`, { title: 'cel' })).status).toBe(404);
    expect((await other.c.get(`/api/progress/${e.id}`)).status).toBe(404);
  });

  it('validates scores and e-mails the summary to student and parents', async () => {
    const { t, s, p, e } = await setup();
    const bad = await t.c.post(`/api/progress/${e.id}/assessments`, {
      title: 'Zły',
      kind: 'test',
      score: 60,
      maxScore: 50,
      takenAt: daysAgo(1),
    });
    expect(bad.body.code).toBe('validation_failed');
    const before = h.mail.outbox.length;
    expect((await t.c.post(`/api/progress/${e.id}/send-summary?days=30`)).body.sent).toBe(2);
    const sent = h.mail.outbox.slice(before);
    expect(sent.map((m) => m.to).sort()).toEqual([p.email, s.email].sort());
    expect(sent[0]!.text).toContain('Odbyte lekcje');
  });
});
