import { api } from '../../convex/_generated/api';
import { convex } from './convex';
import { toDayKey } from './date';
import { getPrefs, setPrefs } from './prefs';

/**
 * Web push: notifications that arrive with the app closed. Each opted-in
 * browser registers one subscription with Convex (convex/push.ts); the
 * server pushes to it when a squad-mate posts, reacts, or nudges, and at
 * the device's daily reminder time.
 *
 * The VAPID public key is read from the deployment (VAPID_PUBLIC_KEY in the
 * Convex environment), so turning push on is purely server config.
 */

let vapidKey: string | null | undefined;

async function publicKey(): Promise<string | null> {
  if (vapidKey === undefined) vapidKey = await convex.query(api.push.publicKey, {}).catch(() => null);
  return vapidKey;
}

function platformSupportsPush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** True when this browser can do push and the deployment has keys. */
export async function pushAvailable(): Promise<boolean> {
  return platformSupportsPush() && !!(await publicKey());
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The next local reminder moment and the local day it belongs to. */
export function nextReminder(reminderAt: string, now = new Date()): { at: number; day: string } {
  const [h, m] = reminderAt.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return { at: d.getTime(), day: toDayKey(d) };
}

/** Subscribe this browser and register it. Idempotent: also how the reminder
 *  time and a rotated endpoint reach the server. Needs permission granted. */
export async function enablePush(): Promise<boolean> {
  const key = await publicKey();
  if (!key || !platformSupportsPush() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;

  const prefs = getPrefs();
  const next = nextReminder(prefs.reminderAt);
  await convex.mutation(api.push.subscribe, {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    reminderOn: prefs.reminder,
    nextReminderAt: prefs.reminder ? next.at : undefined,
    nextReminderDay: prefs.reminder ? next.day : undefined,
  });
  setPrefs({ push: true });
  return true;
}

/** Stop pushes to this browser. */
export async function disablePush(): Promise<void> {
  setPrefs({ push: false });
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await convex.mutation(api.push.unsubscribe, { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Before sign-out, while the session can still delete the registration. */
export async function forgetPushOnSignOut(): Promise<void> {
  await disablePush().catch(() => {});
}
