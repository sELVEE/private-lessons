import { z } from 'zod';

const uuid = z.uuid({ message: 'Nieprawidłowy identyfikator' });

export const materialSchema = z.object({
  title: z.string().trim().min(2, 'Podaj tytuł').max(200),
  /** Markdown with $…$ / $$…$$ math (KaTeX). */
  body: z.string().max(50000).default(''),
  subjectId: uuid,
  topicId: uuid.nullable().optional(),
});
export type MaterialInput = z.input<typeof materialSchema>;

export const shareSchema = z.object({ enrollmentIds: z.array(uuid).max(200) });

export const HOMEWORK_STATUSES = ['assigned', 'submitted', 'reviewed'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];
export const HOMEWORK_STATUS_LABELS: Record<HomeworkStatus, string> = {
  assigned: 'Do zrobienia',
  submitted: 'Oddane',
  reviewed: 'Sprawdzone',
};

export const homeworkSchema = z.object({
  enrollmentId: uuid,
  title: z.string().trim().min(2, 'Podaj tytuł').max(200),
  instructions: z.string().max(20000).default(''),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  lessonId: uuid.nullable().optional(),
});
export type HomeworkInput = z.input<typeof homeworkSchema>;

export const submitHomeworkSchema = z.object({
  submission: z.string().trim().min(1, 'Wpisz rozwiązanie').max(20000),
});

export const reviewHomeworkSchema = z.object({
  feedback: z.string().max(20000).default(''),
  grade: z.string().trim().max(20).optional(),
});

export interface MaterialInfo {
  id: string;
  title: string;
  body: string;
  subject: { id: string; name: string };
  topic: { id: string; name: string } | null;
  tutor: string;
  /** Enrollments it is shared with (tutor view only). */
  sharedWith: string[];
  updatedAt: string;
}

export interface HomeworkInfo {
  id: string;
  enrollmentId: string;
  lessonId: string | null;
  title: string;
  instructions: string;
  dueAt: string | null;
  status: HomeworkStatus;
  submission: string | null;
  submittedAt: string | null;
  feedback: string | null;
  grade: string | null;
  reviewedAt: string | null;
  createdAt: string;
  student: string;
  tutor: string;
  subject: string;
}
