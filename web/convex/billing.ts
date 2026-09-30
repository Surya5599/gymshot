import { v } from 'convex/values';

import { internalMutation } from './_generated/server';

/**
 * Pro entitlement, written only here, from the RevenueCat webhook (http.ts).
 * The client never writes proUntil.
 */
export const applyRevenueCatEvent = internalMutation({
  args: { appUserId: v.string(), type: v.string(), expirationAtMs: v.optional(v.number()) },
  handler: async (ctx, { appUserId, type, expirationAtMs }) => {
    const userId = ctx.db.normalizeId('users', appUserId);
    if (!userId || !(await ctx.db.get(userId))) return 'unknown user';

    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION':
      case 'NON_RENEWING_PURCHASE':
      case 'SUBSCRIPTION_EXTENDED':
      // A cancellation keeps Pro until the paid period ends.
      case 'CANCELLATION':
        if (expirationAtMs) await ctx.db.patch(userId, { proUntil: expirationAtMs });
        return 'ok';
      case 'EXPIRATION':
        await ctx.db.patch(userId, { proUntil: Math.min(expirationAtMs ?? Date.now(), Date.now()) });
        return 'ok';
      default:
        return 'ignored';
    }
  },
});
