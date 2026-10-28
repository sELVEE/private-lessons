import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type ChildInfo,
  formatShortCode,
  type ParentLinkCode,
  type ParentLinkInfo,
} from '@pl/shared';
import { and, eq, gt, inArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/db-errors.js';
import { AppError } from '../common/errors.js';
import { generateShortCode } from '../common/short-code.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { enrollments, parentLinkCodes, parentLinks, studentProfiles, users } from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import { RlsService } from '../rls/rls.service.js';
import { notFound, requireAccountType } from './access.js';
import { selectEnrollments, toEnrollmentInfo } from './enrollment-query.js';

type User = typeof users.$inferSelect;

const CODE_TTL_MS = 24 * 3600_000;
const parent = alias(users, 'parent');
const student = alias(users, 'student');

/**
 * A student hands their parent a one-time code; entering it links the accounts. The student
 * decides who is linked and can remove a link at any time (so can the parent).
 */
@Injectable()
export class ParentsService {
  constructor(
    private readonly rls: RlsService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async createCode(user: User): Promise<ParentLinkCode> {
    requireAccountType(user, 'student');
    const code = generateShortCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await this.rls.run(user.id, async (tx) => {
      await tx.delete(parentLinkCodes).where(eq(parentLinkCodes.studentId, user.id));
      await tx
        .insert(parentLinkCodes)
        .values({ studentId: user.id, codeHash: this.crypto.hash(code), expiresAt });
    });
    return { code: formatShortCode(code), expiresAt: expiresAt.toISOString() };
  }

  async redeem(user: User, code: string): Promise<ParentLinkInfo> {
    requireAccountType(user, 'parent');
    const linkCodeHash = this.crypto.hash(code);
    const link = await this.rls
      .run(
        user.id,
        async (tx) => {
          const [row] = await tx
            .select()
            .from(parentLinkCodes)
            .where(
              and(
                eq(parentLinkCodes.codeHash, linkCodeHash),
                gt(parentLinkCodes.expiresAt, new Date()),
              ),
            );
          if (!row) {
            throw new AppError(
              HttpStatus.BAD_REQUEST,
              'invalid_code',
              'Kod jest nieprawidłowy albo wygasł',
              [{ path: 'code', message: 'Nieprawidłowy lub wygasły kod' }],
            );
          }
          const [created] = await tx
            .insert(parentLinks)
            .values({ parentId: user.id, studentId: row.studentId })
            .returning();
          await tx.delete(parentLinkCodes).where(eq(parentLinkCodes.id, row.id));
          return created!;
        },
        { linkCodeHash },
      )
      .catch((err: unknown) => {
        if (!isUniqueViolation(err)) throw err;
        throw new AppError(
          HttpStatus.CONFLICT,
          'already_linked',
          'To konto jest już połączone z Twoim',
        );
      });

    await this.audit.log({
      actorId: user.id,
      action: 'parent_link.created',
      targetType: 'user',
      targetId: link.studentId,
    });
    const [info] = await this.listLinks(user, link.id);
    const studentEmail = await this.rls.run(user.id, async (tx) => {
      const [s] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, link.studentId));
      return s?.email;
    });
    if (studentEmail) {
      await this.mail.send({
        to: studentEmail,
        subject: 'Rodzic połączył konto z Twoim',
        text:
          `${user.displayName} połączył(a) swoje konto rodzica z Twoim i widzi Twoje lekcje oraz postępy.\n` +
          `Jeśli to pomyłka, usuń połączenie w ustawieniach konta: ${this.mail.link('/app/account')}`,
      });
    }
    return info!;
  }

  listLinks(user: User, onlyId?: string): Promise<ParentLinkInfo[]> {
    return this.rls.run(user.id, async (tx) => {
      const rows = await tx
        .select({
          l: parentLinks,
          parentName: parent.displayName,
          studentName: student.displayName,
        })
        .from(parentLinks)
        .innerJoin(parent, eq(parent.id, parentLinks.parentId))
        .innerJoin(student, eq(student.id, parentLinks.studentId))
        .where(
          onlyId
            ? eq(parentLinks.id, onlyId)
            : or(eq(parentLinks.parentId, user.id), eq(parentLinks.studentId, user.id)),
        );
      return rows.map(({ l, parentName, studentName }) => ({
        id: l.id,
        parent: { id: l.parentId, displayName: parentName },
        student: { id: l.studentId, displayName: studentName },
        createdAt: l.createdAt.toISOString(),
      }));
    });
  }

  async removeLink(user: User, id: string): Promise<void> {
    const removed = await this.rls.run(user.id, (tx) =>
      tx.delete(parentLinks).where(eq(parentLinks.id, id)).returning(),
    );
    if (!removed.length) throw notFound('Nie znaleziono połączenia');
    await this.audit.log({
      actorId: user.id,
      action: 'parent_link.removed',
      targetType: 'parent_link',
      targetId: id,
    });
  }

  async children(user: User): Promise<ChildInfo[]> {
    requireAccountType(user, 'parent');
    return this.rls.run(user.id, async (tx) => {
      const kids = await tx
        .select({
          linkId: parentLinks.id,
          id: student.id,
          displayName: student.displayName,
          schoolLevel: studentProfiles.schoolLevel,
          grade: studentProfiles.grade,
        })
        .from(parentLinks)
        .innerJoin(student, eq(student.id, parentLinks.studentId))
        .leftJoin(studentProfiles, eq(studentProfiles.userId, parentLinks.studentId))
        .where(eq(parentLinks.parentId, user.id))
        .orderBy(student.displayName);
      if (!kids.length) return [];
      const rows = await selectEnrollments(
        tx,
        inArray(
          enrollments.studentId,
          kids.map((k) => k.id),
        ),
      );
      return kids.map((k) => ({
        ...k,
        enrollments: rows.filter((r) => r.e.studentId === k.id).map(toEnrollmentInfo),
      }));
    });
  }
}
