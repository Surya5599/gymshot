import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { AppError, optionalUserId, requireUser } from './lib/access';

export const me = query({
  args: {},
  handler: async (ctx) => {
    const id = await optionalUserId(ctx);
    const user = id ? await ctx.db.get(id) : null;
    if (!user) return null;
    return {
      id: user._id,
      email: user.email ?? null,
      displayName: user.displayName ?? '',
      shareTrained: user.shareTrained ?? true,
      blurFace: user.blurFace ?? false,
      proUntil: user.proUntil ?? null,
    };
  },
});

export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    shareTrained: v.optional(v.boolean()),
    blurFace: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const patch: { displayName?: string; shareTrained?: boolean; blurFace?: boolean } = {};
    if (args.displayName !== undefined) {
      const name = args.displayName.trim();
      if (name.length < 2 || name.length > 28) throw new AppError('Names are 2 to 28 characters.');
      patch.displayName = name;
    }
    if (args.shareTrained !== undefined) patch.shareTrained = args.shareTrained;
    if (args.blurFace !== undefined) patch.blurFace = args.blurFace;
    await ctx.db.patch(user._id, patch);
  },
});

/**
 * Permanently deletes the account: every photo and check-in, reactions and
 * nudges both ways, squads the user owns (with their members and requests),
 * memberships, devices, inbox, and the sign-in records themselves.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await deleteUserData(ctx, user._id);
  },
});

export async function deleteUserData(ctx: MutationCtx, userId: Id<'users'>): Promise<void> {
  const db = ctx.db;

  for (const c of await db.query('checkins').withIndex('by_user_day', (q) => q.eq('userId', userId)).collect()) {
    for (const p of await db.query('photos').withIndex('by_checkin', (q) => q.eq('checkinId', c._id)).collect()) {
      await ctx.storage.delete(p.storageId);
      await db.delete(p._id);
    }
    for (const r of await db.query('reactions').withIndex('by_checkin', (q) => q.eq('checkinId', c._id)).collect()) {
      await db.delete(r._id);
    }
    await db.delete(c._id);
  }
  for (const r of await db.query('reactions').withIndex('by_user', (q) => q.eq('userId', userId)).collect()) {
    await db.delete(r._id);
  }

  // Squads the user created go with them; the rest just lose a member.
  for (const m of await db.query('podMembers').withIndex('by_user', (q) => q.eq('userId', userId)).collect()) {
    const pod = await db.get(m.podId);
    if (pod && pod.createdBy === userId) await deletePod(ctx, pod._id);
    else await db.delete(m._id);
  }
  for (const r of await db.query('joinRequests').withIndex('by_user', (q) => q.eq('userId', userId)).collect()) {
    await db.delete(r._id);
  }
  // Nudges sent: by_from_pod_day is prefixed by fromUser.
  for (const n of await db.query('nudges').withIndex('by_from_pod_day', (q) => q.eq('fromUser', userId)).collect()) {
    await db.delete(n._id);
  }
  for (const n of await db.query('nudges').withIndex('by_to_day', (q) => q.eq('toUser', userId)).collect()) {
    await db.delete(n._id);
  }
  for (const n of await db.query('notifications').withIndex('by_user', (q) => q.eq('userId', userId)).collect()) {
    await db.delete(n._id);
  }
  for (const s of await db.query('pushSubscriptions').withIndex('by_user', (q) => q.eq('userId', userId)).collect()) {
    await db.delete(s._id);
  }

  // Sign-in records.
  for (const s of await db.query('authSessions').withIndex('userId', (q) => q.eq('userId', userId)).collect()) {
    for (const t of await db.query('authRefreshTokens').withIndex('sessionId', (q) => q.eq('sessionId', s._id)).collect()) {
      await db.delete(t._id);
    }
    await db.delete(s._id);
  }
  for (const a of await db.query('authAccounts').withIndex('userIdAndProvider', (q) => q.eq('userId', userId)).collect()) {
    for (const code of await db.query('authVerificationCodes').withIndex('accountId', (q) => q.eq('accountId', a._id)).collect()) {
      await db.delete(code._id);
    }
    await db.delete(a._id);
  }
  await db.delete(userId);
}

export async function deletePod(ctx: MutationCtx, podId: Id<'pods'>): Promise<void> {
  const db = ctx.db;
  for (const m of await db.query('podMembers').withIndex('by_pod', (q) => q.eq('podId', podId)).collect()) await db.delete(m._id);
  for (const r of await db.query('joinRequests').withIndex('by_pod', (q) => q.eq('podId', podId)).collect()) await db.delete(r._id);
  for (const n of await db.query('nudges').withIndex('by_pod', (q) => q.eq('podId', podId)).collect()) await db.delete(n._id);
  await db.delete(podId);
}
