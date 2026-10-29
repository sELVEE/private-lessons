import { HttpStatus, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  BalanceRow,
  BillingAccount,
  EarningsSummary,
  LedgerEntryInfo,
  LedgerRow,
  PackageInfo,
  PaymentMethod,
  Statement,
} from '@pl/shared';
import { PAYMENT_METHOD_LABELS } from '@pl/shared';
import { and, asc, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AppError } from '../common/errors.js';
import { DB, type Db } from '../db/db.module.js';
import {
  enrollmentRates,
  enrollments,
  ledgerEntries,
  lessonPackages,
  lessons,
  parentLinks,
  subjects,
  users,
} from '../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import { type ChargeHandler, LessonHooks } from '../lessons/lesson-hooks.js';
import { RlsService, type Tx } from '../rls/rls.service.js';
import { notFound, requireTutorOrg } from '../teaching/access.js';

type User = typeof users.$inferSelect;
type Enrollment = typeof enrollments.$inferSelect;

const tutorU = alias(users, 'tutor');
const studentU = alias(users, 'student');
const TZ = 'Europe/Warsaw';

/** [start, end) of a calendar month in Warsaw time, as SQL timestamptz expressions. */
function monthRange(month: string) {
  const start = sql`(${`${month}-01`}::timestamp at time zone ${TZ})`;
  const end = sql`((${`${month}-01`}::timestamp + interval '1 month') at time zone ${TZ})`;
  return { start, end };
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const scope = (e: Enrollment) => ({
  organizationId: e.organizationId,
  enrollmentId: e.id,
  tutorId: e.tutorId,
  studentId: e.studentId,
});

/**
 * Ledger-based billing. Completed lessons (and cancellations marked chargeable) are charged once:
 * from the oldest package with lessons left, otherwise at the hourly rate. Payments and
 * corrections are separate entries; mistakes are voided, never deleted.
 */
@Injectable()
export class BillingService implements ChargeHandler, OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly rls: RlsService,
    private readonly hooks: LessonHooks,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.hooks.registerBilling(this);
  }

  // ---------------------------------------------------------------- lesson hooks (trusted)

  /** Called inside a lesson transaction; may run as the student (late cancel), so writes as owner. */
  charge(tx: Tx, lessonId: string): Promise<void> {
    return this.rls.asOwner(tx, async () => {
      const [l] = await tx.select().from(lessons).where(eq(lessons.id, lessonId));
      if (!l) return;
      const [existing] = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.lessonId, lessonId),
            eq(ledgerEntries.kind, 'charge'),
            isNull(ledgerEntries.voidedAt),
          ),
        );
      if (existing) return;

      const base = {
        organizationId: l.organizationId,
        enrollmentId: l.enrollmentId,
        tutorId: l.tutorId,
        studentId: l.studentId,
      };
      const what = l.status === 'cancelled' ? 'Odwołana lekcja' : 'Lekcja';
      const date = l.startsAt.toLocaleDateString('pl-PL', { timeZone: TZ });
      const [pkg] = await tx
        .select()
        .from(lessonPackages)
        .where(
          and(
            eq(lessonPackages.enrollmentId, l.enrollmentId),
            lt(lessonPackages.lessonsUsed, lessonPackages.lessonsTotal),
          ),
        )
        .orderBy(asc(lessonPackages.purchasedAt))
        .limit(1)
        .for('update');
      if (pkg) {
        await tx
          .update(lessonPackages)
          .set({ lessonsUsed: pkg.lessonsUsed + 1 })
          .where(eq(lessonPackages.id, pkg.id));
        await tx.insert(ledgerEntries).values({
          ...base,
          kind: 'charge',
          amount: 0,
          description: `${what} ${date} — z pakietu (${pkg.lessonsUsed + 1}/${pkg.lessonsTotal})`,
          lessonId,
          packageId: pkg.id,
          occurredAt: l.startsAt,
        });
        return;
      }
      const [rate] = await tx
        .select()
        .from(enrollmentRates)
        .where(eq(enrollmentRates.enrollmentId, l.enrollmentId));
      if (!rate) return; // No price set: nothing to charge; the tutor can add a correction.
      await tx.insert(ledgerEntries).values({
        ...base,
        kind: 'charge',
        amount: Math.round((rate.hourlyRate * l.durationMin) / 60),
        description: `${what} ${date} (${l.durationMin} min)`,
        lessonId,
        occurredAt: l.startsAt,
      });
    });
  }

  uncharge(tx: Tx, lessonId: string): Promise<void> {
    return this.rls.asOwner(tx, async () => {
      const voided = await tx
        .update(ledgerEntries)
        .set({ voidedAt: new Date() })
        .where(
          and(
            eq(ledgerEntries.lessonId, lessonId),
            eq(ledgerEntries.kind, 'charge'),
            isNull(ledgerEntries.voidedAt),
          ),
        )
        .returning();
      for (const v of voided) {
        if (v.packageId) {
          await tx
            .update(lessonPackages)
            .set({ lessonsUsed: sql`greatest(${lessonPackages.lessonsUsed} - 1, 0)` })
            .where(eq(lessonPackages.id, v.packageId));
        }
      }
    });
  }

  // ---------------------------------------------------------------- tutor actions

  async setRate(user: User, enrollmentId: string, hourlyRate: number): Promise<BillingAccount> {
    await this.rls.run(user.id, async (tx) => {
      const e = await this.ownEnrollment(tx, user, enrollmentId);
      await tx
        .insert(enrollmentRates)
        .values({ ...scope(e), hourlyRate })
        .onConflictDoUpdate({
          target: enrollmentRates.enrollmentId,
          set: { hourlyRate, updatedAt: new Date() },
        });
    });
    return this.account(user, enrollmentId);
  }

  async addPackage(
    user: User,
    enrollmentId: string,
    p: { lessons: number; price: number; note?: string },
  ) {
    await this.rls.run(user.id, async (tx) => {
      const e = await this.ownEnrollment(tx, user, enrollmentId);
      const [pkg] = await tx
        .insert(lessonPackages)
        .values({ ...scope(e), lessonsTotal: p.lessons, price: p.price, note: p.note || null })
        .returning();
      await tx.insert(ledgerEntries).values({
        ...scope(e),
        kind: 'charge',
        amount: p.price,
        description: `Pakiet ${p.lessons} lekcji${p.note ? ` — ${p.note}` : ''}`,
        packageId: pkg!.id,
        createdBy: user.id,
      });
    });
    return this.account(user, enrollmentId);
  }

  async addPayment(
    user: User,
    enrollmentId: string,
    p: { amount: number; method: PaymentMethod; paidAt?: string; note?: string },
  ) {
    await this.rls.run(user.id, async (tx) => {
      const e = await this.ownEnrollment(tx, user, enrollmentId);
      await tx.insert(ledgerEntries).values({
        ...scope(e),
        kind: 'payment',
        amount: -p.amount,
        method: p.method,
        description: `Wpłata (${PAYMENT_METHOD_LABELS[p.method].toLowerCase()})${p.note ? ` — ${p.note}` : ''}`,
        occurredAt: p.paidAt ? new Date(p.paidAt) : new Date(),
        createdBy: user.id,
      });
    });
    return this.account(user, enrollmentId);
  }

  async addAdjustment(user: User, enrollmentId: string, a: { amount: number; note: string }) {
    await this.rls.run(user.id, async (tx) => {
      const e = await this.ownEnrollment(tx, user, enrollmentId);
      await tx.insert(ledgerEntries).values({
        ...scope(e),
        kind: 'adjustment',
        amount: a.amount,
        description: `Korekta — ${a.note}`,
        createdBy: user.id,
      });
    });
    return this.account(user, enrollmentId);
  }

  /** Voids a payment or correction entered by mistake. Lesson charges follow the lesson instead. */
  async voidEntry(user: User, entryId: string): Promise<void> {
    await this.rls.run(user.id, async (tx) => {
      const [entry] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.id, entryId));
      if (!entry || entry.tutorId !== user.id) throw notFound('Nie znaleziono wpisu');
      if (entry.voidedAt) return;
      if (entry.lessonId || entry.packageId) {
        throw new AppError(
          HttpStatus.BAD_REQUEST,
          'entry_locked',
          'Opłaty za lekcje i pakiety zmienia się przez lekcję lub korektę',
        );
      }
      await tx
        .update(ledgerEntries)
        .set({ voidedAt: new Date() })
        .where(eq(ledgerEntries.id, entryId));
    });
  }

  // ---------------------------------------------------------------- read models (tutor, student, parent via RLS)

  account(user: User, enrollmentId: string): Promise<BillingAccount> {
    return this.rls.run(user.id, async (tx) => {
      const [head] = await this.heads(tx, eq(enrollments.id, enrollmentId));
      if (!head) throw notFound('Nie znaleziono');
      const [rate] = await tx
        .select()
        .from(enrollmentRates)
        .where(eq(enrollmentRates.enrollmentId, enrollmentId));
      const pkgs = await tx
        .select()
        .from(lessonPackages)
        .where(eq(lessonPackages.enrollmentId, enrollmentId))
        .orderBy(desc(lessonPackages.purchasedAt));
      const entries = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.enrollmentId, enrollmentId))
        .orderBy(desc(ledgerEntries.occurredAt))
        .limit(100);
      return {
        ...head,
        hourlyRate: rate?.hourlyRate ?? null,
        balance: await this.balance(tx, enrollmentId),
        packages: pkgs.map(toPackage),
        entries: entries.map(toEntry),
      };
    });
  }

  /** Balances of every enrollment the user can see (tutor: own students; student/parent: own). */
  balances(user: User): Promise<BalanceRow[]> {
    return this.rls.run(user.id, async (tx) => {
      const heads = await this.heads(tx);
      const sums = await tx
        .select({
          enrollmentId: ledgerEntries.enrollmentId,
          charged: sql<number>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.amount} > 0), 0)::int`,
          paid: sql<number>`coalesce(-sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.kind} = 'payment'), 0)::int`,
          balance: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int`,
        })
        .from(ledgerEntries)
        .where(isNull(ledgerEntries.voidedAt))
        .groupBy(ledgerEntries.enrollmentId);
      const byId = new Map(sums.map((s) => [s.enrollmentId, s]));
      return heads.map((h) => ({
        ...h,
        charged: byId.get(h.enrollmentId)?.charged ?? 0,
        paid: byId.get(h.enrollmentId)?.paid ?? 0,
        balance: byId.get(h.enrollmentId)?.balance ?? 0,
      }));
    });
  }

  statement(user: User, enrollmentId: string, month: string): Promise<Statement> {
    return this.rls.run(user.id, async (tx) => {
      const [head] = await this.heads(tx, eq(enrollments.id, enrollmentId));
      if (!head) throw notFound('Nie znaleziono');
      const { start, end } = monthRange(month);
      const live = and(
        eq(ledgerEntries.enrollmentId, enrollmentId),
        isNull(ledgerEntries.voidedAt),
      );
      const [opening] = await tx
        .select({ v: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` })
        .from(ledgerEntries)
        .where(and(live, lt(ledgerEntries.occurredAt, start)));
      const entries = await tx
        .select()
        .from(ledgerEntries)
        .where(and(live, gte(ledgerEntries.occurredAt, start), lt(ledgerEntries.occurredAt, end)))
        .orderBy(asc(ledgerEntries.occurredAt));
      const openingV = opening?.v ?? 0;
      return {
        month,
        ...head,
        opening: openingV,
        closing: openingV + entries.reduce((s, e) => s + e.amount, 0),
        entries: entries.map(toEntry),
      };
    });
  }

  async earnings(user: User, month: string): Promise<EarningsSummary> {
    await requireTutorOrg(this.db, user);
    const rows = await this.balances(user);
    return this.rls.run(user.id, async (tx) => {
      const mine = and(eq(ledgerEntries.tutorId, user.id), isNull(ledgerEntries.voidedAt));
      const sixAgo = monthRange(shiftMonth(month, -5)).start;
      const { end } = monthRange(month);
      const perMonth = await tx
        .select({
          month: sql<string>`to_char(${ledgerEntries.occurredAt} at time zone ${TZ}, 'YYYY-MM')`,
          received: sql<number>`coalesce(-sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.kind} = 'payment'), 0)::int`,
          charged: sql<number>`coalesce(sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.amount} > 0), 0)::int`,
        })
        .from(ledgerEntries)
        .where(and(mine, gte(ledgerEntries.occurredAt, sixAgo), lt(ledgerEntries.occurredAt, end)))
        .groupBy(sql`1`);
      const history = Array.from({ length: 6 }, (_, i) => {
        const m = shiftMonth(month, i - 5);
        const found = perMonth.find((p) => p.month === m);
        return { month: m, received: found?.received ?? 0, charged: found?.charged ?? 0 };
      });
      const { start } = monthRange(month);
      const [done] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(lessons)
        .where(
          and(
            eq(lessons.tutorId, user.id),
            eq(lessons.status, 'completed'),
            gte(lessons.startsAt, start),
            lt(lessons.startsAt, end),
          ),
        );
      const current = history.at(-1)!;
      return {
        month,
        received: current.received,
        charged: current.charged,
        outstanding: rows.reduce((s, r) => s + Math.max(r.balance, 0), 0),
        lessonsCompleted: done?.n ?? 0,
        rows,
        history,
      };
    });
  }

  /** All of the tutor's ledger entries in a month, newest first, with the student's name. */
  async ledger(user: User, month: string): Promise<LedgerRow[]> {
    await requireTutorOrg(this.db, user);
    return this.rls.run(user.id, async (tx) => {
      const { start, end } = monthRange(month);
      const rows = await tx
        .select({ e: ledgerEntries, student: studentU.displayName, subject: subjects.name })
        .from(ledgerEntries)
        .innerJoin(enrollments, eq(enrollments.id, ledgerEntries.enrollmentId))
        .innerJoin(subjects, eq(subjects.id, enrollments.subjectId))
        .innerJoin(studentU, eq(studentU.id, ledgerEntries.studentId))
        .where(
          and(
            eq(ledgerEntries.tutorId, user.id),
            isNull(ledgerEntries.voidedAt),
            gte(ledgerEntries.occurredAt, start),
            lt(ledgerEntries.occurredAt, end),
          ),
        )
        .orderBy(desc(ledgerEntries.occurredAt))
        .limit(500);
      return rows.map(({ e, student, subject }) => ({
        ...toEntry(e),
        enrollmentId: e.enrollmentId,
        student,
        subject,
      }));
    });
  }

  /** E-mails the student and linked parents about the outstanding balance. */
  async remind(user: User, enrollmentId: string): Promise<{ sent: number }> {
    const { balance, studentName, subject, emails } = await this.rls.run(user.id, async (tx) => {
      const e = await this.ownEnrollment(tx, user, enrollmentId);
      const balance = await this.balance(tx, enrollmentId);
      const info = await this.rls.asOwner(tx, async () => {
        const [s] = await tx
          .select({ name: users.displayName, email: users.email })
          .from(users)
          .where(eq(users.id, e.studentId));
        const [subj] = await tx
          .select({ name: subjects.name })
          .from(subjects)
          .where(eq(subjects.id, e.subjectId));
        const parents = await tx
          .select({ email: users.email })
          .from(parentLinks)
          .innerJoin(users, eq(users.id, parentLinks.parentId))
          .where(eq(parentLinks.studentId, e.studentId));
        return {
          studentName: s!.name,
          subject: subj!.name,
          emails: [s!.email, ...parents.map((p) => p.email)],
        };
      });
      return { balance, ...info };
    });
    if (balance <= 0) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'nothing_due', 'Ten uczeń nie ma zaległości');
    }
    const amount = (balance / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
    for (const to of emails) {
      await this.mail.send({
        to,
        subject: `Przypomnienie o płatności — ${subject}`,
        text:
          `Dzień dobry,\n\nprzypominamy o płatności za korepetycje (${studentName}, ${subject}): do zapłaty ${amount}.\n` +
          `Szczegóły rozliczenia: ${this.mail.link(`/app/billing/${enrollmentId}`)}\n\n— ${user.displayName}`,
      });
    }
    await this.audit.log({
      actorId: user.id,
      action: 'billing.reminder_sent',
      targetType: 'enrollment',
      targetId: enrollmentId,
    });
    return { sent: emails.length };
  }

  private heads(tx: Tx, where?: ReturnType<typeof eq>) {
    return tx
      .select({
        enrollmentId: enrollments.id,
        student: studentU.displayName,
        tutor: tutorU.displayName,
        subject: subjects.name,
      })
      .from(enrollments)
      .innerJoin(subjects, eq(subjects.id, enrollments.subjectId))
      .innerJoin(tutorU, eq(tutorU.id, enrollments.tutorId))
      .innerJoin(studentU, eq(studentU.id, enrollments.studentId))
      .where(where)
      .orderBy(studentU.displayName);
  }

  private async balance(tx: Tx, enrollmentId: string): Promise<number> {
    const [r] = await tx
      .select({ v: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.enrollmentId, enrollmentId), isNull(ledgerEntries.voidedAt)));
    return r?.v ?? 0;
  }

  private async ownEnrollment(tx: Tx, user: User, id: string) {
    const [e] = await tx.select().from(enrollments).where(eq(enrollments.id, id));
    if (!e || e.tutorId !== user.id) throw notFound('Nie znaleziono ucznia');
    return e;
  }
}

function toEntry(e: typeof ledgerEntries.$inferSelect): LedgerEntryInfo {
  return {
    id: e.id,
    kind: e.kind,
    amount: e.amount,
    description: e.description,
    occurredAt: e.occurredAt.toISOString(),
    lessonId: e.lessonId,
    voided: !!e.voidedAt,
  };
}

function toPackage(p: typeof lessonPackages.$inferSelect): PackageInfo {
  return {
    id: p.id,
    lessonsTotal: p.lessonsTotal,
    lessonsUsed: p.lessonsUsed,
    price: p.price,
    purchasedAt: p.purchasedAt.toISOString(),
    note: p.note,
  };
}
