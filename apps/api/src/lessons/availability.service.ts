import { Inject, Injectable } from '@nestjs/common';
import {
  type Availability,
  type AvailabilityException,
  clockToMinutes,
  minutesToClock,
  type TimeRange,
  type WeeklyHours,
} from '@pl/shared';
import { and, asc, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { availability, type users } from '../db/schema.js';
import { RlsService } from '../rls/rls.service.js';
import { requireTutorOrg } from '../teaching/access.js';

type User = typeof users.$inferSelect;
type Row = typeof availability.$inferSelect;

const toRange = (r: Row): TimeRange => ({
  start: minutesToClock(r.startMin!),
  end: minutesToClock(r.endMin!),
});
const byStart = (a: Row, b: Row) => (a.startMin ?? -1) - (b.startMin ?? -1);

/** Godziny pracy korepetytora: tygodniowy szablon i wyjątki na wybrane dni. */
@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly rls: RlsService,
  ) {}

  async get(user: User): Promise<Availability> {
    await requireTutorOrg(this.db, user);
    return this.rls.run(user.id, async (tx) => {
      // Wyjątki z przeszłości (starsze niż 60 dni) nie są potrzebne w kalendarzu.
      const since = new Date(Date.now() - 60 * 24 * 3600_000).toISOString().slice(0, 10);
      const [weekly, dated] = await Promise.all([
        tx
          .select()
          .from(availability)
          .where(and(eq(availability.tutorId, user.id), isNotNull(availability.weekday))),
        tx
          .select()
          .from(availability)
          .where(and(eq(availability.tutorId, user.id), gte(availability.onDate, since)))
          .orderBy(asc(availability.onDate)),
      ]);
      const days = new Map<number, TimeRange[]>();
      for (const r of weekly.sort(byStart)) {
        days.set(r.weekday!, [...(days.get(r.weekday!) ?? []), toRange(r)]);
      }
      const exceptions = new Map<string, AvailabilityException>();
      for (const r of dated.sort(byStart)) {
        const e = exceptions.get(r.onDate!) ?? { date: r.onDate!, ranges: [], note: r.note };
        if (r.startMin !== null) e.ranges.push(toRange(r));
        exceptions.set(r.onDate!, e);
      }
      return {
        weekly: [...days.entries()]
          .sort(([a], [b]) => a - b)
          .map(([weekday, ranges]) => ({ weekday, ranges })),
        exceptions: [...exceptions.values()].sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
  }

  async saveWeekly(user: User, input: WeeklyHours): Promise<Availability> {
    const orgId = await requireTutorOrg(this.db, user);
    await this.rls.run(user.id, async (tx) => {
      await tx
        .delete(availability)
        .where(and(eq(availability.tutorId, user.id), isNull(availability.onDate)));
      const rows = input.days.flatMap((d) =>
        d.ranges.map((r) => ({
          organizationId: orgId,
          tutorId: user.id,
          weekday: d.weekday,
          startMin: clockToMinutes(r.start),
          endMin: clockToMinutes(r.end),
        })),
      );
      if (rows.length) await tx.insert(availability).values(rows);
    });
    return this.get(user);
  }

  /** Ustawia wyjątek na dzień; pusta lista przedziałów = dzień wolny. */
  async saveException(
    user: User,
    date: string,
    input: { ranges: TimeRange[]; note?: string },
  ): Promise<Availability> {
    const orgId = await requireTutorOrg(this.db, user);
    await this.rls.run(user.id, async (tx) => {
      await tx
        .delete(availability)
        .where(and(eq(availability.tutorId, user.id), eq(availability.onDate, date)));
      const base = {
        organizationId: orgId,
        tutorId: user.id,
        onDate: date,
        note: input.note ?? null,
      };
      await tx.insert(availability).values(
        input.ranges.length
          ? input.ranges.map((r) => ({
              ...base,
              startMin: clockToMinutes(r.start),
              endMin: clockToMinutes(r.end),
            }))
          : [base],
      );
    });
    return this.get(user);
  }

  async removeException(user: User, date: string): Promise<Availability> {
    await requireTutorOrg(this.db, user);
    await this.rls.run(user.id, (tx) =>
      tx
        .delete(availability)
        .where(and(eq(availability.tutorId, user.id), eq(availability.onDate, date))),
    );
    return this.get(user);
  }
}
