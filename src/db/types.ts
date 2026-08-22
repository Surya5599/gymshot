import type { DayKey } from '@/lib/date';

export type Angle = 'front' | 'side' | 'back';
export const ANGLES: Angle[] = ['front', 'side', 'back'];

export type User = {
  id: string;
  display_name: string;
  is_me: 0 | 1;
};

export type Pod = {
  id: string;
  name: string;
  emoji: string;
  invite_code: string;
  created_at: string;
};

export type Photo = {
  id: string;
  checkin_id: string;
  angle: Angle;
  uri: string | null;
  width: number;
  height: number;
};

export type CheckIn = {
  id: string;
  user_id: string;
  day: DayKey;
  trained: 0 | 1;
  note: string | null;
  created_at: string;
};

export type ReactionRow = {
  id: string;
  checkin_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type MetricRow = {
  id: string;
  user_id: string;
  day: DayKey;
  weight_kg: number | null;
  calories_in: number | null;
  source: string;
};

/** A check-in joined with everything the UI needs to render one card. */
export type FeedItem = {
  checkin: CheckIn;
  user: User;
  photos: Photo[];
  reactions: ReactionRow[];
  metrics: MetricRow | null;
};

export type Settings = {
  /** Applies globally, not per pod - one photo goes to every pod unmodified. */
  blur_face: 0 | 1;
  share_weight: 0 | 1;
  share_calories: 0 | 1;
  share_trained: 0 | 1;
  /** When on, photos never leave the device even once sync is wired up. */
  local_only: 0 | 1;
  onboarded: 0 | 1;
  reminder_hour: number;
  reminders_on: 0 | 1;
  /** Self-timer delay in seconds for the shutter. 0 = off. */
  timer_seconds: number;
  health_connected: 0 | 1;
};
