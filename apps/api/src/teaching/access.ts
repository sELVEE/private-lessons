import { HttpStatus } from '@nestjs/common';
import type { AccountType } from '@pl/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { AppError } from '../common/errors.js';
import type { Db } from '../db/db.module.js';
import { memberships, type users } from '../db/schema.js';

type User = typeof users.$inferSelect;

export function requireAccountType(user: User, ...types: AccountType[]) {
  if (!types.includes(user.accountType)) {
    throw new AppError(
      HttpStatus.FORBIDDEN,
      'forbidden',
      'Ta funkcja nie jest dostępna dla Twojego konta',
    );
  }
}

/**
 * The organization a tutor works in. One per tutor for now; choosing between several
 * (tutor teaching at two schools) comes with multi-organization support.
 */
export async function requireTutorOrg(db: Db, user: User): Promise<string> {
  const [m] = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), inArray(memberships.role, ['tutor', 'owner'])))
    .limit(1);
  if (!m)
    throw new AppError(
      HttpStatus.FORBIDDEN,
      'not_a_tutor',
      'Ta funkcja jest dostępna tylko dla korepetytorów',
    );
  return m.organizationId;
}

export const notFound = (what = 'Nie znaleziono') =>
  new AppError(HttpStatus.NOT_FOUND, 'not_found', what);
