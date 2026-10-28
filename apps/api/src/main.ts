import 'reflect-metadata';
import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

// Local development reads apps/api/.env; in containers the variables come from the environment.
try {
  process.loadEnvFile();
} catch {
  // no .env file — fine
}
const env = loadEnv();
const app = await createApp(env);
await app.listen(env.PORT);
console.log(`API listening on http://localhost:${env.PORT}/api`);
