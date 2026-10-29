import { z } from 'zod';

export const noteSchema = z.object({
  content: z.string().max(20000, 'Notatka może mieć najwyżej 20 000 znaków'),
});

export const reportSchema = z.object({
  summary: z.string().trim().min(1, 'Opisz krótko lekcję').max(4000),
  covered: z.string().trim().max(2000).optional().default(''),
  nextSteps: z.string().trim().max(2000).optional().default(''),
  /** Engagement 1–5, optional. */
  engagement: z.number().int().min(1).max(5).nullable().optional(),
});
export type ReportInput = z.input<typeof reportSchema>;

export interface NoteRevisionInfo {
  editedBy: string | null;
  createdAt: string;
  content: string;
}

export interface NoteInfo {
  content: string;
  updatedAt: string | null;
  updatedBy: string | null;
  revisions: NoteRevisionInfo[];
}

export interface ReportInfo {
  lessonId: string;
  lessonStartsAt: string;
  summary: string;
  covered: string;
  nextSteps: string;
  engagement: number | null;
  updatedAt: string;
}
