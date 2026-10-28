import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { TEST_DATABASE_URL } from './env.js';

/** Recreates the test schema once per run, then applies the real migrations. */
export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await client.end();
  await runMigrations(TEST_DATABASE_URL);
}
