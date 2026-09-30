import type { Session } from '@supabase/supabase-js';
import { Bell, BellOff, CalendarDays, Camera, Images, UserRound, Users, X } from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  checkinOwner,
  getProfile,
  myCheckin,
  myLoggedDays,
  profileName,
  updateProfile,
  type Profile,
} from './lib/api';
import { toDayKey } from './lib/date';
import { setPrefs, usePrefs } from './lib/prefs';
import { feedback } from './lib/sfx';
import { computeStreak } from './lib/streak';
import { supabase } from './lib/supabase';
import {
  ago,
  NoticeIcon,
  NotificationProvider,
  requestSystemNotifications,
  systemNotifyState,
  useNotify,
  type Tab,
} from './notify';
import AuthView from './views/Auth';
import JourneyView from './views/Journey';
import PodsView from './views/Pods';
import TodayView from './views/Today';
import YouView from './views/You';

const TABS: Tab[] = ['today', 'pods', 'journey', 'you'];

function initialTab(): Tab {
  const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
  return t && TABS.includes(t) ? t : 'today';
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    void getProfile().then(setProfile).catch(console.error);
  }, [session]);

  // A tapped system notification brings the app forward on its tab.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; tab?: Tab } | null;
      if (data?.type === 'open-tab' && data.tab && TABS.includes(data.tab)) setTab(data.tab);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  if (!authReady) return null;
  if (!session) return <AuthView />;
  if (!profile) return <p className="notice" style={{ marginTop: 60, textAlign: 'center' }}>Loading...</p>;
  if (!profile.display_name.trim()) {
    return <NameGate onDone={(p) => setProfile(p)} />;
  }

  return (
    <NotificationProvider userId={profile.id} onNavigate={setTab}>
      <Shell
        me={profile}
        tab={tab}
        setTab={setTab}
        onProfileChanged={() => void getProfile().then(setProfile).catch(console.error)}
      />
    </NotificationProvider>
  );
}

function Shell({
  me,
  tab,
  setTab,
  onProfileChanged,
}: {
  me: Profile;
  tab: Tab;
  setTab: (t: Tab) => void;
  onProfileChanged: () => void;
}) {
  const [inboxOpen, setInboxOpen] = useState(false);
  // Bumped by the shutter button; Today opens the booth when it changes.
  const [boothRequest, setBoothRequest] = useState(0);

  useLiveActivity(me);
  useDailyReminder();

  const go = (t: Tab) => {
    if (t !== tab) feedback('tap');
    setTab(t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <header className="row app-header">
        <div className="row" style={{ gap: 10 }}>
          <div className="icon-badge logo-badge">
            <Camera size={20} strokeWidth={2.4} />
          </div>
          <h2 className="wordmark">
            GymShot<span>.</span>
          </h2>
        </div>
        <BellButton onOpen={() => setInboxOpen(true)} />
      </header>

      {/* All tabs stay mounted; hiding instead of unmounting keeps their
          state and decoded images, so switching back is instant. Each pane
          replays its entrance when shown. */}
      <div className="tab-pane" hidden={tab !== 'today'}>
        <TodayView active={tab === 'today'} boothRequest={boothRequest} />
      </div>
      <div className="tab-pane" hidden={tab !== 'pods'}>
        <PodsView me={me} active={tab === 'pods'} />
      </div>
      <div className="tab-pane" hidden={tab !== 'journey'}>
        <JourneyView active={tab === 'journey'} me={me} />
      </div>
      <div className="tab-pane" hidden={tab !== 'you'}>
        <YouView me={me} active={tab === 'you'} onProfileChanged={onProfileChanged} />
      </div>

      <TabBar
        tab={tab}
        onChange={go}
        onShutter={() => {
          feedback('tap');
          setTab('today');
          setBoothRequest((n) => n + 1);
        }}
      />

      {inboxOpen ? <InboxSheet onClose={() => setInboxOpen(false)} onNavigate={go} /> : null}
    </>
  );
}

/* --------------------------------------------------------------- tab bar */

const TAB_ITEMS: [Tab, string, React.ReactNode][] = [
  ['today', 'Today', <CalendarDays key="i" size={17} />],
  ['pods', 'Squads', <Users key="i" size={17} />],
  ['journey', 'Journey', <Images key="i" size={17} />],
  ['you', 'You', <UserRound key="i" size={17} />],
];

function TabBar({ tab, onChange, onShutter }: { tab: Tab; onChange: (t: Tab) => void; onShutter: () => void }) {
  const refs = useRef(new Map<Tab, HTMLButtonElement>());
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  // The active pill slides between tabs rather than blinking.
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current.get(tab);
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    // Web fonts change label widths once they arrive.
    void document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [tab]);

  const button = ([k, label, icon]: (typeof TAB_ITEMS)[number]) => (
    <button
      key={k}
      ref={(el) => {
        if (el) refs.current.set(k, el);
      }}
      className={tab === k ? 'active' : ''}
      aria-current={tab === k ? 'page' : undefined}
      onClick={() => onChange(k)}
    >
      <span className="tab-icon">{icon}</span>
      <span className="tab-label">{label}</span>
    </button>
  );

  return (
    <nav className="tabbar">
      {pill ? <span className="tab-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} /> : null}
      {TAB_ITEMS.slice(0, 2).map(button)}
      <button className="tab-shutter" aria-label="Take today's photos" title="Take today's photos" onClick={onShutter}>
        <Camera size={22} strokeWidth={2.3} />
      </button>
      {TAB_ITEMS.slice(2).map(button)}
    </nav>
  );
}

/* ------------------------------------------------------------ bell + inbox */

function BellButton({ onOpen }: { onOpen: () => void }) {
  const { unread } = useNotify();
  const prev = useRef(unread);
  const [ring, setRing] = useState(0);

  useEffect(() => {
    if (unread > prev.current) setRing((r) => r + 1);
    prev.current = unread;
  }, [unread]);

  return (
    <button
      className="bell-button"
      aria-label={unread ? `Activity, ${unread} unread` : 'Activity'}
      onClick={() => {
        feedback('tap');
        onOpen();
      }}
    >
      <span key={ring} className={ring ? 'bell-ring' : ''} style={{ display: 'flex' }}>
        <Bell size={19} />
      </span>
      {unread > 0 ? (
        <span key={`b${unread}`} className="bell-badge">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </button>
  );
}

function InboxSheet({ onClose, onNavigate }: { onClose: () => void; onNavigate: (t: Tab) => void }) {
  const { inbox, markAllRead, clearInbox } = useNotify();
  const prefs = usePrefs();
  const [leaving, setLeaving] = useState(false);
  const [permission, setPermission] = useState(systemNotifyState);

  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, 220);
  }, [onClose]);

  // Opening the inbox is reading it.
  useEffect(() => {
    const t = window.setTimeout(markAllRead, 900);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
    // markAllRead changes identity with the inbox; run once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [close]);

  const systemOn = prefs.notifications && permission === 'granted';

  return (
    <div className={`sheet-backdrop${leaving ? ' leaving' : ''}`} onClick={close}>
      <div className="sheet" role="dialog" aria-label="Activity" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 22 }}>Activity</h2>
          <div className="row" style={{ gap: 4 }}>
            {inbox.length > 0 ? (
              <button className="btn-ghost" style={{ fontSize: 13, padding: '6px 10px' }} onClick={clearInbox}>
                Clear
              </button>
            ) : null}
            <button className="btn-ghost" style={{ padding: 8 }} aria-label="Close" onClick={close}>
              <X size={18} />
            </button>
          </div>
        </div>

        {!systemOn && permission !== 'unsupported' && permission !== 'denied' ? (
          <div className="card-flat row" style={{ marginTop: 12, padding: 14 }}>
            <BellOff size={18} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
            <span className="caption" style={{ flex: 1, color: 'var(--ink-soft)' }}>
              {permission === 'needs-install'
                ? 'On iPhone, add GymShot to your Home Screen to get notified when the app is closed.'
                : 'Get a heads-up when a squad-mate posts, reacts, or nudges you while GymShot is in the background.'}
            </span>
            {permission !== 'needs-install' ? (
              <button
                className="btn-primary"
                style={{ padding: '7px 14px', fontSize: 13 }}
                onClick={async () => {
                  const next = await requestSystemNotifications();
                  setPermission(next);
                  if (next === 'granted') {
                    setPrefs({ notifications: true });
                    feedback('toggle');
                  }
                }}
              >
                Turn on
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="inbox-list">
          {inbox.length === 0 ? (
            <div className="inbox-empty">
              <Bell size={26} />
              <p>Quiet so far. Posts, reactions, and nudges from your squads land here.</p>
            </div>
          ) : (
            inbox.map((n, i) => (
              <button
                key={n.id}
                className={`inbox-item${n.read ? '' : ' unread'}`}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                onClick={() => {
                  if (n.tab) onNavigate(n.tab);
                  close();
                }}
              >
                <NoticeIcon notice={n} />
                <span className="inbox-text">
                  <strong>{n.title}</strong>
                  {n.body ? <span>{n.body}</span> : null}
                </span>
                <span className="caption" style={{ whiteSpace: 'nowrap' }}>
                  {ago(n.at)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- activity sources */

/**
 * Squad activity, announced as it happens. RLS scopes realtime rows to what
 * I can already see, so this hears exactly my squads and nothing wider.
 */
function useLiveActivity(me: Profile) {
  const { notify } = useNotify();

  useEffect(() => {
    const today = () => toDayKey();
    const channel = supabase
      .channel('activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins' }, (p) => {
        const row = p.new as { user_id: string; day: string };
        if (row.user_id === me.id || row.day !== today()) return;
        void profileName(row.user_id).then((name) =>
          notify({
            kind: 'post',
            title: `${name} just checked in`,
            body: 'Their photos are in the squad thread.',
            tab: 'pods',
            key: `post-${row.user_id}-${row.day}`,
          })
        );
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (p) => {
        if (p.eventType === 'DELETE') return;
        const row = p.new as { checkin_id: string; user_id: string; emoji: string };
        if (row.user_id === me.id) return;
        void (async () => {
          if ((await checkinOwner(row.checkin_id)) !== me.id) return;
          const name = await profileName(row.user_id);
          notify({
            kind: 'reaction',
            emoji: row.emoji,
            title: `${name} reacted to your check-in`,
            tab: 'pods',
            key: `react-${row.checkin_id}-${row.user_id}`,
          });
        })().catch(() => {});
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nudges' }, (p) => {
        const row = p.new as { from_user: string; to_user: string; day: string };
        if (row.to_user !== me.id || row.day !== today()) return;
        void profileName(row.from_user).then((name) =>
          notify({
            kind: 'nudge',
            title: `${name} nudged you`,
            body: "Where's today's photo? Your squad is waiting.",
            tab: 'today',
            key: `nudge-${row.from_user}-${row.day}`,
          })
        );
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pod_join_requests' }, (p) => {
        const row = p.new as { user_id: string };
        if (row.user_id === me.id) return;
        notify({ kind: 'join', title: 'New join request', body: 'Someone wants into your squad.', tab: 'pods' });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me.id, notify]);
}

const REMINDED_KEY = 'gymshot.reminded';

/**
 * The daily nudge from the app itself, at the time chosen in You. It is a
 * timer in the open page, so it fires while GymShot is open or in a
 * background tab - not after the browser has closed it.
 */
function useDailyReminder() {
  const { notify } = useNotify();
  const { reminder, reminderAt } = usePrefs();

  useEffect(() => {
    if (!reminder) return;
    let timer: number | undefined;

    const fire = async () => {
      const day = toDayKey();
      if (localStorage.getItem(REMINDED_KEY) === day) return;
      const [mine, days] = await Promise.all([myCheckin(day), myLoggedDays()]);
      if (mine && mine.photos.length > 0) return;
      localStorage.setItem(REMINDED_KEY, day);
      const s = computeStreak(days, day);
      notify({
        kind: 'reminder',
        emoji: s.current > 0 ? '\u{1F525}' : '\u{1F4F8}',
        title: s.current > 0 ? `Your ${s.current}-day streak is on the line` : "Time for today's photo",
        body: s.current > 0 ? 'Post before midnight to keep it alive.' : 'Three angles, thirty seconds. Your squad is watching.',
        tab: 'today',
        key: `reminder-${day}`,
      });
    };

    const arm = () => {
      const [h, m] = reminderAt.split(':').map(Number);
      const now = new Date();
      const at = new Date(now);
      at.setHours(h || 0, m || 0, 0, 0);
      if (at <= now) at.setDate(at.getDate() + 1);
      timer = window.setTimeout(() => {
        void fire().catch(() => {}).finally(arm);
      }, at.getTime() - now.getTime());
    };

    arm();
    return () => window.clearTimeout(timer);
  }, [reminder, reminderAt, notify]);
}

/* -------------------------------------------------------------- name gate */

/** First sign-in on web: the pod needs a name for you before anything else. */
function NameGate({ onDone }: { onDone: (p: Profile) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({ display_name: name.trim() });
      onDone(await getProfile());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 60 }}>
      <p className="eyebrow">Almost there</p>
      <h1 style={{ fontSize: 28, marginTop: 6 }}>What should your squad call you?</h1>
      <input
        style={{ marginTop: 18 }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        maxLength={28}
      />
      <button
        className="btn-primary"
        style={{ marginTop: 18, width: '100%' }}
        disabled={name.trim().length < 2 || busy}
        onClick={() => void save()}
      >
        Continue
      </button>
    </div>
  );
}
