import React, { useEffect, useRef, useState } from 'react';

import { prefersReducedMotion } from './lib/prefs';
import { feedback } from './lib/sfx';

/* ------------------------------------------------------------- confetti */

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  shape: 'rect' | 'dot';
};

/** The palette comes from the theme so confetti is the page's own ink. */
function confettiColors(): string[] {
  const s = getComputedStyle(document.documentElement);
  return ['--accent', '--moss', '--gold', '--accent-soft', '--ink']
    .map((v) => s.getPropertyValue(v).trim())
    .filter(Boolean);
}

/** Paper confetti from a point (or the top of the screen), on one canvas
 *  that removes itself when the last piece has fallen. */
export function confetti(opts: { x?: number; y?: number; count?: number; spread?: number } = {}): void {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  if (!g) {
    canvas.remove();
    return;
  }
  g.scale(dpr, dpr);

  const colors = confettiColors();
  const ox = opts.x ?? window.innerWidth / 2;
  const oy = opts.y ?? window.innerHeight * 0.38;
  const spread = opts.spread ?? 1;
  const pieces: Piece[] = Array.from({ length: opts.count ?? 120 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 * spread;
    const speed = 7 + Math.random() * 9;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)] ?? '#c4552d',
      shape: Math.random() < 0.25 ? 'dot' : 'rect',
    };
  });

  const started = performance.now();
  const frame = (now: number) => {
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = 0;
    const fade = Math.max(0, 1 - (now - started - 1800) / 900);
    for (const p of pieces) {
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 0.32;
      p.x += p.vx + Math.sin(now / 180 + p.rot) * 0.6;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y < window.innerHeight + 20) alive++;
      g.save();
      g.globalAlpha = fade;
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      if (p.shape === 'dot') {
        g.beginPath();
        g.arc(0, 0, p.h / 1.6, 0, Math.PI * 2);
        g.fill();
      } else {
        // Scale on one axis fakes the tumble of a paper flake.
        g.scale(1, Math.cos(now / 120 + p.rot));
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      g.restore();
    }
    if (alive > 0 && fade > 0) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/* ----------------------------------------------------------- emoji burst */

/** A handful of emoji float up from an element and fade - a reaction you can
 *  see leave your hand. */
export function emojiBurst(from: Element, emoji: string, count = 6): void {
  if (prefersReducedMotion()) return;
  const r = from.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'emoji-float';
    el.textContent = emoji;
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top + r.height / 2}px`;
    el.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    el.style.setProperty('--dy', `${-90 - Math.random() * 90}px`);
    el.style.setProperty('--rot', `${(Math.random() - 0.5) * 70}deg`);
    el.style.setProperty('--scale', `${0.8 + Math.random() * 0.7}`);
    el.style.animationDelay = `${i * 45}ms`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

/* -------------------------------------------------------------- count up */

/** A number that rolls to its new value instead of jumping. */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value || prefersReducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);

  return <>{shown}</>;
}

/* ----------------------------------------------------------- celebration */

const MILESTONES: Record<number, string> = {
  3: 'Three in a row. A habit is forming.',
  7: 'A full week. Your squad noticed.',
  14: 'Two weeks straight.',
  21: 'Three weeks. This is who you are now.',
  30: 'Thirty days. A whole month of showing up.',
  50: 'Fifty days. Genuinely rare.',
  75: 'Seventy-five. Unshakeable.',
  100: 'One hundred days. Frame this one.',
  150: 'One hundred fifty days.',
  200: 'Two hundred days.',
  365: 'A full year. Every single day.',
};

export function milestoneFor(streak: number): string | null {
  return MILESTONES[streak] ?? (streak > 365 && streak % 100 === 0 ? `${streak} days.` : null);
}

export type CelebrationInfo = { streak: number; best: number; squads: number };

/** The one big reward moment: today's check-in lands, the day stamps down. */
export function Celebration({ info, onDone }: { info: CelebrationInfo; onDone: () => void }) {
  const milestone = milestoneFor(info.streak);
  const newBest = info.streak > 1 && info.streak >= info.best;

  useEffect(() => {
    feedback(milestone ? 'milestone' : 'celebrate');
    const t1 = window.setTimeout(() => confetti({ count: milestone ? 200 : 110, spread: milestone ? 1.4 : 1 }), 260);
    const t2 = window.setTimeout(onDone, milestone ? 4200 : 3000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // Mount-only: the moment plays once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const squadLine =
    info.squads === 0
      ? 'Saved to your journey.'
      : info.squads === 1
        ? 'Your squad can see it now.'
        : `All ${info.squads} of your squads can see it now.`;

  return (
    <div className="celebrate" role="status" aria-live="polite" onClick={onDone}>
      <div className="celebrate-stamp">
        <span className="small">day</span>
        <span className="big">{info.streak}</span>
        <span className="small">streak</span>
      </div>
      <h2 className="celebrate-title">{milestone ?? (info.streak === 1 ? 'Day one. Here we go.' : 'Streak kept.')}</h2>
      <p className="celebrate-sub">
        {squadLine}
        {newBest && !milestone ? ' New personal best.' : ''}
      </p>
      <span className="caption" style={{ color: 'inherit', opacity: 0.6, marginTop: 18 }}>
        tap to continue
      </span>
    </div>
  );
}
