import { z } from 'zod';
import { emailSchema } from './auth.js';
import { SCHOOL_LEVEL_MAX_GRADE, SCHOOL_LEVELS, type SchoolLevel } from './enums.js';

export const ENROLLMENT_STATUSES = ['active', 'paused', 'ended'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: 'Aktywna',
  paused: 'Wstrzymana',
  ended: 'Zakończona',
};

/** Short codes people can type: 8 chars without look-alikes (0/O, 1/I), shown as XXXX-XXXX. */
export const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeShortCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function formatShortCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export const shortCodeSchema = z
  .string()
  .transform(normalizeShortCode)
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/, 'Kod ma 8 znaków, np. ABCD-2345'));

const uuid = z.uuid({ message: 'Nieprawidłowy identyfikator' });

export const subjectSchema = z.object({
  name: z.string().trim().min(2, 'Podaj nazwę przedmiotu').max(60),
});

export const topicSchema = z.object({
  name: z.string().trim().min(1, 'Podaj nazwę tematu').max(120),
  parentId: uuid.nullable().optional(),
});

export const createInviteSchema = z.object({
  subjectId: uuid,
  /** Personal e-mail invite (single use, only that address can accept). Without it: a code/link. */
  email: emailSchema.optional(),
  maxUses: z.number().int().min(1).max(50).default(1),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
export type CreateInviteInput = z.input<typeof createInviteSchema>;

export const redeemCodeSchema = z.object({ code: shortCodeSchema });

export const updateEnrollmentSchema = z
  .object({
    goals: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(ENROLLMENT_STATUSES).optional(),
  })
  .refine((v) => v.goals !== undefined || v.status !== undefined, 'Brak zmian');

export const updateStudentProfileSchema = z
  .object({
    schoolLevel: z.enum(SCHOOL_LEVELS),
    grade: z.number().int().min(1).max(8).nullable(),
  })
  .superRefine((p, ctx) => {
    const max = SCHOOL_LEVEL_MAX_GRADE[p.schoolLevel];
    if (p.grade !== null && (max === null || p.grade > max)) {
      ctx.addIssue({
        code: 'custom',
        path: ['grade'],
        message: 'Nieprawidłowa klasa dla tego poziomu',
      });
    }
  });

export const adminUserQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  /** Why the admin looks at user data; stored in the audit log. */
  reason: z.string().trim().min(5, 'Podaj powód (min. 5 znaków)').max(200),
});

export const adminSetStatusSchema = z.object({
  status: z.enum(['active', 'locked', 'disabled']),
  reason: z.string().trim().min(5, 'Podaj powód (min. 5 znaków)').max(200),
});

// ---------------------------------------------------------------- responses

export interface TopicInfo {
  id: string;
  name: string;
  parentId: string | null;
}

export interface SubjectInfo {
  id: string;
  name: string;
  topics: TopicInfo[];
}

export interface InviteInfo {
  id: string;
  subject: { id: string; name: string };
  /** Present only in the response that created the invite; stored hashed afterwards. */
  code?: string;
  link?: string;
  sentTo: boolean;
  uses: number;
  maxUses: number;
  expiresAt: string;
  createdAt: string;
}

export interface InvitePreview {
  tutorName: string;
  subjectName: string;
  alreadyEnrolled: boolean;
}

export interface PersonRef {
  id: string;
  displayName: string;
}

export interface EnrollmentEventInfo {
  type: string;
  note: string | null;
  createdAt: string;
  actor: string | null;
}

export interface EnrollmentInfo {
  id: string;
  status: EnrollmentStatus;
  goals: string | null;
  startedAt: string;
  endedAt: string | null;
  subject: { id: string; name: string };
  tutor: PersonRef;
  student: PersonRef & {
    schoolLevel: SchoolLevel | null;
    grade: number | null;
    age: number | null;
  };
}

export interface EnrollmentDetail extends EnrollmentInfo {
  /** E-mail is shown to the student's own tutor only. */
  studentEmail: string | null;
  events: EnrollmentEventInfo[];
}

export interface ParentLinkCode {
  code: string;
  expiresAt: string;
}

export interface ParentLinkInfo {
  id: string;
  parent: PersonRef;
  student: PersonRef;
  createdAt: string;
}

export interface ChildInfo extends PersonRef {
  linkId: string;
  schoolLevel: SchoolLevel | null;
  grade: number | null;
  enrollments: EnrollmentInfo[];
}

export interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  displayName: string;
  accountType: string;
  isPlatformAdmin: boolean;
  status: 'active' | 'locked' | 'disabled';
  mfaEnabled: boolean;
  createdAt: string;
}
