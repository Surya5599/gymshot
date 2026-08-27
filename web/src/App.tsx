import type { Session } from '@supabase/supabase-js';
import { CalendarDays, Camera, Images, UserRound, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { getProfile, updateProfile, type Profile } from './lib/api';
import { supabase } from './lib/supabase';
import AuthView from './views/Auth';
import JourneyView from './views/Journey';
import PodsView from './views/Pods';
import TodayView from './views/Today';
import YouView from './views/You';

type Tab = 'today' | 'pods' | 'journey' | 'you';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>('today');

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

  if (!authReady) return null;
  if (!session) return <AuthView />;
  if (!profile) return <p className="notice" style={{ marginTop: 60, textAlign: 'center' }}>Loading...</p>;
  if (!profile.display_name.trim()) {
    return <NameGate onDone={(p) => setProfile(p)} />;
  }

  return (
    <>
      <header className="row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="icon-badge">
            <Camera size={20} strokeWidth={2.4} />
          </div>
          <h2 className="wordmark">
            GymShot<span>.</span>
          </h2>
        </div>
        <span className="caption">{profile.display_name}</span>
      </header>

      {/* All tabs stay mounted; hiding instead of unmounting keeps their
          state and decoded images, so switching back is instant. */}
      <div hidden={tab !== 'today'}>
        <TodayView active={tab === 'today'} />
      </div>
      <div hidden={tab !== 'pods'}>
        <PodsView me={profile} active={tab === 'pods'} />
      </div>
      <div hidden={tab !== 'journey'}>
        <JourneyView active={tab === 'journey'} me={profile} />
      </div>
      <div hidden={tab !== 'you'}>
        <YouView
          me={profile}
          active={tab === 'you'}
          onProfileChanged={() => void getProfile().then(setProfile).catch(console.error)}
        />
      </div>

      <nav className="tabbar">
        {(
          [
            ['today', 'Today', <CalendarDays key="i" size={15} />],
            ['pods', 'Squads', <Users key="i" size={15} />],
            ['journey', 'Journey', <Images key="i" size={15} />],
            ['you', 'You', <UserRound key="i" size={15} />],
          ] as [Tab, string, React.ReactNode][]
        ).map(([k, label, icon]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {icon}
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}

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
