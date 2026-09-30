import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Current streak, same rule as the clients: it survives until a day has
 * fully passed unposted, so it counts back from today if today is posted,
 * else from yesterday. Walks the user's days newest first and stops at the
 * first gap, so it reads only as many rows as the streak is long.
 */
export async function currentStreak(ctx: QueryCtx | MutationCtx, userId: Id<'users'>, today: string): Promise<number> {
  let expect = today;
  let n = 0;
  const rows = ctx.db
    .query('checkins')
    .withIndex('by_user_day', (q) => q.eq('userId', userId).lte('day', today))
    .order('desc');
  for await (const c of rows) {
    if (!c.posted) continue;
    if (c.day === expect) {
      n++;
      expect = addDays(expect, -1);
    } else if (n === 0 && c.day === addDays(today, -1)) {
      n = 1;
      expect = addDays(c.day, -1);
    } else {
      break;
    }
  }
  return n;
}
