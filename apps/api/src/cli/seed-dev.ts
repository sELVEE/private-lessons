// Usage: node dist/cli/seed-dev.js — demo accounts for local development only.
import { DEFAULT_SUBJECT } from '@pl/shared';
import argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { ARGON_OPTS } from '../auth/password.service.js';
import {
  enrollmentEvents,
  enrollmentRates,
  enrollments,
  ledgerEntries,
  lessons,
  memberships,
  organizations,
  parentLinks,
  studentProfiles,
  subjects,
  topics,
  users,
} from '../db/schema.js';

const DEMO_PASSWORD = 'Demo-haslo-2026';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-dev nie działa w produkcji.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);
const passwordHash = await argon2.hash(DEMO_PASSWORD, ARGON_OPTS);
const now = new Date();

const accounts = [
  { username: 'admin', displayName: 'Administrator', accountType: 'tutor', isPlatformAdmin: true },
  { username: 'korepetytor', displayName: 'Anna', accountType: 'tutor', isPlatformAdmin: false },
  { username: 'uczen', displayName: 'Kasia', accountType: 'student', isPlatformAdmin: false },
  { username: 'rodzic', displayName: 'Marek', accountType: 'parent', isPlatformAdmin: false },
] as const;

try {
  for (const a of accounts) {
    const email = `${a.username}@demo.local`;
    if (await db.$count(users, eq(users.email, email))) {
      console.log(`  ${a.username}: już istnieje`);
      continue;
    }
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ ...a, email, passwordHash, emailVerifiedAt: now })
        .returning();
      if (a.accountType === 'student') {
        await tx.insert(studentProfiles).values({
          userId: user!.id,
          schoolLevel: 'secondary',
          grade: 2,
          birthYear: now.getFullYear() - 17,
        });
      }
      if (a.accountType === 'tutor' && !a.isPlatformAdmin) {
        const [org] = await tx
          .insert(organizations)
          .values({ name: `Korepetycje — ${a.displayName}` })
          .returning();
        await tx.insert(memberships).values([
          { organizationId: org!.id, userId: user!.id, role: 'owner' },
          { organizationId: org!.id, userId: user!.id, role: 'tutor' },
        ]);
      }
    });
    console.log(`  ${a.username}: utworzono`);
  }
  await seedTeaching();
  console.log(`\nLoginy: ${accounts.map((a) => a.username).join(', ')} · hasło: ${DEMO_PASSWORD}`);
  console.log('Konto admin przy pierwszym logowaniu wymusi konfigurację MFA.');
} finally {
  await pool.end();
}

/** Demo cooperation: Kasia learns maths with Anna, Marek is Kasia's parent. Idempotent. */
async function seedTeaching() {
  const byUsername = async (username: string) =>
    (await db.select().from(users).where(eq(users.username, username)))[0]!;
  const tutor = await byUsername('korepetytor');
  const student = await byUsername('uczen');
  const parent = await byUsername('rodzic');
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, tutor.id), eq(memberships.role, 'tutor')));
  const orgId = m!.organizationId;

  let [math] = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.organizationId, orgId), eq(subjects.name, DEFAULT_SUBJECT)));
  if (!math) {
    [math] = await db
      .insert(subjects)
      .values({ organizationId: orgId, name: DEFAULT_SUBJECT })
      .returning();
    await db.insert(topics).values(
      ['Funkcje', 'Równania kwadratowe', 'Trygonometria', 'Ciągi'].map((name) => ({
        organizationId: orgId,
        subjectId: math!.id,
        name,
      })),
    );
  }

  await db
    .insert(memberships)
    .values({ organizationId: orgId, userId: student.id, role: 'student' })
    .onConflictDoNothing();
  const [existing] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.tutorId, tutor.id), eq(enrollments.studentId, student.id)));
  if (!existing) {
    const [e] = await db
      .insert(enrollments)
      .values({
        organizationId: orgId,
        tutorId: tutor.id,
        studentId: student.id,
        subjectId: math!.id,
        goals: 'Matura rozszerzona z matematyki — cel 80%',
      })
      .returning();
    await db
      .insert(enrollmentEvents)
      .values({ enrollmentId: e!.id, actorId: student.id, type: 'joined' });
  }
  await db
    .insert(parentLinks)
    .values({ parentId: parent.id, studentId: student.id })
    .onConflictDoNothing();

  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.tutorId, tutor.id), eq(enrollments.studentId, student.id)));
  if (!(await db.$count(lessons, eq(lessons.enrollmentId, enrollment!.id)))) {
    // Weekly lessons at 17:00: three in the past (completed), four upcoming.
    const base = new Date();
    base.setDate(base.getDate() - 20);
    base.setHours(17, 0, 0, 0);
    await db.insert(lessons).values(
      Array.from({ length: 7 }, (_, i) => {
        const startsAt = new Date(base.getTime() + i * 7 * 24 * 3600_000);
        const past = startsAt.getTime() < Date.now();
        return {
          organizationId: orgId,
          enrollmentId: enrollment!.id,
          tutorId: tutor.id,
          studentId: student.id,
          startsAt,
          durationMin: 60,
          location: 'online',
          status: past ? ('completed' as const) : ('scheduled' as const),
          attendance: past ? ('present' as const) : null,
        };
      }),
    );
  }
  if (!(await db.$count(enrollmentRates, eq(enrollmentRates.enrollmentId, enrollment!.id)))) {
    const scope = {
      organizationId: orgId,
      enrollmentId: enrollment!.id,
      tutorId: tutor.id,
      studentId: student.id,
    };
    await db.insert(enrollmentRates).values({ ...scope, hourlyRate: 12000 });
    const done = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.enrollmentId, enrollment!.id), eq(lessons.status, 'completed')));
    for (const l of done) {
      await db.insert(ledgerEntries).values({
        ...scope,
        kind: 'charge',
        amount: 12000,
        description: `Lekcja ${l.startsAt.toLocaleDateString('pl-PL')} (60 min)`,
        lessonId: l.id,
        occurredAt: l.startsAt,
      });
    }
    await db.insert(ledgerEntries).values({
      ...scope,
      kind: 'payment',
      amount: -24000,
      method: 'transfer',
      description: 'Wpłata (przelew)',
      createdBy: tutor.id,
    });
  }
  console.log('  Kasia uczy się matematyki u Anny, Marek jest połączony z Kasią');
}
