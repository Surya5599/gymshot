import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { angle } from './schema';
import { announce } from './lib/announce';
import { AppError, displayName, requireDay, requireUser, squadMates, viewer } from './lib/access';
import { checkEpoch, signPhotoUrl } from './lib/photoUrl';

export const ANGLE_ORDER = { front: 0, side: 1, back: 2 } as const;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** One check-in per person per day: find it, or make it. */
async function checkinFor(ctx: MutationCtx, userId: Id<'users'>, day: string): Promise<Doc<'checkins'>> {
  const existing = await ctx.db
    .query('checkins')
    .withIndex('by_user_day', (q) => q.eq('userId', userId).eq('day', day))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert('checkins', { userId, day, trained: false, posted: false });
  return (await ctx.db.get(id))!;
}

/** Every day I posted, newest first - for the streak and the month grid. */
export const loggedDays = query({
  args: {},
  handler: async (ctx) => {
    const user = await viewer(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query('checkins')
      .withIndex('by_user_day', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect();
    return rows.filter((c) => c.posted).map((c) => c.day);
  },
});

/** My check-in for a day, with photo links. */
export const mine = query({
  args: { day: v.string(), epoch: v.number() },
  handler: async (ctx, { day, epoch }) => {
    const user = await viewer(ctx);
    if (!user) return null;
    checkEpoch(epoch);
    const checkin = await ctx.db
      .query('checkins')
      .withIndex('by_user_day', (q) => q.eq('userId', user._id).eq('day', requireDay(day)))
      .unique();
    if (!checkin) return null;
    const photos = await ctx.db.query('photos').withIndex('by_checkin', (q) => q.eq('checkinId', checkin._id)).collect();
    return {
      checkin: { id: checkin._id, day: checkin.day, trained: checkin.trained, note: checkin.note ?? null },
      photos: await Promise.all(
        photos.map(async (p) => ({ angle: p.angle, url: await signPhotoUrl(p.storageId, epoch), version: p._creationTime }))
      ),
    };
  },
});

export const setTrained = mutation({
  args: { day: v.string(), trained: v.boolean() },
  handler: async (ctx, { day, trained }) => {
    const user = await requireUser(ctx);
    const c = await checkinFor(ctx, user._id, requireDay(day));
    await ctx.db.patch(c._id, { trained });
  },
});

export const setNote = mutation({
  args: { day: v.string(), note: v.union(v.string(), v.null()) },
  handler: async (ctx, { day, note }) => {
    const user = await requireUser(ctx);
    const text = note?.trim() ?? '';
    if (text.length > 200) throw new AppError('Notes are 200 characters at most.');
    const c = await checkinFor(ctx, user._id, requireDay(day));
    await ctx.db.patch(c._id, { note: text || undefined });
  },
});

/** Step one of an upload: a short-lived URL the browser POSTs the JPEG to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Step two: attach the uploaded file to today's check-in at an angle. A
 * retake replaces the old file. The first photo of a day is the post: it
 * marks the day posted and tells everyone who shares a squad.
 */
export const savePhoto = mutation({
  args: { day: v.string(), angle, storageId: v.id('_storage'), width: v.number(), height: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) throw new AppError('That upload did not arrive. Try again.');
    // contentType comes from the upload's header and may be absent; a
    // present, non-image type is refused.
    if (meta.size > MAX_PHOTO_BYTES || (meta.contentType !== undefined && !meta.contentType.startsWith('image/'))) {
      await ctx.storage.delete(args.storageId);
      throw new AppError('Photos must be images under 8 MB.');
    }

    const checkin = await checkinFor(ctx, user._id, requireDay(args.day));
    const existing = await ctx.db
      .query('photos')
      .withIndex('by_checkin_angle', (q) => q.eq('checkinId', checkin._id).eq('angle', args.angle))
      .unique();
    const fields = { storageId: args.storageId, width: args.width, height: args.height };
    if (existing) {
      if (existing.storageId !== args.storageId) await ctx.storage.delete(existing.storageId);
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert('photos', { checkinId: checkin._id, userId: user._id, day: checkin.day, angle: args.angle, ...fields });
    }

    if (!checkin.posted) {
      await ctx.db.patch(checkin._id, { posted: true });
      await announce(ctx, await squadMates(ctx, user._id), {
        kind: 'post',
        title: `${displayName(user)} just checked in`,
        body: 'Their photos are in the squad thread.',
        tab: 'pods',
        key: `post:${checkin._id}`,
      });
    }
  },
});

/** My whole history at one angle, oldest first. Only ever mine: nobody in a
 *  squad can scroll anyone's past. */
export const timeline = query({
  args: { angle, epoch: v.number() },
  handler: async (ctx, { angle: a, epoch }) => {
    const user = await viewer(ctx);
    if (!user) return [];
    checkEpoch(epoch);
    const rows = await ctx.db
      .query('photos')
      .withIndex('by_user_angle_day', (q) => q.eq('userId', user._id).eq('angle', a))
      .collect();
    return await Promise.all(rows.map(async (p) => ({ day: p.day, url: await signPhotoUrl(p.storageId, epoch) })));
  },
});
