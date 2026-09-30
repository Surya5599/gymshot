import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export type Tab = 'today' | 'pods' | 'journey' | 'you';
export type Kind = 'post' | 'reaction' | 'nudge' | 'reminder' | 'join' | 'info';

export type Announcement = {
  kind: Kind;
  title: string;
  body?: string;
  emoji?: string;
  tab: Tab;
  /** One notice per key per user; a repeat is dropped. */
  key: string;
};

const INBOX_KEEP = 50;

/**
 * The one way the server tells someone something: a row in their inbox
 * (which every device of theirs sees live) and a web push to their
 * browsers, scheduled so the push service never slows this transaction.
 * Returns who was newly told.
 */
export async function announce(ctx: MutationCtx, userIds: Id<'users'>[], n: Announcement): Promise<Id<'users'>[]> {
  const told: Id<'users'>[] = [];
  for (const userId of new Set(userIds)) {
    const dup = await ctx.db
      .query('notifications')
      .withIndex('by_user_key', (q) => q.eq('userId', userId).eq('key', n.key))
      .unique();
    if (dup) continue;
    await ctx.db.insert('notifications', { userId, ...n, read: false });
    told.push(userId);

    // Keep the inbox short; it is "what happened lately", not an archive.
    const old = await ctx.db
      .query('notifications')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .take(INBOX_KEEP + 20);
    for (const row of old.slice(INBOX_KEEP)) await ctx.db.delete(row._id);
  }
  if (told.length > 0) {
    await ctx.scheduler.runAfter(0, internal.pushNode.send, {
      userIds: told,
      payload: { title: n.emoji ? `${n.emoji} ${n.title}` : n.title, body: n.body, tab: n.tab, tag: n.key },
    });
  }
  return told;
}
