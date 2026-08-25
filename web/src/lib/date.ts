/** Ported from the mobile app: check-ins are keyed by local calendar day. */
export type DayKey = string; // YYYY-MM-DD

export function toDayKey(d: Date = new Date()): DayKey {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DayKey, delta: number): DayKey {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + delta);
  return toDayKey(d);
}

export function daysInMonth(key: DayKey): number {
  const d = fromDayKey(key);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDay(key: DayKey): string {
  const today = toDayKey();
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  const d = fromDayKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function monthName(key: DayKey): string {
  const d = fromDayKey(`${key.slice(0, 7)}-01`);
  return d.toLocaleDateString(undefined, { month: 'long' });
}
