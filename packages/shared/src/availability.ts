import { z } from 'zod';

/** Godzina w formacie „HH:MM” (00:00–24:00). */
const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, { message: 'Podaj godzinę w formacie GG:MM' });

/** Minuty od północy dla „HH:MM”. */
export function clockToMinutes(v: string): number {
  const [h, m] = v.split(':').map(Number);
  return h! * 60 + m!;
}

export function minutesToClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export const timeRangeSchema = z
  .object({ start: clock, end: clock })
  .refine((r) => clockToMinutes(r.end) > clockToMinutes(r.start), {
    message: 'Koniec musi być później niż początek',
    path: ['end'],
  });
export type TimeRange = z.infer<typeof timeRangeSchema>;

const rangesSchema = z
  .array(timeRangeSchema)
  .max(6)
  .refine(
    (rs) => {
      const sorted = [...rs].sort((a, b) => clockToMinutes(a.start) - clockToMinutes(b.start));
      return sorted.every(
        (r, i) => i === 0 || clockToMinutes(r.start) >= clockToMinutes(sorted[i - 1]!.end),
      );
    },
    { message: 'Przedziały godzin nie mogą na siebie nachodzić' },
  );

/** 0 = poniedziałek … 6 = niedziela. */
export const weekdaySchema = z.number().int().min(0).max(6);

export const WEEKDAY_LABELS = [
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
  'Niedziela',
] as const;

/** Tygodniowy szablon godzin pracy; dzień bez przedziałów = wolne. */
export const weeklyHoursSchema = z.object({
  days: z
    .array(z.object({ weekday: weekdaySchema, ranges: rangesSchema }))
    .max(7)
    .refine((ds) => new Set(ds.map((d) => d.weekday)).size === ds.length, {
      message: 'Każdy dzień tygodnia może wystąpić tylko raz',
    }),
});
export type WeeklyHours = z.infer<typeof weeklyHoursSchema>;

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Nieprawidłowa data' })
  .refine(
    (v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
    },
    {
      message: 'Nieprawidłowa data',
    },
  );

/** Wyjątek na konkretny dzień; pusta lista przedziałów = dzień wolny. */
export const availabilityExceptionSchema = z.object({
  ranges: rangesSchema,
  note: z.string().trim().max(120).optional(),
});
export const availabilityDateSchema = day;

export interface AvailabilityException {
  date: string;
  ranges: TimeRange[];
  note: string | null;
}

export interface Availability {
  weekly: { weekday: number; ranges: TimeRange[] }[];
  exceptions: AvailabilityException[];
}

/** Przedziały pracy obowiązujące danego dnia (wyjątek ma pierwszeństwo przed szablonem). */
export function rangesForDate(a: Availability, date: string, weekday: number): TimeRange[] {
  const ex = a.exceptions.find((e) => e.date === date);
  if (ex) return ex.ranges;
  return a.weekly.find((d) => d.weekday === weekday)?.ranges ?? [];
}
