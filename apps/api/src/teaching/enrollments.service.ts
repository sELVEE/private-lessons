import { Injectable } from '@nestjs/common';
import type { EnrollmentDetail, EnrollmentInfo, EnrollmentStatus } from '@pl/shared';
import { desc, eq } from 'drizzle-orm';
import { enrollmentEvents, enrollments, users } from '../db/schema.js';
import { RlsService } from '../rls/rls.service.js';
import { notFound } from './access.js';
import { selectEnrollments, toEnrollmentInfo } from './enrollment-query.js';

type User = typeof users.$inferSelect;

const STATUS_EVENT: Record<EnrollmentStatus, string> = {
  active: 'resumed',
  paused: 'paused',
  ended: 'ended',
};

/**
 * One endpoint serves every role: row-level security decides which enrollments the user sees
 * (tutor — own students, student — own, parent — children's, organization owner — all in it).
 */
@Injectable()
export class EnrollmentsService {
  constructor(private readonly rls: RlsService) {}

  list(user: User): Promise<EnrollmentInfo[]> {
    return this.rls.run(user.id, async (tx) => (await selectEnrollments(tx)).map(toEnrollmentInfo));
  }

  detail(user: User, id: string): Promise<EnrollmentDetail> {
    return this.rls.run(user.id, async (tx) => {
      const [row] = await selectEnrollments(tx, eq(enrollments.id, id));
      if (!row) throw notFound('Nie znaleziono współpracy');
      const events = await tx
        .select({ e: enrollmentEvents, actor: users.displayName })
        .from(enrollmentEvents)
        .leftJoin(users, eq(users.id, enrollmentEvents.actorId))
        .where(eq(enrollmentEvents.enrollmentId, id))
        .orderBy(desc(enrollmentEvents.createdAt));
      return {
        ...toEnrollmentInfo(row),
        studentEmail: row.e.tutorId === user.id ? row.studentEmail : null,
        events: events.map(({ e, actor }) => ({
          type: e.type,
          note: e.note,
          createdAt: e.createdAt.toISOString(),
          actor,
        })),
      };
    });
  }

  /** Only the student's tutor may change goals or status (enforced by RLS too). */
  update(
    user: User,
    id: string,
    patch: { goals?: string | null; status?: EnrollmentStatus },
  ): Promise<EnrollmentDetail> {
    return this.rls
      .run(user.id, async (tx) => {
        const [current] = await tx.select().from(enrollments).where(eq(enrollments.id, id));
        if (!current || current.tutorId !== user.id) throw notFound('Nie znaleziono współpracy');

        const set: Partial<typeof enrollments.$inferInsert> = {};
        const events: { type: string; note: string | null }[] = [];
        if (patch.goals !== undefined && patch.goals !== current.goals) {
          set.goals = patch.goals || null;
          events.push({ type: 'goals_updated', note: set.goals ?? null });
        }
        if (patch.status && patch.status !== current.status) {
          set.status = patch.status;
          set.endedAt = patch.status === 'ended' ? new Date() : null;
          events.push({ type: STATUS_EVENT[patch.status], note: null });
        }
        if (!events.length) return;
        await tx.update(enrollments).set(set).where(eq(enrollments.id, id));
        await tx
          .insert(enrollmentEvents)
          .values(events.map((ev) => ({ ...ev, enrollmentId: id, actorId: user.id })));
      })
      .then(() => this.detail(user, id));
  }
}
