import { Camera } from 'lucide-react';
import React, { useState } from 'react';

import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

export default function AuthView() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const valid = /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 6;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          setNotice('Check your email for a confirmation link, then sign in.');
          setMode('signin');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 48, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
      <div className="icon-badge" style={{ width: 54, height: 54, borderRadius: 16 }}>
        <Camera size={26} strokeWidth={2.4} />
      </div>
      <h1 className="wordmark" style={{ fontSize: 34, marginTop: 18 }}>
        Gym<span>Shot</span>
      </h1>
      <p className="notice" style={{ marginTop: 8 }}>
        {mode === 'signin'
          ? 'Welcome back. Sign in to pick up your streak.'
          : 'One account, so your squad knows it is really you.'}
      </p>

      <h3 style={{ marginTop: 32 }}>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h3>
      <input
        style={{ marginTop: 12 }}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        autoComplete="email"
      />
      <input
        style={{ marginTop: 10 }}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (6+ characters)"
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && valid && !busy) void submit();
        }}
      />

      {error ? <p className="error" style={{ marginTop: 10 }}>{error}</p> : null}
      {notice ? <p className="notice" style={{ marginTop: 10 }}>{notice}</p> : null}

      <button
        className="btn-primary"
        style={{ width: '100%', marginTop: 18 }}
        disabled={!valid || busy}
        onClick={() => void submit()}
      >
        {busy ? '...' : mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>
      <button
        className="btn-ghost"
        style={{ width: '100%', marginTop: 8, fontSize: 14 }}
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
          setNotice(null);
        }}
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
