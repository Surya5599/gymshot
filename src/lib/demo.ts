import type { SQLiteDatabase } from 'expo-sqlite';

import * as q from '@/db/queries';
import { addDays, toDayKey } from './date';
import { newId } from './id';

/**
 * Loads a demo pod with three pod-mates and two weeks of plausible history.
 *
 * This exists because the social half of the product is unevaluable with a pod
 * of one, and there is no sync backend yet. It is always explicitly invoked
 * from Settings or onboarding and every seeded person is labelled as demo, so
 * it can never be mistaken for real pod activity.
 */

const FRIENDS = [
  { name: 'Nadia (demo)', trainRate: 0.85, postRate: 0.9 },
  { name: 'Theo (demo)', trainRate: 0.6, postRate: 0.7 },
  { name: 'Priya (demo)', trainRate: 0.95, postRate: 0.55 },
];

const NOTES = [
  'leg day, felt strong',
  'easy zone 2 + abs',
  'push day. bench finally moved',
  'rest day but still showed up',
  'pull day, back is cooked',
  'short session, better than nothing',
];

export const DEMO_POD_NAME = 'Gym friends (demo)';

export async function loadDemoPod(db: SQLiteDatabase, meId: string): Promise<string> {
  const existing = (await q.listPods(db, meId)).find((p) => p.name === DEMO_POD_NAME);
  const pod = existing ?? (await q.createPod(db, meId, DEMO_POD_NAME, '\u{1F3CB}\u{FE0F}'));

  const today = toDayKey();

  for (const friend of FRIENDS) {
    const id = newId('u');
    await q.upsertUser(db, id, friend.name);
    await q.addMember(db, pod.id, id);

    for (let back = 13; back >= 0; back--) {
      const day = addDays(today, -back);
      const roll = pseudo(`${id}:${day}`);
      if (roll > friend.postRate) continue; // a visible gap in their streak

      const checkin = await q.ensureCheckIn(db, id, day);
      await q.updateCheckIn(db, checkin.id, {
        trained: pseudo(`t:${id}:${day}`) < friend.trainRate ? 1 : 0,
        note: NOTES[Math.floor(pseudo(`n:${id}:${day}`) * NOTES.length)],
      });
      // No photo files for demo pod-mates - PhotoTile draws a stable
      // placeholder, which is honest about there being no real image.
      await q.upsertMetric(db, id, day, {
        weight_kg: Math.round((72 + pseudo(`w:${id}`) * 14 - back * 0.03) * 10) / 10,
        calories_in: 1800 + Math.floor(pseudo(`c:${id}:${day}`) * 900),
        source: 'demo',
      });
    }
  }

  return pod.id;
}

export async function removeDemoData(db: SQLiteDatabase, meId: string): Promise<void> {
  const pods = await q.listPods(db, meId);
  for (const pod of pods) {
    if (pod.name !== DEMO_POD_NAME) continue;
    const members = await q.podMembers(db, pod.id);
    for (const m of members) {
      if (m.is_me) continue;
      await db.runAsync('DELETE FROM users WHERE id = ?', m.id);
    }
    await db.runAsync('DELETE FROM pods WHERE id = ?', pod.id);
  }
}

/** Stable 0..1 from a string, so demo history never reshuffles on reload. */
function pseudo(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
