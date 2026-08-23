import type { Session } from '@supabase/supabase-js';
import { useSQLiteContext } from 'expo-sqlite';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import * as q from '@/db/queries';
import type { Angle, CheckIn, FeedItem, MetricRow, Photo, Pod, Settings, User } from '@/db/types';
import { addDays, DayKey, toDayKey } from '@/lib/date';
import { loadDemoPod, removeDemoData } from '@/lib/demo';
import { healthProvider, syncRecentHealth } from '@/lib/health';
import { deleteStoredPhoto, storeCheckInPhoto } from '@/lib/photos';
import { pushDisplayName, supabase } from '@/lib/supabase';
import { cancelDailyReminder, requestReminderPermission, scheduleDailyReminder } from '@/lib/reminders';
import { computeStreak, StreakInfo } from '@/lib/streak';

type Store = {
  ready: boolean;
  /** Supabase auth session; null while signed out. Valid once `authReady`. */
  session: Session | null;
  authReady: boolean;
  me: User | null;
  settings: Settings;
  pods: Pod[];
  today: DayKey;
  todayCheckIn: CheckIn | null;
  todayPhotos: Photo[];
  todayMetrics: MetricRow | null;
  streak: StreakInfo;
  /** Every day I have checked in, newest first. */
  loggedDays: DayKey[];
  feed: FeedItem[];
  missing: User[];
  healthLabel: string;

  refresh: () => Promise<void>;
  signUp: (name: string) => Promise<void>;
  /** Returns true if a session exists afterwards; false means the project
   *  requires email confirmation before the first sign-in. */
  signUpWithEmail: (email: string, password: string) => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;

  createPod: (name: string, emoji: string) => Promise<Pod>;
  joinPodByCode: (code: string) => Promise<Pod | null>;
  leavePod: (podId: string) => Promise<void>;

  /** Attaches a captured photo to today's check-in, creating it if needed. */
  saveTodayPhoto: (args: {
    uri: string;
    angle: Angle;
    width?: number;
    height?: number;
  }) => Promise<void>;
  removeTodayPhoto: (angle: Angle) => Promise<void>;
  setTrained: (trained: boolean) => Promise<void>;
  setNote: (note: string) => Promise<void>;
  react: (checkinId: string, emoji: string) => Promise<void>;

  syncHealth: () => Promise<number>;
  setReminders: (on: boolean, hour?: number) => Promise<boolean>;
  seedDemoPod: () => Promise<void>;
  clearDemoData: () => Promise<void>;
  resetEverything: () => Promise<void>;

  timeline: (angle: Angle) => Promise<(Photo & { day: DayKey })[]>;
  feedForPod: (podId: string) => Promise<{ items: FeedItem[]; missing: User[] }>;
  members: (podId: string) => Promise<User[]>;
};

const EMPTY_SETTINGS: Settings = {
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

const EMPTY_STREAK: StreakInfo = {
  current: 0,
  best: 0,
  loggedToday: false,
  monthLogged: 0,
  monthDays: 30,
  monthProgress: 0,
};

const StoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();

  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [me, setMe] = useState<User | null>(null);
  // Actions read the profile through this ref, not the `me` state. signUp()
  // creates the row and refreshes, but a handler that calls signUp() and then
  // createPod() in the same tick still closes over the render's stale `me`.
  const meRef = useRef<User | null>(null);
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [pods, setPods] = useState<Pod[]>([]);
  const [today, setToday] = useState<DayKey>(toDayKey());
  const [todayCheckIn, setTodayCheckIn] = useState<CheckIn | null>(null);
  const [todayPhotos, setTodayPhotos] = useState<Photo[]>([]);
  const [todayMetrics, setTodayMetrics] = useState<MetricRow | null>(null);
  const [streak, setStreak] = useState<StreakInfo>(EMPTY_STREAK);
  const [loggedDays, setLoggedDays] = useState<DayKey[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [missing, setMissing] = useState<User[]>([]);

  const refresh = useCallback(async () => {
    const day = toDayKey();
    setToday(day);

    const nextSettings = await q.readSettings(db);
    setSettings(nextSettings);

    const user = await q.getMe(db);
    meRef.current = user;
    setMe(user);

    if (!user) {
      setPods([]);
      setTodayCheckIn(null);
      setTodayPhotos([]);
      setTodayMetrics(null);
      setStreak(EMPTY_STREAK);
      setLoggedDays([]);
      setFeed([]);
      setMissing([]);
      setReady(true);
      return;
    }

    const [podRows, checkin, days, feedRows, missingRows, metrics] = await Promise.all([
      q.listPods(db, user.id),
      q.getCheckIn(db, user.id, day),
      q.loggedDays(db, user.id),
      q.feedForDay(db, user.id, day),
      q.missingForDay(db, user.id, day),
      q.metricFor(db, user.id, day),
    ]);

    setPods(podRows);
    setTodayCheckIn(checkin);
    setTodayPhotos(checkin ? await q.photosFor(db, checkin.id) : []);
    setTodayMetrics(metrics);
    setStreak(computeStreak(days, day));
    setLoggedDays(days);
    setFeed(feedRows);
    setMissing(missingRows);
    setReady(true);
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* --------------------------------------------------------------- actions */

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data.session != null;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const signUp = useCallback(
    async (name: string) => {
      await q.createMe(db, name.trim() || 'Me');
      await q.writeSetting(db, 'onboarded', 1);
      // Mirror the name to the remote profile; local-first, so a failure
      // here must never block onboarding.
      pushDisplayName(name.trim() || 'Me').catch(() => {});
      await refresh();
    },
    [db, refresh]
  );

  const setSetting = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      await q.writeSetting(db, key, value);
    },
    [db]
  );

  const createPod = useCallback(
    async (name: string, emoji: string) => {
      const me = meRef.current;
      if (!me) throw new Error('No profile yet');
      const pod = await q.createPod(db, me.id, name.trim() || 'My pod', emoji);
      await refresh();
      return pod;
    },
    [db, refresh]
  );

  const joinPodByCode = useCallback(
    async (code: string) => {
      const me = meRef.current;
      if (!me) throw new Error('No profile yet');
      const pod = await q.findPodByCode(db, code.trim());
      if (!pod) return null;
      if ((await q.memberCount(db, pod.id)) >= q.POD_MAX_MEMBERS) return null;
      await q.addMember(db, pod.id, me.id);
      await refresh();
      return pod;
    },
    [db, refresh]
  );

  const leavePod = useCallback(
    async (podId: string) => {
      const me = meRef.current;
      if (!me) return;
      await q.leavePod(db, podId, me.id);
      await refresh();
    },
    [db, refresh]
  );

  const saveTodayPhoto = useCallback(
    async ({ uri, angle, width, height }: { uri: string; angle: Angle; width?: number; height?: number }) => {
      const me = meRef.current;
      if (!me) throw new Error('No profile yet');
      const day = toDayKey();
      const checkin = await q.ensureCheckIn(db, me.id, day);
      const stored = await storeCheckInPhoto(uri, day, angle, width, height);

      const previous = (await q.photosFor(db, checkin.id)).find((p) => p.angle === angle);
      await q.setPhoto(db, checkin.id, angle, stored.uri, stored.width, stored.height);
      if (previous?.uri && previous.uri !== stored.uri) deleteStoredPhoto(previous.uri);

      await refresh();
    },
    [db, refresh]
  );

  const removeTodayPhoto = useCallback(
    async (angle: Angle) => {
      if (!todayCheckIn) return;
      const photo = (await q.photosFor(db, todayCheckIn.id)).find((p) => p.angle === angle);
      if (!photo) return;
      await db.runAsync('DELETE FROM photos WHERE id = ?', photo.id);
      if (photo.uri) deleteStoredPhoto(photo.uri);
      // A check-in with no photos left is not a check-in.
      const rest = await q.photosFor(db, todayCheckIn.id);
      if (rest.length === 0 && !todayCheckIn.trained && !todayCheckIn.note) {
        await q.deleteCheckIn(db, todayCheckIn.id);
      }
      await refresh();
    },
    [db, todayCheckIn, refresh]
  );

  const setTrained = useCallback(
    async (trained: boolean) => {
      const me = meRef.current;
      if (!me) return;
      const checkin = todayCheckIn ?? (await q.ensureCheckIn(db, me.id, toDayKey()));
      await q.updateCheckIn(db, checkin.id, { trained: trained ? 1 : 0 });
      await refresh();
    },
    [db, todayCheckIn, refresh]
  );

  const setNote = useCallback(
    async (note: string) => {
      const me = meRef.current;
      if (!me) return;
      const checkin = todayCheckIn ?? (await q.ensureCheckIn(db, me.id, toDayKey()));
      await q.updateCheckIn(db, checkin.id, { note: note.trim() ? note : null });
      await refresh();
    },
    [db, todayCheckIn, refresh]
  );

  const react = useCallback(
    async (checkinId: string, emoji: string) => {
      const me = meRef.current;
      if (!me) return;
      await q.toggleReaction(db, checkinId, me.id, emoji);
      await refresh();
    },
    [db, refresh]
  );

  const syncHealth = useCallback(async () => {
    const me = meRef.current;
    if (!me) return 0;
    const provider = healthProvider();
    const granted = await provider.requestPermissions().catch(() => false);
    if (!granted) return 0;
    const samples = await syncRecentHealth(30);
    for (const s of samples) {
      await q.upsertMetric(db, me.id, s.day, {
        weight_kg: s.weightKg,
        calories_in: s.caloriesIn,
        source: provider.id,
      });
    }
    await q.writeSetting(db, 'health_connected', 1);
    await refresh();
    return samples.length;
  }, [db, refresh]);

  const setReminders = useCallback(
    async (on: boolean, hour?: number) => {
      const targetHour = hour ?? settings.reminder_hour;
      if (!on) {
        await cancelDailyReminder();
        await setSetting('reminders_on', 0);
        return false;
      }
      const granted = await requestReminderPermission();
      if (!granted) {
        await setSetting('reminders_on', 0);
        return false;
      }
      await scheduleDailyReminder(targetHour);
      await setSetting('reminder_hour', targetHour);
      await setSetting('reminders_on', 1);
      return true;
    },
    [settings.reminder_hour, setSetting]
  );

  const seedDemoPod = useCallback(async () => {
    const me = meRef.current;
    if (!me) return;
    await loadDemoPod(db, me.id);
    await refresh();
  }, [db, refresh]);

  const clearDemoData = useCallback(async () => {
    const me = meRef.current;
    if (!me) return;
    await removeDemoData(db, me.id);
    await refresh();
  }, [db, refresh]);

  const resetEverything = useCallback(async () => {
    const rows = await db.getAllAsync<{ uri: string | null }>('SELECT uri FROM photos');
    for (const r of rows) if (r.uri) deleteStoredPhoto(r.uri);
    await cancelDailyReminder();
    await q.wipeAll(db);
    await refresh();
  }, [db, refresh]);

  const timeline = useCallback(
    async (angle: Angle) => (me ? q.myTimeline(db, me.id, angle) : []),
    [db, me]
  );

  const feedForPod = useCallback(
    async (podId: string) => {
      if (!me) return { items: [], missing: [] };
      const day = toDayKey();
      return {
        items: await q.feedForDay(db, me.id, day, podId),
        missing: await q.missingForDay(db, me.id, day, podId),
      };
    },
    [db, me]
  );

  const members = useCallback(async (podId: string) => q.podMembers(db, podId), [db]);

  const value = useMemo<Store>(
    () => ({
      ready,
      session,
      authReady,
      me,
      settings,
      pods,
      today,
      todayCheckIn,
      todayPhotos,
      todayMetrics,
      streak,
      loggedDays,
      feed,
      missing,
      healthLabel: healthProvider().label,
      refresh,
      signUp,
      signUpWithEmail,
      signInWithEmail,
      signOut,
      setSetting,
      createPod,
      joinPodByCode,
      leavePod,
      saveTodayPhoto,
      removeTodayPhoto,
      setTrained,
      setNote,
      react,
      syncHealth,
      setReminders,
      seedDemoPod,
      clearDemoData,
      resetEverything,
      timeline,
      feedForPod,
      members,
    }),
    [
      ready,
      session,
      authReady,
      me,
      settings,
      pods,
      today,
      todayCheckIn,
      todayPhotos,
      todayMetrics,
      streak,
      loggedDays,
      feed,
      missing,
      refresh,
      signUp,
      signUpWithEmail,
      signInWithEmail,
      signOut,
      setSetting,
      createPod,
      joinPodByCode,
      leavePod,
      saveTodayPhoto,
      removeTodayPhoto,
      setTrained,
      setNote,
      react,
      syncHealth,
      setReminders,
      seedDemoPod,
      clearDemoData,
      resetEverything,
      timeline,
      feedForPod,
      members,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside AppStoreProvider');
  return ctx;
}

/** Yesterday, for the ghost-overlay label. */
export const yesterdayKey = () => addDays(toDayKey(), -1);
