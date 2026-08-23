import type { SQLiteDatabase } from 'expo-sqlite';

// Deliberately still podshot.db after the GymShot rename: the filename is the
// on-device database identity, so renaming it would orphan existing check-ins.
export const DATABASE_NAME = 'podshot.db';
const DATABASE_VERSION = 1;

/**
 * Migrations run in `SQLiteProvider onInit`. Each version block is additive and
 * must stay in place forever once shipped - never edit a released block.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      PRAGMA foreign_keys = ON;

      CREATE TABLE users (
        id           TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL,
        is_me        INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE pods (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL,
        emoji       TEXT NOT NULL DEFAULT '',
        invite_code TEXT NOT NULL UNIQUE,
        created_at  TEXT NOT NULL
      );

      CREATE TABLE pod_members (
        pod_id  TEXT NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (pod_id, user_id)
      );

      CREATE TABLE checkins (
        id         TEXT PRIMARY KEY NOT NULL,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day        TEXT NOT NULL,
        trained    INTEGER NOT NULL DEFAULT 0,
        note       TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (user_id, day)
      );

      CREATE TABLE photos (
        id         TEXT PRIMARY KEY NOT NULL,
        checkin_id TEXT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
        angle      TEXT NOT NULL,
        uri        TEXT,
        width      INTEGER NOT NULL DEFAULT 0,
        height     INTEGER NOT NULL DEFAULT 0,
        UNIQUE (checkin_id, angle)
      );

      CREATE TABLE reactions (
        id         TEXT PRIMARY KEY NOT NULL,
        checkin_id TEXT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji      TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (checkin_id, user_id)
      );

      CREATE TABLE metrics (
        id          TEXT PRIMARY KEY NOT NULL,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day         TEXT NOT NULL,
        weight_kg   REAL,
        calories_in REAL,
        source      TEXT NOT NULL DEFAULT 'health',
        UNIQUE (user_id, day)
      );

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX idx_checkins_day  ON checkins (day);
      CREATE INDEX idx_checkins_user ON checkins (user_id, day DESC);
      CREATE INDEX idx_members_pod   ON pod_members (pod_id);
      CREATE INDEX idx_members_user  ON pod_members (user_id);
    `);
    version = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
