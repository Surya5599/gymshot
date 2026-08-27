import { BellRing, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, Crown, Dumbbell, Flame, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { Avatar, ProUpsell } from '../components';
import {
  approveJoinRequest,
  cancelJoinRequest,
  createPod,
  declineJoinRequest,
  incomingJoinRequests,
  listPods,
  myJoinRequests,
  myNudgesSent,
  nudge,
  podFeed,
  REACTIONS,
  squadStreaks,
  requestJoinByCode,
  isPro,
  toggleReaction,
  type FeedEntry,
  type IncomingJoinRequest,
  type MyJoinRequest,
  type Pod,
  type Profile,
} from '../lib/api';
import { toDayKey } from '../lib/date';
import { supabase } from '../lib/supabase';

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
        <div
          key={p.id}
          className="card row"
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          aria-label={`Open squad ${p.name}`}
          onClick={() => setOpen(p)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(p);
            }
          }}
        >
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
                aria-label="Decline request"
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

      {/* Free tier is one squad; the server enforces this too. */}
      {pods.length >= 1 && !isPro(me) ? (
        <ProUpsell reason="You are in your free squad. More squads come with Pro." userId={me.id} />
      ) : (
        <>
          <NewPod onDone={() => void load()} />
          <JoinPod onDone={() => void load()} />
        </>
      )}
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
  const [members, setMembers] = useState<Profile[]>([]);
  const [streaks, setStreaks] = useState<Map<string, number>>(new Map());
  const [nudged, setNudged] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [feed, sent, str] = await Promise.all([
      podFeed(pod.id, today),
      myNudgesSent(pod.id, today),
      squadStreaks(pod.id).catch(() => new Map<string, number>()),
    ]);
    setEntries(feed.entries);
    setWaiting(feed.waiting);
    setMembers(feed.members);
    setStreaks(str);
    setNudged(sent);
    setLoaded(true);
  }, [pod.id, today]);

  useEffect(() => {
    void load().catch(console.error);
  }, [load]);

  // Live thread: whenever a squad-visible row changes, refresh shortly after.
  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load().catch(() => {}), 400);
    };
    const channel = supabase
      .channel(`pod-${pod.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkin_photos' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, refresh)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [pod.id, load]);

  const myEntry = entries.find((e) => e.author.id === me.id);
  const postedAt = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row">
        <button className="btn-ghost row" style={{ padding: '6px 10px', gap: 4 }} onClick={onBack}>
          <ChevronLeft size={16} /> Back
        </button>
        <span style={{ fontSize: 22 }}>{pod.emoji}</span>
        <div style={{ flex: 1 }}>
          <strong>{pod.name}</strong>
          <p className="caption">invite code {pod.invite_code}</p>
        </div>
        <button
          className="btn-ghost row"
          style={{ padding: '6px 10px', fontSize: 13, gap: 5 }}
          aria-label="Copy invite code"
          onClick={async () => {
            await navigator.clipboard.writeText(pod.invite_code).catch(() => {});
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Everyone in the squad, visible to everyone in the squad. */}
      {members.length > 0 ? (
        <div className="card-flat" style={{ padding: 12 }}>
          <button
            className="btn-ghost row"
            style={{ width: '100%', padding: 4, gap: 8, justifyContent: 'flex-start' }}
            onClick={() => setShowMembers(!showMembers)}
          >
            <span className="row" style={{ gap: 0 }}>
              {members.slice(0, 6).map((m, i) => (
                <span key={m.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                  <Avatar id={m.id} name={m.display_name} size={30} />
                </span>
              ))}
            </span>
            <span className="caption" style={{ flex: 1, textAlign: 'left' }}>
              {members.length} of 8 members
            </span>
            <ChevronDown size={16} style={{ transform: showMembers ? 'rotate(180deg)' : 'none' }} />
          </button>
          {showMembers
            ? members.map((m) => (
                <div key={m.id} className="row" style={{ marginTop: 10, paddingLeft: 4 }}>
                  <Avatar id={m.id} name={m.display_name} size={30} />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>
                    {m.display_name}
                    {m.id === me.id ? ' (you)' : ''}
                  </span>
                  {(streaks.get(m.id) ?? 0) > 0 ? (
                    <span className="caption row" style={{ gap: 3, color: 'var(--accent-ink)' }}>
                      <Flame size={13} /> {streaks.get(m.id)}
                    </span>
                  ) : null}
                  {m.id === pod.created_by ? (
                    <span className="caption row" style={{ gap: 4 }}>
                      <Crown size={13} /> owner
                    </span>
                  ) : null}
                </div>
              ))
            : null}
        </div>
      ) : null}

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
              <span className="caption">
                {mine ? 'you' : entry.author.display_name} - {postedAt(entry.checkin.created_at)}
              </span>
              <div
                className={`bubble${mine ? ' mine' : ''}`}
                style={{ cursor: mine ? 'default' : 'pointer' }}
                role={mine ? undefined : 'button'}
                tabIndex={mine ? undefined : 0}
                aria-label={mine ? undefined : `React to ${entry.author.display_name}'s check-in`}
                onClick={() => {
                  if (!mine) setPickerFor(pickerFor === entry.checkin.id ? null : entry.checkin.id);
                }}
                onKeyDown={(e) => {
                  if (!mine && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setPickerFor(pickerFor === entry.checkin.id ? null : entry.checkin.id);
                  }
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
                      aria-label={`React with ${emoji}`}
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

      {/* The waiting row is the accountability mechanic - the gap gets named,
          and anyone can nudge the people it names. */}
      {loaded && waiting.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="dots">
              <span />
              <span />
              <span />
            </span>
            <span className="caption">
              waiting on {waiting.map((w) => (w.id === me.id ? 'you' : w.display_name)).join(', ')}
            </span>
          </div>
          {waiting
            .filter((w) => w.id !== me.id)
            .map((w) => (
              <div key={w.id} className="row" style={{ marginTop: 10 }}>
                <Avatar id={w.id} name={w.display_name} size={30} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{w.display_name}</span>
                {nudged.has(w.id) ? (
                  <span className="caption row" style={{ gap: 4 }}>
                    <Check size={13} /> nudged
                  </span>
                ) : (
                  <button
                    className="btn-secondary row"
                    style={{ padding: '6px 14px', fontSize: 13, gap: 5 }}
                    onClick={async () => {
                      await nudge(pod.id, w.id, today).catch(() => {});
                      setNudged(new Set([...nudged, w.id]));
                    }}
                  >
                    <BellRing size={13} /> Nudge
                  </button>
                )}
              </div>
            ))}
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
