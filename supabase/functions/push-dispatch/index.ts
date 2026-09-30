// push-dispatch: turns squad activity into web push notifications.
//
// Called two ways, both authenticated by the x-push-secret header:
//   - by database triggers (see migrations/*_web_push.sql) with
//     { type: 'INSERT' | 'UPDATE', table, record } for a changed row;
//   - by pg_cron every 15 minutes with { type: 'REMINDER' }.
//
// It resolves who should hear about the change, dedupes through push_sent,
// and sends to every device in push_subscriptions for those people. Devices
// the push service reports as gone (404/410) are deleted.
//
// Deploy with --no-verify-jwt: the caller is Postgres, not a signed-in user.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...),
// PUSH_WEBHOOK_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided by the platform.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type Tab = 'today' | 'pods' | 'journey' | 'you';
type Push = { title: string; body?: string; tab: Tab; tag: string };
type Event =
  | { type: 'INSERT' | 'UPDATE'; table: string; record: Record<string, unknown> }
  | { type: 'REMINDER' };

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

const SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET');

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-push-secret') !== SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const event = (await req.json()) as Event;
  try {
    const sent = event.type === 'REMINDER' ? await reminders() : await onRow(event.table, event.record);
    return Response.json({ sent });
  } catch (e) {
    console.error('push-dispatch', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});

/* ------------------------------------------------------------- row events */

async function onRow(table: string, r: Record<string, unknown>): Promise<number> {
  switch (table) {
    case 'checkin_photos':
      return onFirstPhoto(r.checkin_id as string);
    case 'reactions':
      return onReaction(r.checkin_id as string, r.user_id as string, r.emoji as string);
    case 'nudges':
      return onNudge(r.from_user as string, r.to_user as string, r.day as string);
    case 'pod_join_requests':
      return onJoinRequest(r.pod_id as string, r.user_id as string);
    case 'pod_members':
      return onMemberAdded(r.pod_id as string, r.user_id as string);
    default:
      return 0;
  }
}

/** A check-in is announced once, on its first photo, to everyone who shares
 *  a squad with the author. */
async function onFirstPhoto(checkinId: string): Promise<number> {
  if (!(await claim(`post:${checkinId}`))) return 0;
  const { data: c } = await db.from('checkins').select('user_id').eq('id', checkinId).maybeSingle();
  if (!c) return 0;
  const [name, mates] = await Promise.all([displayName(c.user_id), squadMates(c.user_id)]);
  return sendTo(mates, {
    title: `${name} just checked in`,
    body: 'Their photos are in the squad thread.',
    tab: 'pods',
    tag: `post-${c.user_id}`,
  });
}

async function onReaction(checkinId: string, reactor: string, emoji: string): Promise<number> {
  const { data: c } = await db.from('checkins').select('user_id').eq('id', checkinId).maybeSingle();
  if (!c || c.user_id === reactor) return 0;
  if (!(await claim(`react:${checkinId}:${reactor}:${emoji}`))) return 0;
  const name = await displayName(reactor);
  return sendTo([c.user_id], {
    title: `${emoji} ${name} reacted to your check-in`,
    tab: 'pods',
    tag: `react-${checkinId}-${reactor}`,
  });
}

async function onNudge(from: string, to: string, day: string): Promise<number> {
  if (!(await claim(`nudge:${from}:${to}:${day}`))) return 0;
  // A nudge to someone who already posted is moot.
  if (await postedOn(to, day)) return 0;
  const name = await displayName(from);
  return sendTo([to], {
    title: `${name} nudged you`,
    body: "Where's today's photo? Your squad is waiting.",
    tab: 'today',
    tag: `nudge-${from}`,
  });
}

async function onJoinRequest(podId: string, requester: string): Promise<number> {
  const { data: pod } = await db.from('pods').select('name, emoji, created_by').eq('id', podId).maybeSingle();
  if (!pod || pod.created_by === requester) return 0;
  const name = await displayName(requester);
  return sendTo([pod.created_by], {
    title: `${name} wants to join ${pod.emoji} ${pod.name}`,
    body: 'Approve or decline in Squads.',
    tab: 'pods',
    tag: `join-${podId}-${requester}`,
  });
}

/** A member row that is not the creator's own is an approved request. */
async function onMemberAdded(podId: string, userId: string): Promise<number> {
  const { data: pod } = await db.from('pods').select('name, emoji, created_by').eq('id', podId).maybeSingle();
  if (!pod || pod.created_by === userId) return 0;
  return sendTo([userId], {
    title: `You're in ${pod.emoji} ${pod.name}`,
    body: 'Your request was approved. Say hi with today\'s photo.',
    tab: 'pods',
    tag: `joined-${podId}`,
  });
}

/* --------------------------------------------------------------- reminder */

/** How late a cron run may be and still send the day's reminder. */
const REMINDER_WINDOW_MIN = 60;

async function reminders(): Promise<number> {
  // Housekeeping rides along: dedupe keys only need to outlive a burst.
  await db.from('push_sent').delete().lt('created_at', new Date(Date.now() - 3 * 864e5).toISOString());

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, reminder_at, tz, last_reminded_day')
    .eq('reminder_on', true);

  let sent = 0;
  for (const s of subs ?? []) {
    const local = localClock(s.tz);
    if (!local || s.last_reminded_day === local.day) continue;
    const [h, m] = String(s.reminder_at).split(':').map(Number);
    const late = local.minutes - (h * 60 + m);
    if (late < 0 || late >= REMINDER_WINDOW_MIN) continue;

    // Mark first, so an overlapping run cannot remind twice.
    await db.from('push_subscriptions').update({ last_reminded_day: local.day }).eq('id', s.id);
    if (await postedOn(s.user_id, local.day)) continue;

    const streak = await streakBefore(s.user_id, local.day);
    const ok = await deliver(s, {
      title: streak > 0 ? `\u{1F525} Your ${streak}-day streak is on the line` : "\u{1F4F8} Time for today's photo",
      body: streak > 0 ? 'Post before midnight to keep it alive.' : 'Three angles, thirty seconds. Your squad is watching.',
      tab: 'today',
      tag: 'reminder',
    });
    if (ok) sent++;
  }
  return sent;
}

/** Day key and minute-of-day on the device's wall clock. */
function localClock(tz: string): { day: string; minutes: number } | null {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value])
    );
    return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  } catch {
    return null; // Unknown time zone string from an old browser.
  }
}

function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Consecutive posted days ending yesterday - the streak today would keep. */
async function streakBefore(userId: string, today: string): Promise<number> {
  const { data } = await db
    .from('checkins')
    .select('day')
    .eq('user_id', userId)
    .gte('day', addDays(today, -400))
    .lt('day', today);
  const days = new Set((data ?? []).map((r) => r.day as string));
  let n = 0;
  for (let d = addDays(today, -1); days.has(d); d = addDays(d, -1)) n++;
  return n;
}

/* ---------------------------------------------------------------- helpers */

/** True the first time a key is seen. */
async function claim(key: string): Promise<boolean> {
  const { data, error } = await db.from('push_sent').upsert({ key }, { onConflict: 'key', ignoreDuplicates: true }).select('key');
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function displayName(userId: string): Promise<string> {
  const { data } = await db.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return (data?.display_name as string | undefined)?.trim() || 'A squad-mate';
}

/** Everyone who shares at least one squad with the user, minus the user. */
async function squadMates(userId: string): Promise<string[]> {
  const { data: mine } = await db.from('pod_members').select('pod_id').eq('user_id', userId);
  const pods = (mine ?? []).map((r) => r.pod_id as string);
  if (pods.length === 0) return [];
  const { data } = await db.from('pod_members').select('user_id').in('pod_id', pods);
  return [...new Set((data ?? []).map((r) => r.user_id as string))].filter((id) => id !== userId);
}

async function postedOn(userId: string, day: string): Promise<boolean> {
  const { data } = await db
    .from('checkins')
    .select('id, checkin_photos(id)')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle();
  return ((data?.checkin_photos as unknown[] | undefined) ?? []).length > 0;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

async function sendTo(userIds: string[], push: Push): Promise<number> {
  if (userIds.length === 0) return 0;
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  const results = await Promise.all((subs ?? []).map((s) => deliver(s, push)));
  return results.filter(Boolean).length;
}

async function deliver(s: Sub, push: Push): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify(push),
      { TTL: push.tag === 'reminder' ? 2 * 3600 : 6 * 3600, urgency: push.tag.startsWith('nudge') ? 'high' : 'normal' }
    );
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.from('push_subscriptions').delete().eq('id', s.id);
    } else {
      console.error('push failed', status, (e as Error).message);
    }
    return false;
  }
}
