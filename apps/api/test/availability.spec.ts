import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { account } from './fixtures.js';
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

const workdays = [0, 1, 2, 3].map((weekday) => ({
  weekday,
  ranges: [{ start: '15:00', end: '20:00' }],
}));

describe('availability', () => {
  it('stores a weekly template and per-day exceptions', async () => {
    const t = await account(h, 'tutor', 'Anna');
    const saved = await t.c.put('/api/availability/weekly', {
      days: [...workdays, { weekday: 4, ranges: [{ start: '17:00', end: '20:00' }] }],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.weekly).toHaveLength(5);
    expect(saved.body.weekly[4]).toEqual({
      weekday: 4,
      ranges: [{ start: '17:00', end: '20:00' }],
    });

    const day = new Date(Date.now() + 5 * 24 * 3600_000).toISOString().slice(0, 10);
    const off = await t.c.put(`/api/availability/exceptions/${day}`, { ranges: [], note: 'urlop' });
    expect(off.body.exceptions).toEqual([{ date: day, ranges: [], note: 'urlop' }]);

    const split = await t.c.put(`/api/availability/exceptions/${day}`, {
      ranges: [
        { start: '16:00', end: '18:00' },
        { start: '09:00', end: '11:00' },
      ],
    });
    expect(split.body.exceptions[0].ranges).toEqual([
      { start: '09:00', end: '11:00' },
      { start: '16:00', end: '18:00' },
    ]);

    // Ponowny zapis szablonu zastępuje poprzedni, wyjątki zostają.
    const replaced = await t.c.put('/api/availability/weekly', { days: workdays.slice(0, 1) });
    expect(replaced.body.weekly).toHaveLength(1);
    expect(replaced.body.exceptions).toHaveLength(1);

    const removed = await t.c.delete(`/api/availability/exceptions/${day}`);
    expect(removed.body.exceptions).toEqual([]);
  });

  it('validates ranges and dates', async () => {
    const t = await account(h, 'tutor', 'Anna');
    const backwards = await t.c.put('/api/availability/weekly', {
      days: [{ weekday: 0, ranges: [{ start: '20:00', end: '15:00' }] }],
    });
    expect(backwards.status).toBe(400);
    const overlap = await t.c.put('/api/availability/weekly', {
      days: [
        {
          weekday: 0,
          ranges: [
            { start: '15:00', end: '18:00' },
            { start: '17:00', end: '19:00' },
          ],
        },
      ],
    });
    expect(overlap.status).toBe(400);
    expect((await t.c.put('/api/availability/exceptions/2026-02-30', { ranges: [] })).status).toBe(
      400,
    );
    expect((await t.c.put('/api/availability/exceptions/2026-99-99', { ranges: [] })).status).toBe(
      400,
    );
  });

  it('is private to the tutor and unavailable to students', async () => {
    const anna = await account(h, 'tutor', 'Anna');
    const other = await account(h, 'tutor', 'Piotr');
    const kasia = await account(h, 'student', 'Kasia');
    await anna.c.put('/api/availability/weekly', { days: workdays });
    expect((await other.c.get('/api/availability')).body).toEqual({ weekly: [], exceptions: [] });
    expect((await kasia.c.get('/api/availability')).status).toBe(403);
  });
});
