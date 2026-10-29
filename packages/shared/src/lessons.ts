import { z } from 'zod';

export const LESSON_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const ATTENDANCE = ['present', 'late', 'absent'] as const;
export type Attendance = (typeof ATTENDANCE)[number];

export const ATTENDANCE_LABELS: Record<Attendance, string> = {
  present: 'Obecny',
  late: 'Spóźniony',
  absent: 'Nieobecny',
};

export const LESSON_STATUS_LABELS: Record<LessonStatus, string> = {
  scheduled: 'Zaplanowana',
  completed: 'Odbyta',
  cancelled: 'Odwołana',
};

const uuid = z.uuid({ message: 'Nieprawidłowy identyfikator' });
const isoDate = z.iso.datetime({ offset: true, message: 'Nieprawidłowa data' });

export const createLessonSchema = z.object({
  enrollmentId: uuid,
  startsAt: isoDate,
  durationMin: z.number().int().min(15).max(240),
  /** Repeat weekly this many times in total (1 = single lesson). Group lessons: later. */
  repeatWeeks: z.number().int().min(1).max(26).default(1),
  location: z.string().trim().max(200).optional(),
  topic: z.string().trim().max(200).optional(),
});
export type CreateLessonInput = z.input<typeof createLessonSchema>;

export const rescheduleLessonSchema = z.object({
  startsAt: isoDate,
  durationMin: z.number().int().min(15).max(240).optional(),
  note: z.string().trim().max(500).optional(),
});

export const cancelLessonSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const completeLessonSchema = z.object({
  attendance: z.enum(ATTENDANCE),
});

export const chargeDecisionSchema = z.object({ chargeable: z.boolean() });

export const lessonRangeSchema = z.object({
  from: isoDate,
  to: isoDate,
  enrollmentId: uuid.optional(),
});

/** Booking step: lessons start on multiples of this many minutes (10:00, 10:15… or 10:00, 10:30…). */
export const SLOT_MINUTES = [5, 10, 15, 20, 30, 60] as const;
export type SlotMinutes = (typeof SLOT_MINUTES)[number];

export const orgSettingsSchema = z.object({
  /** Late cancellations by the student are charged automatically instead of waiting for the tutor. */
  autoChargeLateCancellation: z.boolean(),
  /** "Late" means less than this many hours before the lesson. */
  cancellationWindowHours: z.number().int().min(1).max(168),
  defaultLessonMinutes: z.number().int().min(15).max(240),
  slotMinutes: z
    .number()
    .int()
    .refine((v) => (SLOT_MINUTES as readonly number[]).includes(v), {
      message: 'Dozwolony krok: 5, 10, 15, 20, 30 lub 60 minut',
    }),
});

/** Whether a start time falls on the booking grid (every slot divides an hour, so UTC minutes suffice). */
export function isOnSlot(at: Date, slotMinutes: number): boolean {
  return (
    at.getUTCSeconds() === 0 &&
    at.getUTCMilliseconds() === 0 &&
    at.getUTCMinutes() % slotMinutes === 0
  );
}
export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export interface LessonChangeInfo {
  type: string;
  note: string | null;
  fromStartsAt: string | null;
  toStartsAt: string | null;
  actor: string | null;
  createdAt: string;
}

export interface LessonInfo {
  id: string;
  enrollmentId: string;
  seriesId: string | null;
  startsAt: string;
  durationMin: number;
  status: LessonStatus;
  attendance: Attendance | null;
  location: string | null;
  topic: string | null;
  cancelReason: string | null;
  cancelledByStudent: boolean;
  /** null = late cancellation waiting for the tutor's decision. */
  chargeable: boolean | null;
  subject: string;
  tutor: { id: string; displayName: string };
  student: { id: string; displayName: string };
}

export interface LessonDetail extends LessonInfo {
  changes: LessonChangeInfo[];
}
