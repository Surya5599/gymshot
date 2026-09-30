import { getAuthUserId } from '@convex-dev/auth/server';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/**
 * Authorization, in one place. Convex has no row-level security: every
 * query and mutation calls one of these before it reads or writes anything
 * that is not plainly the caller's own.
 */

export const POD_CAP = 8;
export const FREE_POD_LIMIT = 1;

type Ctx = QueryCtx | MutationCtx;

export class AppError extends Error {}

export async function requireUser(ctx: Ctx): Promise<Doc<'users'>> {
  const id = await getAuthUserId(ctx);
  const user = id ? await ctx.db.get(id) : null;
  if (!user) throw new AppError('Not signed in.');
  return user;
}

/** For queries: the signed-in user, or null. Read queries return empty
 *  results rather than throwing for a signed-out viewer, because a screen can
 *  still be subscribed for a moment after sign-out or account deletion, and
 *  a thrown query error would crash it. Mutations use requireUser. */
export async function viewer(ctx: Ctx): Promise<Doc<'users'> | null> {
  const id = await getAuthUserId(ctx);
  return id ? await ctx.db.get(id) : null;
}

export async function optionalUserId(ctx: Ctx): Promise<Id<'users'> | null> {
  return await getAuthUserId(ctx);
}

export function isPro(user: Doc<'users'>, now = Date.now()): boolean {
  return (user.proUntil ?? 0) > now;
}

export async function podIdsOf(ctx: Ctx, userId: Id<'users'>): Promise<Id<'pods'>[]> {
  const rows = await ctx.db
    .query('podMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  return rows.map((r) => r.podId);
}

export async function isMember(ctx: Ctx, podId: Id<'pods'>, userId: Id<'users'>): Promise<boolean> {
  const row = await ctx.db
    .query('podMembers')
    .withIndex('by_pod_user', (q) => q.eq('podId', podId).eq('userId', userId))
    .unique();
  return row !== null;
}

export async function requireMember(ctx: Ctx, podId: Id<'pods'>, userId: Id<'users'>): Promise<Doc<'pods'>> {
  const pod = await ctx.db.get(podId);
  if (!pod || !(await isMember(ctx, podId, userId))) throw new AppError('You are not in that squad.');
  return pod;
}

export async function memberIds(ctx: Ctx, podId: Id<'pods'>): Promise<Id<'users'>[]> {
  const rows = await ctx.db
    .query('podMembers')
    .withIndex('by_pod', (q) => q.eq('podId', podId))
    .collect();
  return rows.map((r) => r.userId);
}

/** Everyone who shares at least one squad with the user, minus the user. */
export async function squadMates(ctx: Ctx, userId: Id<'users'>): Promise<Id<'users'>[]> {
  const out = new Set<Id<'users'>>();
  for (const podId of await podIdsOf(ctx, userId)) {
    for (const id of await memberIds(ctx, podId)) if (id !== userId) out.add(id);
  }
  return [...out];
}

export async function sharesSquad(ctx: Ctx, a: Id<'users'>, b: Id<'users'>): Promise<boolean> {
  if (a === b) return true;
  const mine = new Set(await podIdsOf(ctx, a));
  for (const podId of await podIdsOf(ctx, b)) if (mine.has(podId)) return true;
  return false;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function requireDay(day: string): string {
  if (!DAY.test(day)) throw new AppError('Bad day.');
  return day;
}

export function displayName(user: Doc<'users'> | null): string {
  return user?.displayName?.trim() || 'A squad-mate';
}
