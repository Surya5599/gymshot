import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { announce } from './lib/announce';
import {
  AppError,
  viewer,
  displayName,
  FREE_POD_LIMIT,
  isPro,
  memberIds,
  podIdsOf,
  POD_CAP,
  requireMember,
  requireUser,
} from './lib/access';
import { deletePod } from './users';

// No 0/O or 1/I/L: codes get read aloud and typed from screenshots.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

async function newInviteCode(ctx: MutationCtx): Promise<string> {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    const taken = await ctx.db.query('pods').withIndex('by_code', (q) => q.eq('inviteCode', code)).unique();
    if (!taken) return code;
  }
}

async function requireRoomFor(ctx: MutationCtx, user: Doc<'users'>): Promise<void> {
  if (isPro(user)) return;
  if ((await podIdsOf(ctx, user._id)).length >= FREE_POD_LIMIT) {
    throw new AppError('Free accounts get one squad. More squads come with Pro.');
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await viewer(ctx);
    if (!user) return [];
    const out = [];
    for (const podId of await podIdsOf(ctx, user._id)) {
      const pod = await ctx.db.get(podId);
      if (!pod) continue;
      out.push({ ...pod, memberCount: (await memberIds(ctx, podId)).length });
    }
    return out.sort((a, b) => a._creationTime - b._creationTime);
  },
});

export const create = mutation({
  args: { name: v.string(), emoji: v.string() },
  handler: async (ctx, { name, emoji }) => {
    const user = await requireUser(ctx);
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 24) throw new AppError('Squad names are 2 to 24 characters.');
    if (emoji.length === 0 || emoji.length > 16) throw new AppError('Pick an emoji.');
    await requireRoomFor(ctx, user);
    const podId = await ctx.db.insert('pods', {
      name: trimmed,
      emoji,
      inviteCode: await newInviteCode(ctx),
      createdBy: user._id,
    });
    await ctx.db.insert('podMembers', { podId, userId: user._id });
    return podId;
  },
});

/** Asks to join; membership only happens once the squad owner approves. */
export const requestJoin = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const user = await requireUser(ctx);
    const pod = await ctx.db
      .query('pods')
      .withIndex('by_code', (q) => q.eq('inviteCode', code.trim().toUpperCase()))
      .unique();
    if (!pod) throw new AppError('No squad with that code.');
    const members = await memberIds(ctx, pod._id);
    if (members.includes(user._id)) throw new AppError(`You are already in ${pod.name}.`);
    if (members.length >= POD_CAP) throw new AppError(`${pod.name} is full - squads cap at ${POD_CAP}.`);
    await requireRoomFor(ctx, user);
    const existing = await ctx.db
      .query('joinRequests')
      .withIndex('by_pod_user', (q) => q.eq('podId', pod._id).eq('userId', user._id))
      .unique();
    if (!existing) {
      await ctx.db.insert('joinRequests', { podId: pod._id, userId: user._id });
      await announce(ctx, [pod.createdBy], {
        kind: 'join',
        title: `${displayName(user)} wants to join ${pod.emoji} ${pod.name}`,
        body: 'Approve or decline in Squads.',
        tab: 'pods',
        key: `join:${pod._id}:${user._id}`,
      });
    }
    return { name: pod.name, emoji: pod.emoji };
  },
});

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await viewer(ctx);
    if (!user) return [];
    const rows = await ctx.db.query('joinRequests').withIndex('by_user', (q) => q.eq('userId', user._id)).collect();
    const out = [];
    for (const r of rows) {
      const pod = await ctx.db.get(r.podId);
      if (pod) out.push({ podId: pod._id, name: pod.name, emoji: pod.emoji });
    }
    return out;
  },
});

/** Requests waiting on me, across every squad I own. */
export const incomingRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await viewer(ctx);
    if (!user) return [];
    const out = [];
    for (const podId of await podIdsOf(ctx, user._id)) {
      const pod = await ctx.db.get(podId);
      if (!pod || pod.createdBy !== user._id) continue;
      for (const r of await ctx.db.query('joinRequests').withIndex('by_pod', (q) => q.eq('podId', podId)).collect()) {
        const who = await ctx.db.get(r.userId);
        out.push({ podId, podName: pod.name, podEmoji: pod.emoji, userId: r.userId, displayName: displayName(who) });
      }
    }
    return out;
  },
});

async function ownedRequest(ctx: MutationCtx, podId: Id<'pods'>, userId: Id<'users'>) {
  const owner = await requireUser(ctx);
  const pod = await ctx.db.get(podId);
  if (!pod || pod.createdBy !== owner._id) throw new AppError('Only the squad owner can do that.');
  const request = await ctx.db
    .query('joinRequests')
    .withIndex('by_pod_user', (q) => q.eq('podId', podId).eq('userId', userId))
    .unique();
  if (!request) throw new AppError('That request is gone.');
  return { pod, request };
}

export const approve = mutation({
  args: { podId: v.id('pods'), userId: v.id('users') },
  handler: async (ctx, { podId, userId }) => {
    const { pod, request } = await ownedRequest(ctx, podId, userId);
    const members = await memberIds(ctx, podId);
    if (members.length >= POD_CAP) throw new AppError(`${pod.name} is full - squads cap at ${POD_CAP}.`);
    const joiner = await ctx.db.get(userId);
    if (!joiner) throw new AppError('That account is gone.');
    // Checked again here: the free limit may have been reached since asking.
    if (!isPro(joiner) && (await podIdsOf(ctx, userId)).length >= FREE_POD_LIMIT) {
      throw new AppError(`${displayName(joiner)} is already in a squad on the free plan.`);
    }
    await ctx.db.delete(request._id);
    if (!members.includes(userId)) await ctx.db.insert('podMembers', { podId, userId });
    await announce(ctx, [userId], {
      kind: 'join',
      title: `You're in ${pod.emoji} ${pod.name}`,
      body: "Your request was approved. Say hi with today's photo.",
      tab: 'pods',
      key: `joined:${podId}`,
    });
  },
});

export const decline = mutation({
  args: { podId: v.id('pods'), userId: v.id('users') },
  handler: async (ctx, { podId, userId }) => {
    const { request } = await ownedRequest(ctx, podId, userId);
    await ctx.db.delete(request._id);
  },
});

export const cancelRequest = mutation({
  args: { podId: v.id('pods') },
  handler: async (ctx, { podId }) => {
    const user = await requireUser(ctx);
    const request = await ctx.db
      .query('joinRequests')
      .withIndex('by_pod_user', (q) => q.eq('podId', podId).eq('userId', user._id))
      .unique();
    if (request) await ctx.db.delete(request._id);
  },
});

/** Leaving keeps your check-ins yours; the squad just stops seeing them. An
 *  owner who leaves hands the squad to its longest-standing member, and the
 *  last one out closes it. */
export const leave = mutation({
  args: { podId: v.id('pods') },
  handler: async (ctx, { podId }) => {
    const user = await requireUser(ctx);
    const pod = await requireMember(ctx, podId, user._id);
    const row = await ctx.db
      .query('podMembers')
      .withIndex('by_pod_user', (q) => q.eq('podId', podId).eq('userId', user._id))
      .unique();
    if (row) await ctx.db.delete(row._id);
    const rest = await ctx.db.query('podMembers').withIndex('by_pod', (q) => q.eq('podId', podId)).collect();
    if (rest.length === 0) {
      await deletePod(ctx, podId);
    } else if (pod.createdBy === user._id) {
      const heir = rest.sort((a, b) => a._creationTime - b._creationTime)[0];
      await ctx.db.patch(podId, { createdBy: heir.userId });
    }
  },
});
