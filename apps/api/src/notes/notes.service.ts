import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { NoteInfo, ReportInfo, ReportInput } from '@pl/shared';
import { and, desc, eq } from 'drizzle-orm';
import { AppError } from '../common/errors.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { DB, type Db } from '../db/db.module.js';
import {
  lessonNotes,
  lessonReports,
  lessons,
  noteRevisions,
  parentLinks,
  users,
} from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import { RlsService, type Tx } from '../rls/rls.service.js';
import { notFound } from '../teaching/access.js';

type User = typeof users.$inferSelect;

const REVISIONS_SHOWN = 20;

@Injectable()
export class NotesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly rls: RlsService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
  ) {}

  /** Notes are encrypted per lesson (the lesson id is bound as AAD). */
  getNote(user: User, lessonId: string): Promise<NoteInfo> {
    return this.rls.run(user.id, async (tx) => {
      await this.partyLesson(tx, user, lessonId);
      const [note] = await tx
        .select({ n: lessonNotes, by: users.displayName })
        .from(lessonNotes)
        .leftJoin(users, eq(users.id, lessonNotes.updatedBy))
        .where(eq(lessonNotes.lessonId, lessonId));
      if (!note) return { content: '', updatedAt: null, updatedBy: null, revisions: [] };
      const revs = await tx
        .select({ r: noteRevisions, by: users.displayName })
        .from(noteRevisions)
        .leftJoin(users, eq(users.id, noteRevisions.editedBy))
        .where(eq(noteRevisions.noteId, note.n.id))
        .orderBy(desc(noteRevisions.createdAt))
        .limit(REVISIONS_SHOWN);
      return {
        content: this.crypto.decrypt(note.n.contentEnc, lessonId),
        updatedAt: note.n.updatedAt.toISOString(),
        updatedBy: note.by,
        revisions: revs.map(({ r, by }) => ({
          editedBy: by,
          createdAt: r.createdAt.toISOString(),
          content: this.crypto.decrypt(r.contentEnc, lessonId),
        })),
      };
    });
  }

  async saveNote(user: User, lessonId: string, content: string): Promise<NoteInfo> {
    await this.rls.run(user.id, async (tx) => {
      const l = await this.partyLesson(tx, user, lessonId);
      const contentEnc = this.crypto.encrypt(content, lessonId);
      const [existing] = await tx
        .select()
        .from(lessonNotes)
        .where(eq(lessonNotes.lessonId, lessonId));
      let noteId: string;
      if (existing) {
        if (this.crypto.decrypt(existing.contentEnc, lessonId) === content) return;
        await tx
          .update(lessonNotes)
          .set({ contentEnc, updatedBy: user.id, updatedAt: new Date() })
          .where(eq(lessonNotes.id, existing.id));
        noteId = existing.id;
      } else {
        const [created] = await tx
          .insert(lessonNotes)
          .values({
            organizationId: l.organizationId,
            enrollmentId: l.enrollmentId,
            tutorId: l.tutorId,
            studentId: l.studentId,
            lessonId,
            contentEnc,
            updatedBy: user.id,
          })
          .returning({ id: lessonNotes.id });
        noteId = created!.id;
      }
      await tx.insert(noteRevisions).values({ noteId, contentEnc, editedBy: user.id });
    });
    return this.getNote(user, lessonId);
  }

  getReport(user: User, lessonId: string): Promise<ReportInfo | null> {
    return this.rls.run(user.id, async (tx) => {
      const [l] = await tx.select().from(lessons).where(eq(lessons.id, lessonId));
      if (!l) throw notFound('Nie znaleziono lekcji');
      const [r] = await tx.select().from(lessonReports).where(eq(lessonReports.lessonId, lessonId));
      return r ? toReport(r, l.startsAt) : null;
    });
  }

  /** Tutor writes the report; the student and linked parents get an e-mail the first time. */
  async saveReport(user: User, lessonId: string, input: ReportInput): Promise<ReportInfo> {
    const { report, isNew, lesson } = await this.rls.run(user.id, async (tx) => {
      const [l] = await tx.select().from(lessons).where(eq(lessons.id, lessonId));
      if (!l || l.tutorId !== user.id) throw notFound('Nie znaleziono lekcji');
      if (l.status === 'cancelled') {
        throw new AppError(HttpStatus.BAD_REQUEST, 'lesson_cancelled', 'Lekcja została odwołana');
      }
      const values = {
        summary: input.summary,
        covered: input.covered ?? '',
        nextSteps: input.nextSteps ?? '',
        engagement: input.engagement ?? null,
        updatedAt: new Date(),
      };
      const [existing] = await tx
        .select()
        .from(lessonReports)
        .where(eq(lessonReports.lessonId, lessonId));
      const [r] = existing
        ? await tx
            .update(lessonReports)
            .set(values)
            .where(eq(lessonReports.id, existing.id))
            .returning()
        : await tx
            .insert(lessonReports)
            .values({
              organizationId: l.organizationId,
              enrollmentId: l.enrollmentId,
              tutorId: l.tutorId,
              studentId: l.studentId,
              lessonId,
              ...values,
            })
            .returning();
      return { report: r!, isNew: !existing, lesson: l };
    });
    if (isNew) await this.notifyReport(user, lesson);
    return toReport(report, lesson.startsAt);
  }

  listReports(user: User, enrollmentId: string): Promise<ReportInfo[]> {
    return this.rls.run(user.id, async (tx) => {
      const rows = await tx
        .select({ r: lessonReports, startsAt: lessons.startsAt })
        .from(lessonReports)
        .innerJoin(lessons, eq(lessons.id, lessonReports.lessonId))
        .where(eq(lessonReports.enrollmentId, enrollmentId))
        .orderBy(desc(lessons.startsAt));
      return rows.map(({ r, startsAt }) => toReport(r, startsAt));
    });
  }

  private async partyLesson(tx: Tx, user: User, lessonId: string) {
    const [l] = await tx.select().from(lessons).where(eq(lessons.id, lessonId));
    // Parents and organization owners can see the lesson, but notes belong to its two parties.
    if (!l || (l.tutorId !== user.id && l.studentId !== user.id))
      throw notFound('Nie znaleziono lekcji');
    return l;
  }

  private async notifyReport(tutor: User, l: typeof lessons.$inferSelect) {
    const recipients = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, l.studentId))
      .union(
        this.db
          .select({ email: users.email })
          .from(parentLinks)
          .innerJoin(users, eq(users.id, parentLinks.parentId))
          .where(and(eq(parentLinks.studentId, l.studentId))),
      );
    const when = l.startsAt.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
    for (const r of recipients) {
      await this.mail.send({
        to: r.email,
        subject: `Raport po lekcji ${when}`,
        text: `${tutor.displayName} dodał(a) raport po lekcji z ${when}.\nZobacz: ${this.mail.link(`/app/lessons/${l.id}`)}`,
      });
    }
  }
}

function toReport(r: typeof lessonReports.$inferSelect, startsAt: Date): ReportInfo {
  return {
    lessonId: r.lessonId,
    lessonStartsAt: startsAt.toISOString(),
    summary: r.summary,
    covered: r.covered,
    nextSteps: r.nextSteps,
    engagement: r.engagement,
    updatedAt: r.updatedAt.toISOString(),
  };
}
