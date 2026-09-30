import { useSyncExternalStore } from 'react';

/** Per-device preferences. These are about this browser (can it make noise,
 *  may it notify), not about the account, so they live in localStorage. */
export type Prefs = {
  sounds: boolean;
  haptics: boolean;
  notifications: boolean;
  /** This browser holds a web push subscription (see lib/push.ts). */
  push: boolean;
  reminder: boolean;
  /** Local wall-clock time, HH:MM. */
  reminderAt: string;
};

const KEY = 'gymshot.prefs';
const DEFAULTS: Prefs = { sounds: true, haptics: true, notifications: false, push: false, reminder: true, reminderAt: '19:00' };

let current: Prefs = read();
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function getPrefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private mode or blocked storage: the preference holds for this session.
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
