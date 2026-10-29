/** Stable colour per student, so the same person looks the same in the calendar, lists and charts. */
const COLORS = ['#23291e', '#5e7a8c', '#a84f2c', '#4f6b3c', '#7a5c8c', '#2f6f73'];

export function personColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
