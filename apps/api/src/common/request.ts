import type { Request } from 'express';
import type { sessions, users } from '../db/schema.js';

export interface AuthContext {
  user: typeof users.$inferSelect;
  session: typeof sessions.$inferSelect;
}

export type AppRequest = Request & { auth?: AuthContext };

export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

export function userAgent(req: Request): string | null {
  return req.get('user-agent')?.slice(0, 300) ?? null;
}
