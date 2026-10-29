import { z } from 'zod';

const uuid = z.uuid({ message: 'Nieprawidłowy identyfikator' });

export const ASSESSMENT_KINDS = ['test', 'quiz', 'exam', 'oral', 'homework', 'other'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];
export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  test: 'Sprawdzian',
  quiz: 'Kartkówka',
  exam: 'Egzamin próbny',
  oral: 'Odpowiedź ustna',
  homework: 'Praca domowa',
  other: 'Inne',
};

export const TOPIC_STATUSES = ['learning', 'review', 'mastered'] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];
export const TOPIC_STATUS_LABELS: Record<TopicStatus, string> = {
  learning: 'W trakcie',
  review: 'Do powtórki',
  mastered: 'Opanowany',
};

export const assessmentSchema = z
  .object({
    title: z.string().trim().min(2, 'Podaj nazwę').max(200),
    kind: z.enum(ASSESSMENT_KINDS),
    score: z.number().min(0).max(100000).nullable().optional(),
    maxScore: z.number().positive().max(100000).nullable().optional(),
    grade: z.string().trim().max(20).nullable().optional(),
    takenAt: z.iso.date(),
    topicId: uuid.nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((a) => a.score == null || a.maxScore == null || a.score <= a.maxScore, {
    path: ['score'],
    message: 'Wynik nie może przekraczać maksimum',
  })
  .refine((a) => a.score != null || (a.grade != null && a.grade !== ''), {
    path: ['grade'],
    message: 'Podaj wynik punktowy albo ocenę',
  });
export type AssessmentInput = z.input<typeof assessmentSchema>;

export const topicStatusSchema = z.object({ status: z.enum(TOPIC_STATUSES).nullable() });

export const goalSchema = z.object({
  title: z.string().trim().min(2, 'Opisz cel').max(200),
  targetDate: z.iso.date().nullable().optional(),
});

export const goalUpdateSchema = z.object({ achieved: z.boolean() });

export interface AssessmentInfo {
  id: string;
  title: string;
  kind: AssessmentKind;
  score: number | null;
  maxScore: number | null;
  /** score / maxScore in %, when both are known. */
  percent: number | null;
  grade: string | null;
  takenAt: string;
  topic: string | null;
  note: string | null;
}

export interface TopicProgressInfo {
  topicId: string;
  name: string;
  parentId: string | null;
  status: TopicStatus | null;
  updatedAt: string | null;
}

export interface GoalInfo {
  id: string;
  title: string;
  targetDate: string | null;
  achievedAt: string | null;
  createdAt: string;
}

export interface ProgressSummary {
  periodDays: number;
  lessonsCompleted: number;
  attendanceRate: number | null;
  homeworkAssigned: number;
  homeworkDone: number;
  averagePercent: number | null;
  /** Average of the period minus average before it, in percentage points. */
  trend: number | null;
  mastered: number;
  toReview: string[];
  goalsAchieved: number;
  goalsOpen: number;
  lastNextSteps: string | null;
}

export interface ProgressInfo {
  enrollmentId: string;
  student: string;
  tutor: string;
  subject: string;
  assessments: AssessmentInfo[];
  topics: TopicProgressInfo[];
  goals: GoalInfo[];
  summary: ProgressSummary;
}
