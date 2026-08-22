import { addDays, DayKey, daysInMonth, toDayKey } from './date';

export type StreakInfo = {
  /** Consecutive days ending today (or yesterday, if today is still open). */
  current: number;
  best: number;
  /** True once today is logged - drives the ring's "complete" state. */
  loggedToday: boolean;
  /** Days logged in the current calendar month. */
  monthLogged: number;
  monthDays: number;
  /** 0..1 for the streak ring. */
  monthProgress: number;
};

/**
 * Streak rule (product decision): a streak survives until a day has fully
 * passed unlogged. So at 11pm with nothing posted you still show yesterday's
 * streak - the pressure is "don't lose it", not "you already lost it". Once a
 * day is missed the counter resets to zero and the calendar keeps the gap
 * visible, which is the honest signal a pod-mate should see.
 */
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
