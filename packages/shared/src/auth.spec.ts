import { describe, expect, it } from 'vitest';
import { needsParentConsent, registerSchema } from './auth.js';

const now = new Date('2026-10-28');

describe('needsParentConsent', () => {
  it('requires consent for clearly under-16 students', () => {
    expect(needsParentConsent(2012, undefined, now)).toBe(true);
    expect(needsParentConsent(2012, true, now)).toBe(true);
  });
  it('does not require consent for clearly 16+ students', () => {
    expect(needsParentConsent(2009, undefined, now)).toBe(false);
  });
  it('relies on the declaration in the ambiguous year', () => {
    expect(needsParentConsent(2010, undefined, now)).toBe(true);
    expect(needsParentConsent(2010, true, now)).toBe(false);
  });
});

describe('registerSchema', () => {
  const base = {
    email: 'Ala@Example.com',
    username: 'Ala.Kot',
    password: 'correct horse battery',
    displayName: 'Ala',
    acceptTerms: true as const,
  };

  it('normalises e-mail and username', () => {
    const r = registerSchema.parse({ ...base, accountType: 'tutor', declaresAdult: true });
    expect(r.email).toBe('ala@example.com');
    expect(r.username).toBe('ala.kot');
  });

  it('requires a parent e-mail for young students', () => {
    const r = registerSchema.safeParse({
      ...base,
      accountType: 'student',
      student: { schoolLevel: 'primary', grade: 6, birthYear: new Date().getFullYear() - 12 },
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path.join('.') === 'student.parentEmail')).toBe(true);
  });

  it('rejects a grade outside the school level', () => {
    const r = registerSchema.safeParse({
      ...base,
      accountType: 'student',
      student: { schoolLevel: 'vocational', grade: 5, birthYear: 2000 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects short passwords', () => {
    const r = registerSchema.safeParse({
      ...base,
      password: 'short',
      accountType: 'tutor',
      declaresAdult: true,
    });
    expect(r.success).toBe(false);
  });
});
