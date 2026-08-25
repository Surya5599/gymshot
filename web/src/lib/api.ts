import type { DayKey } from './date';
import { supabase } from './supabase';

export const ANGLES = ['front', 'side', 'back'] as const;
export type Angle = (typeof ANGLES)[number];

export const REACTIONS = ['\u{1F525}', '\u{1F44F}', '\u{1F4AA}', '\u{1F440}', '\u{1F60D}'] as const;

export type Profile = {
  id: string;
  display_name: string;
  share_trained: boolean;
  blur_face: boolean;
};

export type Pod = {
  id: string;
  name: string;
  emoji: string;
  invite_code: string;
  created_by: string;
  created_at: string;
};

export type CheckIn = {
  id: string;
  user_id: string;
  day: DayKey;
  trained: boolean;
  note: string | null;
  created_at: string;
};

export type CheckinPhoto = {
  id: string;
  checkin_id: string;
  angle: Angle;
  storage_path: string;
  width: number | null;
  height: number | null;
};

export type Reaction = {
  checkin_id: string;
  user_id: string;
  emoji: string;
};

export type FeedEntry = {
  checkin: CheckIn;
  author: Profile;
  photos: (CheckinPhoto & { url: string | null })[];
  reactions: Reaction[];
};

function fail(message: string): never {
  throw new Error(message);
}

/* -------------------------------------------------------------- profile */

export async function getProfile(): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? fail('not signed in');
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? fail('not signed in');
  const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
  if (error) throw error;
}

/* ----------------------------------------------------------------- pods */

export async function listPods(): Promise<(Pod & { memberCount: number })[]> {
  const { data, error } = await supabase
    .from('pods')
    .select('*, pod_members(count)')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((p) => ({
    ...(p as unknown as Pod),
    memberCount: (p as { pod_members: { count: number }[] }).pod_members?.[0]?.count ?? 0,
  }));
}

export async function createPod(name: string, emoji: string): Promise<Pod> {
  const { data, error } = await supabase.rpc('create_pod', { p_name: name, p_emoji: emoji });
  if (error) throw error;
  return data as Pod;
}

/** Asks to join; membership only happens once the squad owner approves. */
export async function requestJoinByCode(code: string): Promise<Pod> {
  const { data, error } = await supabase.rpc('request_join_by_code', { p_code: code });
  if (error) throw error;
  return data as Pod;
}

export type MyJoinRequest = { pod_id: string; name: string; emoji: string; requested_at: string };

export async function myJoinRequests(): Promise<MyJoinRequest[]> {
  const { data, error } = await supabase.rpc('my_join_requests');
  if (error) throw error;
  return (data ?? []) as MyJoinRequest[];
}

export type IncomingJoinRequest = {
  pod_id: string;
  pod_name: string;
  pod_emoji: string;
  user_id: string;
  display_name: string;
  requested_at: string;
};

/** Requests waiting on me, across every squad I own. */
export async function incomingJoinRequests(): Promise<IncomingJoinRequest[]> {
  const { data, error } = await supabase.rpc('incoming_join_requests');
  if (error) throw error;
  return (data ?? []) as IncomingJoinRequest[];
}

export async function approveJoinRequest(podId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_join_request', { p_pod: podId, p_user: userId });
  if (error) throw error;
}

export async function declineJoinRequest(podId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_join_request', { p_pod: podId, p_user: userId });
  if (error) throw error;
}

export async function cancelJoinRequest(podId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? fail('not signed in');
  const { error } = await supabase.from('pod_join_requests').delete().eq('pod_id', podId).eq('user_id', uid);
  if (error) throw error;
}

export async function leavePod(podId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? fail('not signed in');
  const { error } = await supabase.from('pod_members').delete().eq('pod_id', podId).eq('user_id', uid);
  if (error) throw error;
}

export async function podMembers(podId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('pod_members')
    .select('profiles(*)')
    .eq('pod_id', podId)
    .order('joined_at');
  if (error) throw error;
  return (data ?? []).map((r) => (r as unknown as { profiles: Profile }).profiles);
}

/* ------------------------------------------------------------- checkins */

export async function myLoggedDays(): Promise<DayKey[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? fail('not signed in');
  const { data, error } = await supabase
    .from('checkins')
    .select('day')
    .eq('user_id', uid)
    .order('day', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => r.day as DayKey);
}

export async function myCheckin(day: DayKey): Promise<{ checkin: CheckIn; photos: CheckinPhoto[] } | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? fail('not signed in');
  const { data, error } = await supabase
    .from('checkins')
    .select('*, checkin_photos(*)')
    .eq('user_id', uid)
    .eq('day', day)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { checkin_photos, ...checkin } = data as CheckIn & { checkin_photos: CheckinPhoto[] };
  return { checkin: checkin as CheckIn, photos: checkin_photos ?? [] };
}

export async function ensureCheckin(day: DayKey): Promise<CheckIn> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? fail('not signed in');
  const { data, error } = await supabase
    .from('checkins')
    .upsert({ user_id: uid, day }, { onConflict: 'user_id,day' })
    .select()
    .single();
  if (error) throw error;
  return data as CheckIn;
}

export async function updateCheckin(id: string, patch: { trained?: boolean; note?: string | null }): Promise<void> {
  const { error } = await supabase.from('checkins').update(patch).eq('id', id);
  if (error) throw error;
}

/* --------------------------------------------------------------- photos */

/** Downscale to keep uploads phone-photo sized, not camera-raw sized. */
async function resizeToJpeg(file: Blob, maxDim = 1440): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not encode the photo.');
  return { blob, width, height };
}

export async function uploadPhoto(day: DayKey, angle: Angle, file: Blob): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? fail('not signed in');
  const checkin = await ensureCheckin(day);
  const { blob, width, height } = await resizeToJpeg(file);
  const path = `${uid}/${day}-${angle}.jpg`;

  const { error: upErr } = await supabase.storage.from('checkins').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) throw upErr;
  // A retake reuses the path; the next sign must mint a fresh URL so the
  // browser does not serve the old image from cache.
  invalidateSignedUrl(path);

  const { error } = await supabase
    .from('checkin_photos')
    .upsert({ checkin_id: checkin.id, angle, storage_path: path, width, height }, { onConflict: 'checkin_id,angle' });
  if (error) throw error;
}

/**
 * Session cache for signed URLs. Re-signing on every view mount produced a
 * different URL each time, which defeats the browser's image cache and makes
 * every tab switch re-download every photo. A stable URL makes repeat views
 * instant. Entries expire an hour before the signature does.
 */
const SIGN_TTL_SECONDS = 60 * 60 * 24;
const urlCache = new Map<string, { url: string; expires: number }>();

function invalidateSignedUrl(path: string): void {
  urlCache.delete(path);
}

export async function signPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const missing: string[] = [];
  for (const p of new Set(paths)) {
    const hit = urlCache.get(p);
    if (hit && hit.expires > now) out.set(p, hit.url);
    else missing.push(p);
  }
  if (missing.length > 0) {
    const { data, error } = await supabase.storage.from('checkins').createSignedUrls(missing, SIGN_TTL_SECONDS);
    if (error) throw error;
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        out.set(item.path, item.signedUrl);
        urlCache.set(item.path, { url: item.signedUrl, expires: now + (SIGN_TTL_SECONDS - 3600) * 1000 });
      }
    }
  }
  return out;
}

/** My whole photo timeline, oldest first, for the Journey view. */
export async function myTimeline(angle: Angle): Promise<{ day: DayKey; path: string }[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? fail('not signed in');
  const { data, error } = await supabase
    .from('checkin_photos')
    .select('storage_path, checkins!inner(day, user_id)')
    .eq('angle', angle)
    .eq('checkins.user_id', uid);
  if (error) throw error;
  return (data ?? [])
    .map((r) => {
      const row = r as unknown as { storage_path: string; checkins: { day: DayKey } };
      return { day: row.checkins.day, path: row.storage_path };
    })
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

/* ----------------------------------------------------------------- feed */

/** Today's thread for one pod: who posted (with photos + reactions), who has not. */
export async function podFeed(
  podId: string,
  day: DayKey
): Promise<{ entries: FeedEntry[]; waiting: Profile[]; members: Profile[] }> {
  const members = await podMembers(podId);
  const ids = members.map((m) => m.id);

  const { data, error } = await supabase
    .from('checkins')
    .select('*, checkin_photos(*), reactions(*)')
    .in('user_id', ids)
    .eq('day', day)
    .order('created_at');
  if (error) throw error;

  const rows = (data ?? []) as (CheckIn & { checkin_photos: CheckinPhoto[]; reactions: Reaction[] })[];
  const urls = await signPhotoUrls(rows.flatMap((r) => r.checkin_photos.map((p) => p.storage_path)));

  const entries: FeedEntry[] = rows.map((r) => {
    const { checkin_photos, reactions, ...checkin } = r;
    return {
      checkin: checkin as CheckIn,
      author: members.find((m) => m.id === r.user_id)!,
      photos: checkin_photos
        .sort((a, b) => ANGLES.indexOf(a.angle) - ANGLES.indexOf(b.angle))
        .map((p) => ({ ...p, url: urls.get(p.storage_path) ?? null })),
      reactions: reactions ?? [],
    };
  });

  const posted = new Set(rows.map((r) => r.user_id));
  return { entries, waiting: members.filter((m) => !posted.has(m.id)), members };
}

/** One reaction per person per check-in; same emoji again removes it. */
export async function toggleReaction(checkinId: string, emoji: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? fail('not signed in');
  const { data } = await supabase
    .from('reactions')
    .select('emoji')
    .eq('checkin_id', checkinId)
    .eq('user_id', uid)
    .maybeSingle();

  if (data?.emoji === emoji) {
    const { error } = await supabase.from('reactions').delete().eq('checkin_id', checkinId).eq('user_id', uid);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('reactions')
      .upsert({ checkin_id: checkinId, user_id: uid, emoji }, { onConflict: 'checkin_id,user_id' });
    if (error) throw error;
  }
}
