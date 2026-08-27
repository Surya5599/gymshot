import { BellRing, Camera, Loader2, SwitchCamera, Timer, TimerOff, Upload, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { MonthGrid, Toggle } from '../components';
import {
  ANGLES,
  ensureCheckin,
  myCheckin,
  myLoggedDays,
  myTimeline,
  nudgesForMe,
  signPhotoUrls,
  updateCheckin,
  uploadPhoto,
  type Angle,
  type CheckIn,
} from '../lib/api';
import { formatDay, toDayKey, type DayKey } from '../lib/date';
import { supabase } from '../lib/supabase';
import { computeStreak } from '../lib/streak';

export default function TodayView({ active }: { active: boolean }) {
  const today = toDayKey();
  const [days, setDays] = useState<DayKey[]>([]);
  const [checkin, setCheckin] = useState<CheckIn | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Partial<Record<Angle, string>>>({});
  const [note, setNote] = useState('');
  const [busyAngle, setBusyAngle] = useState<Angle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nudgers, setNudgers] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [logged, mine, nudges] = await Promise.all([
      myLoggedDays(),
      myCheckin(today),
      nudgesForMe(today).catch(() => []),
    ]);
    setNudgers(nudges.map((n) => n.name));
    setDays(logged);
    setCheckin(mine?.checkin ?? null);
    setNote(mine?.checkin.note ?? '');
    if (mine && mine.photos.length) {
      const urls = await signPhotoUrls(mine.photos.map((p) => p.storage_path));
      const next: Partial<Record<Angle, string>> = {};
      for (const p of mine.photos) {
        const u = urls.get(p.storage_path);
        if (u) next[p.angle] = u;
      }
      setPhotoUrls(next);
    } else {
      setPhotoUrls({});
    }
  }, [today]);

  // Refresh quietly whenever the tab is shown; existing state keeps
  // rendering meanwhile, so the switch never blanks.
  useEffect(() => {
    if (!active) return;
    void load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [active, load]);

  const streak = computeStreak(days, today);

  // A nudge should land while the tab is open, not on the next visit.
  useEffect(() => {
    const channel = supabase
      .channel('my-nudges')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nudges' }, () => {
        void load().catch(() => {});
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const [cameraFor, setCameraFor] = useState<Angle | null>(null);

  const onPick = async (angle: Angle, file: Blob | undefined) => {
    if (!file) return;
    setBusyAngle(angle);
    setError(null);
    try {
      await uploadPhoto(today, angle, file);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusyAngle(null);
    }
  };

  const setTrained = async (v: boolean) => {
    const c = checkin ?? (await ensureCheckin(today));
    await updateCheckin(c.id, { trained: v });
    await load();
  };

  const saveNote = async () => {
    const c = checkin ?? (await ensureCheckin(today));
    await updateCheckin(c.id, { note: note.trim() ? note : null });
    await load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Today</h1>
        <p className="caption" style={{ marginTop: 2 }}>
          One check-in a day. Your squads see today only.
        </p>
      </div>

      {/* A nudge is a squad-mate asking where today's photo is. */}
      {nudgers.length > 0 && !streak.loggedToday ? (
        <div className="card row" style={{ background: 'var(--accent-soft)' }}>
          <BellRing size={18} style={{ color: 'var(--accent-ink)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-ink)' }}>
            {nudgers.join(', ')} nudged you - post today's photo.
          </span>
        </div>
      ) : null}

      <div className="card row" style={{ justifyContent: 'space-around', textAlign: 'center' }}>
        <Stat value={String(streak.current)} label="day streak" highlight={streak.loggedToday} />
        <Stat value={String(streak.best)} label="best ever" />
        <Stat value={`${streak.monthLogged}/${streak.monthDays}`} label="this month" />
      </div>

      <div className="print-card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {ANGLES.map((angle) => (
            <AngleTile
              key={angle}
              angle={angle}
              url={photoUrls[angle]}
              busy={busyAngle === angle}
              onPick={(f) => void onPick(angle, f)}
              onCamera={() => setCameraFor(angle)}
            />
          ))}
        </div>
        <div className="print-footer">
          <span className="brand">GymShot</span>
          <span className="caption">{formatDay(today)}</span>
        </div>
        {error ? <p className="error" role="alert" style={{ marginTop: 10 }}>{error}</p> : null}
      </div>

      {cameraFor ? (
        <CameraModal
          angle={cameraFor}
          onClose={() => setCameraFor(null)}
          onCapture={(blob) => {
            const angle = cameraFor;
            setCameraFor(null);
            void onPick(angle, blob);
          }}
        />
      ) : null}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>Trained today</strong>
            <p className="caption">Just the fact, not the sets.</p>
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
        <button
          className="btn-secondary"
          style={{ marginTop: 10, fontSize: 14, padding: '9px 20px' }}
          disabled={(checkin?.note ?? '') === (note.trim() ? note : '')}
          onClick={() => void saveNote()}
        >
          Save note
        </button>
      </div>

      <div className="card">
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

function Stat({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, color: highlight ? 'var(--accent)' : 'var(--ink)' }}>{value}</div>
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
          <img src={url} alt={`${angle} photo`} onClick={takePhoto} style={{ cursor: 'pointer' }} />
          <span className="label">{angle}</span>
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
        <div className="empty" onClick={takePhoto}>
          {busy ? <Loader2 size={22} className="spin" /> : <Camera size={22} />}
          {busy ? 'Uploading...' : angle}
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

/**
 * Live camera capture. Preview is mirrored for the front camera (what people
 * expect from a mirror-selfie), but the saved frame is the true camera image
 * so photos stay comparable across days.
 */
function CameraModal({
  angle,
  onCapture,
  onClose,
}: {
  angle: Angle;
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [delay, setDelay] = useState<0 | 3 | 5 | 10>(3);
  const [error, setError] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ url: string; day: DayKey } | null>(null);
  const [ghostOpacity, setGhostOpacity] = useState(0.4);

  // Ghost overlay: the most recent shot at this angle from a previous day,
  // laid over the live preview so today's photo lines up with the last one.
  useEffect(() => {
    let cancelled = false;
    const today = toDayKey();
    void (async () => {
      const rows = await myTimeline(angle);
      const prev = rows.filter((r) => r.day < today).pop();
      if (!prev) return;
      const urls = await signPhotoUrls([prev.path]);
      const url = urls.get(prev.path);
      if (url && !cancelled) setGhost({ url, day: prev.day });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [angle]);

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
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      'image/jpeg',
      0.9
    );
  };

  /** Shutter honours the selected delay, like the mobile capture screen. */
  const shoot = () => {
    if (countdown !== null) return;
    if (delay === 0) {
      capture();
      return;
    }
    let n = delay;
    setCountdown(n);
    const tick = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(tick);
        setCountdown(null);
        capture();
      } else {
        setCountdown(n);
      }
    }, 1000);
  };

  const TIMER_CYCLE: (0 | 3 | 5 | 10)[] = [0, 3, 5, 10];
  const cycleTimer = () => setDelay(TIMER_CYCLE[(TIMER_CYCLE.indexOf(delay) + 1) % TIMER_CYCLE.length]);

  return (
    <div className="camera-overlay" onClick={onClose}>
      <div className="camera-frame" onClick={(e) => e.stopPropagation()}>
        <video ref={videoRef} className={facing === 'user' ? 'mirrored' : ''} autoPlay playsInline muted />
        {/* Saved photos are true-camera images; mirror the ghost with the
            front-camera preview so your body and the ghost move the same way. */}
        {ghost ? (
          <img
            className={`ghost${facing === 'user' ? ' mirrored' : ''}`}
            src={ghost.url}
            alt=""
            style={{ opacity: ghostOpacity }}
          />
        ) : null}
        {/* Thirds grid, same alignment aid as the mobile capture screen. */}
        <div className="gridline v" style={{ left: '33.3%' }} />
        <div className="gridline v" style={{ left: '66.6%' }} />
        <div className="gridline h" style={{ top: '33.3%' }} />
        <div className="gridline h" style={{ top: '66.6%' }} />
        <span className="angle-badge">{angle}</span>
        {countdown !== null ? <div className="countdown">{countdown}</div> : null}
        {error ? (
          <div className="countdown" style={{ fontSize: 15, padding: 24, textAlign: 'center' }}>
            {error}
          </div>
        ) : null}
      </div>
      {ghost ? (
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
        <button className="side" title="Cancel" aria-label="Close camera" onClick={onClose}>
          <X size={20} />
        </button>
        <button className="side" title="Self-timer" aria-label="Cycle self-timer" onClick={cycleTimer} disabled={!!error}>
          {delay === 0 ? <TimerOff size={18} /> : (
            <span className="row" style={{ gap: 3 }}>
              <Timer size={15} />
              {delay}
            </span>
          )}
        </button>
        <button className="shutter" title="Take photo" aria-label="Take photo" onClick={shoot} disabled={!!error || countdown !== null} />
        <button
          className="side"
          title="Flip camera"
          aria-label="Flip camera"
          onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}
          disabled={!!error}
        >
          <SwitchCamera size={20} />
        </button>
      </div>
    </div>
  );
}
