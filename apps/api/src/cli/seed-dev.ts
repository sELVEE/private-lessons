// Usage: node dist/cli/seed-dev.js — demo accounts for local development only.
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { ARGON_OPTS } from '../auth/password.service.js';
import { memberships, organizations, studentProfiles, users } from '../db/schema.js';

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
  console.log(`\nLoginy: ${accounts.map((a) => a.username).join(', ')} · hasło: ${DEMO_PASSWORD}`);
  console.log('Konto admin przy pierwszym logowaniu wymusi konfigurację MFA.');
} finally {
  await pool.end();
}
