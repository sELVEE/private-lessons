import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CreateInviteInput,
  type EnrollmentInfo,
  formatShortCode,
  type InviteInfo,
  type InvitePreview,
} from '@pl/shared';
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import { generateShortCode } from '../common/short-code.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { DB, type Db } from '../db/db.module.js';
import {
  enrollmentEvents,
  enrollments,
  invites,
  memberships,
  subjects,
  users,
} from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import { RlsService, type Tx } from '../rls/rls.service.js';
import { notFound, requireAccountType, requireTutorOrg } from './access.js';
import { selectEnrollments, toEnrollmentInfo } from './enrollment-query.js';

type User = typeof users.$inferSelect;

const invalidCode = () =>
  new AppError(
    HttpStatus.BAD_REQUEST,
    'invalid_invite',
    'Kod jest nieprawidłowy, wygasł albo został już wykorzystany',
    [{ path: 'code', message: 'Nieprawidłowy lub wygasły kod' }],
  );

@Injectable()
export class InvitesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly rls: RlsService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- tutor side

  async list(user: User): Promise<InviteInfo[]> {
    await requireTutorOrg(this.db, user);
    return this.rls.run(user.id, async (tx) => {
      const rows = await tx
        .select({ i: invites, subjectName: subjects.name })
        .from(invites)
        .innerJoin(subjects, eq(subjects.id, invites.subjectId))
        .where(
          and(
            eq(invites.tutorId, user.id),
            isNull(invites.revokedAt),
            gt(invites.expiresAt, new Date()),
            lt(invites.uses, invites.maxUses),
          ),
        )
        .orderBy(desc(invites.createdAt));
      return rows.map(({ i, subjectName }) => toInfo(i, subjectName));
    });
  }

  async create(
    user: User,
    input: Required<Pick<CreateInviteInput, 'subjectId'>> & CreateInviteInput,
  ): Promise<InviteInfo> {
    const orgId = await requireTutorOrg(this.db, user);
    const code = generateShortCode();
    const info = await this.rls.run(user.id, async (tx) => {
      const [subject] = await tx
        .select()
        .from(subjects)
        .where(and(eq(subjects.id, input.subjectId), eq(subjects.organizationId, orgId)));
      if (!subject) throw notFound('Nie znaleziono przedmiotu');
      const [i] = await tx
        .insert(invites)
        .values({
          organizationId: orgId,
          tutorId: user.id,
          subjectId: subject.id,
          codeHash: this.crypto.hash(code),
          emailHash: input.email ? this.crypto.hash(input.email) : null,
          maxUses: input.email ? 1 : (input.maxUses ?? 1),
          expiresAt: new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 3600_000),
        })
        .returning();
      return toInfo(i!, subject.name);
    });

    const link = this.mail.link(`/join?code=${code}`);
    await this.audit.log({
      actorId: user.id,
      action: 'invite.created',
      targetType: 'invite',
      targetId: info.id,
    });
    if (input.email) {
      await this.mail.send({
        to: input.email,
        subject: `${user.displayName} zaprasza Cię na korepetycje`,
        text:
          `${user.displayName} zaprasza Cię na korepetycje z przedmiotu: ${info.subject.name}.\n\n` +
          `Kliknij, aby dołączyć (jeśli nie masz konta, najpierw je załóż):\n${link}\n\n` +
          `Kod zaproszenia: ${formatShortCode(code)} (ważny do ${new Date(info.expiresAt).toLocaleDateString('pl-PL')}).`,
      });
      // The code went only to the invitee; the tutor sees the invite but not its code.
      return info;
    }
    return { ...info, code: formatShortCode(code), link };
  }

  async revoke(user: User, id: string): Promise<void> {
    await requireTutorOrg(this.db, user);
    await this.rls.run(user.id, async (tx) => {
      const updated = await tx
        .update(invites)
        .set({ revokedAt: new Date() })
        .where(and(eq(invites.id, id), eq(invites.tutorId, user.id)))
        .returning({ id: invites.id });
      if (!updated.length) throw notFound('Nie znaleziono zaproszenia');
    });
  }

  // ---------------------------------------------------------------- student side

  async preview(user: User, code: string): Promise<InvitePreview> {
    requireAccountType(user, 'student');
    const codeHash = this.crypto.hash(code);
    return this.rls.run(
      user.id,
      async (tx) => {
        const { invite, tutorName, subjectName } = await this.findUsable(tx, codeHash, user);
        const already = await tx.$count(
          enrollments,
          and(
            eq(enrollments.studentId, user.id),
            eq(enrollments.tutorId, invite.tutorId),
            eq(enrollments.subjectId, invite.subjectId),
            eq(enrollments.status, 'active'),
          ),
        );
        return { tutorName, subjectName, alreadyEnrolled: already > 0 };
      },
      { inviteCodeHash: codeHash },
    );
  }

  async redeem(user: User, code: string): Promise<EnrollmentInfo> {
    requireAccountType(user, 'student');
    const codeHash = this.crypto.hash(code);
    const enrollmentId = await this.rls.run(
      user.id,
      async (tx) => {
        const { invite } = await this.findUsable(tx, codeHash, user, true);

        // Membership rows are written with owner rights, after the invite was validated above.
        await this.rls.asOwner(tx, () =>
          tx
            .insert(memberships)
            .values({ organizationId: invite.organizationId, userId: user.id, role: 'student' })
            .onConflictDoNothing(),
        );

        const [existing] = await tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.studentId, user.id),
              eq(enrollments.tutorId, invite.tutorId),
              eq(enrollments.subjectId, invite.subjectId),
            ),
          );
        if (existing?.status === 'active') {
          throw new AppError(
            HttpStatus.CONFLICT,
            'already_enrolled',
            'Już uczysz się u tego korepetytora z tego przedmiotu',
          );
        }

        let id: string;
        if (existing) {
          await tx
            .update(enrollments)
            .set({ status: 'active', endedAt: null })
            .where(eq(enrollments.id, existing.id));
          id = existing.id;
        } else {
          const [created] = await tx
            .insert(enrollments)
            .values({
              organizationId: invite.organizationId,
              tutorId: invite.tutorId,
              studentId: user.id,
              subjectId: invite.subjectId,
            })
            .returning({ id: enrollments.id });
          id = created!.id;
        }
        await tx.insert(enrollmentEvents).values({
          enrollmentId: id,
          actorId: user.id,
          type: existing ? 'rejoined' : 'joined',
          note: null,
        });
        await tx
          .update(invites)
          .set({ uses: sql`${invites.uses} + 1` })
          .where(eq(invites.id, invite.id));
        return id;
      },
      { inviteCodeHash: codeHash },
    );

    await this.audit.log({
      actorId: user.id,
      action: 'invite.redeemed',
      targetType: 'enrollment',
      targetId: enrollmentId,
    });
    return this.rls.run(user.id, async (tx) =>
      toEnrollmentInfo((await selectEnrollments(tx, eq(enrollments.id, enrollmentId)))[0]!),
    );
  }

  private async findUsable(tx: Tx, codeHash: string, user: User, lock = false) {
    // The invite itself is visible through RLS only to holders of the code.
    const query = tx.select().from(invites).where(eq(invites.codeHash, codeHash));
    // Row lock serialises concurrent redemptions of a single-use code.
    const [invite] = lock ? await query.for('update') : await query;
    if (
      !invite ||
      invite.revokedAt ||
      invite.expiresAt <= new Date() ||
      invite.uses >= invite.maxUses ||
      (invite.emailHash && invite.emailHash !== this.crypto.hash(user.email))
    ) {
      throw invalidCode();
    }
    // The student is not in the organization yet, so RLS hides its subjects; the invite above
    // already authorises showing this one subject name.
    const [names] = await this.rls.asOwner(tx, () =>
      tx
        .select({ tutorName: users.displayName, subjectName: subjects.name })
        .from(users)
        .innerJoin(subjects, eq(subjects.id, invite.subjectId))
        .where(eq(users.id, invite.tutorId)),
    );
    return { invite, ...names! };
  }
}

function toInfo(i: typeof invites.$inferSelect, subjectName: string): InviteInfo {
  return {
    id: i.id,
    subject: { id: i.subjectId, name: subjectName },
    sentTo: !!i.emailHash,
    uses: i.uses,
    maxUses: i.maxUses,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
}
