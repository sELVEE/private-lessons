import { z } from 'zod';
import {
  ACCOUNT_TYPES,
  DIGITAL_CONSENT_AGE,
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_MAX_GRADE,
} from './enums.js';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Nieprawidłowy adres e-mail' }));

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Login musi mieć co najmniej 3 znaki')
  .max(32, 'Login może mieć najwyżej 32 znaki')
  .regex(/^[a-z0-9._-]+$/, 'Login może zawierać tylko litery, cyfry oraz . _ -');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków`)
  .max(PASSWORD_MAX_LENGTH, `Hasło może mieć najwyżej ${PASSWORD_MAX_LENGTH} znaków`);

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Podaj imię lub pseudonim')
  .max(60, 'Najwyżej 60 znaków');

/** Returns how old someone born in `birthYear` may be today: [youngest, oldest]. */
export function ageRange(birthYear: number, now = new Date()): [number, number] {
  const diff = now.getFullYear() - birthYear;
  return [diff - 1, diff];
}

/**
 * Decides whether a student needs parental consent. We only collect the birth year, so in the
 * one ambiguous year we rely on the student's own declaration (`isAtLeast16`).
 */
export function needsParentConsent(birthYear: number, isAtLeast16?: boolean, now = new Date()) {
  const [youngest, oldest] = ageRange(birthYear, now);
  if (youngest >= DIGITAL_CONSENT_AGE) return false;
  if (oldest < DIGITAL_CONSENT_AGE) return true;
  return isAtLeast16 !== true;
}

const currentYear = () => new Date().getFullYear();

const studentProfileSchema = z
  .object({
    schoolLevel: z.enum(SCHOOL_LEVELS),
    grade: z.number().int().min(1).max(8).optional(),
    birthYear: z
      .number()
      .int()
      .refine(
        (y) => y >= currentYear() - 100 && y <= currentYear() - 5,
        'Nieprawidłowy rok urodzenia',
      ),
    isAtLeast16: z.boolean().optional(),
    parentEmail: emailSchema.optional(),
  })
  .superRefine((p, ctx) => {
    const max = SCHOOL_LEVEL_MAX_GRADE[p.schoolLevel];
    if (p.grade !== undefined && (max === null || p.grade > max)) {
      ctx.addIssue({
        code: 'custom',
        path: ['grade'],
        message: 'Nieprawidłowa klasa dla tego poziomu',
      });
    }
    if (needsParentConsent(p.birthYear, p.isAtLeast16) && !p.parentEmail) {
      ctx.addIssue({
        code: 'custom',
        path: ['parentEmail'],
        message: 'Osoby poniżej 16 lat potrzebują zgody rodzica — podaj jego e-mail',
      });
    }
  });

export const registerSchema = z
  .object({
    accountType: z.enum(ACCOUNT_TYPES),
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
    acceptTerms: z.literal(true, { message: 'Musisz zaakceptować regulamin' }),
    declaresAdult: z.boolean().optional(),
    student: studentProfileSchema.optional(),
  })
  .superRefine((r, ctx) => {
    if (r.accountType === 'student' && !r.student) {
      ctx.addIssue({ code: 'custom', path: ['student'], message: 'Uzupełnij dane ucznia' });
    }
    if (r.accountType !== 'student' && r.declaresAdult !== true) {
      ctx.addIssue({ code: 'custom', path: ['declaresAdult'], message: 'Wymagana pełnoletność' });
    }
    if (r.student?.parentEmail && r.student.parentEmail === r.email) {
      ctx.addIssue({
        code: 'custom',
        path: ['student', 'parentEmail'],
        message: 'E-mail rodzica musi być inny niż Twój',
      });
    }
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  /** E-mail or username. */
  identifier: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaCodeSchema = z
  .string()
  .trim()
  .regex(/^(\d{6}|[a-z0-9]{5}-[a-z0-9]{5})$/i, 'Podaj 6-cyfrowy kod lub kod zapasowy');

export const loginMfaSchema = z.object({
  challengeId: z.string().min(16).max(128),
  code: mfaCodeSchema,
});
export type LoginMfaInput = z.infer<typeof loginMfaSchema>;

export const tokenSchema = z.object({ token: z.string().min(16).max(128) });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export const mfaEnableSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
export const mfaDisableSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  code: mfaCodeSchema,
});
