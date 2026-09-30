import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireUser } from './lib/access';
import { addDays, currentStreak } from './lib/days';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How late a reminder may be delivered before it is skipped as stale. */
const REMINDER_GRACE_MS = 60 * 60 * 1000;

/** The VAPID public key, served so it lives in one place (the deployment's
 *  environment) instead of being pasted into the client. */
export const publicKey = query({
  args: {},
  handler: async () => process.env.VAPID_PUBLIC_KEY ?? null,
});

/**
 * Register (or refresh) this browser. Also how the device's reminder time
 * reaches the server: the device computes its next local reminder moment,
 * since only it knows its time zone.
 */
export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    reminderOn: v.boolean(),
    nextReminderAt: v.optional(v.number()),
    nextReminderDay: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint))
      .unique();
    // A browser belongs to whoever is signed in on it now.
    if (existing) await ctx.db.patch(existing._id, { ...args, userId: me._id });
    else await ctx.db.insert('pushSubscriptions', { ...args, userId: me._id });
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const me = await requireUser(ctx);
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
      .unique();
    if (existing && existing.userId === me._id) await ctx.db.delete(existing._id);
  },
});

export const subscriptionsFor = internalQuery({
  args: { userIds: v.optional(v.array(v.id('users'))), subscriptionIds: v.optional(v.array(v.id('pushSubscriptions'))) },
  handler: async (ctx, { userIds, subscriptionIds }) => {
    const out = [];
    for (const userId of userIds ?? []) {
      out.push(...(await ctx.db.query('pushSubscriptions').withIndex('by_user', (q) => q.eq('userId', userId)).collect()));
    }
    for (const id of subscriptionIds ?? []) {
      const s = await ctx.db.get(id);
      if (s) out.push(s);
    }
    return out.map((s) => ({ id: s._id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }));
  },
});

/** The push service said this endpoint is gone (404/410). */
export const removeSubscription = internalMutation({
  args: { id: v.id('pushSubscriptions') },
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});

/**
 * Runs every 15 minutes (crons.ts). Each due device is reminded at its own
 * local time, only if its owner has not posted that day, and then moved to
 * the same time tomorrow. The device re-syncs its exact time on every open,
 * which also absorbs daylight-saving shifts.
 */
export const runReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_next_reminder', (q) => q.gt('nextReminderAt', 0).lte('nextReminderAt', now))
      .take(500);

    let sent = 0;
    for (const s of due) {
      let at = s.nextReminderAt!;
      let day = s.nextReminderDay;
      if (s.reminderOn && day && now - at <= REMINDER_GRACE_MS) {
        const c = await ctx.db
          .query('checkins')
          .withIndex('by_user_day', (q) => q.eq('userId', s.userId).eq('day', day!))
          .unique();
        if (!c?.posted) {
          const streak = await currentStreak(ctx, s.userId, day);
          const title = streak > 0 ? `Your ${streak}-day streak is on the line` : "Time for today's photo";
          const notice = {
            kind: 'reminder' as const,
            emoji: streak > 0 ? '\u{1F525}' : '\u{1F4F8}',
            title,
            body: streak > 0 ? 'Post before midnight to keep it alive.' : 'Three angles, thirty seconds. Your squad is watching.',
            tab: 'today' as const,
            key: `reminder:${day}`,
          };
          // Inbox once per person per day; the push goes to this device only.
          const existing = await ctx.db
            .query('notifications')
            .withIndex('by_user_key', (q) => q.eq('userId', s.userId).eq('key', notice.key))
            .unique();
          if (!existing) await ctx.db.insert('notifications', { userId: s.userId, ...notice, read: false });
          await ctx.scheduler.runAfter(0, internal.pushNode.send, {
            subscriptionIds: [s._id],
            payload: { title: `${notice.emoji} ${title}`, body: notice.body, tab: 'today', tag: 'reminder' },
          });
          sent++;
        }
      }
      // Advance to the next future occurrence.
      while (at <= now) {
        at += DAY_MS;
        if (day) day = addDays(day, 1);
      }
      await ctx.db.patch(s._id, { nextReminderAt: at, nextReminderDay: day });
    }
    return sent;
  },
});
