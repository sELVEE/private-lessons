import { expect } from 'vitest';
import { type Client, client, type Harness, tokenFromMail, uniqueUser } from './harness.js';

export const PASSWORD = 'Wiosna-nad-Wisla-2026';

export interface Account {
  c: Client;
  id: string;
  email: string;
  username: string;
}

export async function account(
  h: Harness,
  accountType: 'tutor' | 'student' | 'parent',
  displayName: string,
): Promise<Account> {
  const u = uniqueUser(accountType);
  const c = await client(h.app);
  const res = await c.post('/api/auth/register', {
    accountType,
    ...u,
    password: PASSWORD,
    displayName,
    acceptTerms: true,
    ...(accountType === 'student'
      ? {
          student: { schoolLevel: 'secondary', grade: 2, birthYear: new Date().getFullYear() - 17 },
        }
      : { declaresAdult: true }),
  });
  expect(res.status).toBe(202);
  await c.post('/api/auth/verify-email', {
    token: tokenFromMail(h.mail, u.email, '/verify-email'),
  });
  const login = await c.post('/api/auth/login', { identifier: u.username, password: PASSWORD });
  expect(login.body.status).toBe('ok');
  return { c, id: login.body.user.id, ...u };
}

export async function firstSubject(t: Account) {
  const res = await t.c.get('/api/subjects');
  expect(res.status).toBe(200);
  return res.body[0] as { id: string; name: string };
}

export async function enrol(t: Account, s: Account) {
  const subject = await firstSubject(t);
  const invite = await t.c.post('/api/invites', { subjectId: subject.id });
  expect(invite.status).toBe(201);
  const res = await s.c.post('/api/invites/redeem', { code: invite.body.code });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}
