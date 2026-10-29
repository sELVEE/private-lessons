import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lessons } from '../src/db/schema.js';
import { ReminderService } from '../src/lessons/reminder.service.js';
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

const inHours = onSlot;

async function setup() {
  const t = await account(h, 'tutor', 'Anna');
  const s = await account(h, 'student', 'Kasia');
  const e = await enrol(t, s);
  return { t, s, e };
}

async function schedule(t: Account, enrollmentId: string, startsAt: string, extra: object = {}) {
  const res = await t.c.post('/api/lessons', { enrollmentId, startsAt, durationMin: 60, ...extra });
  expect(res.status).toBe(201);
  return res.body as { id: string; seriesId: string | null }[];
}

describe('lessons', () => {
  it('schedules a weekly series and shows it to tutor and student', async () => {
    const { t, s, e } = await setup();
    const series = await schedule(t, e.id, inHours(48), { repeatWeeks: 4, location: 'online' });
    expect(series).toHaveLength(4);
    expect(new Set(series.map((l) => l.seriesId)).size).toBe(1);

    const range = `from=${encodeURIComponent(inHours(0))}&to=${encodeURIComponent(inHours(24 * 40))}`;
    expect((await t.c.get(`/api/lessons?${range}`)).body).toHaveLength(4);
    const studentView = (await s.c.get(`/api/lessons?${range}`)).body;
    expect(studentView).toHaveLength(4);
    expect(studentView[0].subject).toBe('Matematyka');
  });

  it('refuses overlapping lessons for the same tutor', async () => {
    const { t, e } = await setup();
    const at = inHours(72);
    await schedule(t, e.id, at);
    const clash = await t.c.post('/api/lessons', {
      enrollmentId: e.id,
      startsAt: new Date(Date.parse(at) + 30 * 60_000).toISOString(),
      durationMin: 60,
    });
    expect(clash.body.code).toBe('lesson_overlap');
  });

  it('hides lessons from other tutors and does not let students schedule', async () => {
    const { t, s, e } = await setup();
    const other = await account(h, 'tutor', 'Obca');
    const [l] = await schedule(t, e.id, inHours(30));
    expect((await other.c.get(`/api/lessons/${l!.id}`)).status).toBe(404);
    expect((await other.c.post(`/api/lessons/${l!.id}/cancel`, {})).status).toBe(404);
    expect(
      (
        await s.c.post('/api/lessons', {
          enrollmentId: e.id,
          startsAt: inHours(50),
          durationMin: 60,
        })
      ).status,
    ).toBe(403);
    expect(
      (await s.c.post(`/api/lessons/${l!.id}/reschedule`, { startsAt: inHours(55) })).status,
    ).toBe(404);
  });

  it('reschedules with history and notifies the student', async () => {
    const { t, s, e } = await setup();
    const [l] = await schedule(t, e.id, inHours(30));
    const res = await t.c.post(`/api/lessons/${l!.id}/reschedule`, {
      startsAt: inHours(54),
      note: 'choroba',
    });
    expect(res.body.changes[0]).toMatchObject({ type: 'rescheduled', note: 'choroba' });
    expect(h.mail.outbox.at(-1)).toMatchObject({ to: s.email, subject: 'Lekcja przełożona' });
  });
});

describe('cancellation policy', () => {
  it('free when cancelled early, waits for the tutor when cancelled late', async () => {
    const { t, s, e } = await setup();
    const [early] = await schedule(t, e.id, inHours(72));
    const [late] = await schedule(t, e.id, inHours(5));

    expect(
      (await s.c.post(`/api/lessons/${early!.id}/cancel`, { reason: 'wyjazd' })).body.chargeable,
    ).toBe(false);
    const lateRes = await s.c.post(`/api/lessons/${late!.id}/cancel`, {});
    expect(lateRes.body.chargeable).toBeNull();
    expect(lateRes.body.cancelledByStudent).toBe(true);

    expect((await s.c.post(`/api/lessons/${late!.id}/charge`, { chargeable: true })).status).toBe(
      404,
    );
    const decided = await t.c.post(`/api/lessons/${late!.id}/charge`, { chargeable: true });
    expect(decided.body.chargeable).toBe(true);
  });

  it('charges late cancellations automatically when the tutor enabled it', async () => {
    const { t, s, e } = await setup();
    expect((await t.c.get('/api/settings')).body.autoChargeLateCancellation).toBe(false);
    await t.c.put('/api/settings', {
      autoChargeLateCancellation: true,
      cancellationWindowHours: 12,
      defaultLessonMinutes: 60,
      slotMinutes: 30,
    });
    const [late] = await schedule(t, e.id, inHours(6));
    const [early] = await schedule(t, e.id, inHours(20));
    expect((await s.c.post(`/api/lessons/${late!.id}/cancel`, {})).body.chargeable).toBe(true);
    expect((await s.c.post(`/api/lessons/${early!.id}/cancel`, {})).body.chargeable).toBe(false);
  });

  it('never charges when the tutor cancels', async () => {
    const { t, e } = await setup();
    const [l] = await schedule(t, e.id, inHours(2));
    expect((await t.c.post(`/api/lessons/${l!.id}/cancel`, {})).body.chargeable).toBe(false);
  });
});

describe('attendance', () => {
  it('records attendance only after the lesson started', async () => {
    const { t, s, e } = await setup();
    const [future] = await schedule(t, e.id, inHours(10));
    expect(
      (await t.c.post(`/api/lessons/${future!.id}/complete`, { attendance: 'present' })).body.code,
    ).toBe('lesson_in_future');
    const [past] = await schedule(t, e.id, inHours(-3));
    const done = await t.c.post(`/api/lessons/${past!.id}/complete`, { attendance: 'late' });
    expect(done.body).toMatchObject({ status: 'completed', attendance: 'late' });
    expect(
      (await s.c.post(`/api/lessons/${past!.id}/complete`, { attendance: 'present' })).status,
    ).toBe(404);
  });
});

describe('reminders', () => {
  it('e-mails both sides once, about a day before', async () => {
    const { t, s, e } = await setup();
    const [soon] = await schedule(t, e.id, inHours(20));
    await schedule(t, e.id, inHours(40));
    const reminders = h.app.get(ReminderService);
    await reminders.tick();
    const [row] = await h.db.select().from(lessons).where(eq(lessons.id, soon!.id));
    expect(row!.reminderSentAt).not.toBeNull();
    expect(
      h.mail.outbox.some((m) => m.to === s.email && m.subject.startsWith('Przypomnienie')),
    ).toBe(true);
    expect(
      h.mail.outbox.some((m) => m.to === t.email && m.subject.startsWith('Przypomnienie')),
    ).toBe(true);
  });

  it('keeps lesson starts on the configured booking step', async () => {
    const { t, e } = await setup();
    const base = Date.parse(inHours(72));
    const at = (min: number) => new Date(base + min * 60_000).toISOString();
    const settings = (await t.c.get('/api/settings')).body;
    expect(settings.slotMinutes).toBe(30);

    const off = await t.c.post('/api/lessons', {
      enrollmentId: e.id,
      startsAt: at(15),
      durationMin: 60,
    });
    expect(off.status).toBe(400);
    expect(off.body.code).toBe('off_slot');

    expect((await t.c.put('/api/settings', { ...settings, slotMinutes: 7 })).status).toBe(400);
    expect(
      (await t.c.put('/api/settings', { ...settings, slotMinutes: 15 })).body.slotMinutes,
    ).toBe(15);
    const [l] = await schedule(t, e.id, at(15));
    const moved = await t.c.post(`/api/lessons/${l!.id}/reschedule`, { startsAt: at(130) });
    expect(moved.body.code).toBe('off_slot');
    expect((await t.c.post(`/api/lessons/${l!.id}/reschedule`, { startsAt: at(135) })).status).toBe(
      200,
    );
  });
});
