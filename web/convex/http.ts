import { httpRouter } from 'convex/server';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { httpAction } from './_generated/server';
import { auth } from './auth';
import { verifyPhotoUrl } from './lib/photoUrl';

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * Private photos. Links are minted by queries that already checked the
 * viewer may see the photo (lib/photoUrl.ts); this route only checks the
 * signature and expiry. CORS is open so the Journey exports can draw the
 * image onto a canvas.
 */
http.route({
  path: '/photo',
  method: 'GET',
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') ?? '';
    const exp = Number(url.searchParams.get('e'));
    const sig = url.searchParams.get('s') ?? '';
    if (!(await verifyPhotoUrl(id, exp, sig))) return new Response('This link has expired.', { status: 403 });
    let blob: Blob | null = null;
    try {
      blob = await ctx.storage.get(id as Id<'_storage'>);
    } catch {
      blob = null;
    }
    if (!blob) return new Response('Not found', { status: 404 });
    const maxAge = Math.max(0, Math.floor((exp - Date.now()) / 1000));
    return new Response(blob, {
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
        'Cache-Control': `private, max-age=${maxAge}, immutable`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  }),
});

/**
 * RevenueCat webhook. Set its Authorization header in RevenueCat to
 * "Bearer <REVENUECAT_WEBHOOK_AUTH>". app_user_id is the Convex user id,
 * which is what the clients configure Purchases with.
 */
http.route({
  path: '/revenuecat',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
      return new Response('forbidden', { status: 403 });
    }
    const body = (await req.json()) as { event?: { type?: string; app_user_id?: string; expiration_at_ms?: number | null } };
    const e = body.event;
    if (!e?.type || !e.app_user_id) return new Response('ignored', { status: 200 });
    const result = await ctx.runMutation(internal.billing.applyRevenueCatEvent, {
      appUserId: e.app_user_id,
      type: e.type,
      expirationAtMs: e.expiration_at_ms ?? undefined,
    });
    return new Response(result, { status: 200 });
  }),
});

export default http;
