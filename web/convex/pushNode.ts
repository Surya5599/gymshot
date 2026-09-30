'use node';

import { v } from 'convex/values';
import webpush from 'web-push';

import { internal } from './_generated/api';
import { internalAction } from './_generated/server';

/**
 * Sends one web push to a set of browsers. Node runtime, because the
 * web-push library needs Node's crypto. Endpoints the push service reports
 * as gone are removed. Without VAPID keys configured this is a no-op, so
 * the app works (in-app notifications only) before push is set up.
 */
export const send = internalAction({
  args: {
    userIds: v.optional(v.array(v.id('users'))),
    subscriptionIds: v.optional(v.array(v.id('pushSubscriptions'))),
    payload: v.object({ title: v.string(), body: v.optional(v.string()), tab: v.string(), tag: v.string() }),
  },
  handler: async (ctx, { userIds, subscriptionIds, payload }) => {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!pub || !priv || !subject) return 0;
    webpush.setVapidDetails(subject, pub, priv);

    const subs = await ctx.runQuery(internal.push.subscriptionsFor, { userIds, subscriptionIds });
    const body = JSON.stringify(payload);
    let delivered = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: payload.tag === 'reminder' ? 2 * 3600 : 6 * 3600,
            urgency: payload.tag.startsWith('nudge') ? 'high' : 'normal',
          });
          delivered++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await ctx.runMutation(internal.push.removeSubscription, { id: s.id });
          else console.error('push failed', status, (e as Error).message);
        }
      })
    );
    return delivered;
  },
});
