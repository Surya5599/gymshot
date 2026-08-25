import { addDays, DayKey, daysInMonth, toDayKey } from './date';

export type StreakInfo = {
  current: number;
  best: number;
  loggedToday: boolean;
  monthLogged: number;
  monthDays: number;
  monthProgress: number;
};

/** Same rule as mobile: a streak survives until a day has fully passed unlogged. */
export function computeStreak(days: DayKey[], today: DayKey = toDayKey()): StreakInfo {
  const set = new Set(days);
  const loggedToday = set.has(today);

  let cursor = loggedToday ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...set].sort();
  let best = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }

  const monthPrefix = today.slice(0, 7);
  const monthLogged = sorted.filter((d) => d.startsWith(monthPrefix)).length;
  const monthDays = daysInMonth(today);

  return {
    current,
    best,
    loggedToday,
    monthLogged,
    monthDays,
    monthProgress: monthDays ? monthLogged / monthDays : 0,
  };
}
