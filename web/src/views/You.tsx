import { BellRing, ExternalLink, LogOut, Sparkles, Trash2, Volume2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { Avatar, ProUpsell, Toggle } from '../components';
import {
  deleteAccount,
  isPro,
  leavePod,
  listPods,
  updateProfile,
  type Pod,
  type Profile,
} from '../lib/api';
import { getManagementUrl } from '../lib/billing';
import { setPrefs, usePrefs } from '../lib/prefs';
import { feedback, play } from '../lib/sfx';
import { supabase } from '../lib/supabase';
import { forgetPushOnSignOut, pushSupported } from '../lib/push';
import {
  sendTestNotification,
  systemNotifyState,
  turnOffNotifications,
  turnOnNotifications,
  useNotify,
  type SystemNotifyState,
} from '../notify';

export default function YouView({
  me,
  active,
  onProfileChanged,
}: {
  me: Profile;
  active: boolean;
  onProfileChanged: () => void;
}) {
  const [pods, setPods] = useState<(Pod & { memberCount: number })[]>([]);
  const [name, setName] = useState(me.display_name);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setPods(await listPods());
    const { data } = await supabase.auth.getUser();
    setEmail(data.user?.email ?? null);
  }, []);

  useEffect(() => {
    if (!active) return;
    void load().catch(console.error);
  }, [active, load]);

  const patch = async (fields: Parameters<typeof updateProfile>[0]) => {
    await updateProfile(fields);
    onProfileChanged();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>You</h1>
        <p className="caption" style={{ marginTop: 2 }}>
          Your name, your rules, your account.
        </p>
      </div>

      <div className="card">
        <div className="row">
          <Avatar id={me.id} name={me.display_name} size={48} />
          <div style={{ flex: 1 }}>
            <strong>{me.display_name}</strong>
            <p className="caption">{email ?? ''}</p>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={28} aria-label="Display name" />
          <button
            className="btn-secondary"
            disabled={name.trim().length < 2 || name.trim() === me.display_name || busy === 'name'}
            onClick={async () => {
              setBusy('name');
              try {
                await patch({ display_name: name.trim() });
              } finally {
                setBusy(null);
              }
            }}
          >
            Save
          </button>
        </div>
      </div>

      <div className="card">
        <p className="eyebrow">Privacy</p>
        <p className="caption" style={{ marginTop: 2 }}>
          These apply to every squad at once. One photo goes out unmodified, so a per-squad setting would be a
          promise the app could not keep.
        </p>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <div>
            <strong>Blur my face</strong>
            <p className="caption">Applied on every photo your squads see</p>
          </div>
          <Toggle on={me.blur_face} onChange={(v) => void patch({ blur_face: v })} />
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <div>
            <strong>Share "trained today"</strong>
            <p className="caption">The toggle and your note</p>
          </div>
          <Toggle on={me.share_trained} onChange={(v) => void patch({ share_trained: v })} />
        </div>
      </div>

      <AlertsCard />

      {isPro(me) ? (
        <div className="card">
          <div className="row">
            <div className="icon-badge">
              <Sparkles size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <strong>GymShot Pro</strong>
              <p className="caption">
                Active until {me.pro_until ? new Date(me.pro_until).toLocaleDateString() : ''}
              </p>
            </div>
            <button
              className="btn-secondary row"
              style={{ gap: 6, fontSize: 13, padding: '8px 14px' }}
              onClick={async () => {
                const url = await getManagementUrl(me.id).catch(() => null);
                if (url) window.open(url, '_blank');
                else window.alert('No store subscription to manage on this account.');
              }}
            >
              <ExternalLink size={13} /> Manage
            </button>
          </div>
        </div>
      ) : (
        <ProUpsell reason="Every squad you want, plus exports." userId={me.id} />
      )}

      {pods.length > 0 ? (
        <div className="card">
          <p className="eyebrow">Squads</p>
          {pods.map((p) => (
            <div key={p.id} className="row" style={{ marginTop: 12 }}>
              <span style={{ fontSize: 20 }}>{p.emoji}</span>
              <div style={{ flex: 1 }}>
                <strong>{p.name}</strong>
                <p className="caption">
                  {p.memberCount} member{p.memberCount === 1 ? '' : 's'}
                </p>
              </div>
              <button
                className="btn-ghost"
                style={{ fontSize: 13, padding: '6px 10px' }}
                onClick={async () => {
                  if (!window.confirm(`Leave ${p.name}? Your check-ins stay yours; the squad stops seeing them.`))
                    return;
                  await leavePod(p.id);
                  await load();
                }}
              >
                Leave
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card">
        <p className="eyebrow">Account</p>
        <button
          className="btn-secondary row"
          style={{ gap: 8, marginTop: 12 }}
          onClick={async () => {
            // Before signing out: the device must stop getting this
            // account's pushes, and deleting the row needs the session.
            await forgetPushOnSignOut();
            await supabase.auth.signOut();
          }}
        >
          <LogOut size={15} /> Sign out
        </button>
        {!confirmDelete ? (
          <button
            className="btn-ghost row"
            style={{ gap: 8, marginTop: 8, color: 'var(--accent-ink)' }}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={15} /> Delete my account
          </button>
        ) : (
          <div className="card-flat" style={{ marginTop: 10 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Delete everything?</p>
            <p className="caption" style={{ marginTop: 4 }}>
              Every photo, check-in, and squad you own is permanently removed. This cannot be undone.
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn-danger"
                disabled={busy === 'delete'}
                onClick={async () => {
                  setBusy('delete');
                  try {
                    await deleteAccount();
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : 'Could not delete the account.');
                    setBusy(null);
                  }
                }}
              >
                {busy === 'delete' ? 'Deleting...' : 'Delete forever'}
              </button>
              <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                Keep my account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PERMISSION_NOTE: Record<SystemNotifyState, string | null> = {
  granted: null,
  default: null,
  denied: 'Blocked in this browser. Allow notifications for this site in the browser settings, then come back.',
  unsupported: 'This browser cannot show system notifications. Activity still appears in the bell.',
  'needs-install': 'On iPhone, tap Share, then Add to Home Screen, and open GymShot from there to allow notifications.',
};

/** Sound, haptics, and notifications. These belong to this device, not the
 *  account: a laptop can stay quiet while the phone chimes. */
function AlertsCard() {
  const prefs = usePrefs();
  const { notify } = useNotify();
  const [permission, setPermission] = useState<SystemNotifyState>(systemNotifyState);
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  const systemOn = prefs.notifications && permission === 'granted';

  const toggleSystem = async (on: boolean) => {
    if (!on) {
      feedback('toggle');
      await turnOffNotifications();
      return;
    }
    const next = await turnOnNotifications();
    setPermission(next);
    if (next === 'granted') {
      feedback('toggle');
      void sendTestNotification();
    }
  };

  return (
    <div className="card">
      <p className="eyebrow">Sound and notifications</p>
      <p className="caption" style={{ marginTop: 2 }}>
        Set per device. Your phone can chime while your laptop stays quiet.
      </p>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
        <div className="row" style={{ gap: 10 }}>
          <Volume2 size={18} style={{ color: 'var(--ink-soft)' }} />
          <div>
            <strong>Sounds</strong>
            <p className="caption">Shutter, countdown, reactions, and chimes</p>
          </div>
        </div>
        <Toggle
          on={prefs.sounds}
          onChange={(v) => {
            setPrefs({ sounds: v });
            if (v) play('celebrate');
          }}
        />
      </div>

      {canVibrate ? (
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <div style={{ paddingLeft: 28 }}>
            <strong>Haptics</strong>
            <p className="caption">A small buzz on taps and arrivals</p>
          </div>
          <Toggle
            on={prefs.haptics}
            onChange={(v) => {
              setPrefs({ haptics: v });
              if (v) navigator.vibrate?.([20, 40, 20]);
            }}
          />
        </div>
      ) : null}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
        <div className="row" style={{ gap: 10 }}>
          <BellRing size={18} style={{ color: 'var(--ink-soft)' }} />
          <div>
            <strong>System notifications</strong>
            <p className="caption">
              {pushSupported()
                ? 'Posts, reactions, nudges, and your reminder - even with GymShot closed'
                : 'Posts, reactions, and nudges while GymShot is in the background'}
            </p>
          </div>
        </div>
        <Toggle on={systemOn} onChange={(v) => void toggleSystem(v)} />
      </div>
      {PERMISSION_NOTE[permission] ? (
        <p className="caption" style={{ marginTop: 6, paddingLeft: 28, color: 'var(--ink-soft)' }}>
          {PERMISSION_NOTE[permission]}
        </p>
      ) : null}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
        <div style={{ paddingLeft: 28 }}>
          <strong>Daily reminder</strong>
          <p className="caption">Only if you have not posted yet</p>
        </div>
        <Toggle
          on={prefs.reminder}
          onChange={(v) => {
            setPrefs({ reminder: v });
            feedback('toggle');
          }}
        />
      </div>
      {prefs.reminder ? (
        <label className="row member-in" style={{ gap: 10, marginTop: 8, paddingLeft: 28 }}>
          <span className="caption" style={{ color: 'var(--ink-soft)' }}>Remind me at</span>
          <input
            type="time"
            value={prefs.reminderAt}
            onChange={(e) => e.target.value && setPrefs({ reminderAt: e.target.value })}
            style={{ width: 'auto', padding: '6px 10px', fontSize: 14 }}
          />
        </label>
      ) : null}

      <button
        className="btn-ghost"
        style={{ marginTop: 12, fontSize: 13, padding: '6px 0 0 28px' }}
        onClick={() =>
          notify({
            kind: 'reaction',
            emoji: '\u{1F525}',
            title: 'This is what a reaction looks like',
            body: 'Tap a toast to jump to where it happened.',
            ephemeral: true,
          })
        }
      >
        Preview a notification
      </button>
    </div>
  );
}
