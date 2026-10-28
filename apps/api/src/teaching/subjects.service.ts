import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { SubjectInfo } from '@pl/shared';
import { and, asc, eq } from 'drizzle-orm';
import { isUniqueViolation } from '../common/db-errors.js';
import { AppError } from '../common/errors.js';
import { DB, type Db } from '../db/db.module.js';
import { enrollments, subjects, topics, type users } from '../db/schema.js';
import { RlsService } from '../rls/rls.service.js';
import { notFound, requireTutorOrg } from './access.js';

type User = typeof users.$inferSelect;

@Injectable()
export class SubjectsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly rls: RlsService,
  ) {}

  async list(user: User): Promise<SubjectInfo[]> {
    const orgId = await requireTutorOrg(this.db, user);
    return this.rls.run(user.id, async (tx) => {
      const subs = await tx
        .select()
        .from(subjects)
        .where(eq(subjects.organizationId, orgId))
        .orderBy(asc(subjects.name));
      const tops = await tx
        .select()
        .from(topics)
        .where(eq(topics.organizationId, orgId))
        .orderBy(asc(topics.createdAt));
      return subs.map((s) => ({
        id: s.id,
        name: s.name,
        topics: tops
          .filter((t) => t.subjectId === s.id)
          .map((t) => ({ id: t.id, name: t.name, parentId: t.parentId })),
      }));
    });
  }

  async create(user: User, name: string): Promise<SubjectInfo> {
    const orgId = await requireTutorOrg(this.db, user);
    return this.rls
      .run(user.id, async (tx) => {
        const [s] = await tx.insert(subjects).values({ organizationId: orgId, name }).returning();
        return { id: s!.id, name: s!.name, topics: [] };
      })
      .catch(rethrowDuplicate);
  }

  async rename(user: User, id: string, name: string): Promise<void> {
    await requireTutorOrg(this.db, user);
    await this.rls
      .run(user.id, async (tx) => {
        const updated = await tx
          .update(subjects)
          .set({ name })
          .where(eq(subjects.id, id))
          .returning({ id: subjects.id });
        if (!updated.length) throw notFound('Nie znaleziono przedmiotu');
      })
      .catch(rethrowDuplicate);
  }

  async remove(user: User, id: string): Promise<void> {
    await requireTutorOrg(this.db, user);
    await this.rls.run(user.id, async (tx) => {
      // Owner-level check: enrollments of other tutors are invisible here, so ask as owner.
      const used = await this.rls.asOwner(tx, () =>
        tx.$count(enrollments, eq(enrollments.subjectId, id)),
      );
      if (used) {
        throw new AppError(
          HttpStatus.CONFLICT,
          'subject_in_use',
          'Przedmiot ma przypisanych uczniów — nie można go usunąć',
        );
      }
      const deleted = await tx
        .delete(subjects)
        .where(eq(subjects.id, id))
        .returning({ id: subjects.id });
      if (!deleted.length) throw notFound('Nie znaleziono przedmiotu');
    });
  }

  async addTopic(
    user: User,
    subjectId: string,
    name: string,
    parentId: string | null,
  ): Promise<void> {
    await requireTutorOrg(this.db, user);
    await this.rls.run(user.id, async (tx) => {
      const [subject] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
      if (!subject) throw notFound('Nie znaleziono przedmiotu');
      if (parentId) {
        const [parent] = await tx
          .select()
          .from(topics)
          .where(and(eq(topics.id, parentId), eq(topics.subjectId, subjectId)));
        if (!parent) throw notFound('Nie znaleziono tematu nadrzędnego');
      }
      await tx
        .insert(topics)
        .values({ organizationId: subject.organizationId, subjectId, name, parentId });
    });
  }

  async removeTopic(user: User, topicId: string): Promise<void> {
    await requireTutorOrg(this.db, user);
    await this.rls.run(user.id, async (tx) => {
      const deleted = await tx
        .delete(topics)
        .where(eq(topics.id, topicId))
        .returning({ id: topics.id });
      if (!deleted.length) throw notFound('Nie znaleziono tematu');
    });
  }
}

function rethrowDuplicate(err: unknown): never {
  if (!isUniqueViolation(err)) throw err;
  throw new AppError(HttpStatus.CONFLICT, 'subject_exists', 'Taki przedmiot już istnieje', [
    { path: 'name', message: 'Taki przedmiot już istnieje' },
  ]);
}
