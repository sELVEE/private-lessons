import { Injectable } from '@nestjs/common';
import {
  type AssessmentInfo,
  type AssessmentInput,
  type GoalInfo,
  type ProgressInfo,
  type ProgressSummary,
  type TopicProgressInfo,
  type TopicStatus,
} from '@pl/shared';
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  assessments,
  enrollments,
  homework,
  learningGoals,
  lessonReports,
  lessons,
  parentLinks,
  subjects,
  topicProgress,
  topics,
  users,
} from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import { RlsService, type Tx } from '../rls/rls.service.js';
import { notFound } from '../teaching/access.js';

type User = typeof users.$inferSelect;
type Enrollment = typeof enrollments.$inferSelect;

const tutorU = alias(users, 'tutor');
const studentU = alias(users, 'student');
const DAY_MS = 24 * 3600_000;

const scope = (e: Enrollment) => ({
  organizationId: e.organizationId,
  enrollmentId: e.id,
  tutorId: e.tutorId,
  studentId: e.studentId,
});

@Injectable()
export class ProgressService {
  constructor(
    private readonly rls: RlsService,
    private readonly mail: MailService,
  ) {}

  /** Everything about one cooperation's progress; tutor, student and linked parents (RLS). */
  get(user: User, enrollmentId: string, periodDays = 30): Promise<ProgressInfo> {
    return this.rls.run(user.id, (tx) => this.load(tx, enrollmentId, periodDays));
  }

  async addAssessment(user: User, enrollmentId: string, a: AssessmentInput): Promise<ProgressInfo> {
    return this.rls.run(user.id, async (tx) => {
      const e = await this.own(tx, user, enrollmentId);
      if (a.topicId) await this.assertTopic(tx, e, a.topicId);
      await tx.insert(assessments).values({
        ...scope(e),
        title: a.title,
        kind: a.kind,
        score: a.score ?? null,
        maxScore: a.maxScore ?? null,
        grade: a.grade || null,
        takenAt: a.takenAt,
        topicId: a.topicId ?? null,
        note: a.note || null,
      });
      return this.load(tx, enrollmentId, 30);
    });
  }

  async removeAssessment(user: User, id: string): Promise<void> {
    await this.rls.run(user.id, async (tx) => {
      const deleted = await tx
        .delete(assessments)
        .where(and(eq(assessments.id, id), eq(assessments.tutorId, user.id)))
        .returning({ id: assessments.id });
      if (!deleted.length) throw notFound('Nie znaleziono oceny');
    });
  }

  async setTopic(
    user: User,
    enrollmentId: string,
    topicId: string,
    status: TopicStatus | null,
  ): Promise<ProgressInfo> {
    return this.rls.run(user.id, async (tx) => {
      const e = await this.own(tx, user, enrollmentId);
      await this.assertTopic(tx, e, topicId);
      if (status === null) {
        await tx
          .delete(topicProgress)
          .where(and(eq(topicProgress.enrollmentId, e.id), eq(topicProgress.topicId, topicId)));
      } else {
        await tx
          .insert(topicProgress)
          .values({ ...scope(e), topicId, status })
          .onConflictDoUpdate({
            target: [topicProgress.enrollmentId, topicProgress.topicId],
            set: { status, updatedAt: new Date() },
          });
      }
      return this.load(tx, enrollmentId, 30);
    });
  }

  async addGoal(
    user: User,
    enrollmentId: string,
    title: string,
    targetDate?: string | null,
  ): Promise<ProgressInfo> {
    return this.rls.run(user.id, async (tx) => {
      const e = await this.own(tx, user, enrollmentId);
      await tx.insert(learningGoals).values({ ...scope(e), title, targetDate: targetDate ?? null });
      return this.load(tx, enrollmentId, 30);
    });
  }

  async setGoal(user: User, id: string, achieved: boolean): Promise<void> {
    await this.rls.run(user.id, async (tx) => {
      const updated = await tx
        .update(learningGoals)
        .set({ achievedAt: achieved ? new Date() : null })
        .where(and(eq(learningGoals.id, id), eq(learningGoals.tutorId, user.id)))
        .returning({ id: learningGoals.id });
      if (!updated.length) throw notFound('Nie znaleziono celu');
    });
  }

  async removeGoal(user: User, id: string): Promise<void> {
    await this.rls.run(user.id, async (tx) => {
      const deleted = await tx
        .delete(learningGoals)
        .where(and(eq(learningGoals.id, id), eq(learningGoals.tutorId, user.id)))
        .returning({ id: learningGoals.id });
      if (!deleted.length) throw notFound('Nie znaleziono celu');
    });
  }

  /** E-mails the period summary to the student and linked parents. */
  async sendSummary(
    user: User,
    enrollmentId: string,
    periodDays: number,
  ): Promise<{ sent: number }> {
    const { info, emails } = await this.rls.run(user.id, async (tx) => {
      const e = await this.own(tx, user, enrollmentId);
      const info = await this.load(tx, enrollmentId, periodDays);
      const recipients = await this.rls.asOwner(tx, async () => {
        const [s] = await tx
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, e.studentId));
        const parents = await tx
          .select({ email: users.email })
          .from(parentLinks)
          .innerJoin(users, eq(users.id, parentLinks.parentId))
          .where(eq(parentLinks.studentId, e.studentId));
        return [s?.email, ...parents.map((p) => p.email)].filter((x): x is string => !!x);
      });
      return { info, emails: recipients };
    });
    const s = info.summary;
    const lines = [
      `Podsumowanie postępów: ${info.student} · ${info.subject} (ostatnie ${periodDays} dni)`,
      '',
      `• Odbyte lekcje: ${s.lessonsCompleted}${s.attendanceRate !== null ? `, frekwencja ${s.attendanceRate}%` : ''}`,
      `• Zadania domowe: ${s.homeworkDone}/${s.homeworkAssigned} oddane`,
      s.averagePercent !== null
        ? `• Średni wynik: ${s.averagePercent}%${s.trend !== null ? ` (${s.trend >= 0 ? '+' : ''}${s.trend} pp. względem wcześniej)` : ''}`
        : '• Brak ocen punktowych w tym okresie',
      `• Opanowane tematy: ${s.mastered}`,
      s.toReview.length ? `• Do powtórki: ${s.toReview.join(', ')}` : '',
      `• Cele: ${s.goalsAchieved} osiągnięte, ${s.goalsOpen} w toku`,
      s.lastNextSteps ? `\nDalsze kroki: ${s.lastNextSteps}` : '',
      '',
      `Szczegóły: ${this.mail.link(`/app/progress/${enrollmentId}`)}`,
      `— ${user.displayName}`,
    ].filter((l) => l !== '');
    for (const to of emails) {
      await this.mail.send({
        to,
        subject: `Postępy: ${info.student} — ${info.subject}`,
        text: lines.join('\n'),
      });
    }
    return { sent: emails.length };
  }

  // ---------------------------------------------------------------- internals

  private async load(tx: Tx, enrollmentId: string, periodDays: number): Promise<ProgressInfo> {
    const [head] = await tx
      .select({
        e: enrollments,
        subject: subjects.name,
        tutor: tutorU.displayName,
        student: studentU.displayName,
      })
      .from(enrollments)
      .innerJoin(subjects, eq(subjects.id, enrollments.subjectId))
      .innerJoin(tutorU, eq(tutorU.id, enrollments.tutorId))
      .innerJoin(studentU, eq(studentU.id, enrollments.studentId))
      .where(eq(enrollments.id, enrollmentId));
    if (!head) throw notFound('Nie znaleziono współpracy');
    const e = head.e;

    const aRows = await tx
      .select({ a: assessments, topic: topics.name })
      .from(assessments)
      .leftJoin(topics, eq(topics.id, assessments.topicId))
      .where(eq(assessments.enrollmentId, enrollmentId))
      .orderBy(desc(assessments.takenAt), desc(assessments.createdAt));
    const list: AssessmentInfo[] = aRows.map(({ a, topic }) => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      score: a.score,
      maxScore: a.maxScore,
      percent: a.score != null && a.maxScore ? Math.round((a.score / a.maxScore) * 100) : null,
      grade: a.grade,
      takenAt: a.takenAt,
      topic,
      note: a.note,
    }));

    const allTopics = await tx
      .select()
      .from(topics)
      .where(eq(topics.subjectId, e.subjectId))
      .orderBy(asc(topics.createdAt));
    const statuses = await tx
      .select()
      .from(topicProgress)
      .where(eq(topicProgress.enrollmentId, enrollmentId));
    const topicList: TopicProgressInfo[] = allTopics.map((t) => {
      const st = statuses.find((s) => s.topicId === t.id);
      return {
        topicId: t.id,
        name: t.name,
        parentId: t.parentId,
        status: st?.status ?? null,
        updatedAt: st?.updatedAt.toISOString() ?? null,
      };
    });

    const goals = await tx
      .select()
      .from(learningGoals)
      .where(eq(learningGoals.enrollmentId, enrollmentId))
      .orderBy(asc(learningGoals.createdAt));
    const goalList: GoalInfo[] = goals.map((g) => ({
      id: g.id,
      title: g.title,
      targetDate: g.targetDate,
      achievedAt: g.achievedAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
    }));

    const since = new Date(Date.now() - periodDays * DAY_MS);
    const periodLessons = await tx
      .select()
      .from(lessons)
      .where(and(eq(lessons.enrollmentId, enrollmentId), gte(lessons.startsAt, since)));
    const completed = periodLessons.filter((l) => l.status === 'completed');
    const present = completed.filter((l) => l.attendance !== 'absent').length;
    const hw = await tx
      .select()
      .from(homework)
      .where(and(eq(homework.enrollmentId, enrollmentId), gte(homework.createdAt, since)));
    const [lastReport] = await tx
      .select({ nextSteps: lessonReports.nextSteps })
      .from(lessonReports)
      .where(eq(lessonReports.enrollmentId, enrollmentId))
      .orderBy(desc(lessonReports.updatedAt))
      .limit(1);

    const sinceDate = since.toISOString().slice(0, 10);
    const avg = (xs: AssessmentInfo[]) => {
      const p = xs.map((x) => x.percent).filter((x): x is number => x !== null);
      return p.length ? Math.round(p.reduce((s, x) => s + x, 0) / p.length) : null;
    };
    const inPeriod = avg(list.filter((a) => a.takenAt >= sinceDate));
    const before = avg(list.filter((a) => a.takenAt < sinceDate));
    const summary: ProgressSummary = {
      periodDays,
      lessonsCompleted: completed.length,
      attendanceRate: completed.length ? Math.round((present / completed.length) * 100) : null,
      homeworkAssigned: hw.length,
      homeworkDone: hw.filter((h) => h.status !== 'assigned').length,
      averagePercent: inPeriod,
      trend: inPeriod !== null && before !== null ? inPeriod - before : null,
      mastered: topicList.filter((t) => t.status === 'mastered').length,
      toReview: topicList.filter((t) => t.status === 'review').map((t) => t.name),
      goalsAchieved: goalList.filter((g) => g.achievedAt).length,
      goalsOpen: goalList.filter((g) => !g.achievedAt).length,
      lastNextSteps: lastReport?.nextSteps || null,
    };

    return {
      enrollmentId,
      student: head.student,
      tutor: head.tutor,
      subject: head.subject,
      assessments: list,
      topics: topicList,
      goals: goalList,
      summary,
    };
  }

  private async own(tx: Tx, user: User, enrollmentId: string) {
    const [e] = await tx.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
    if (!e || e.tutorId !== user.id) throw notFound('Nie znaleziono ucznia');
    return e;
  }

  private async assertTopic(tx: Tx, e: Enrollment, topicId: string) {
    const [t] = await tx
      .select()
      .from(topics)
      .where(and(eq(topics.id, topicId), eq(topics.subjectId, e.subjectId)));
    if (!t) throw notFound('Nie znaleziono tematu');
  }
}
