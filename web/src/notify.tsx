import { useMutation, useQuery } from 'convex/react';
import { AtSign, BellRing, Camera, Flame, Heart, Info, UserPlus } from 'lucide-react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../convex/_generated/api';
import { getPrefs, setPrefs } from './lib/prefs';
import { disablePush, enablePush, pushAvailable } from './lib/push';
import { feedback, type Cue } from './lib/sfx';

/**
 * One notification system with four outlets, so every event is announced
 * the same way wherever it comes from:
 *   - a toast that slides in at the top while the app is in front,
 *   - the inbox behind the header bell (kept on the server, same everywhere),
 *   - a system notification when the tab is in the background,
 *   - the installed app's icon badge.
 */

export type Tab = 'today' | 'pods' | 'journey' | 'you';
export type NoticeKind = 'post' | 'reaction' | 'nudge' | 'reminder' | 'join' | 'info';

export type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body?: string;
  /** Leading emoji, shown instead of the kind's icon. */
  emoji?: string;
  tab?: Tab;
  at: number;
  read: boolean;
};

type NewNotice = Omit<Notice, 'id' | 'at' | 'read'> & {
  silent?: boolean;
  /** Also show a system notification if the tab is hidden. */
  system?: boolean;
};

type Ctx = {
  notify: (n: NewNotice) => void;
  inbox: Notice[];
  unread: number;
  markAllRead: () => void;
  clearInbox: () => void;
};

const NotifyContext = createContext<Ctx | null>(null);

export function useNotify(): Ctx {
  const c = useContext(NotifyContext);
  if (!c) throw new Error('useNotify outside NotificationProvider');
  return c;
}

const CUE: Record<NoticeKind, Cue> = {
  post: 'chime',
  reaction: 'pop',
  nudge: 'nudge',
  reminder: 'chime',
  join: 'chime',
  info: 'tap',
};

type Toast = Notice & { leaving?: boolean };

/**
 * The inbox lives on the server (convex/notifications.ts), so it is the same
 * on every device and fills in live. This provider watches it: anything new
 * that arrives while the app is open becomes a toast with its sound; while
 * the tab is hidden, a system notification - unless web push is on, in
 * which case the push already covered it.
 *
 * notify() is for client-only moments ("Nudged Jules", "Note saved"): a
 * toast, never an inbox row.
 */
export function NotificationProvider({ onNavigate, children }: { onNavigate: (tab: Tab) => void; children: React.ReactNode }) {
  const rows = useQuery(api.notifications.list);
  const markAllReadMutation = useMutation(api.notifications.markAllRead);
  const clearMutation = useMutation(api.notifications.clear);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<string> | null>(null);

  const inbox = useMemo<Notice[]>(
    () =>
      (rows ?? []).map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        emoji: n.emoji,
        tab: n.tab,
        at: n.at,
        read: n.read,
      })),
    [rows]
  );
  const unread = inbox.filter((n) => !n.read).length;

  // The installed app's icon carries the unread count (Badging API).
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread > 0) void nav.setAppBadge?.(unread).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 260);
  }, []);

  const show = useCallback(
    (notice: Notice, opts: { silent?: boolean; system?: boolean } = {}) => {
      if (document.visibilityState === 'hidden') {
        if (opts.system && !getPrefs().push) void showSystemNotification(notice);
        return;
      }
      if (!opts.silent) feedback(CUE[notice.kind]);
      setToasts((t) => [...t.slice(-2), notice]);
      window.setTimeout(() => dismiss(notice.id), 4200);
    },
    [dismiss]
  );

  // Announce server notices that are new since the app opened. The first
  // load only sets the baseline - opening the app is not an event.
  useEffect(() => {
    if (!rows) return;
    if (seen.current === null) {
      seen.current = new Set(rows.map((n) => n.id));
      return;
    }
    for (const n of [...inbox].reverse()) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (!n.read) show(n, { system: true });
    }
  }, [rows, inbox, show]);

  const notify = useCallback(
    (n: NewNotice) => {
      const id = `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      show(
        { id, kind: n.kind, title: n.title, body: n.body, emoji: n.emoji, tab: n.tab, at: Date.now(), read: true },
        { silent: n.silent, system: n.system }
      );
    },
    [show]
  );

  const value = useMemo<Ctx>(
    () => ({
      notify,
      inbox,
      unread,
      markAllRead: () => void markAllReadMutation().catch(() => {}),
      clearInbox: () => void clearMutation().catch(() => {}),
    }),
    [notify, inbox, unread, markAllReadMutation, clearMutation]
  );

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.id}
            className={`toast${t.leaving ? ' leaving' : ''}`}
            onClick={() => {
              if (t.tab) onNavigate(t.tab);
              dismiss(t.id);
            }}
          >
            <NoticeIcon notice={t} />
            <span className="toast-text">
              <strong>{t.title}</strong>
              {t.body ? <span>{t.body}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </NotifyContext.Provider>
  );
}

export function NoticeIcon({ notice }: { notice: Pick<Notice, 'kind' | 'emoji'> }) {
  const icon = {
    post: <Camera size={17} />,
    reaction: <Heart size={17} />,
    nudge: <BellRing size={17} />,
    reminder: <Flame size={17} />,
    join: <UserPlus size={17} />,
    info: <Info size={17} />,
  }[notice.kind] ?? <AtSign size={17} />;
  return <span className={`notice-icon k-${notice.kind}`}>{notice.emoji ? <span className="emoji">{notice.emoji}</span> : icon}</span>;
}

/** Relative time for the inbox, in the app's plain voice. */
export function ago(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/* ------------------------------------------------- system notifications */

export type SystemNotifyState = 'granted' | 'denied' | 'default' | 'unsupported' | 'needs-install';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function systemNotifyState(): SystemNotifyState {
  if (!('Notification' in window)) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  return Notification.permission as SystemNotifyState;
}

export async function requestSystemNotifications(): Promise<SystemNotifyState> {
  const state = systemNotifyState();
  if (state !== 'default') return state;
  return (await Notification.requestPermission()) as SystemNotifyState;
}

/** The one way notifications get switched on: ask permission, then
 *  subscribe to web push where it is configured. */
export async function turnOnNotifications(): Promise<SystemNotifyState> {
  const state = await requestSystemNotifications();
  if (state !== 'granted') return state;
  setPrefs({ notifications: true });
  if (await pushAvailable()) await enablePush().catch((e) => console.error('push subscribe failed', e));
  return state;
}

export async function turnOffNotifications(): Promise<void> {
  setPrefs({ notifications: false });
  await disablePush().catch(() => {});
}

async function showSystemNotification(n: Notice): Promise<void> {
  if (!getPrefs().notifications || systemNotifyState() !== 'granted') return;
  const title = n.emoji ? `${n.emoji} ${n.title}` : n.title;
  const opts: NotificationOptions = {
    body: n.body,
    icon: '/icon-192.png',
    badge: '/favicon.png',
    tag: n.kind,
    data: { tab: n.tab ?? 'today' },
  };
  try {
    // Android Chrome only allows notifications through a service worker.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {
    // A notification we cannot show is still in the inbox.
  }
}

/** Test ping from settings, shown even while the app is in front. */
export async function sendTestNotification(): Promise<boolean> {
  if (systemNotifyState() !== 'granted') return false;
  const reg = await navigator.serviceWorker?.getRegistration();
  const opts: NotificationOptions = { body: 'This is how a nudge from your squad will look.', icon: '/icon-192.png', tag: 'test' };
  if (reg) await reg.showNotification('GymShot notifications are on', opts);
  else new Notification('GymShot notifications are on', opts);
  return true;
}
