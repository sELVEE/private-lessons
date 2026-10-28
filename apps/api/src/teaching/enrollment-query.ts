import type { EnrollmentInfo } from '@pl/shared';
import { eq, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { enrollments, studentProfiles, subjects, users } from '../db/schema.js';
import type { Tx } from '../rls/rls.service.js';

const tutor = alias(users, 'tutor');
const student = alias(users, 'student');

/** Enrollments with names, as seen through RLS by the user of the transaction. */
export async function selectEnrollments(tx: Tx, where?: SQL) {
  const rows = await tx
    .select({
      e: enrollments,
      subjectName: subjects.name,
      tutorName: tutor.displayName,
      studentName: student.displayName,
      studentEmail: student.email,
      schoolLevel: studentProfiles.schoolLevel,
      grade: studentProfiles.grade,
      birthYear: studentProfiles.birthYear,
    })
    .from(enrollments)
    .innerJoin(subjects, eq(subjects.id, enrollments.subjectId))
    .innerJoin(tutor, eq(tutor.id, enrollments.tutorId))
    .innerJoin(student, eq(student.id, enrollments.studentId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, enrollments.studentId))
    .where(where)
    .orderBy(student.displayName, subjects.name);
  return rows;
}

export type EnrollmentRow = Awaited<ReturnType<typeof selectEnrollments>>[number];

export function toEnrollmentInfo(r: EnrollmentRow): EnrollmentInfo {
  return {
    id: r.e.id,
    status: r.e.status,
    goals: r.e.goals,
    startedAt: r.e.startedAt.toISOString(),
    endedAt: r.e.endedAt?.toISOString() ?? null,
    subject: { id: r.e.subjectId, name: r.subjectName },
    tutor: { id: r.e.tutorId, displayName: r.tutorName },
    student: {
      id: r.e.studentId,
      displayName: r.studentName,
      schoolLevel: r.schoolLevel,
      grade: r.grade,
      age: r.birthYear ? new Date().getFullYear() - r.birthYear : null,
    },
  };
}
