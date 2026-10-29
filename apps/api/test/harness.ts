import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { DB, type Db } from '../src/db/db.module.js';
import { MailService } from '../src/mail/mail.service.js';
import { testEnv, TEST_REDIS_URL } from './env.js';

export const ORIGIN = 'http://localhost:4200';

export interface Harness {
  app: INestApplication;
  db: Db;
  mail: MailService;
  redis: Redis;
  close(): Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const app = await createApp(testEnv());
  await app.init();
  const redis = new Redis(TEST_REDIS_URL);
  return {
    app,
    db: app.get<Db>(DB),
    mail: app.get(MailService),
    redis,
    async close() {
      await redis.quit();
      await app.close();
    },
  };
}

/** A browser-like client: keeps cookies and sends the CSRF header on mutating requests. */
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  private csrf = '';

  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  async init() {
    const res = await this.agent.get('/api/health');
    this.csrf = /pl_csrf=([^;]+)/.exec(String(res.headers['set-cookie']))?.[1] ?? '';
    return this;
  }

  get(url: string) {
    return this.agent.get(url);
  }

  post(url: string, body?: object) {
    return this.agent.post(url).set('origin', ORIGIN).set('x-csrf-token', this.csrf).send(body);
  }

  put(url: string, body?: object) {
    return this.agent.put(url).set('origin', ORIGIN).set('x-csrf-token', this.csrf).send(body);
  }

  patch(url: string, body?: object) {
    return this.agent.patch(url).set('origin', ORIGIN).set('x-csrf-token', this.csrf).send(body);
  }

  delete(url: string) {
    return this.agent.delete(url).set('origin', ORIGIN).set('x-csrf-token', this.csrf);
  }
}

export async function client(app: INestApplication) {
  return new Client(app).init();
}

/** Extracts the token from the last e-mail sent to `to` whose link contains `path`. */
export function tokenFromMail(mail: MailService, to: string, path: string): string {
  const msg = [...mail.outbox].reverse().find((m) => m.to === to && m.text.includes(path));
  const token = msg && new RegExp(`${path}\\?token=([\\w-]+)`).exec(msg.text)?.[1];
  if (!token) throw new Error(`No ${path} mail for ${to}`);
  return token;
}

let seq = 0;
export function uniqueUser(prefix = 'user') {
  seq += 1;
  const id = `${prefix}${Date.now().toString(36)}${seq}`;
  return { email: `${id}@example.com`, username: id };
}
