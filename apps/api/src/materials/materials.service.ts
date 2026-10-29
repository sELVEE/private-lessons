import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { HomeworkInfo, HomeworkInput, MaterialInfo, MaterialInput } from '@pl/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AppError } from '../common/errors.js';
import { DB, type Db } from '../db/db.module.js';
import {
  enrollments,
  homework,
  lessons,
  materialShares,
  materials,
  subjects,
  topics,
  users,
} from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import { RlsService, type Tx } from '../rls/rls.service.js';
import { notFound, requireTutorOrg } from '../teaching/access.js';

type User = typeof users.$inferSelect;

const tutorU = alias(users, 'tutor');
const studentU = alias(users, 'student');

@Injectable()
export class MaterialsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly rls: RlsService,
    private readonly mail: MailService,
  ) {}

  // ---------------------------------------------------------------- materials

  /** Tutor: own library. Student/parent: items shared with them (RLS decides). */
  listMaterials(user: User, subjectId?: string): Promise<MaterialInfo[]> {
    return this.rls.run(user.id, async (tx) => {
      const rows = await this.selectMaterials(
        tx,
        subjectId ? eq(materials.subjectId, subjectId) : undefined,
      );
      return this.withShares(tx, user, rows);
    });
  }

  getMaterial(user: User, id: string): Promise<MaterialInfo> {
    return this.rls.run(user.id, async (tx) => {
      const rows = await this.selectMaterials(tx, eq(materials.id, id));
      if (!rows.length) throw notFound('Nie znaleziono materiału');
      return (await this.withShares(tx, user, rows))[0]!;
    });
  }

  async createMaterial(user: User, input: MaterialInput): Promise<MaterialInfo> {
    const orgId = await requireTutorOrg(this.db, user);
    const id = await this.rls.run(user.id, async (tx) => {
      await this.assertSubject(tx, orgId, input.subjectId, input.topicId ?? null);
      const [m] = await tx
        .insert(materials)
        .values({
          organizationId: orgId,
          tutorId: user.id,
          subjectId: input.subjectId,
          topicId: input.topicId ?? null,
          title: input.title,
          body: input.body ?? '',
        })
        .returning({ id: materials.id });
      return m!.id;
    });
    return this.getMaterial(user, id);
  }

  async updateMaterial(user: User, id: string, input: MaterialInput): Promise<MaterialInfo> {
    const orgId = await requireTutorOrg(this.db, user);
    await this.rls.run(user.id, async (tx) => {
      await this.assertSubject(tx, orgId, input.subjectId, input.topicId ?? null);
      const updated = await tx
        .update(materials)
        .set({
          title: input.title,
          body: input.body ?? '',
          subjectId: input.subjectId,
          topicId: input.topicId ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(materials.id, id), eq(materials.tutorId, user.id)))
        .returning({ id: materials.id });
      if (!updated.length) throw notFound('Nie znaleziono materiału');
    });
    return this.getMaterial(user, id);
  }

  async deleteMaterial(user: User, id: string): Promise<void> {
    await this.rls.run(user.id, async (tx) => {
      const deleted = await tx
        .delete(materials)
        .where(and(eq(materials.id, id), eq(materials.tutorId, user.id)))
        .returning({ id: materials.id });
      if (!deleted.length) throw notFound('Nie znaleziono materiału');
    });
  }

  /** Replaces the set of students a material is shared with. */
  async share(user: User, id: string, enrollmentIds: string[]): Promise<MaterialInfo> {
    await this.rls.run(user.id, async (tx) => {
      const [m] = await tx
        .select()
        .from(materials)
        .where(and(eq(materials.id, id), eq(materials.tutorId, user.id)));
      if (!m) throw notFound('Nie znaleziono materiału');
      const own = enrollmentIds.length
        ? await tx
            .select()
            .from(enrollments)
            .where(and(inArray(enrollments.id, enrollmentIds), eq(enrollments.tutorId, user.id)))
        : [];
      if (own.length !== new Set(enrollmentIds).size) throw notFound('Nie znaleziono ucznia');
      await tx.delete(materialShares).where(eq(materialShares.materialId, id));
      if (own.length) {
        await tx.insert(materialShares).values(
          own.map((e) => ({
            organizationId: e.organizationId,
            enrollmentId: e.id,
            tutorId: e.tutorId,
            studentId: e.studentId,
            materialId: id,
          })),
        );
      }
    });
    return this.getMaterial(user, id);
  }

  private selectMaterials(tx: Tx, where?: ReturnType<typeof eq>) {
    return tx
      .select({
        m: materials,
        subject: subjects.name,
        topic: topics.name,
        tutor: users.displayName,
      })
      .from(materials)
      .innerJoin(subjects, eq(subjects.id, materials.subjectId))
      .leftJoin(topics, eq(topics.id, materials.topicId))
      .innerJoin(users, eq(users.id, materials.tutorId))
      .where(where)
      .orderBy(desc(materials.updatedAt));
  }

  private async withShares(
    tx: Tx,
    user: User,
    rows: Awaited<ReturnType<MaterialsService['selectMaterials']>>,
  ): Promise<MaterialInfo[]> {
    const own = rows.filter((r) => r.m.tutorId === user.id).map((r) => r.m.id);
    const shares = own.length
      ? await tx.select().from(materialShares).where(inArray(materialShares.materialId, own))
      : [];
    return rows.map((r) => ({
      id: r.m.id,
      title: r.m.title,
      body: r.m.body,
      subject: { id: r.m.subjectId, name: r.subject },
      topic: r.m.topicId && r.topic ? { id: r.m.topicId, name: r.topic } : null,
      tutor: r.tutor,
      sharedWith: shares.filter((s) => s.materialId === r.m.id).map((s) => s.enrollmentId),
      updatedAt: r.m.updatedAt.toISOString(),
    }));
  }

  private async assertSubject(tx: Tx, orgId: string, subjectId: string, topicId: string | null) {
    const [s] = await tx
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.organizationId, orgId)));
    if (!s) throw notFound('Nie znaleziono przedmiotu');
    if (topicId) {
      const [t] = await tx
        .select()
        .from(topics)
        .where(and(eq(topics.id, topicId), eq(topics.subjectId, subjectId)));
      if (!t) throw notFound('Nie znaleziono tematu');
    }
  }

  // ---------------------------------------------------------------- homework

  listHomework(user: User, enrollmentId?: string): Promise<HomeworkInfo[]> {
    return this.rls.run(user.id, async (tx) =>
      (
        await this.selectHomework(
          tx,
          enrollmentId ? eq(homework.enrollmentId, enrollmentId) : undefined,
        )
      ).map(toHomework),
    );
  }

  async assign(user: User, input: HomeworkInput): Promise<HomeworkInfo> {
    const { hw, studentEmail } = await this.rls.run(user.id, async (tx) => {
      const [e] = await tx.select().from(enrollments).where(eq(enrollments.id, input.enrollmentId));
      if (!e || e.tutorId !== user.id) throw notFound('Nie znaleziono ucznia');
      if (input.lessonId) {
        const [l] = await tx
          .select()
          .from(lessons)
          .where(and(eq(lessons.id, input.lessonId), eq(lessons.enrollmentId, e.id)));
        if (!l) throw notFound('Nie znaleziono lekcji');
      }
      const [created] = await tx
        .insert(homework)
        .values({
          organizationId: e.organizationId,
          enrollmentId: e.id,
          tutorId: e.tutorId,
          studentId: e.studentId,
          lessonId: input.lessonId ?? null,
          title: input.title,
          instructions: input.instructions ?? '',
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
        })
        .returning({ id: homework.id });
      const [row] = await this.selectHomework(tx, eq(homework.id, created!.id));
      return { hw: toHomework(row!), studentEmail: row!.studentEmail };
    });
    await this.mail.send({
      to: studentEmail,
      subject: `Nowe zadanie domowe: ${hw.title}`,
      text:
        `${user.displayName} zadał(a) Ci zadanie „${hw.title}”` +
        (hw.dueAt
          ? ` na ${new Date(hw.dueAt).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })}`
          : '') +
        `.\n${this.mail.link('/app/homework')}`,
    });
    return hw;
  }

  async submit(user: User, id: string, submission: string): Promise<HomeworkInfo> {
    const { hw, tutorEmail } = await this.rls.run(user.id, async (tx) => {
      const [h] = await tx.select().from(homework).where(eq(homework.id, id));
      if (!h || h.studentId !== user.id) throw notFound('Nie znaleziono zadania');
      if (h.status === 'reviewed') {
        throw new AppError(
          HttpStatus.CONFLICT,
          'homework_reviewed',
          'Zadanie zostało już sprawdzone',
        );
      }
      await tx
        .update(homework)
        .set({ submission, status: 'submitted', submittedAt: new Date() })
        .where(eq(homework.id, id));
      const [row] = await this.selectHomework(tx, eq(homework.id, id));
      return { hw: toHomework(row!), tutorEmail: row!.tutorEmail };
    });
    await this.mail.send({
      to: tutorEmail,
      subject: `${user.displayName} oddał(a) zadanie: ${hw.title}`,
      text: `Sprawdź rozwiązanie: ${this.mail.link('/app/homework')}`,
    });
    return hw;
  }

  async review(user: User, id: string, feedback: string, grade?: string): Promise<HomeworkInfo> {
    const { hw, studentEmail } = await this.rls.run(user.id, async (tx) => {
      const [h] = await tx.select().from(homework).where(eq(homework.id, id));
      if (!h || h.tutorId !== user.id) throw notFound('Nie znaleziono zadania');
      await tx
        .update(homework)
        .set({ feedback, grade: grade || null, status: 'reviewed', reviewedAt: new Date() })
        .where(eq(homework.id, id));
      const [row] = await this.selectHomework(tx, eq(homework.id, id));
      return { hw: toHomework(row!), studentEmail: row!.studentEmail };
    });
    await this.mail.send({
      to: studentEmail,
      subject: `Zadanie sprawdzone: ${hw.title}`,
      text: `${user.displayName} sprawdził(a) Twoje zadanie${hw.grade ? ` — ocena: ${hw.grade}` : ''}.\n${this.mail.link('/app/homework')}`,
    });
    return hw;
  }

  async removeHomework(user: User, id: string): Promise<void> {
    await this.rls.run(user.id, async (tx) => {
      const deleted = await tx
        .delete(homework)
        .where(and(eq(homework.id, id), eq(homework.tutorId, user.id)))
        .returning({ id: homework.id });
      if (!deleted.length) throw notFound('Nie znaleziono zadania');
    });
  }

  private selectHomework(tx: Tx, where?: ReturnType<typeof eq>) {
    return tx
      .select({
        h: homework,
        subject: subjects.name,
        tutorName: tutorU.displayName,
        tutorEmail: tutorU.email,
        studentName: studentU.displayName,
        studentEmail: studentU.email,
      })
      .from(homework)
      .innerJoin(enrollments, eq(enrollments.id, homework.enrollmentId))
      .innerJoin(subjects, eq(subjects.id, enrollments.subjectId))
      .innerJoin(tutorU, eq(tutorU.id, homework.tutorId))
      .innerJoin(studentU, eq(studentU.id, homework.studentId))
      .where(where)
      .orderBy(desc(homework.createdAt));
  }
}

type HwRow = {
  h: typeof homework.$inferSelect;
  subject: string;
  tutorName: string;
  studentName: string;
};

function toHomework(r: HwRow): HomeworkInfo {
  const h = r.h;
  return {
    id: h.id,
    enrollmentId: h.enrollmentId,
    lessonId: h.lessonId,
    title: h.title,
    instructions: h.instructions,
    dueAt: h.dueAt?.toISOString() ?? null,
    status: h.status,
    submission: h.submission,
    submittedAt: h.submittedAt?.toISOString() ?? null,
    feedback: h.feedback,
    grade: h.grade,
    reviewedAt: h.reviewedAt?.toISOString() ?? null,
    createdAt: h.createdAt.toISOString(),
    student: r.studentName,
    tutor: r.tutorName,
    subject: r.subject,
  };
}
