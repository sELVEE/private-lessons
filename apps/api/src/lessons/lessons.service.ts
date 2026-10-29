import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CreateLessonInput,
  isOnSlot,
  type LessonDetail,
  type LessonInfo,
  type OrgSettings,
} from '@pl/shared';
import { and, desc, eq, gt, gte, lt, ne, sql } from 'drizzle-orm';
import { AppError } from '../common/errors.js';
import { DB, type Db } from '../db/db.module.js';
import { enrollments, lessonChanges, lessons, orgSettings, users } from '../db/schema.js';
import { RlsService, type Tx } from '../rls/rls.service.js';
import { notFound, requireTutorOrg } from '../teaching/access.js';
import { LessonHooks } from './lesson-hooks.js';
import { selectLessons, toLessonInfo } from './lesson-query.js';

type User = typeof users.$inferSelect;

export const DEFAULT_SETTINGS: OrgSettings = {
  autoChargeLateCancellation: false,
  cancellationWindowHours: 24,
  defaultLessonMinutes: 60,
  slotMinutes: 30,
};

const WEEK_MS = 7 * 24 * 3600_000;

/** The slot after 10:00, e.g. „10:15” or „11:00”. */
const slotExample = (step: number) =>
  `${10 + Math.floor(step / 60)}:${String(step % 60).padStart(2, '0')}`;

@Injectable()
export class LessonsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly rls: RlsService,
    private readonly hooks: LessonHooks,
  ) {}

  list(user: User, from: Date, to: Date, enrollmentId?: string): Promise<LessonInfo[]> {
    return this.rls.run(user.id, async (tx) => {
      const rows = await selectLessons(
        tx,
        and(
          gte(lessons.startsAt, from),
          lt(lessons.startsAt, to),
          enrollmentId ? eq(lessons.enrollmentId, enrollmentId) : undefined,
        ),
      );
      return rows.map(toLessonInfo);
    });
  }

  detail(user: User, id: string): Promise<LessonDetail> {
    return this.rls.run(user.id, (tx) => this.loadDetail(tx, id));
  }

  /** Tutor schedules a lesson, optionally repeated weekly. Overlaps with own lessons are refused. */
  async create(
    user: User,
    input: Required<Pick<CreateLessonInput, 'repeatWeeks'>> & CreateLessonInput,
  ): Promise<LessonInfo[]> {
    await requireTutorOrg(this.db, user);
    return this.rls.run(user.id, async (tx) => {
      const [e] = await tx.select().from(enrollments).where(eq(enrollments.id, input.enrollmentId));
      if (!e || e.tutorId !== user.id) throw notFound('Nie znaleziono ucznia');
      if (e.status !== 'active') {
        throw new AppError(
          HttpStatus.CONFLICT,
          'enrollment_inactive',
          'Współpraca jest wstrzymana lub zakończona',
        );
      }
      const seriesId = input.repeatWeeks > 1 ? randomUUID() : null;
      await this.assertOnSlot(tx, e.organizationId, new Date(input.startsAt));
      const first = new Date(input.startsAt).getTime();
      const values = Array.from({ length: input.repeatWeeks }, (_, i) => ({
        organizationId: e.organizationId,
        enrollmentId: e.id,
        tutorId: e.tutorId,
        studentId: e.studentId,
        seriesId,
        startsAt: new Date(first + i * WEEK_MS),
        durationMin: input.durationMin,
        location: input.location || null,
        topic: input.topic || null,
      }));
      for (const v of values) await this.assertFree(tx, user.id, v.startsAt, v.durationMin);
      const created = await tx.insert(lessons).values(values).returning({ id: lessons.id });
      await tx
        .insert(lessonChanges)
        .values(created.map((c) => ({ lessonId: c.id, actorId: user.id, type: 'scheduled' })));
      const rows = await selectLessons(tx, eq(lessons.enrollmentId, e.id));
      const ids = new Set(created.map((c) => c.id));
      return rows.filter((r) => ids.has(r.l.id)).map(toLessonInfo);
    });
  }

  reschedule(
    user: User,
    id: string,
    startsAt: string,
    durationMin?: number,
    note?: string,
  ): Promise<LessonDetail> {
    return this.rls.run(user.id, async (tx) => {
      const l = await this.ownLesson(tx, user, id);
      if (l.status !== 'scheduled') throw notScheduled();
      const to = new Date(startsAt);
      await this.assertOnSlot(tx, l.organizationId, to);
      const duration = durationMin ?? l.durationMin;
      await this.assertFree(tx, user.id, to, duration, l.id);
      await tx
        .update(lessons)
        .set({ startsAt: to, durationMin: duration, reminderSentAt: null })
        .where(eq(lessons.id, id));
      await tx.insert(lessonChanges).values({
        lessonId: id,
        actorId: user.id,
        type: 'rescheduled',
        fromStartsAt: l.startsAt,
        toStartsAt: to,
        note: note || null,
      });
      await this.hooks.notify('rescheduled', l, user, to);
      return this.loadDetail(tx, id);
    });
  }

  /**
   * Tutor or student cancels. A student's late cancellation (inside the window) is charged only
   * when the organization enabled it; otherwise it waits for the tutor's decision (chargeable = null).
   */
  cancel(user: User, id: string, reason?: string): Promise<LessonDetail> {
    return this.rls.run(user.id, async (tx) => {
      const [l] = await tx.select().from(lessons).where(eq(lessons.id, id));
      if (!l || (l.tutorId !== user.id && l.studentId !== user.id))
        throw notFound('Nie znaleziono lekcji');
      if (l.status !== 'scheduled') throw notScheduled();

      let chargeable: boolean | null = false;
      if (user.id === l.studentId) {
        const settings = await this.settingsFor(tx, l.organizationId);
        const late =
          l.startsAt.getTime() - Date.now() < settings.cancellationWindowHours * 3600_000;
        chargeable = late ? (settings.autoChargeLateCancellation ? true : null) : false;
      }
      await tx
        .update(lessons)
        .set({
          status: 'cancelled',
          cancelledBy: user.id,
          cancelReason: reason || null,
          cancelledAt: new Date(),
          chargeable,
        })
        .where(eq(lessons.id, id));
      await tx
        .insert(lessonChanges)
        .values({ lessonId: id, actorId: user.id, type: 'cancelled', note: reason || null });
      if (chargeable) await this.hooks.charged(tx, id);
      await this.hooks.notify('cancelled', l, user);
      return this.loadDetail(tx, id);
    });
  }

  complete(
    user: User,
    id: string,
    attendance: 'present' | 'late' | 'absent',
  ): Promise<LessonDetail> {
    return this.rls.run(user.id, async (tx) => {
      const l = await this.ownLesson(tx, user, id);
      if (l.status === 'cancelled') throw notScheduled();
      if (l.startsAt.getTime() > Date.now()) {
        throw new AppError(
          HttpStatus.BAD_REQUEST,
          'lesson_in_future',
          'Lekcja jeszcze się nie odbyła',
        );
      }
      const wasCompleted = l.status === 'completed';
      await tx.update(lessons).set({ status: 'completed', attendance }).where(eq(lessons.id, id));
      await tx
        .insert(lessonChanges)
        .values({ lessonId: id, actorId: user.id, type: 'completed', note: attendance });
      if (!wasCompleted) await this.hooks.charged(tx, id);
      return this.loadDetail(tx, id);
    });
  }

  /** Tutor's decision on a late cancellation. */
  decideCharge(user: User, id: string, chargeable: boolean): Promise<LessonDetail> {
    return this.rls.run(user.id, async (tx) => {
      const l = await this.ownLesson(tx, user, id);
      if (l.status !== 'cancelled')
        throw new AppError(HttpStatus.BAD_REQUEST, 'not_cancelled', 'Lekcja nie jest odwołana');
      if (l.chargeable === chargeable) return this.loadDetail(tx, id);
      await tx.update(lessons).set({ chargeable }).where(eq(lessons.id, id));
      await tx.insert(lessonChanges).values({
        lessonId: id,
        actorId: user.id,
        type: chargeable ? 'charge_confirmed' : 'charge_waived',
      });
      if (chargeable) await this.hooks.charged(tx, id);
      else await this.hooks.uncharged(tx, id);
      return this.loadDetail(tx, id);
    });
  }

  async getSettings(user: User): Promise<OrgSettings> {
    const orgId = await requireTutorOrg(this.db, user);
    return this.rls.run(user.id, (tx) => this.settingsFor(tx, orgId));
  }

  async saveSettings(user: User, s: OrgSettings): Promise<OrgSettings> {
    const orgId = await requireTutorOrg(this.db, user);
    return this.rls.run(user.id, async (tx) => {
      await tx
        .insert(orgSettings)
        .values({ organizationId: orgId, ...s })
        .onConflictDoUpdate({ target: orgSettings.organizationId, set: s });
      return this.settingsFor(tx, orgId);
    });
  }

  private async settingsFor(tx: Tx, orgId: string): Promise<OrgSettings> {
    const [row] = await tx.select().from(orgSettings).where(eq(orgSettings.organizationId, orgId));
    return row
      ? {
          autoChargeLateCancellation: row.autoChargeLateCancellation,
          cancellationWindowHours: row.cancellationWindowHours,
          defaultLessonMinutes: row.defaultLessonMinutes,
          slotMinutes: row.slotMinutes,
        }
      : DEFAULT_SETTINGS;
  }

  /** Lessons start only on the organization's booking grid (e.g. every 15 or 30 minutes). */
  private async assertOnSlot(tx: Tx, orgId: string, at: Date) {
    const { slotMinutes } = await this.settingsFor(tx, orgId);
    if (!isOnSlot(at, slotMinutes)) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        'off_slot',
        `Lekcje można planować co ${slotMinutes} min (np. 10:00, ${slotExample(slotMinutes)})`,
      );
    }
  }

  private async ownLesson(tx: Tx, user: User, id: string) {
    const [l] = await tx.select().from(lessons).where(eq(lessons.id, id));
    if (!l || l.tutorId !== user.id) throw notFound('Nie znaleziono lekcji');
    return l;
  }

  private async assertFree(
    tx: Tx,
    tutorId: string,
    start: Date,
    durationMin: number,
    exceptId?: string,
  ) {
    const end = new Date(start.getTime() + durationMin * 60_000);
    const [clash] = await tx
      .select({ startsAt: lessons.startsAt })
      .from(lessons)
      .where(
        and(
          eq(lessons.tutorId, tutorId),
          eq(lessons.status, 'scheduled'),
          exceptId ? ne(lessons.id, exceptId) : undefined,
          lt(lessons.startsAt, end),
          gt(sql`${lessons.startsAt} + make_interval(mins => ${lessons.durationMin})`, start),
        ),
      )
      .limit(1);
    if (clash) {
      throw new AppError(
        HttpStatus.CONFLICT,
        'lesson_overlap',
        `Termin koliduje z inną lekcją (${clash.startsAt.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })})`,
      );
    }
  }

  private async loadDetail(tx: Tx, id: string): Promise<LessonDetail> {
    const [row] = await selectLessons(tx, eq(lessons.id, id));
    if (!row) throw notFound('Nie znaleziono lekcji');
    const changes = await tx
      .select({ c: lessonChanges, actor: users.displayName })
      .from(lessonChanges)
      .leftJoin(users, eq(users.id, lessonChanges.actorId))
      .where(eq(lessonChanges.lessonId, id))
      .orderBy(desc(lessonChanges.createdAt));
    return {
      ...toLessonInfo(row),
      changes: changes.map(({ c, actor }) => ({
        type: c.type,
        note: c.note,
        fromStartsAt: c.fromStartsAt?.toISOString() ?? null,
        toStartsAt: c.toStartsAt?.toISOString() ?? null,
        actor,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}

function notScheduled() {
  return new AppError(
    HttpStatus.CONFLICT,
    'lesson_not_scheduled',
    'Tej lekcji nie można już zmienić',
  );
}
