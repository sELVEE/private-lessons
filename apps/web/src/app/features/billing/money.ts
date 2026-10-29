/** Grosze → "1 234,50 zł". */
export function money(grosze: number): string {
  return (grosze / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
}

/** User input in złoty ("120", "120,50") → grosze, or null when invalid. */
export function toGrosze(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  const n =
    typeof input === 'number' ? input : Number(String(input).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function currentMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
}
