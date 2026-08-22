import type { SQLiteDatabase } from 'expo-sqlite';

import { addDays, DayKey, toDayKey } from '@/lib/date';
import { newId, newInviteCode } from '@/lib/id';
import type {
  Angle,
  CheckIn,
  FeedItem,
  MetricRow,
  Photo,
  Pod,
  ReactionRow,
  Settings,
  User,
} from './types';

const DEFAULT_SETTINGS: Settings = {
  blur_face: 0,
  share_weight: 0,
  share_calories: 0,
  share_trained: 1,
  local_only: 1,
  onboarded: 0,
  reminder_hour: 8,
  reminders_on: 0,
  timer_seconds: 3,
  health_connected: 0,
};

const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------------ settings */

export async function readSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const out = { ...DEFAULT_SETTINGS } as Record<string, number>;
  for (const r of rows) out[r.key] = Number(r.value);
  return out as unknown as Settings;
}

export async function writeSetting<K extends keyof Settings>(
  db: SQLiteDatabase,
  key: K,
  value: Settings[K]
): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    String(value)
  );
}

/* --------------------------------------------------------------------- users */

export async function getMe(db: SQLiteDatabase): Promise<User | null> {
  return db.getFirstAsync<User>('SELECT * FROM users WHERE is_me = 1 LIMIT 1');
}

export async function createMe(db: SQLiteDatabase, displayName: string): Promise<User> {
  const existing = await getMe(db);
  if (existing) {
    await db.runAsync('UPDATE users SET display_name = ? WHERE id = ?', displayName, existing.id);
    return { ...existing, display_name: displayName };
  }
  const id = newId('u');
  await db.runAsync('INSERT INTO users (id, display_name, is_me) VALUES (?, ?, 1)', id, displayName);
  return { id, display_name: displayName, is_me: 1 };
}

export async function upsertUser(db: SQLiteDatabase, id: string, displayName: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO users (id, display_name, is_me) VALUES (?, ?, 0) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name',
    id,
    displayName
  );
}

/* ---------------------------------------------------------------------- pods */

export const POD_MAX_MEMBERS = 8;

export async function listPods(db: SQLiteDatabase, userId: string): Promise<Pod[]> {
  return db.getAllAsync<Pod>(
    `SELECT p.* FROM pods p
     JOIN pod_members m ON m.pod_id = p.id
     WHERE m.user_id = ?
     ORDER BY p.created_at ASC`,
    userId
  );
}

export async function getPod(db: SQLiteDatabase, podId: string): Promise<Pod | null> {
  return db.getFirstAsync<Pod>('SELECT * FROM pods WHERE id = ?', podId);
}

export async function findPodByCode(db: SQLiteDatabase, code: string): Promise<Pod | null> {
  return db.getFirstAsync<Pod>('SELECT * FROM pods WHERE invite_code = ?', code.toUpperCase());
}

export async function podMembers(db: SQLiteDatabase, podId: string): Promise<User[]> {
  return db.getAllAsync<User>(
    `SELECT u.* FROM users u
     JOIN pod_members m ON m.user_id = u.id
     WHERE m.pod_id = ?
     ORDER BY u.is_me DESC, u.display_name ASC`,
    podId
  );
}

export async function createPod(
  db: SQLiteDatabase,
  ownerId: string,
  name: string,
  emoji: string
): Promise<Pod> {
  const pod: Pod = {
    id: newId('p'),
    name,
    emoji,
    invite_code: newInviteCode(),
    created_at: nowIso(),
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO pods (id, name, emoji, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
      pod.id,
      pod.name,
      pod.emoji,
      pod.invite_code,
      pod.created_at
    );
    await db.runAsync('INSERT INTO pod_members (pod_id, user_id) VALUES (?, ?)', pod.id, ownerId);
  });
  return pod;
}

export async function addMember(db: SQLiteDatabase, podId: string, userId: string): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO pod_members (pod_id, user_id) VALUES (?, ?)', podId, userId);
}

export async function memberCount(db: SQLiteDatabase, podId: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM pod_members WHERE pod_id = ?',
    podId
  );
  return row?.n ?? 0;
}

export async function leavePod(db: SQLiteDatabase, podId: string, userId: string): Promise<void> {
  await db.runAsync('DELETE FROM pod_members WHERE pod_id = ? AND user_id = ?', podId, userId);
  if ((await memberCount(db, podId)) === 0) {
    await db.runAsync('DELETE FROM pods WHERE id = ?', podId);
  }
}

/* ------------------------------------------------------------------ checkins */

export async function getCheckIn(
  db: SQLiteDatabase,
  userId: string,
  day: DayKey
): Promise<CheckIn | null> {
  return db.getFirstAsync<CheckIn>('SELECT * FROM checkins WHERE user_id = ? AND day = ?', userId, day);
}

/**
 * One check-in per person per day. Creating it is idempotent so the capture
 * flow can call this before it has a photo, then attach photos as they arrive.
 */
export async function ensureCheckIn(
  db: SQLiteDatabase,
  userId: string,
  day: DayKey
): Promise<CheckIn> {
  const existing = await getCheckIn(db, userId, day);
  if (existing) return existing;
  const row: CheckIn = {
    id: newId('c'),
    user_id: userId,
    day,
    trained: 0,
    note: null,
    created_at: nowIso(),
  };
  await db.runAsync(
    'INSERT INTO checkins (id, user_id, day, trained, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    row.id,
    row.user_id,
    row.day,
    row.trained,
    row.note,
    row.created_at
  );
  return row;
}

export async function updateCheckIn(
  db: SQLiteDatabase,
  checkinId: string,
  patch: { trained?: 0 | 1; note?: string | null }
): Promise<void> {
  if (patch.trained !== undefined) {
    await db.runAsync('UPDATE checkins SET trained = ? WHERE id = ?', patch.trained, checkinId);
  }
  if (patch.note !== undefined) {
    await db.runAsync('UPDATE checkins SET note = ? WHERE id = ?', patch.note, checkinId);
  }
}

export async function deleteCheckIn(db: SQLiteDatabase, checkinId: string): Promise<void> {
  await db.runAsync('DELETE FROM checkins WHERE id = ?', checkinId);
}

export async function setPhoto(
  db: SQLiteDatabase,
  checkinId: string,
  angle: Angle,
  uri: string,
  width: number,
  height: number
): Promise<void> {
  await db.runAsync(
    `INSERT INTO photos (id, checkin_id, angle, uri, width, height)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(checkin_id, angle) DO UPDATE SET
       uri = excluded.uri, width = excluded.width, height = excluded.height`,
    newId('ph'),
    checkinId,
    angle,
    uri,
    width,
    height
  );
}

export async function photosFor(db: SQLiteDatabase, checkinId: string): Promise<Photo[]> {
  return db.getAllAsync<Photo>('SELECT * FROM photos WHERE checkin_id = ?', checkinId);
}

/** Most recent photo at a given angle - the ghost-overlay reference. */
export async function latestPhotoAtAngle(
  db: SQLiteDatabase,
  userId: string,
  angle: Angle,
  beforeDay?: DayKey
): Promise<(Photo & { day: DayKey }) | null> {
  if (beforeDay) {
    return db.getFirstAsync<Photo & { day: DayKey }>(
      `SELECT ph.*, c.day FROM photos ph
       JOIN checkins c ON c.id = ph.checkin_id
       WHERE c.user_id = ? AND ph.angle = ? AND ph.uri IS NOT NULL AND c.day < ?
       ORDER BY c.day DESC LIMIT 1`,
      userId,
      angle,
      beforeDay
    );
  }
  return db.getFirstAsync<Photo & { day: DayKey }>(
    `SELECT ph.*, c.day FROM photos ph
     JOIN checkins c ON c.id = ph.checkin_id
     WHERE c.user_id = ? AND ph.angle = ? AND ph.uri IS NOT NULL
     ORDER BY c.day DESC LIMIT 1`,
    userId,
    angle
  );
}

/* ------------------------------------------------------------------ timeline */

export async function myTimeline(
  db: SQLiteDatabase,
  userId: string,
  angle: Angle
): Promise<(Photo & { day: DayKey })[]> {
  return db.getAllAsync<Photo & { day: DayKey }>(
    `SELECT ph.*, c.day FROM photos ph
     JOIN checkins c ON c.id = ph.checkin_id
     WHERE c.user_id = ? AND ph.angle = ? AND ph.uri IS NOT NULL
     ORDER BY c.day ASC`,
    userId,
    angle
  );
}

export async function loggedDays(db: SQLiteDatabase, userId: string): Promise<DayKey[]> {
  const rows = await db.getAllAsync<{ day: DayKey }>(
    'SELECT day FROM checkins WHERE user_id = ? ORDER BY day DESC',
    userId
  );
  return rows.map((r) => r.day);
}

/* ---------------------------------------------------------------------- feed */

/**
 * Every check-in on `day` from anyone who shares a pod with me. DISTINCT
 * because one check-in broadcasts to all pods - a person in two of my pods
 * must still appear once.
 */
export async function feedForDay(
  db: SQLiteDatabase,
  userId: string,
  day: DayKey,
  podId?: string
): Promise<FeedItem[]> {
  const rows = podId
    ? await db.getAllAsync<CheckIn & { display_name: string; is_me: 0 | 1 }>(
        `SELECT DISTINCT c.*, u.display_name, u.is_me
         FROM pod_members me
         JOIN pod_members m ON m.pod_id = me.pod_id
         JOIN users u       ON u.id = m.user_id
         JOIN checkins c    ON c.user_id = u.id
         WHERE me.user_id = ? AND m.pod_id = ? AND c.day = ?
         ORDER BY u.is_me DESC, c.created_at DESC`,
        userId,
        podId,
        day
      )
    : await db.getAllAsync<CheckIn & { display_name: string; is_me: 0 | 1 }>(
        `SELECT DISTINCT c.*, u.display_name, u.is_me
         FROM pod_members me
         JOIN pod_members m ON m.pod_id = me.pod_id
         JOIN users u       ON u.id = m.user_id
         JOIN checkins c    ON c.user_id = u.id
         WHERE me.user_id = ? AND c.day = ?
         ORDER BY u.is_me DESC, c.created_at DESC`,
        userId,
        day
      );

  const items: FeedItem[] = [];
  for (const row of rows) {
    const { display_name, is_me, ...rest } = row;
    const checkin = rest as CheckIn;
    items.push({
      checkin,
      user: { id: checkin.user_id, display_name, is_me },
      photos: await photosFor(db, checkin.id),
      reactions: await db.getAllAsync<ReactionRow>(
        'SELECT * FROM reactions WHERE checkin_id = ?',
        checkin.id
      ),
      metrics: await db.getFirstAsync<MetricRow>(
        'SELECT * FROM metrics WHERE user_id = ? AND day = ?',
        checkin.user_id,
        day
      ),
    });
  }
  return items;
}

/** Pod-mates with no check-in on `day`. This is the soft-pressure surface. */
export async function missingForDay(
  db: SQLiteDatabase,
  userId: string,
  day: DayKey,
  podId?: string
): Promise<User[]> {
  if (podId) {
    return db.getAllAsync<User>(
      `SELECT DISTINCT u.* FROM pod_members me
       JOIN pod_members m ON m.pod_id = me.pod_id
       JOIN users u       ON u.id = m.user_id
       WHERE me.user_id = ? AND m.pod_id = ?
         AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.user_id = u.id AND c.day = ?)
       ORDER BY u.is_me DESC, u.display_name ASC`,
      userId,
      podId,
      day
    );
  }
  return db.getAllAsync<User>(
    `SELECT DISTINCT u.* FROM pod_members me
     JOIN pod_members m ON m.pod_id = me.pod_id
     JOIN users u       ON u.id = m.user_id
     WHERE me.user_id = ?
       AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.user_id = u.id AND c.day = ?)
     ORDER BY u.is_me DESC, u.display_name ASC`,
    userId,
    day
  );
}

/** One reaction per person per check-in; tapping the same emoji clears it. */
export async function toggleReaction(
  db: SQLiteDatabase,
  checkinId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const existing = await db.getFirstAsync<ReactionRow>(
    'SELECT * FROM reactions WHERE checkin_id = ? AND user_id = ?',
    checkinId,
    userId
  );
  if (existing && existing.emoji === emoji) {
    await db.runAsync('DELETE FROM reactions WHERE id = ?', existing.id);
    return;
  }
  await db.runAsync(
    `INSERT INTO reactions (id, checkin_id, user_id, emoji, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(checkin_id, user_id) DO UPDATE SET
       emoji = excluded.emoji, created_at = excluded.created_at`,
    newId('r'),
    checkinId,
    userId,
    emoji,
    nowIso()
  );
}

/* ------------------------------------------------------------------- metrics */

export async function upsertMetric(
  db: SQLiteDatabase,
  userId: string,
  day: DayKey,
  patch: { weight_kg?: number | null; calories_in?: number | null; source?: string }
): Promise<void> {
  await db.runAsync(
    `INSERT INTO metrics (id, user_id, day, weight_kg, calories_in, source)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET
       weight_kg   = COALESCE(excluded.weight_kg, metrics.weight_kg),
       calories_in = COALESCE(excluded.calories_in, metrics.calories_in),
       source      = excluded.source`,
    newId('m'),
    userId,
    day,
    patch.weight_kg ?? null,
    patch.calories_in ?? null,
    patch.source ?? 'health'
  );
}

export async function metricsSince(
  db: SQLiteDatabase,
  userId: string,
  fromDay: DayKey
): Promise<MetricRow[]> {
  return db.getAllAsync<MetricRow>(
    'SELECT * FROM metrics WHERE user_id = ? AND day >= ? ORDER BY day ASC',
    userId,
    fromDay
  );
}

export async function metricFor(
  db: SQLiteDatabase,
  userId: string,
  day: DayKey
): Promise<MetricRow | null> {
  return db.getFirstAsync<MetricRow>(
    'SELECT * FROM metrics WHERE user_id = ? AND day = ?',
    userId,
    day
  );
}

/* ------------------------------------------------------------------- destroy */

export async function wipeAll(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DELETE FROM reactions;
    DELETE FROM photos;
    DELETE FROM checkins;
    DELETE FROM metrics;
    DELETE FROM pod_members;
    DELETE FROM pods;
    DELETE FROM users;
    DELETE FROM settings;
  `);
}

export const dayHelpers = { today: toDayKey, yesterday: () => addDays(toDayKey(), -1) };
