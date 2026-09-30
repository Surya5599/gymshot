import { useAuthActions } from '@convex-dev/auth/react';
import { Camera } from 'lucide-react';
import React, { useState } from 'react';

type Mode = 'signin' | 'signup';

/** Convex Auth reports failures as codes; say them in the app's voice. */
function friendly(e: unknown, mode: Mode): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/InvalidAccountId|InvalidSecret|Invalid credentials/i.test(raw)) {
    return mode === 'signin' ? 'That email and password do not match.' : 'Could not create that account.';
  }
  if (/already exists/i.test(raw)) return 'That email already has an account. Sign in instead.';
  if (/TooManyFailedAttempts|rate/i.test(raw)) return 'Too many tries. Wait a minute and try again.';
  if (/password/i.test(raw) && /8|length|short/i.test(raw)) return 'Passwords need at least 8 characters.';
  return 'Something went wrong. Try again.';
}

export default function AuthView() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const valid = /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 8;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await signIn('password', { email: email.trim().toLowerCase(), password, flow: mode === 'signin' ? 'signIn' : 'signUp' });
    } catch (e) {
      setError(friendly(e, mode));
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
        GymShot<span>.</span>
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
        placeholder="Password (8+ characters)"
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && valid && !busy) void submit();
        }}
      />

      {error ? <p className="error" role="alert" style={{ marginTop: 10 }}>{error}</p> : null}
      {notice ? <p className="notice" role="status" style={{ marginTop: 10 }}>{notice}</p> : null}

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
