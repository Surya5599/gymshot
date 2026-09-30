import { mutation, query } from './_generated/server';
import { requireUser, viewer } from './lib/access';

/** The activity inbox, newest first. Live on every device. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return [];
    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_user', (q) => q.eq('userId', me._id))
      .order('desc')
      .take(50);
    return rows.map((n) => ({
      id: n._id,
      at: n._creationTime,
      kind: n.kind,
      title: n.title,
      body: n.body,
      emoji: n.emoji,
      tab: n.tab,
      read: n.read,
    }));
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query('notifications').withIndex('by_user', (q) => q.eq('userId', me._id)).collect();
    for (const n of rows) if (!n.read) await ctx.db.patch(n._id, { read: true });
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query('notifications').withIndex('by_user', (q) => q.eq('userId', me._id)).collect();
    for (const n of rows) await ctx.db.delete(n._id);
  },
});
