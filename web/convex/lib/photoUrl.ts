import type { Id } from '../_generated/dataModel';

/**
 * Private photo links. Convex file URLs never expire, which is wrong for
 * body photos, so photos are served by the /photo HTTP route instead, behind
 * an HMAC-signed link that expires.
 *
 * Queries must be deterministic to cache well, so the expiry comes from an
 * `epoch` argument the client sends (a 12-hour bucket of its clock) rather
 * than from Date.now(): a link minted for epoch E stays valid until the end
 * of epoch E+1, i.e. 12 to 24 hours. The client moves to the next epoch on
 * a timer, which re-runs the query and mints fresh links.
 */

export const EPOCH_MS = 12 * 60 * 60 * 1000;

export function currentEpoch(now = Date.now()): number {
  return Math.floor(now / EPOCH_MS);
}

/** Refuses epochs far from the server's clock, so a client cannot mint
 *  long-lived links by asking for one in the future. */
export function checkEpoch(epoch: number): number {
  const now = currentEpoch();
  if (!Number.isInteger(epoch) || epoch < now - 1 || epoch > now + 1) throw new Error('Stale clock. Refresh the page.');
  return epoch;
}

function secret(): string {
  const s = process.env.PHOTO_URL_SECRET;
  if (!s) throw new Error('PHOTO_URL_SECRET is not set on this deployment.');
  return s;
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signPhotoUrl(storageId: Id<'_storage'>, epoch: number): Promise<string> {
  const exp = (epoch + 2) * EPOCH_MS;
  const sig = await hmac(`${storageId}.${exp}`);
  const base = process.env.CONVEX_SITE_URL ?? '';
  return `${base}/photo?id=${encodeURIComponent(storageId)}&e=${exp}&s=${sig}`;
}

/** Constant-time comparison of a presented signature. */
export async function verifyPhotoUrl(id: string, exp: number, sig: string, now = Date.now()): Promise<boolean> {
  if (!Number.isFinite(exp) || exp < now) return false;
  const want = await hmac(`${id}.${exp}`);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
