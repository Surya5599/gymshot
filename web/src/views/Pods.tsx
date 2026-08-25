import { Check, ChevronLeft, ChevronRight, Clock, Dumbbell, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { Avatar } from '../components';
import {
  approveJoinRequest,
  cancelJoinRequest,
  createPod,
  declineJoinRequest,
  incomingJoinRequests,
  listPods,
  myJoinRequests,
  podFeed,
  REACTIONS,
  requestJoinByCode,
  toggleReaction,
  type FeedEntry,
  type IncomingJoinRequest,
  type MyJoinRequest,
  type Pod,
  type Profile,
} from '../lib/api';
import { toDayKey } from '../lib/date';

const POD_EMOJI = ['\u{1F3CB}\u{FE0F}', '\u{1F525}', '\u{1F962}', '\u{1F31F}', '\u{1F436}', '\u{1F3AF}'];

export default function PodsView({ me, active }: { me: Profile; active: boolean }) {
  const [pods, setPods] = useState<(Pod & { memberCount: number })[]>([]);
  const [pending, setPending] = useState<MyJoinRequest[]>([]);
  const [incoming, setIncoming] = useState<IncomingJoinRequest[]>([]);
  const [open, setOpen] = useState<Pod | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, mine, inc] = await Promise.all([listPods(), myJoinRequests(), incomingJoinRequests()]);
    setPods(p);
    setPending(mine);
    setIncoming(inc);
  }, []);

  useEffect(() => {
    if (!active) return;
    void load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [active, load]);

  if (open) return <PodThread pod={open} me={me} onBack={() => setOpen(null)} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Squad Up</h1>
        <p className="caption" style={{ marginTop: 2 }}>
          3 to 8 people. Invite-only, never discoverable.
        </p>
      </div>

      {pods.map((p) => (
        <div key={p.id} className="card row" style={{ cursor: 'pointer' }} onClick={() => setOpen(p)}>
          <span style={{ fontSize: 24 }}>{p.emoji}</span>
          <div style={{ flex: 1 }}>
            <strong>{p.name}</strong>
            <p className="caption">
              {p.memberCount} member{p.memberCount === 1 ? '' : 's'} - code {p.invite_code}
            </p>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--ink-faint)' }} />
        </div>
      ))}
      {pods.length === 0 ? <p className="notice">No squads yet. Start one or join with a code.</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {/* Requests waiting on my approval, across squads I own. */}
      {incoming.length > 0 ? (
        <div className="card">
          <p className="eyebrow">Join requests</p>
          {incoming.map((r) => (
            <div key={`${r.pod_id}-${r.user_id}`} className="row" style={{ marginTop: 12 }}>
              <Avatar id={r.user_id} name={r.display_name} />
              <div style={{ flex: 1 }}>
                <strong>{r.display_name}</strong>
                <p className="caption">
                  wants to join {r.pod_emoji} {r.pod_name}
                </p>
              </div>
              <button
                className="btn-primary row"
                style={{ padding: '7px 14px', fontSize: 13, gap: 5 }}
                onClick={async () => {
                  await approveJoinRequest(r.pod_id, r.user_id);
                  await load();
                }}
              >
                <Check size={14} /> Approve
              </button>
              <button
                className="btn-ghost"
                style={{ padding: 6 }}
                title="Decline"
                onClick={async () => {
                  await declineJoinRequest(r.pod_id, r.user_id);
                  await load();
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* My own requests still waiting on a squad owner. */}
      {pending.length > 0 ? (
        <div className="card-flat">
          <p className="eyebrow">Waiting for approval</p>
          {pending.map((r) => (
            <div key={r.pod_id} className="row" style={{ marginTop: 12 }}>
              <Clock size={16} style={{ color: 'var(--ink-faint)' }} />
              <div style={{ flex: 1 }}>
                <strong>
                  {r.emoji} {r.name}
                </strong>
                <p className="caption">The squad owner has to let you in.</p>
              </div>
              <button
                className="btn-ghost"
                style={{ padding: '6px 10px', fontSize: 13 }}
                onClick={async () => {
                  await cancelJoinRequest(r.pod_id);
                  await load();
                }}
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <NewPod onDone={() => void load()} />
      <JoinPod onDone={() => void load()} />
    </div>
  );
}

function NewPod({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(POD_EMOJI[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card-flat">
      <p className="eyebrow">New squad</p>
      <input
        style={{ marginTop: 10 }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Gym friends"
        maxLength={24}
      />
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        {POD_EMOJI.map((e) => (
          <button
            key={e}
            className="btn-ghost"
            style={{
              padding: 8,
              fontSize: 18,
              borderRadius: '50%',
              background: emoji === e ? 'var(--accent-soft)' : 'var(--surface)',
              border: emoji === e ? '1.5px solid var(--accent)' : '1px solid var(--border)',
            }}
            onClick={() => setEmoji(e)}
          >
            {e}
          </button>
        ))}
      </div>
      {error ? <p className="error" style={{ marginTop: 8 }}>{error}</p> : null}
      <button
        className="btn-primary"
        style={{ marginTop: 12 }}
        disabled={name.trim().length < 2 || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await createPod(name.trim(), emoji);
            setName('');
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create the squad.');
          } finally {
            setBusy(false);
          }
        }}
      >
        Create squad
      </button>
    </div>
  );
}

function JoinPod({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="card-flat">
      <p className="eyebrow">Have an invite code</p>
      <input
        style={{ marginTop: 10, letterSpacing: 4, fontWeight: 700, textTransform: 'uppercase' }}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABC123"
        maxLength={6}
      />
      {error ? <p className="error" style={{ marginTop: 8 }}>{error}</p> : null}
      {notice ? <p className="notice" style={{ marginTop: 8 }}>{notice}</p> : null}
      <button
        className="btn-secondary"
        style={{ marginTop: 12 }}
        disabled={code.length !== 6 || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          setNotice(null);
          try {
            const pod = await requestJoinByCode(code);
            setCode('');
            setNotice(`Request sent. ${pod.name}'s owner has to approve you.`);
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No squad with that code, or it is already full.');
          } finally {
            setBusy(false);
          }
        }}
      >
        Ask to join
      </button>
      <p className="caption" style={{ marginTop: 8 }}>
        A code alone does not get anyone in - the squad owner approves every join.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- thread */

function PodThread({ pod, me, onBack }: { pod: Pod; me: Profile; onBack: () => void }) {
  const today = toDayKey();
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [waiting, setWaiting] = useState<Profile[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const feed = await podFeed(pod.id, today);
    setEntries(feed.entries);
    setWaiting(feed.waiting);
    setLoaded(true);
  }, [pod.id, today]);

  useEffect(() => {
    void load().catch(console.error);
  }, [load]);

  const myEntry = entries.find((e) => e.author.id === me.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row">
        <button className="btn-ghost row" style={{ padding: '6px 10px', gap: 4 }} onClick={onBack}>
          <ChevronLeft size={16} /> Back
        </button>
        <span style={{ fontSize: 22 }}>{pod.emoji}</span>
        <div>
          <strong>{pod.name}</strong>
          <p className="caption">invite code {pod.invite_code}</p>
        </div>
      </div>

      <p className="caption" style={{ textAlign: 'center' }}>
        Today - the thread resets every day
      </p>

      {loaded && entries.length === 0 ? (
        <p className="notice" style={{ textAlign: 'center', marginTop: 12 }}>
          Nobody has posted yet today. Be the first.
        </p>
      ) : null}

      {entries.map((entry) => {
        const mine = entry.author.id === me.id;
        return (
          <div key={entry.checkin.id} className="row" style={{ alignItems: 'flex-end', flexDirection: mine ? 'row-reverse' : 'row' }}>
            {!mine ? <Avatar id={entry.author.id} name={entry.author.display_name} /> : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: mine ? 'flex-end' : 'flex-start', flex: 1 }}>
              {!mine ? <span className="caption">{entry.author.display_name}</span> : null}
              <div
                className={`bubble${mine ? ' mine' : ''}`}
                style={{ cursor: mine ? 'default' : 'pointer' }}
                onClick={() => {
                  if (!mine) setPickerFor(pickerFor === entry.checkin.id ? null : entry.checkin.id);
                }}
              >
                <div className="row" style={{ gap: 6, alignItems: 'stretch' }}>
                  {entry.photos.map((p) =>
                    p.url ? (
                      <div key={p.id} style={{ position: 'relative' }}>
                        <img src={p.url} alt={p.angle} style={{ width: entry.photos.length > 1 ? 120 : 200 }} />
                        {entry.author.blur_face ? <div className="blur-strip" style={{ borderRadius: 14 }} /> : null}
                      </div>
                    ) : null
                  )}
                </div>
                {entry.checkin.trained && entry.author.share_trained ? (
                  <p className="row" style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700, gap: 5 }}>
                    <Dumbbell size={14} /> Trained today
                  </p>
                ) : null}
                {entry.checkin.note ? <p style={{ margin: '6px 0 0', fontSize: 14 }}>{entry.checkin.note}</p> : null}
                {entry.reactions.length ? (
                  <span className="tapback">
                    {entry.reactions.map((r) => r.emoji).join(' ')}
                  </span>
                ) : null}
              </div>
              {pickerFor === entry.checkin.id ? (
                <div className="reaction-picker">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      className={entry.reactions.some((r) => r.user_id === me.id && r.emoji === emoji) ? 'chosen' : ''}
                      onClick={async () => {
                        await toggleReaction(entry.checkin.id, emoji);
                        setPickerFor(null);
                        await load();
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* The waiting row is the accountability mechanic - the gap gets named. */}
      {loaded && waiting.length > 0 ? (
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <span className="dots">
            <span />
            <span />
            <span />
          </span>
          <span className="caption">
            waiting on {waiting.map((w) => (w.id === me.id ? 'you' : w.display_name)).join(', ')}
          </span>
        </div>
      ) : null}

      {/* The composer is the one-per-day rule made physical. */}
      <div className="card-flat" style={{ textAlign: 'center', marginTop: 8 }}>
        {myEntry ? (
          <p className="notice">That is today. Come back tomorrow.</p>
        ) : (
          <p className="notice">
            Post today's photo from the <strong>Today</strong> tab - it lands in every squad you belong to.
          </p>
        )}
      </div>
    </div>
  );
}
