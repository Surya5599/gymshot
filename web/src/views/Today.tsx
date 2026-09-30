import {
  BellRing,
  Camera,
  Check,
  Dumbbell,
  Flame,
  Loader2,
  RotateCcw,
  SwitchCamera,
  Timer,
  TimerOff,
  Upload,
  X,
} from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { api } from '../../convex/_generated/api';
import { MonthGrid, Toggle } from '../components';
import { Celebration, CountUp, type CelebrationInfo } from '../fx';
import { ANGLES, errorText, useEpoch, useUploadPhoto, type Angle } from '../lib/api';
import { formatDay, toDayKey, type DayKey } from '../lib/date';
import { feedback, play } from '../lib/sfx';
import { computeStreak } from '../lib/streak';
import { useNotify } from '../notify';

/** Streak-at-risk warnings start in the evening, when there is still time. */
const AT_RISK_HOUR = 17;

export default function TodayView({ boothRequest }: { active: boolean; boothRequest: number }) {
  const today = toDayKey();
  const epoch = useEpoch();
  const { notify } = useNotify();

  // Live: a nudge, or a photo posted from another device, shows up by itself.
  const loggedDays = useQuery(api.checkins.loggedDays);
  const mine = useQuery(api.checkins.mine, { day: today, epoch });
  const nudgers = useQuery(api.feed.nudgesForMe, { day: today }) ?? [];
  const squads = useQuery(api.pods.list);
  const setTrainedMutation = useMutation(api.checkins.setTrained);
  const setNoteMutation = useMutation(api.checkins.setNote);
  const uploadPhoto = useUploadPhoto();

  const days: DayKey[] = loggedDays ?? [];
  const loaded = loggedDays !== undefined && mine !== undefined;
  const checkin = mine?.checkin ?? null;
  const photoUrls: Partial<Record<Angle, string>> = {};
  for (const p of mine?.photos ?? []) photoUrls[p.angle] = p.url;

  const [note, setNote] = useState('');
  const serverNote = checkin?.note ?? '';
  useEffect(() => setNote(serverNote), [serverNote]);

  const [busyAngles, setBusyAngles] = useState<Set<Angle>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [booth, setBooth] = useState<Angle[] | null>(null);
  const [celebration, setCelebration] = useState<CelebrationInfo | null>(null);

  // The reward plays once, for the first photo of the day, in this session.
  const celebrated = useRef<DayKey | null>(null);

  const streak = computeStreak(days, today);
  const taken = ANGLES.filter((a) => photoUrls[a]);
  const missing = ANGLES.filter((a) => !photoUrls[a]);
  const hasPhotosToday = taken.length > 0;

  // Hidden capture input: where the in-page camera is unavailable, the booth
  // falls back to the phone's own camera app, one angle at a time.
  const fallbackInput = useRef<HTMLInputElement>(null);
  const fallbackAngle = useRef<Angle>('front');

  const openBooth = useCallback(
    (angles: Angle[]) => {
      if (angles.length === 0) return;
      if (liveCameraSupported()) {
        setBooth(angles);
      } else {
        fallbackAngle.current = angles[0];
        fallbackInput.current?.click();
      }
    },
    []
  );

  // The shutter in the tab bar asks for the booth from anywhere.
  const lastRequest = useRef(boothRequest);
  useEffect(() => {
    if (boothRequest === lastRequest.current) return;
    lastRequest.current = boothRequest;
    openBooth(missing.length ? [...missing] : [...ANGLES]);
    // Only a new request should open the booth, not a change in photos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boothRequest, openBooth]);

  const onPick = async (angle: Angle, file: Blob | undefined) => {
    if (!file) return;
    const first = loaded && !hasPhotosToday && !days.includes(today) && celebrated.current !== today;
    if (first) celebrated.current = today;
    setBusyAngles((s) => new Set(s).add(angle));
    setError(null);
    try {
      await uploadPhoto(today, angle, file);
      play('develop');
      if (first) {
        const s = computeStreak([...days, today], today);
        setCelebration({ streak: s.current, best: s.best, squads: squads?.length ?? 0 });
      }
    } catch (e) {
      if (first) celebrated.current = null;
      setError(errorText(e, 'Upload failed.'));
      notify({ kind: 'info', title: 'That photo did not upload', body: 'Check your connection and try again.' });
    } finally {
      setBusyAngles((s) => {
        const next = new Set(s);
        next.delete(angle);
        return next;
      });
    }
  };

  const setTrained = async (v: boolean) => {
    feedback('toggle');
    await setTrainedMutation({ day: today, trained: v }).catch((e) => setError(errorText(e)));
  };

  const saveNote = async () => {
    try {
      await setNoteMutation({ day: today, note: note.trim() ? note : null });
      notify({ kind: 'info', title: 'Note saved', body: 'Your squad sees it under your photos.', silent: true });
      feedback('keep');
    } catch (e) {
      setError(errorText(e));
    }
  };

  const hour = new Date().getHours();
  const atRisk = loaded && !hasPhotosToday && streak.current > 0 && hour >= AT_RISK_HOUR;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input
        ref={fallbackInput}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={(e) => {
          void onPick(fallbackAngle.current, e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="stagger" style={{ '--i': 0 } as React.CSSProperties}>
        <h1 style={{ fontSize: 28 }}>Today</h1>
        <p className="caption" style={{ marginTop: 2 }}>
          One check-in a day. Your squads see today only.
        </p>
      </div>

      {/* A nudge is a squad-mate asking where today's photo is. */}
      {nudgers.length > 0 && !hasPhotosToday ? (
        <div className="card row banner-in" style={{ background: 'var(--accent-soft)' }}>
          <BellRing size={18} className="bell-ring loop" style={{ color: 'var(--accent-ink)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-ink)' }}>
            {nudgers.join(', ')} nudged you - post today's photo.
          </span>
        </div>
      ) : null}

      {atRisk ? (
        <div className="card row banner-in at-risk">
          <Flame size={22} className="flicker" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
            Your {streak.current}-day streak ends at midnight.
          </span>
        </div>
      ) : null}

      <div
        className="card row stagger"
        style={{ justifyContent: 'space-around', textAlign: 'center', '--i': 1 } as React.CSSProperties}
      >
        <Stat
          value={streak.current}
          label="day streak"
          highlight={streak.loggedToday}
          icon={<Flame size={18} className={streak.loggedToday ? 'flicker' : ''} />}
        />
        <Stat value={streak.best} label="best ever" />
        <Stat value={streak.monthLogged} suffix={`/${streak.monthDays}`} label="this month" />
      </div>

      {loaded && missing.length > 0 ? (
        <button
          className="booth-cta stagger"
          style={{ '--i': 2 } as React.CSSProperties}
          onClick={() => {
            feedback('tap');
            openBooth([...missing]);
          }}
        >
          <span className="booth-cta-icon">
            <Camera size={24} strokeWidth={2.2} />
          </span>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <span className="booth-cta-title">{hasPhotosToday ? 'Finish the booth' : 'Step into the booth'}</span>
            <span className="booth-cta-sub">
              {hasPhotosToday
                ? `${missing.length} angle${missing.length === 1 ? '' : 's'} left - ${missing.join(', ')}`
                : 'Front, side, back. Three shots, one flow.'}
            </span>
          </span>
        </button>
      ) : null}

      <div className="print-card stagger" style={{ '--i': 3 } as React.CSSProperties}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {ANGLES.map((angle) => (
            <AngleTile
              key={angle}
              angle={angle}
              url={photoUrls[angle]}
              busy={busyAngles.has(angle)}
              onPick={(f) => void onPick(angle, f)}
              onCamera={() => openBooth([angle])}
            />
          ))}
        </div>
        <div className="print-footer">
          <span className="brand">GymShot</span>
          {missing.length === 0 ? (
            <span className="print-stamp">
              <Check size={12} strokeWidth={3} /> posted
            </span>
          ) : null}
          <span className="caption">{formatDay(today)}</span>
        </div>
        {error ? <p className="error" role="alert" style={{ marginTop: 10 }}>{error}</p> : null}
      </div>

      {/* Full-screen moments render on <body>, above the tab bar and clear
          of any animated ancestor. */}
      {booth
        ? createPortal(
            <BoothModal
              angles={booth}
              onShot={(angle, blob) => void onPick(angle, blob)}
              onClose={() => setBooth(null)}
            />,
            document.body
          )
        : null}

      {celebration && !booth
        ? createPortal(<Celebration info={celebration} onDone={() => setCelebration(null)} />, document.body)
        : null}

      <div className="card stagger" style={{ '--i': 4 } as React.CSSProperties}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 10 }}>
            <span className={`trained-icon${checkin?.trained ? ' on' : ''}`}>
              <Dumbbell size={17} />
            </span>
            <div>
              <strong>Trained today</strong>
              <p className="caption">Just the fact, not the sets.</p>
            </div>
          </div>
          <Toggle on={checkin?.trained ?? false} onChange={(v) => void setTrained(v)} />
        </div>
        <textarea
          style={{ marginTop: 14, resize: 'vertical', minHeight: 60 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A note for the squad (optional)"
          maxLength={200}
        />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <button
            className="btn-secondary"
            style={{ fontSize: 14, padding: '9px 20px' }}
            disabled={serverNote === note.trim()}
            onClick={() => void saveNote()}
          >
            Save note
          </button>
          <span className="caption">{note.length}/200</span>
        </div>
      </div>

      <div className="card stagger" style={{ '--i': 5 } as React.CSSProperties}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <p className="eyebrow">This month</p>
          <span className="caption">
            {streak.monthLogged} of {streak.monthDays} days
          </span>
        </div>
        <MonthGrid logged={days} today={today} />
      </div>
    </div>
  );
}

function Stat({
  value,
  suffix,
  label,
  highlight,
  icon,
}: {
  value: number;
  suffix?: string;
  label: string;
  highlight?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="row"
        style={{
          gap: 4,
          justifyContent: 'center',
          fontSize: 26,
          fontWeight: 800,
          color: highlight ? 'var(--accent)' : 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {icon ? <span style={{ display: 'flex', color: highlight ? 'var(--accent)' : 'var(--ink-faint)' }}>{icon}</span> : null}
        <span>
          <CountUp value={value} />
          {suffix ? <span style={{ color: 'var(--ink-faint)', fontSize: 18 }}>{suffix}</span> : null}
        </span>
      </div>
      <div className="caption">{label}</div>
    </div>
  );
}

/** The in-page camera needs a secure context (https or localhost). Where it
 *  is unavailable - e.g. plain http over the LAN - a file input with
 *  `capture` opens the phone's native camera app instead. */
const liveCameraSupported = () =>
  typeof navigator !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

function AngleTile({
  angle,
  url,
  busy,
  onPick,
  onCamera,
}: {
  angle: Angle;
  url: string | undefined;
  busy: boolean;
  onPick: (f: File | undefined) => void;
  onCamera: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);

  const takePhoto = () => {
    feedback('tap');
    if (liveCameraSupported()) onCamera();
    else captureInput.current?.click();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPick(e.target.files?.[0]);
    e.target.value = '';
  };

  return (
    <div className="angle-tile">
      <input ref={input} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
      <input
        ref={captureInput}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={onFile}
      />
      {url ? (
        <>
          {/* Keyed by URL, so a new or retaken photo develops in again. */}
          <img key={url} className="developed" src={url} alt={`${angle} photo`} onClick={takePhoto} style={{ cursor: 'pointer' }} />
          <span className="label">{angle}</span>
          {busy ? (
            <div className="tile-busy">
              <Loader2 size={22} className="spin" />
            </div>
          ) : null}
          <div className="tile-actions">
            <button title="Retake with camera" aria-label="Retake with camera" onClick={takePhoto}>
              <Camera size={14} />
            </button>
            <button title="Upload a file" aria-label="Upload a file" onClick={() => input.current?.click()}>
              <Upload size={14} />
            </button>
          </div>
        </>
      ) : (
        <div className={`empty${busy ? ' busy' : ''}`} onClick={busy ? undefined : takePhoto}>
          {busy ? <Loader2 size={22} className="spin" /> : <Camera size={22} className="empty-cam" />}
          {busy ? 'Developing...' : angle}
          {!busy ? (
            <button
              className="btn-ghost"
              style={{ padding: '2px 10px', fontSize: 12 }}
              onClick={(e) => {
                e.stopPropagation();
                input.current?.click();
              }}
            >
              or upload
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ booth */

const POSE_TIPS: Record<Angle, string> = {
  front: 'Face the lens, arms relaxed at your sides.',
  side: 'Quarter turn left. Same spot as last time.',
  back: 'Back to the camera. Stand tall and hold still.',
};

const TIMER_CYCLE: (0 | 3 | 5 | 10)[] = [0, 3, 5, 10];

/**
 * The photobooth: live camera for a queue of angles, shot one after another
 * without leaving. Each shot gets a review - it develops in, then Retake or
 * Keep. Kept shots upload in the background while the next angle lines up.
 *
 * Preview is mirrored for the front camera (what people expect from a
 * mirror-selfie), but the saved frame is the true camera image so photos stay
 * comparable across days.
 */
function BoothModal({
  angles,
  onShot,
  onClose,
}: {
  angles: Angle[];
  onShot: (angle: Angle, blob: Blob) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | undefined>(undefined);
  const [step, setStep] = useState(0);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [delay, setDelay] = useState<0 | 3 | 5 | 10>(3);
  const [error, setError] = useState<string | null>(null);
  const [ghostOpacity, setGhostOpacity] = useState(0.4);
  const [review, setReview] = useState<{ blob: Blob; url: string } | null>(null);
  const [flash, setFlash] = useState(0);
  const [kept, setKept] = useState<Set<Angle>>(new Set());

  const angle = angles[step];

  // Ghost overlay: the most recent shot at this angle from a previous day,
  // laid over the live preview so today's photo lines up with the last one.
  const epoch = useEpoch();
  const history = useQuery(api.checkins.timeline, { angle, epoch });
  const todayKey = toDayKey();
  const prev = history?.filter((r) => r.day < todayKey).pop();
  const ghost = prev ? { url: prev.url, day: prev.day } : null;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    navigator.mediaDevices
      .getUserMedia({
        // Ask for a portrait 3:4 stream so the 0.74 preview frame crops
        // almost nothing; a wide stream in a tall frame reads as heavy zoom.
        video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1440 }, aspectRatio: { ideal: 0.75 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError('Camera unavailable. Check the browser permission, or upload a file instead.'));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, [facing]);

  // Leaving mid-countdown must not fire a capture into an unmounted booth.
  useEffect(() => () => window.clearInterval(tickRef.current), []);

  useEffect(
    () => () => {
      if (review) URL.revokeObjectURL(review.url);
    },
    [review]
  );

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // Center-crop to the preview frame's ratio so the saved photo is exactly
    // what the grid showed (the preview uses object-fit: cover).
    const targetRatio = 0.74;
    let sx = 0;
    let sy = 0;
    let sw = video.videoWidth;
    let sh = video.videoHeight;
    if (sw / sh > targetRatio) {
      sw = Math.round(sh * targetRatio);
      sx = Math.round((video.videoWidth - sw) / 2);
    } else {
      sh = Math.round(sw / targetRatio);
      sy = Math.round((video.videoHeight - sh) / 2);
    }
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext('2d')?.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    feedback('shutter');
    setFlash((f) => f + 1);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setReview({ blob, url: URL.createObjectURL(blob) });
        window.setTimeout(() => play('develop'), 120);
      },
      'image/jpeg',
      0.9
    );
  };

  /** Shutter honours the selected delay, beeping down to the shot. */
  const shoot = () => {
    if (countdown !== null || review || error) return;
    if (delay === 0) {
      capture();
      return;
    }
    let n = delay;
    setCountdown(n);
    feedback('tick');
    tickRef.current = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(tickRef.current);
        setCountdown(null);
        play('go');
        capture();
      } else {
        setCountdown(n);
        feedback('tick');
      }
    }, 1000);
  };

  const retake = () => {
    feedback('tap');
    setReview(null);
  };

  const keep = () => {
    if (!review) return;
    feedback('keep');
    onShot(angle, review.blob);
    setKept((k) => new Set(k).add(angle));
    setReview(null);
    if (step + 1 < angles.length) setStep(step + 1);
    else onClose();
  };

  // Keyboard: space shoots or keeps, R retakes, Escape leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (review) keep();
        else shoot();
      } else if ((e.key === 'r' || e.key === 'R') && review) retake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const cycleTimer = () => {
    feedback('tap');
    setDelay(TIMER_CYCLE[(TIMER_CYCLE.indexOf(delay) + 1) % TIMER_CYCLE.length]);
  };

  return (
    <div className="camera-overlay booth" onClick={onClose}>
      {angles.length > 1 ? (
        <div className="booth-steps" onClick={(e) => e.stopPropagation()}>
          {angles.map((a, i) => (
            <span key={a} className={`booth-step${i === step ? ' current' : ''}${kept.has(a) ? ' done' : ''}`}>
              <span className="dot">{kept.has(a) ? <Check size={11} strokeWidth={3.2} /> : i + 1}</span>
              {a}
            </span>
          ))}
        </div>
      ) : null}

      <div className="camera-frame" onClick={(e) => e.stopPropagation()}>
        <video ref={videoRef} className={facing === 'user' ? 'mirrored' : ''} autoPlay playsInline muted />
        {/* Saved photos are true-camera images; mirror the ghost with the
            front-camera preview so your body and the ghost move the same way. */}
        {ghost && !review ? (
          <img
            className={`ghost${facing === 'user' ? ' mirrored' : ''}`}
            src={ghost.url}
            alt=""
            style={{ opacity: ghostOpacity }}
          />
        ) : null}
        {!review ? (
          <>
            {/* Thirds grid, same alignment aid as the mobile capture screen. */}
            <div className="gridline v" style={{ left: '33.3%' }} />
            <div className="gridline v" style={{ left: '66.6%' }} />
            <div className="gridline h" style={{ top: '33.3%' }} />
            <div className="gridline h" style={{ top: '66.6%' }} />
          </>
        ) : null}
        {review ? <img className="review-shot" src={review.url} alt={`${angle} shot to review`} /> : null}
        <span key={angle} className="angle-badge badge-in">
          {angle}
        </span>
        {countdown !== null ? (
          <div key={countdown} className="countdown count-pop">
            {countdown}
          </div>
        ) : null}
        {flash > 0 ? <div key={flash} className="flash" /> : null}
        {error ? (
          <div className="countdown" style={{ fontSize: 15, padding: 24, textAlign: 'center' }}>
            {error}
          </div>
        ) : null}
      </div>

      <p key={`${angle}-${!!review}`} className="pose-tip" onClick={(e) => e.stopPropagation()}>
        {review ? 'Happy with it? Keep it, or go again.' : POSE_TIPS[angle]}
      </p>

      {ghost && !review ? (
        <div className="ghost-slider" onClick={(e) => e.stopPropagation()}>
          <span>Ghost - {formatDay(ghost.day)}</span>
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.05}
            value={ghostOpacity}
            onChange={(e) => setGhostOpacity(Number(e.target.value))}
            aria-label="Ghost overlay opacity"
          />
        </div>
      ) : null}

      <div className="camera-controls" onClick={(e) => e.stopPropagation()}>
        {review ? (
          <>
            <button className="review-btn" onClick={retake}>
              <RotateCcw size={17} /> Retake
            </button>
            <button className="review-btn keep" onClick={keep}>
              <Check size={18} strokeWidth={2.8} />
              {step + 1 < angles.length ? `Keep, then ${angles[step + 1]}` : 'Keep it'}
            </button>
          </>
        ) : (
          <>
            <button className="side" title="Close" aria-label="Close camera" onClick={onClose}>
              <X size={20} />
            </button>
            <button className="side" title="Self-timer" aria-label="Cycle self-timer" onClick={cycleTimer} disabled={!!error}>
              {delay === 0 ? (
                <TimerOff size={18} />
              ) : (
                <span className="row" style={{ gap: 3 }}>
                  <Timer size={15} />
                  {delay}
                </span>
              )}
            </button>
            <button
              className={`shutter${countdown !== null ? ' counting' : ''}`}
              title="Take photo"
              aria-label="Take photo"
              onClick={shoot}
              disabled={!!error || countdown !== null}
            />
            <button
              className="side"
              title="Flip camera"
              aria-label="Flip camera"
              onClick={() => {
                feedback('tap');
                setFacing(facing === 'user' ? 'environment' : 'user');
              }}
              disabled={!!error}
            >
              <SwitchCamera size={20} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
