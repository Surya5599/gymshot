import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { ANGLE_ORDER } from './checkins';
import { announce } from './lib/announce';
import { AppError, displayName, isMember, memberIds, requireDay, requireMember, requireUser, sharesSquad, viewer } from './lib/access';
import { currentStreak } from './lib/days';
import { checkEpoch, signPhotoUrl } from './lib/photoUrl';

export const REACTIONS = ['\u{1F525}', '\u{1F44F}', '\u{1F4AA}', '\u{1F440}', '\u{1F60D}'];

/**
 * A squad's thread for one day - live, like everything in Convex: who
 * posted (photos, note, reactions), who has not, the roster with each
 * member's streak count (never their history), and whom I already nudged.
 */
export const thread = query({
  args: { podId: v.id('pods'), day: v.string(), epoch: v.number() },
  handler: async (ctx, { podId, day, epoch }) => {
    const me = await viewer(ctx);
    if (!me) return null;
    // Left or removed while the thread was open: nothing to show. Anyone
    // else asking about a squad they are not in gets the same refusal.
    if (!(await isMember(ctx, podId, me._id))) {
      if (await ctx.db.get(podId)) throw new AppError('You are not in that squad.');
      return null;
    }
    const pod = (await ctx.db.get(podId))!;
    requireDay(day);
    checkEpoch(epoch);

    const members = [];
    for (const id of await memberIds(ctx, podId)) {
      const u = await ctx.db.get(id);
      if (!u) continue;
      members.push({
        id: u._id,
        displayName: displayName(u),
        blurFace: u.blurFace ?? false,
        shareTrained: u.shareTrained ?? true,
        streak: await currentStreak(ctx, u._id, day),
      });
    }

    const entries = [];
    const waiting = [];
    for (const m of members) {
      const c = await ctx.db
        .query('checkins')
        .withIndex('by_user_day', (q) => q.eq('userId', m.id).eq('day', day))
        .unique();
      if (!c || !c.posted) {
        waiting.push(m);
        continue;
      }
      const photos = (await ctx.db.query('photos').withIndex('by_checkin', (q) => q.eq('checkinId', c._id)).collect()).sort(
        (a, b) => ANGLE_ORDER[a.angle] - ANGLE_ORDER[b.angle]
      );
      const reactions = await ctx.db.query('reactions').withIndex('by_checkin', (q) => q.eq('checkinId', c._id)).collect();
      const showTrained = m.shareTrained;
      entries.push({
        checkinId: c._id,
        postedAt: Math.min(...photos.map((p) => p._creationTime)),
        author: m,
        trained: showTrained ? c.trained : false,
        note: showTrained ? (c.note ?? null) : null,
        photos: await Promise.all(
          photos.map(async (p) => ({ id: p._id, angle: p.angle, url: await signPhotoUrl(p.storageId, epoch) }))
        ),
        reactions: reactions.map((r) => ({ userId: r.userId, emoji: r.emoji })),
      });
    }
    entries.sort((a, b) => a.postedAt - b.postedAt);

    const sent = await ctx.db
      .query('nudges')
      .withIndex('by_from_pod_day', (q) => q.eq('fromUser', me._id).eq('podId', podId).eq('day', day))
      .collect();

    return {
      pod: { id: pod._id, name: pod.name, emoji: pod.emoji, inviteCode: pod.inviteCode, createdBy: pod.createdBy },
      members,
      entries,
      waiting,
      nudged: sent.map((n) => n.toUser),
    };
  },
});

/** One reaction per person per check-in; the same emoji again removes it. */
export const toggleReaction = mutation({
  args: { checkinId: v.id('checkins'), emoji: v.string() },
  handler: async (ctx, { checkinId, emoji }) => {
    const me = await requireUser(ctx);
    if (!REACTIONS.includes(emoji)) throw new AppError('Not a reaction.');
    const checkin = await ctx.db.get(checkinId);
    if (!checkin || !checkin.posted || !(await sharesSquad(ctx, me._id, checkin.userId))) {
      throw new AppError('That check-in is not in your squads.');
    }
    if (checkin.userId === me._id) throw new AppError('React to your squad, not yourself.');

    const existing = await ctx.db
      .query('reactions')
      .withIndex('by_checkin_user', (q) => q.eq('checkinId', checkinId).eq('userId', me._id))
      .unique();
    if (existing?.emoji === emoji) {
      await ctx.db.delete(existing._id);
      return;
    }
    if (existing) await ctx.db.patch(existing._id, { emoji });
    else await ctx.db.insert('reactions', { checkinId, userId: me._id, emoji });
    await announce(ctx, [checkin.userId], {
      kind: 'reaction',
      emoji,
      title: `${displayName(me)} reacted to your check-in`,
      tab: 'pods',
      key: `react:${checkinId}:${me._id}:${emoji}`,
    });
  },
});

/** Poke a squad-mate to post. Once per person per squad per day. */
export const nudge = mutation({
  args: { podId: v.id('pods'), toUser: v.id('users'), day: v.string() },
  handler: async (ctx, { podId, toUser, day }) => {
    const me = await requireUser(ctx);
    await requireMember(ctx, podId, me._id);
    await requireMember(ctx, podId, toUser);
    requireDay(day);
    if (toUser === me._id) throw new AppError('You cannot nudge yourself.');
    const posted = await ctx.db
      .query('checkins')
      .withIndex('by_user_day', (q) => q.eq('userId', toUser).eq('day', day))
      .unique();
    if (posted?.posted) return;
    const already = await ctx.db
      .query('nudges')
      .withIndex('by_from_pod_day', (q) => q.eq('fromUser', me._id).eq('podId', podId).eq('day', day))
      .collect();
    if (already.some((n) => n.toUser === toUser)) return;
    await ctx.db.insert('nudges', { podId, fromUser: me._id, toUser, day });
    await announce(ctx, [toUser], {
      kind: 'nudge',
      title: `${displayName(me)} nudged you`,
      body: "Where's today's photo? Your squad is waiting.",
      tab: 'today',
      key: `nudge:${me._id}:${day}`,
    });
  },
});

/** Who nudged me on a day, names resolved. */
export const nudgesForMe = query({
  args: { day: v.string() },
  handler: async (ctx, { day }) => {
    const me = await viewer(ctx);
    if (!me) return [];
    const rows = await ctx.db
      .query('nudges')
      .withIndex('by_to_day', (q) => q.eq('toUser', me._id).eq('day', requireDay(day)))
      .collect();
    const names = new Map<string, string>();
    for (const n of rows) if (!names.has(n.fromUser)) names.set(n.fromUser, displayName(await ctx.db.get(n.fromUser)));
    return [...names.values()];
  },
});
