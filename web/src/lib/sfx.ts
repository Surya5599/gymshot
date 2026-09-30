import { getPrefs } from './prefs';

/**
 * Every sound in the app, synthesized with Web Audio. Nothing to download,
 * nothing to license, and each cue can be tuned in code. Sounds are short,
 * quiet, and warm (triangle and sine, soft attacks) - a darkroom, not an
 * arcade. They never play while the page is hidden.
 */

export type Cue =
  | 'tap'
  | 'toggle'
  | 'tick'
  | 'go'
  | 'shutter'
  | 'develop'
  | 'keep'
  | 'pop'
  | 'nudge'
  | 'chime'
  | 'celebrate'
  | 'milestone'
  | 'whoosh';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: master! };
}

/** Browsers only start audio from a user gesture; the first tap anywhere
 *  unlocks it so later, event-driven cues (a nudge arriving) can play. */
export function installAudioUnlock(): void {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

type ToneOpts = { type?: OscillatorType; gain?: number; attack?: number; to?: number };

function tone(freq: number, at: number, dur: number, o: ToneOpts = {}): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + at;
  const osc = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const peak = o.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function burst(at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass'): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + at;
  const src = a.ctx.createBufferSource();
  src.buffer = noise(a.ctx);
  const f = a.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

// Pitches, named so the melodies read as melodies.
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;
const E6 = 1318.5;
const G6 = 1568;

const CUES: Record<Cue, () => void> = {
  tap: () => tone(1400, 0, 0.04, { type: 'sine', gain: 0.12 }),
  toggle: () => {
    tone(900, 0, 0.05, { type: 'sine', gain: 0.14 });
    tone(1350, 0.04, 0.05, { type: 'sine', gain: 0.1 });
  },
  tick: () => tone(A5, 0, 0.09, { type: 'sine', gain: 0.22 }),
  go: () => tone(E6, 0, 0.18, { type: 'sine', gain: 0.26 }),
  // A mechanical shutter: the curtain opens, then snaps shut.
  shutter: () => {
    burst(0, 0.035, 3200, 0.9, 0.9);
    tone(180, 0, 0.05, { type: 'square', gain: 0.08 });
    burst(0.075, 0.05, 2200, 0.8, 0.7);
    tone(120, 0.075, 0.06, { type: 'square', gain: 0.07 });
  },
  // Darkroom: a soft rising shimmer as the print comes up.
  develop: () => {
    burst(0, 0.5, 6000, 0.4, 0.05, 'highpass');
    tone(C5, 0, 0.5, { type: 'sine', gain: 0.08, attack: 0.2, to: G5 });
  },
  keep: () => {
    tone(G5, 0, 0.12, { gain: 0.2 });
    tone(C6, 0.08, 0.2, { gain: 0.2 });
  },
  pop: () => tone(420, 0, 0.1, { type: 'sine', gain: 0.3, to: 980 }),
  // A small hand bell, struck twice.
  nudge: () => {
    for (const at of [0, 0.16]) {
      tone(G6, at, 0.5, { type: 'sine', gain: 0.18 });
      tone(G6 * 1.5, at, 0.35, { type: 'sine', gain: 0.07 });
    }
  },
  chime: () => {
    tone(E6, 0, 0.3, { type: 'sine', gain: 0.16 });
    tone(C6 * 0.95, 0.11, 0.45, { type: 'sine', gain: 0.14 });
  },
  celebrate: () => {
    [C5, E5, G5, C6].forEach((f, i) => tone(f, i * 0.08, 0.35, { gain: 0.2 }));
    burst(0.3, 0.4, 8000, 0.5, 0.06, 'highpass');
  },
  milestone: () => {
    [C5, E5, G5, C6, E6].forEach((f, i) => tone(f, i * 0.07, 0.3, { gain: 0.2 }));
    [C6, E6, G6].forEach((f) => tone(f, 0.42, 0.9, { gain: 0.12, attack: 0.02 }));
    burst(0.4, 0.8, 9000, 0.5, 0.08, 'highpass');
  },
  whoosh: () => burst(0, 0.22, 1400, 0.6, 0.12, 'lowpass'),
};

export function play(cue: Cue): void {
  if (!getPrefs().sounds) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  try {
    CUES[cue]();
  } catch {
    // Audio is garnish; never let it break an action.
  }
}

const PATTERNS: Partial<Record<Cue, number | number[]>> = {
  tap: 8,
  toggle: 10,
  tick: 12,
  go: 25,
  shutter: [18, 40, 18],
  keep: 20,
  pop: 12,
  nudge: [30, 60, 30],
  chime: [15, 50, 15],
  celebrate: [30, 50, 60],
  milestone: [40, 60, 40, 60, 90],
};

/** Vibration where the platform has it (Android); a silent no-op elsewhere. */
export function buzz(cue: Cue): void {
  if (!getPrefs().haptics) return;
  const p = PATTERNS[cue];
  if (p !== undefined) navigator.vibrate?.(p);
}

/** The usual pairing: hear it and feel it. */
export function feedback(cue: Cue): void {
  play(cue);
  buzz(cue);
}
