import { Platform } from 'react-native';

import type { DayKey } from './date';
import { nativeHealthModule } from './nativeHealthModule';
import { addDays, fromDayKey, toDayKey } from './date';

/**
 * Read-only health bridge.
 *
 * The product line is strict: this app never writes to Health and never lets
 * you log food or weight here. It only reads weight and energy-intake so the
 * photo timeline has context.
 *
 * Apple HealthKit and Android Health Connect both require native modules that
 * are not in the Expo Go sandbox (`react-native-health` /
 * `react-native-health-connect`). So the provider is an interface with two
 * implementations: a simulated one that works everywhere today, and a native
 * one that activates once the app runs in a development/production build.
 */

export type HealthSample = {
  day: DayKey;
  weightKg: number | null;
  caloriesIn: number | null;
};

export type HealthProvider = {
  readonly id: 'apple-health' | 'health-connect' | 'simulated';
  readonly label: string;
  /** False when the native module is missing from the current binary. */
  isAvailable(): boolean;
  requestPermissions(): Promise<boolean>;
  /** Inclusive range, oldest first. Missing days are simply absent. */
  readRange(fromDay: DayKey, toDay: DayKey): Promise<HealthSample[]>;
};

function nativeModulePresent(): boolean {
  // The optional dependency is isolated in one file so a binary without it
  // (Expo Go, Android) falls back cleanly. See nativeHealthModule.ts.
  return nativeHealthModule !== null && nativeHealthModule.isHealthDataAvailable();
}

/**
 * Deterministic stand-in. Values are derived from the day string, so the same
 * date always yields the same numbers and the UI is stable across reloads.
 * Clearly labelled as simulated everywhere it surfaces.
 */
export const simulatedHealth: HealthProvider = {
  id: 'simulated',
  label: 'Simulated data',
  isAvailable: () => true,
  requestPermissions: async () => true,
  readRange: async (fromDay, toDay) => {
    const out: HealthSample[] = [];
    let cursor = fromDay;
    let i = 0;
    while (cursor <= toDay && i < 400) {
      const seed = hash(cursor);
      out.push({
        day: cursor,
        weightKg: round(78 - i * 0.035 + ((seed % 90) / 100 - 0.45), 1),
        caloriesIn: 1900 + (seed % 700),
      });
      cursor = addDays(cursor, 1);
      i++;
    }
    return out;
  },
};

const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const DIETARY_ENERGY = 'HKQuantityTypeIdentifierDietaryEnergyConsumed';

const nativeHealth: HealthProvider = {
  id: Platform.OS === 'ios' ? 'apple-health' : 'health-connect',
  label: Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect',
  isAvailable: nativeModulePresent,
  requestPermissions: async () => {
    const hk = nativeHealthModule;
    if (!hk || !hk.isHealthDataAvailable()) return false;
    // HealthKit never reveals whether a read grant was given, only that the
    // prompt completed - denied types just come back with no samples.
    return hk.requestAuthorization({ toRead: [BODY_MASS, DIETARY_ENERGY] });
  },
  readRange: async (fromDay, toDay) => {
    const hk = nativeHealthModule;
    if (!hk) return [];
    // Local-midnight bounds: a sample belongs to the calendar day it was
    // taken on, matching how check-ins are keyed.
    const startDate = fromDayKey(fromDay);
    const endDate = fromDayKey(addDays(toDay, 1));
    const query = (identifier: string, unit: string) =>
      hk.queryQuantitySamples(identifier, {
        filter: { date: { startDate, endDate } },
        limit: 0,
        ascending: true,
        unit,
      });

    const [weights, energy] = await Promise.all([
      query(BODY_MASS, 'kg'),
      query(DIETARY_ENERGY, 'kcal'),
    ]);

    const byDay = new Map<DayKey, { weightKg: number | null; caloriesIn: number | null }>();
    const entry = (day: DayKey) => {
      let e = byDay.get(day);
      if (!e) {
        e = { weightKg: null, caloriesIn: null };
        byDay.set(day, e);
      }
      return e;
    };

    // Ascending order, so the last weight sample of a day wins.
    for (const s of weights) entry(toDayKey(new Date(s.startDate))).weightKg = round(s.quantity, 1);
    for (const s of energy) {
      const e = entry(toDayKey(new Date(s.startDate)));
      e.caloriesIn = Math.round((e.caloriesIn ?? 0) + s.quantity);
    }

    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, v]) => ({ day, ...v }));
  },
};

export function healthProvider(): HealthProvider {
  return nativeModulePresent() ? nativeHealth : simulatedHealth;
}

/** Pull the trailing `days` window; callers persist the result via upsertMetric. */
export async function syncRecentHealth(days = 30): Promise<HealthSample[]> {
  const provider = healthProvider();
  const today = toDayKey();
  return provider.readRange(addDays(today, -(days - 1)), today);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
