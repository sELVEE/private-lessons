import { loadEnv } from '../src/config/env.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://pl:pl@localhost:5432/private_lessons_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

export const testEnv = () =>
  loadEnv({
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:4200',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    TOKEN_HASH_KEY: Buffer.alloc(32, 2).toString('base64'),
    COOKIE_SECURE: 'false',
    MAIL_TRANSPORT: 'log',
    HIBP_ENABLED: 'false',
  });
