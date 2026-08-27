import { Clapperboard, ImageDown, Pause, Play, Video, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { ProUpsell, Segmented } from '../components';
import { ANGLES, isPro, myTimeline, signPhotoUrls, type Angle, type Profile } from '../lib/api';
import { formatDay, fromDayKey, monthName, type DayKey } from '../lib/date';

type Frame = { day: DayKey; path: string; url: string | null };

export default function JourneyView({ active, me }: { active: boolean; me: Profile }) {
  const [angle, setAngle] = useState<Angle>('front');
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [wantsPro, setWantsPro] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      const rows = await myTimeline(angle);
      const urls = await signPhotoUrls(rows.map((r) => r.path));
      if (cancelled) return;
      setFrames(rows.map((r) => ({ ...r, url: urls.get(r.path) ?? null })));
      setLoaded(true);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [angle, active]);

  const byMonth = new Map<string, Frame[]>();
  for (const f of frames) {
    const key = f.day.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), f]);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Journey</h1>
        <p className="caption" style={{ marginTop: 2 }}>
          Your own history. Nobody in your squads can scroll this.
        </p>
      </div>

      <Segmented
        options={ANGLES.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))}
        value={angle}
        onChange={setAngle}
      />

      {loaded && frames.length === 0 ? (
        <p className="notice" style={{ textAlign: 'center', marginTop: 24 }}>
          No {angle} photos yet. Every photo you post at this angle lands here, oldest first.
        </p>
      ) : null}

      {/* The payoff moments: play the run, export the proof. */}
      {frames.length >= 2 ? (
        <>
          <div className="row">
            <button
              className="btn-primary row"
              style={{ flex: 1, justifyContent: 'center', gap: 8 }}
              onClick={() => setPlaying(true)}
            >
              <Clapperboard size={16} /> Play timelapse
            </button>
            <button
              className="btn-secondary row"
              style={{ flex: 1, justifyContent: 'center', gap: 8 }}
              disabled={exporting}
              onClick={() => {
                if (!isPro(me)) {
                  setWantsPro(true);
                  return;
                }
                setExporting(true);
                void exportCollage(frames[0], frames[frames.length - 1], angle)
                  .catch(() => {})
                  .finally(() => setExporting(false));
              }}
            >
              <ImageDown size={16} />
              {exporting ? 'Rendering...' : 'Before / after'}
            </button>
          </div>
          {wantsPro && !isPro(me) ? (
            <ProUpsell reason="Exports come with Pro. Your photos stay yours either way." userId={me.id} />
          ) : null}
          {playing ? (
            <TimelapseModal
              frames={frames.filter((f) => f.url)}
              angle={angle}
              pro={isPro(me)}
              onClose={() => setPlaying(false)}
            />
          ) : null}
        </>
      ) : null}

      {months.map(([month, monthFrames]) => (
        <div key={month}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            {monthName(`${month}-01`)}
          </p>
          <div className="photo-grid">
            {monthFrames.map((f) =>
              f.url ? (
                <div key={f.path + f.day} style={{ position: 'relative' }}>
                  <img src={f.url} alt={f.day} loading="lazy" decoding="async" />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 6,
                      left: 6,
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      borderRadius: 999,
                      padding: '1px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {formatDay(f.day)}
                  </span>
                </div>
              ) : null
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ collage */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function collageDate(day: DayKey): string {
  const d = fromDayKey(day);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Cover-crop `img` into a rounded, ink-outlined panel with a hard shadow. */
function drawPanel(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const r = 20;
  ctx.fillStyle = '#17161a';
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 10, w, h, r);
  ctx.fill();

  const ratio = w / h;
  let sw = img.width;
  let sh = img.height;
  let sx = 0;
  let sy = 0;
  if (sw / sh > ratio) {
    sw = sh * ratio;
    sx = (img.width - sw) / 2;
  } else {
    sh = sw / ratio;
    sy = (img.height - sh) / 2;
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = '#17161a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
}

async function exportCollage(first: Frame, last: Frame, angle: Angle): Promise<void> {
  if (!first.url || !last.url) return;
  const [a, b] = await Promise.all([loadImage(first.url), loadImage(last.url)]);

  const P = 56;
  const GAP = 44;
  const W = 1080;
  const panelW = (W - P * 2 - GAP) / 2;
  const panelH = Math.round(panelW / 0.74);
  const headerH = 130;
  const labelH = 88;
  const H = headerH + panelH + labelH + P;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#ecf0e2';
  ctx.fillRect(0, 0, W, H);

  ctx.font = '54px "Archivo Black", sans-serif';
  ctx.fillStyle = '#17161a';
  ctx.fillText('GYM', P, 92);
  ctx.fillStyle = '#cc9a8d';
  ctx.fillText('SHOT', P + ctx.measureText('GYM').width, 92);

  const days = Math.round((fromDayKey(last.day).getTime() - fromDayKey(first.day).getTime()) / 86400000);
  ctx.font = '700 26px Archivo, sans-serif';
  ctx.fillStyle = '#5b6053';
  const tag = `${days} DAYS - ${angle.toUpperCase()}`;
  ctx.fillText(tag, W - P - ctx.measureText(tag).width, 88);

  drawPanel(ctx, a, P, headerH, panelW, panelH);
  drawPanel(ctx, b, P + panelW + GAP, headerH, panelW, panelH);

  ctx.font = '700 30px Archivo, sans-serif';
  ctx.fillStyle = '#17161a';
  const labelY = headerH + panelH + 56;
  ctx.fillText(collageDate(first.day), P, labelY);
  const lastLabel = collageDate(last.day);
  ctx.fillText(lastLabel, W - P - ctx.measureText(lastLabel).width, labelY);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;

  const file = new File([blob], `gymshot-${angle}-${first.day}-to-${last.day}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => downloadBlob(blob, file.name));
  } else {
    downloadBlob(blob, file.name);
  }
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/* ----------------------------------------------------------- timelapse */

const FRAME_MS = 220;

function TimelapseModal({
  frames,
  angle,
  pro,
  onClose,
}: {
  frames: Frame[];
  angle: Angle;
  pro: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const imagesRef = useRef<HTMLImageElement[] | null>(null);
  const [readyCount, setReadyCount] = useState(0);

  // Decode every frame up front so playback never stutters on the network.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      frames.map(async (f, i) => {
        const img = await loadImage(f.url!);
        if (!cancelled) setReadyCount((n) => Math.max(n, i + 1));
        return img;
      })
    ).then((imgs) => {
      if (!cancelled) imagesRef.current = imgs;
    });
    return () => {
      cancelled = true;
    };
  }, [frames]);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % frames.length), FRAME_MS);
    return () => window.clearInterval(t);
  }, [running, frames.length]);

  const current = frames[index];

  const saveVideo = async () => {
    if (!imagesRef.current) return;
    setSaving(true);
    setNote(null);
    try {
      await recordTimelapse(imagesRef.current, frames, angle);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not record the video.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="camera-overlay" onClick={onClose}>
      <div className="camera-frame" onClick={(e) => e.stopPropagation()}>
        {current?.url ? (
          <img src={current.url} alt={current.day} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : null}
        <span className="angle-badge">{formatDay(current?.day ?? '')}</span>
        <span className="angle-badge" style={{ left: 'auto', right: 12 }}>
          {index + 1}/{frames.length}
        </span>
      </div>
      <div className="ghost-slider" onClick={(e) => e.stopPropagation()}>
        <span>{angle}</span>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          step={1}
          value={index}
          onChange={(e) => {
            setRunning(false);
            setIndex(Number(e.target.value));
          }}
          aria-label="Timelapse position"
        />
      </div>
      {note ? (
        <p style={{ color: '#fffcf7', fontSize: 13, margin: 0 }} onClick={(e) => e.stopPropagation()}>
          {note}
        </p>
      ) : null}
      <div className="camera-controls" onClick={(e) => e.stopPropagation()}>
        <button className="side" title="Close" aria-label="Close timelapse" onClick={onClose}>
          <X size={20} />
        </button>
        <button className="side" title={running ? 'Pause' : 'Play'} aria-label={running ? 'Pause' : 'Play'} onClick={() => setRunning(!running)}>
          {running ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          className="side"
          title={pro ? 'Save as video' : 'Saving the video needs Pro'}
          disabled={saving || !imagesRef.current}
          style={{ opacity: pro ? 1 : 0.5 }}
          onClick={() => {
            if (!pro) {
              setNote('Saving the video comes with GymShot Pro.');
              return;
            }
            void saveVideo();
          }}
        >
          <Video size={20} />
        </button>
      </div>
      {readyCount < frames.length ? (
        <p style={{ color: 'rgba(255,252,247,0.7)', fontSize: 12, margin: 0 }}>
          loading {readyCount}/{frames.length}
        </p>
      ) : null}
    </div>
  );
}

/** Renders the frames to a canvas stream and records a video file. Safari
 *  records mp4; everything else records webm. */
async function recordTimelapse(images: HTMLImageElement[], frames: Frame[], angle: Angle): Promise<void> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser cannot record video.');
  }
  const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('This browser cannot record video.');

  const W = 740;
  const H = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not start the renderer.');

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const drawFrame = (img: HTMLImageElement, day: DayKey) => {
    const ratio = W / H;
    let sw = img.width;
    let sh = img.height;
    let sx = 0;
    let sy = 0;
    if (sw / sh > ratio) {
      sw = sh * ratio;
      sx = (img.width - sw) / 2;
    } else {
      sh = sw / ratio;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    ctx.fillStyle = 'rgba(23,22,26,0.65)';
    ctx.beginPath();
    ctx.roundRect(20, H - 62, 220, 42, 999);
    ctx.fill();
    ctx.fillStyle = '#fffcf7';
    ctx.font = '700 22px Archivo, sans-serif';
    ctx.fillText(collageDate(day), 36, H - 33);
  };

  recorder.start();
  for (let i = 0; i < images.length; i++) {
    drawFrame(images[i], frames[i].day);
    await new Promise((r) => setTimeout(r, FRAME_MS));
  }
  // Hold the final frame for a beat so the video does not end abruptly.
  await new Promise((r) => setTimeout(r, 900));
  recorder.stop();
  await done;

  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type: mime });
  const file = new File([blob], `gymshot-${angle}-timelapse.${ext}`, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => downloadBlob(blob, file.name));
  } else {
    downloadBlob(blob, file.name);
  }
}
