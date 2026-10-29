import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const hoursAgo = (n: number) => onSlot(-n);
const month = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }).slice(0, 7);

async function setup() {
  const t = await account(h, 'tutor', 'Anna');
  const s = await account(h, 'student', 'Kasia');
  const p = await account(h, 'parent', 'Marek');
  const e = await enrol(t, s);
  const { code } = (await s.c.post('/api/parent-links/code')).body;
  await p.c.post('/api/parent-links/redeem', { code });
  return { t, s, p, e };
}

async function pastLesson(t: Account, enrollmentId: string, hours: number, durationMin = 60) {
  const res = await t.c.post('/api/lessons', {
    enrollmentId,
    startsAt: hoursAgo(hours),
    durationMin,
  });
  return res.body[0].id as string;
}

describe('billing', () => {
  it('charges completed lessons at the hourly rate and tracks payments', async () => {
    const { t, s, p, e } = await setup();
    await t.c.put(`/api/billing/enrollments/${e.id}/rate`, { hourlyRate: 12000 });
    const l1 = await pastLesson(t, e.id, 5, 90);
    await t.c.post(`/api/lessons/${l1}/complete`, { attendance: 'present' });
    await t.c.post(`/api/lessons/${l1}/complete`, { attendance: 'late' }); // no double charge

    let acc = (await t.c.get(`/api/billing/enrollments/${e.id}`)).body;
    expect(acc.balance).toBe(18000);

    acc = (
      await t.c.post(`/api/billing/enrollments/${e.id}/payments`, { amount: 20000, method: 'blik' })
    ).body;
    expect(acc.balance).toBe(-2000);

    // Student and parent can read, not write.
    expect((await s.c.get(`/api/billing/enrollments/${e.id}`)).body.balance).toBe(-2000);
    expect((await p.c.get('/api/billing/balances')).body[0].balance).toBe(-2000);
    expect(
      (await s.c.post(`/api/billing/enrollments/${e.id}/payments`, { amount: 1, method: 'cash' }))
        .status,
    ).toBe(404);
  });

  it('uses prepaid packages before the hourly rate', async () => {
    const { t, e } = await setup();
    await t.c.put(`/api/billing/enrollments/${e.id}/rate`, { hourlyRate: 10000 });
    await t.c.post(`/api/billing/enrollments/${e.id}/packages`, { lessons: 2, price: 18000 });
    for (const hours of [30, 20, 10]) {
      const id = await pastLesson(t, e.id, hours);
      await t.c.post(`/api/lessons/${id}/complete`, { attendance: 'present' });
    }
    const acc = (await t.c.get(`/api/billing/enrollments/${e.id}`)).body;
    expect(acc.packages[0]).toMatchObject({ lessonsTotal: 2, lessonsUsed: 2 });
    expect(acc.balance).toBe(18000 + 10000);
  });

  it('charges a late cancellation only once the tutor confirms, and can waive it back', async () => {
    const { t, s, e } = await setup();
    await t.c.put(`/api/billing/enrollments/${e.id}/rate`, { hourlyRate: 10000 });
    const lesson = (
      await t.c.post('/api/lessons', {
        enrollmentId: e.id,
        startsAt: onSlot(3),
        durationMin: 60,
      })
    ).body[0].id;
    await s.c.post(`/api/lessons/${lesson}/cancel`, {});
    expect((await t.c.get(`/api/billing/enrollments/${e.id}`)).body.balance).toBe(0);
    await t.c.post(`/api/lessons/${lesson}/charge`, { chargeable: true });
    expect((await t.c.get(`/api/billing/enrollments/${e.id}`)).body.balance).toBe(10000);
    await t.c.post(`/api/lessons/${lesson}/charge`, { chargeable: false });
    expect((await t.c.get(`/api/billing/enrollments/${e.id}`)).body.balance).toBe(0);
  });

  it('auto-charges late student cancellations when enabled (written as owner from the student context)', async () => {
    const { t, s, e } = await setup();
    await t.c.put(`/api/billing/enrollments/${e.id}/rate`, { hourlyRate: 8000 });
    await t.c.put('/api/settings', {
      autoChargeLateCancellation: true,
      cancellationWindowHours: 24,
      defaultLessonMinutes: 60,
      slotMinutes: 30,
    });
    const lesson = (
      await t.c.post('/api/lessons', {
        enrollmentId: e.id,
        startsAt: onSlot(2),
        durationMin: 60,
      })
    ).body[0].id;
    expect((await s.c.post(`/api/lessons/${lesson}/cancel`, {})).status).toBe(200);
    expect((await t.c.get(`/api/billing/enrollments/${e.id}`)).body.balance).toBe(8000);
  });

  it('produces monthly statements and an earnings summary', async () => {
    const { t, s, e } = await setup();
    await t.c.put(`/api/billing/enrollments/${e.id}/rate`, { hourlyRate: 10000 });
    const id = await pastLesson(t, e.id, 2);
    await t.c.post(`/api/lessons/${id}/complete`, { attendance: 'present' });
    await t.c.post(`/api/billing/enrollments/${e.id}/payments`, { amount: 4000, method: 'cash' });
    const wrong = (
      await t.c.post(`/api/billing/enrollments/${e.id}/payments`, { amount: 999, method: 'cash' })
    ).body;
    await t.c.delete(
      `/api/billing/entries/${wrong.entries.find((x: { amount: number }) => x.amount === -999).id}`,
    );

    const st = (await s.c.get(`/api/billing/enrollments/${e.id}/statement?month=${month()}`)).body;
    expect(st.opening).toBe(0);
    expect(st.closing).toBe(6000);

    const earn = (await t.c.get(`/api/billing/earnings?month=${month()}`)).body;
    expect(earn).toMatchObject({
      received: 4000,
      charged: 10000,
      outstanding: 6000,
      lessonsCompleted: 1,
    });
    expect(earn.history).toHaveLength(6);
    expect((await s.c.get(`/api/billing/earnings?month=${month()}`)).body.code).toBe('not_a_tutor');
  });

  it('isolates billing between tutors', async () => {
    const { e } = await setup();
    const other = await account(h, 'tutor', 'Obca');
    expect((await other.c.get(`/api/billing/enrollments/${e.id}`)).status).toBe(404);
    expect(
      (await other.c.put(`/api/billing/enrollments/${e.id}/rate`, { hourlyRate: 1 })).status,
    ).toBe(404);
    expect((await other.c.get('/api/billing/balances')).body).toEqual([]);
  });
});

describe('tutor ledger and payment reminders', () => {
  it('lists the month across students and e-mails a reminder to student and parents', async () => {
    const { t, s, p, e } = await setup();
    await t.c.put(`/api/billing/enrollments/${e.id}/rate`, { hourlyRate: 12000 });
    expect((await t.c.post(`/api/billing/enrollments/${e.id}/remind`)).body.code).toBe(
      'nothing_due',
    );
    const id = await pastLesson(t, e.id, 2);
    await t.c.post(`/api/lessons/${id}/complete`, { attendance: 'present' });

    const ledger = (await t.c.get(`/api/billing/ledger?month=${month()}`)).body;
    expect(ledger[0]).toMatchObject({ student: 'Kasia', subject: 'Matematyka', amount: 12000 });
    expect((await s.c.get(`/api/billing/ledger?month=${month()}`)).body.code).toBe('not_a_tutor');

    const before = h.mail.outbox.length;
    expect((await t.c.post(`/api/billing/enrollments/${e.id}/remind`)).body.sent).toBe(2);
    expect(
      h.mail.outbox
        .slice(before)
        .map((m) => m.to)
        .sort(),
    ).toEqual([p.email, s.email].sort());
    expect((await s.c.post(`/api/billing/enrollments/${e.id}/remind`)).status).toBe(404);
  });
});
