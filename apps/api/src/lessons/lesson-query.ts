import type { LessonInfo } from '@pl/shared';
import { asc, eq, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { enrollments, lessons, subjects, users } from '../db/schema.js';
import type { Tx } from '../rls/rls.service.js';

const tutor = alias(users, 'tutor');
const student = alias(users, 'student');

export async function selectLessons(tx: Tx, where?: SQL) {
  return tx
    .select({
      l: lessons,
      subject: subjects.name,
      tutorName: tutor.displayName,
      studentName: student.displayName,
    })
    .from(lessons)
    .innerJoin(enrollments, eq(enrollments.id, lessons.enrollmentId))
    .innerJoin(subjects, eq(subjects.id, enrollments.subjectId))
    .innerJoin(tutor, eq(tutor.id, lessons.tutorId))
    .innerJoin(student, eq(student.id, lessons.studentId))
    .where(where)
    .orderBy(asc(lessons.startsAt));
}

export type LessonRow = Awaited<ReturnType<typeof selectLessons>>[number];

export function toLessonInfo(r: LessonRow): LessonInfo {
  const l = r.l;
  return {
    id: l.id,
    enrollmentId: l.enrollmentId,
    seriesId: l.seriesId,
    startsAt: l.startsAt.toISOString(),
    durationMin: l.durationMin,
    status: l.status,
    attendance: l.attendance,
    location: l.location,
    topic: l.topic,
    cancelReason: l.cancelReason,
    cancelledByStudent: !!l.cancelledBy && l.cancelledBy === l.studentId,
    chargeable: l.chargeable,
    subject: r.subject,
    tutor: { id: l.tutorId, displayName: r.tutorName },
    student: { id: l.studentId, displayName: r.studentName },
  };
}
