/**
 * Remembers an invite code across registration and e-mail verification, so a student who opened
 * a /join link before having an account lands back on the join screen after logging in.
 */
const KEY = 'pl_pending_invite';

export const pendingInvite = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(code: string): void {
    try {
      localStorage.setItem(KEY, code);
    } catch {
      // storage unavailable (private mode) — the user can paste the code manually
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  },
};
