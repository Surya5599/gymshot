import { BellRing, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, Crown, Dumbbell, Flame, X } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import React, { useEffect, useState } from 'react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Avatar, ProUpsell } from '../components';
import { emojiBurst } from '../fx';
import { errorText, isPro, REACTIONS, useEpoch, type Profile } from '../lib/api';
import { toDayKey } from '../lib/date';
import { feedback } from '../lib/sfx';
import { useNotify } from '../notify';

const POD_EMOJI = ['\u{1F3CB}\u{FE0F}', '\u{1F525}', '\u{1F962}', '\u{1F31F}', '\u{1F436}', '\u{1F3AF}'];

type PodSummary = { _id: Id<'pods'>; name: string; emoji: string; inviteCode: string };

export default function PodsView({ me }: { me: Profile; active: boolean }) {
  // All live: a join request, an approval, or a new member shows up by itself.
  const pods = useQuery(api.pods.list) ?? [];
  const pending = useQuery(api.pods.myRequests) ?? [];
  const incoming = useQuery(api.pods.incomingRequests) ?? [];
  const approve = useMutation(api.pods.approve);
  const decline = useMutation(api.pods.decline);
  const cancelRequest = useMutation(api.pods.cancelRequest);
  const [openId, setOpenId] = useState<Id<'pods'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = pods.find((p) => p._id === openId) ?? null;

  if (open) return <PodThread pod={open} me={me} onBack={() => setOpenId(null)} />;

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
          key={p._id}
          className="card row squad-row stagger"
          style={{ cursor: 'pointer', '--i': pods.indexOf(p) } as React.CSSProperties}
          role="button"
          tabIndex={0}
          aria-label={`Open squad ${p.name}`}
          onClick={() => {
            feedback('tap');
            setOpenId(p._id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpenId(p._id);
            }
          }}
        >
          <span style={{ fontSize: 24 }}>{p.emoji}</span>
          <div style={{ flex: 1 }}>
            <strong>{p.name}</strong>
            <p className="caption">
              {p.memberCount} member{p.memberCount === 1 ? '' : 's'} - code {p.inviteCode}
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
            <div key={`${r.podId}-${r.userId}`} className="row" style={{ marginTop: 12 }}>
              <Avatar id={r.userId} name={r.displayName} />
              <div style={{ flex: 1 }}>
                <strong>{r.displayName}</strong>
                <p className="caption">
                  wants to join {r.podEmoji} {r.podName}
                </p>
              </div>
              <button
                className="btn-primary row"
                style={{ padding: '7px 14px', fontSize: 13, gap: 5 }}
                onClick={async () => {
                  setError(null);
                  try {
                    await approve({ podId: r.podId, userId: r.userId });
                    feedback('keep');
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                <Check size={14} /> Approve
              </button>
              <button
                className="btn-ghost"
                style={{ padding: 6 }}
                title="Decline"
                aria-label="Decline request"
                onClick={() => void decline({ podId: r.podId, userId: r.userId }).catch((e) => setError(errorText(e)))}
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
            <div key={r.podId} className="row" style={{ marginTop: 12 }}>
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
                onClick={() => void cancelRequest({ podId: r.podId })}
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
          <NewPod />
          <JoinPod />
        </>
      )}
    </div>
  );
}

function NewPod() {
  const createPod = useMutation(api.pods.create);
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
            await createPod({ name: name.trim(), emoji });
            setName('');
            feedback('keep');
          } catch (e) {
            setError(errorText(e, 'Could not create the squad.'));
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

function JoinPod() {
  const requestJoin = useMutation(api.pods.requestJoin);
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
            const pod = await requestJoin({ code });
            setCode('');
            setNotice(`Request sent. ${pod.name}'s owner has to approve you.`);
          } catch (e) {
            setError(errorText(e, 'No squad with that code, or it is already full.'));
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

function PodThread({ pod, me, onBack }: { pod: PodSummary; me: Profile; onBack: () => void }) {
  const today = toDayKey();
  const epoch = useEpoch();
  // One live query is the whole thread: posts, reactions, the waiting row,
  // streaks, and my nudges all update as they happen.
  const thread = useQuery(api.feed.thread, { podId: pod._id, day: today, epoch });
  const toggleReaction = useMutation(api.feed.toggleReaction);
  const nudgeMutation = useMutation(api.feed.nudge);
  const [copied, setCopied] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [justNudged, setJustNudged] = useState<Set<string>>(new Set());
  const { notify } = useNotify();

  // null: this squad is no longer mine (left, or closed) - step back out.
  useEffect(() => {
    if (thread === null) onBack();
  }, [thread, onBack]);

  const loaded = thread !== undefined;
  const entries = thread?.entries ?? [];
  const waiting = thread?.waiting ?? [];
  const members = thread?.members ?? [];
  const nudged = new Set<string>([...(thread?.nudged ?? []), ...justNudged]);
  const ownerId = thread?.pod.createdBy;

  const myEntry = entries.find((e) => e.author.id === me.id);
  const postedAt = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row">
        <button className="btn-ghost row" style={{ padding: '6px 10px', gap: 4 }} onClick={onBack}>
          <ChevronLeft size={16} /> Back
        </button>
        <span style={{ fontSize: 22 }}>{pod.emoji}</span>
        <div style={{ flex: 1 }}>
          <strong>{pod.name}</strong>
          <p className="caption">invite code {pod.inviteCode}</p>
        </div>
        <button
          className="btn-ghost row"
          style={{ padding: '6px 10px', fontSize: 13, gap: 5 }}
          aria-label="Copy invite code"
          onClick={async () => {
            await navigator.clipboard.writeText(pod.inviteCode).catch(() => {});
            feedback('keep');
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
            onClick={() => {
              feedback('tap');
              setShowMembers(!showMembers);
            }}
          >
            <span className="row" style={{ gap: 0 }}>
              {members.slice(0, 6).map((m, i) => (
                <span key={m.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                  <Avatar id={m.id} name={m.displayName} size={30} />
                </span>
              ))}
            </span>
            <span className="caption" style={{ flex: 1, textAlign: 'left' }}>
              {members.length} of 8 members
            </span>
            <ChevronDown size={16} style={{ transform: showMembers ? 'rotate(180deg)' : 'none', transition: 'transform 220ms ease' }} />
          </button>
          {showMembers
            ? members.map((m) => (
                <div key={m.id} className="row member-in" style={{ marginTop: 10, paddingLeft: 4 }}>
                  <Avatar id={m.id} name={m.displayName} size={30} />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>
                    {m.displayName}
                    {m.id === me.id ? ' (you)' : ''}
                  </span>
                  {m.streak > 0 ? (
                    <span className="caption row" style={{ gap: 3, color: 'var(--accent-ink)' }}>
                      <Flame size={13} /> {m.streak}
                    </span>
                  ) : null}
                  {m.id === ownerId ? (
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

      {entries.map((entry, idx) => {
        const mine = entry.author.id === me.id;
        return (
          <div
            key={entry.checkinId}
            className="row"
            style={{ alignItems: 'flex-end', flexDirection: mine ? 'row-reverse' : 'row', '--i': idx } as React.CSSProperties}
          >
            {!mine ? <Avatar id={entry.author.id} name={entry.author.displayName} /> : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: mine ? 'flex-end' : 'flex-start', flex: 1 }}>
              <span className="caption">
                {mine ? 'you' : entry.author.displayName} - {postedAt(entry.postedAt)}
              </span>
              <div
                className={`bubble${mine ? ' mine' : ''}`}
                style={{ cursor: mine ? 'default' : 'pointer' }}
                role={mine ? undefined : 'button'}
                tabIndex={mine ? undefined : 0}
                aria-label={mine ? undefined : `React to ${entry.author.displayName}'s check-in`}
                onClick={() => {
                  if (mine) return;
                  feedback('tap');
                  setPickerFor(pickerFor === entry.checkinId ? null : entry.checkinId);
                }}
                onKeyDown={(e) => {
                  if (!mine && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setPickerFor(pickerFor === entry.checkinId ? null : entry.checkinId);
                  }
                }}
              >
                <div className="row" style={{ gap: 6, alignItems: 'stretch' }}>
                  {entry.photos.map((p) =>
                    p.url ? (
                      <div key={p.id} style={{ position: 'relative' }}>
                        <img src={p.url} alt={p.angle} style={{ width: entry.photos.length > 1 ? 120 : 200 }} />
                        {entry.author.blurFace ? <div className="blur-strip" style={{ borderRadius: 14 }} /> : null}
                      </div>
                    ) : null
                  )}
                </div>
                {entry.trained ? (
                  <p className="row" style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700, gap: 5 }}>
                    <Dumbbell size={14} /> Trained today
                  </p>
                ) : null}
                {entry.note ? <p style={{ margin: '6px 0 0', fontSize: 14 }}>{entry.note}</p> : null}
                {entry.reactions.length ? (
                  <span key={entry.reactions.map((r) => r.emoji).join('')} className="tapback">
                    {entry.reactions.map((r) => r.emoji).join(' ')}
                  </span>
                ) : null}
              </div>
              {pickerFor === entry.checkinId ? (
                <div className="reaction-picker">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      aria-label={`React with ${emoji}`}
                      className={entry.reactions.some((r) => r.userId === me.id && r.emoji === emoji) ? 'chosen' : ''}
                      style={{ animationDelay: `${REACTIONS.indexOf(emoji) * 35}ms` }}
                      onClick={async (e) => {
                        const removing = entry.reactions.some((r) => r.userId === me.id && r.emoji === emoji);
                        if (!removing) emojiBurst(e.currentTarget, emoji);
                        feedback(removing ? 'tap' : 'pop');
                        setPickerFor(null);
                        await toggleReaction({ checkinId: entry.checkinId, emoji }).catch(() => {});
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
              waiting on {waiting.map((w) => (w.id === me.id ? 'you' : w.displayName)).join(', ')}
            </span>
          </div>
          {waiting
            .filter((w) => w.id !== me.id)
            .map((w) => (
              <div key={w.id} className="row member-in" style={{ marginTop: 10 }}>
                <Avatar id={w.id} name={w.displayName} size={30} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{w.displayName}</span>
                {nudged.has(w.id) ? (
                  <span className="caption row nudged-in" style={{ gap: 4 }}>
                    <Check size={13} /> nudged
                  </span>
                ) : (
                  <button
                    className="btn-secondary row"
                    style={{ padding: '6px 14px', fontSize: 13, gap: 5 }}
                    onClick={async (e) => {
                      emojiBurst(e.currentTarget, '\u{1F514}', 3);
                      feedback('nudge');
                      setJustNudged(new Set([...justNudged, w.id]));
                      await nudgeMutation({ podId: pod._id, toUser: w.id, day: today }).catch(() => {});
                      notify({
                        kind: 'nudge',
                        title: `Nudged ${w.displayName}`,
                        body: 'They will get a heads-up to post.',
                        silent: true,
                      });
                    }}
                  >
                    <BellRing size={13} className="bell-hover" /> Nudge
                  </button>
                )}
              </div>
            ))}
        </div>
      ) : null}

      {/* The composer is the one-per-day rule made physical. */}
      <div className="card-flat" style={{ textAlign: 'center', marginTop: 8 }}>
        {myEntry ? (
          <p className="notice row" style={{ justifyContent: 'center', gap: 6 }}>
            <Check size={15} style={{ color: 'var(--moss)' }} /> That is today. Come back tomorrow.
          </p>
        ) : (
          <p className="notice">
            Post today's photo from the <strong>Today</strong> tab - it lands in every squad you belong to.
          </p>
        )}
      </div>
    </div>
  );
}
