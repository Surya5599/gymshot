import { getPrefs, setPrefs } from './prefs';
import { supabase } from './supabase';

/**
 * Web push: notifications that arrive with the app closed. Each opted-in
 * browser registers one push subscription; the push-dispatch edge function
 * sends to it when a squad-mate posts, reacts, or nudges, and at the daily
 * reminder time.
 *
 * Paste the VAPID *public* key here to switch it on (see supabase/README.md).
 * The private key belongs only in the edge function's secrets - never here,
 * this file ships in the public bundle.
 */
const VAPID_PUBLIC_KEY = '';

export function pushConfigured(): boolean {
  return VAPID_PUBLIC_KEY.length > 0;
}

export function pushSupported(): boolean {
  return (
    pushConfigured() &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceFields() {
  const p = getPrefs();
  return {
    reminder_on: p.reminder,
    reminder_at: p.reminderAt,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}

/** Subscribe this browser and store the subscription for the dispatcher.
 *  Idempotent: also how the reminder time, time zone, and a rotated
 *  endpoint reach the server. Needs notification permission granted. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      ...deviceFields(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
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
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => {});
}

/** On sign-out the device must stop receiving that account's pushes. */
export async function forgetPushOnSignOut(): Promise<void> {
  await disablePush().catch(() => {});
}
