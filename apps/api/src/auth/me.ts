import type { MeResponse } from '@pl/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/db.module.js';
import { memberships, organizations, studentProfiles, type users } from '../db/schema.js';
import { mfaSetupRequired } from './auth.guard.js';

export async function buildMe(db: Db, user: typeof users.$inferSelect): Promise<MeResponse> {
  const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, user.id));
  const orgs = await db
    .select({ organizationId: organizations.id, organizationName: organizations.name, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, user.id));
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    accountType: user.accountType,
    isPlatformAdmin: user.isPlatformAdmin,
    mfaEnabled: !!user.mfaEnabledAt,
    mfaSetupRequired: mfaSetupRequired(user),
    student: profile ? { schoolLevel: profile.schoolLevel, grade: profile.grade, birthYear: profile.birthYear } : null,
    memberships: orgs,
  };
}
