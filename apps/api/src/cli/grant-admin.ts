// Usage: node dist/cli/grant-admin.js <email> [--revoke]
// Admin rights are never assignable through the API; this script is the only way.
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { auditLog, sessions, users } from '../db/schema.js';

const [email, flag] = process.argv.slice(2);
if (!email || (flag && flag !== '--revoke')) {
  console.error('Użycie: grant-admin <email> [--revoke]');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);
const grant = flag !== '--revoke';
try {
  const [user] = await db
    .update(users)
    .set({ isPlatformAdmin: grant, updatedAt: new Date() })
    .where(eq(users.email, email.trim().toLowerCase()))
    .returning();
  if (!user) {
    console.error(`Nie znaleziono konta ${email}. Najpierw zarejestruj je w aplikacji.`);
    process.exitCode = 1;
  } else {
    // Existing sessions were created without admin rights; force a fresh login.
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    await db.insert(auditLog).values({
      actorId: null,
      action: grant ? 'admin.granted' : 'admin.revoked',
      targetType: 'user',
      targetId: user.id,
      metadata: { via: 'cli' },
    });
    console.log(
      grant
        ? `${user.email} jest administratorem. Po zalogowaniu aplikacja wymusi włączenie MFA.`
        : `${user.email} nie jest już administratorem.`,
    );
  }
} finally {
  await pool.end();
}
