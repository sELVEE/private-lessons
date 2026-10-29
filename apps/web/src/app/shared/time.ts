export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Calendar-day arithmetic (safe across DST changes, unlike adding 24 h). */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Local `YYYY-MM-DD` for a date. */
export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight for `YYYY-MM-DD`, or null when the text is not a date. */
export function parseIsoDay(v: string | undefined | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** „za 47 min”, „za 3 h”, „jutro”, „w piątek” — how far away a moment is, in words. */
export function relativeTime(iso: string, now = new Date()): string {
  const t = new Date(iso);
  const mins = Math.round((t.getTime() - now.getTime()) / 60_000);
  if (mins < 0) return mins > -90 ? 'trwa teraz' : 'minęła';
  if (mins < 60) return `za ${mins} min`;
  if (t.toDateString() === now.toDateString()) return `za ${Math.round(mins / 60)} h`;
  if (t.toDateString() === addDays(now, 1).toDateString()) return 'jutro';
  return t.toLocaleDateString('pl-PL', { weekday: 'long' });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'dziś';
  if (d.toDateString() === addDays(now, 1).toDateString()) return 'jutro';
  return d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' });
}
