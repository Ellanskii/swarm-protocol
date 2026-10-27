// Procedural adaptive music: a 16-step sequencer on WebAudio with one track per map, all in D minor.
// Layers fade in and out with the game mode and how hot the fight is; nothing is pre-recorded.
// A new track takes over on the next bar from its own first bar (always Dm), and the tempo glides,
// so the menu music flows into whichever map is played.
import { musicOut } from './audio';
import type { MapId } from './config';
import { clamp } from './utils';

export type MusicMode = 'menu' | 'play' | 'boss' | 'evac' | 'over';
type Layer = 'pad' | 'bass' | 'hat' | 'kick' | 'snare' | 'arp' | 'lead';
type Mix = Record<Layer, number>;
type Out = NonNullable<ReturnType<typeof musicOut>>;
export type TrackId = 'menu' | MapId;

interface Track {
  bpm: number;
  /** One chord per bar; the loop is as long as the progression. */
  chords: number[][];
  targets(mode: MusicMode, i: number): Partial<Mix>;
  /** Schedules what plays on step `s` of the loop at audio time `t`. */
  step(out: Out, s: number, t: number): void;
}

const LAYERS: Layer[] = ['pad', 'bass', 'hat', 'kick', 'snare', 'arp', 'lead'];
/** Notes are scheduled this far ahead of the audio clock, so frame hiccups don't stutter the beat. */
const LOOKAHEAD = 0.12;
/** Seconds for a layer to fade most of the way in or out. */
const FADE = 1.5;

// ---------------- Пустошь (and the menu): i–VI–iv–V at 116 BPM ----------------

/** One chord per bar, MIDI notes around the third octave: Dm, B♭, Gm, A. */
const CHORDS = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
/** Bass line per eighth note, in semitones over the chord root an octave down. */
const BASS = [0, 0, 12, 0, 0, 0, 12, 7];
/** Arpeggio per sixteenth: index into the chord, 3 = root an octave up. */
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 2, 1];
/** Boss lead, per bar: [step, MIDI note, length in steps]. The A7 bar resolves back to D. */
const LEAD: [number, number, number][][] = [
  [[0, 74, 3], [3, 72, 1], [4, 74, 2], [6, 77, 4], [10, 76, 2], [12, 74, 4]],
  [[0, 74, 3], [3, 72, 1], [4, 70, 2], [6, 69, 4], [10, 70, 2], [12, 65, 4]],
  [[0, 67, 3], [3, 69, 1], [4, 70, 2], [6, 74, 4], [10, 72, 2], [12, 70, 4]],
  [[0, 69, 3], [3, 73, 1], [4, 76, 2], [6, 73, 2], [8, 76, 2], [10, 79, 2], [12, 81, 4]],
];

const WASTE: Track = {
  bpm: 116,
  chords: CHORDS,
  /** `i` 0..1 only matters in 'play': calm start → drums → full groove with the arpeggio. */
  targets: (mode, i) =>
    mode === 'menu' ? { pad: 1, bass: 0.35, arp: 0.25 }
    : mode === 'play' ? {
      pad: 0.7 - 0.4 * i, bass: 0.5 + 0.5 * i, hat: ramp(0.05, 0.2, i),
      kick: ramp(0.2, 0.4, i), snare: ramp(0.45, 0.6, i), arp: ramp(0.6, 0.8, i),
    }
    : mode === 'boss' ? { pad: 0.3, bass: 1, hat: 1, kick: 1, snare: 1, arp: 0.7, lead: 1 }
    : mode === 'evac' ? { pad: 1, bass: 0.4, arp: 0.8 }
    : { pad: 0.8, bass: 0.2 },
  step: wasteStep,
};

function wasteStep(out: Out, s: number, t: number): void {
  const bar = Math.floor(s / 16), b = s % 16, ch = CHORDS[bar], root = ch[0] - 12;
  const on = (l: Layer) => mix[l] > 0.02;

  if (b === 0 && on('pad')) pad(out, ch, t, STEP * 16, mix.pad);
  if (on('bass')) {
    if (b % 2 === 0) bass(out, root + BASS[b / 2], t, mix.bass);
    else if (b % 4 === 3 && mix.kick > 0.5) bass(out, root, t, mix.bass * 0.6); // gallop once the drums are in
  }
  if (on('kick') && (b % 4 === 0 || (b === 14 && mix.kick > 0.8))) kick(out, t, mix.kick);
  if (on('snare') && (b === 4 || b === 12)) snare(out, t, mix.snare);
  if (on('hat')) {
    if (b % 2 === 0) hat(out, t, mix.hat * (b % 4 === 2 ? 1 : 0.6), b % 4 === 2 && mix.snare > 0.5);
    else if (mix.arp > 0.3) hat(out, t, mix.hat * 0.4, false);
  }
  if (on('arp')) {
    const a = ARP[b];
    arp(out, ch[a % 3] + 24 + (a === 3 ? 12 : 0), t, mix.arp);
  }
  if (on('lead')) for (const [st, note, len] of LEAD[bar]) if (st === b) lead(out, note, t, len * STEP, mix.lead);
}

// ---------------- Магистраль: night-highway synthwave, i–VI–III–VII at 124 BPM ----------------

/** Dm, B♭, F, C; root first, the bass folds it into its own octave. */
const ROAD_CHORDS = [[50, 53, 57], [46, 50, 53], [41, 45, 48], [48, 52, 55]];
/** Hook per bar, [step, MIDI note, length in steps]: a quiet lift at the peak of a fight, in full for the boss. */
const ROAD_LEAD: [number, number, number][][] = [
  [[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 76, 4]],
  [[0, 74, 6], [6, 70, 2], [8, 72, 2], [10, 74, 2], [12, 77, 4]],
  [[0, 77, 4], [4, 81, 4], [8, 84, 4], [12, 81, 4]],
  [[0, 79, 6], [6, 76, 2], [8, 79, 2], [10, 76, 2], [12, 72, 2], [14, 76, 2]],
];
/** Arpeggio per sixteenth: index into the chord, 3 = root an octave up. Echoed a dotted eighth later. */
const ROAD_ARP = [0, 2, 3, 2, 1, 2, 3, 2, 0, 2, 3, 2, 1, 3, 2, 1];

const ROAD: Track = {
  bpm: 124,
  chords: ROAD_CHORDS,
  // calm cruise → engine pulse → drums → arpeggio lights → the hook
  targets: (mode, i) =>
    mode === 'play' ? {
      pad: 0.8 - 0.4 * i, bass: 0.5 + 0.5 * i, hat: ramp(0.05, 0.2, i),
      kick: ramp(0.2, 0.4, i), snare: ramp(0.4, 0.55, i), arp: ramp(0.55, 0.75, i), lead: 0.5 * ramp(0.85, 1, i),
    }
    : mode === 'boss' ? { pad: 0.4, bass: 1, hat: 1, kick: 1, snare: 1, arp: 0.6, lead: 1 }
    : mode === 'evac' ? { pad: 1, bass: 0.5, hat: 0.4, arp: 0.8 }
    : { pad: 0.8, bass: 0.2 },
  step: roadStep,
};

function roadStep(out: Out, s: number, t: number): void {
  const bar = Math.floor(s / 16), b = s % 16, ch = ROAD_CHORDS[bar];
  const root = 33 + ((ch[0] - 33) % 12 + 12) % 12;
  const on = (l: Layer) => mix[l] > 0.02;

  if (b === 0 && on('pad')) pad(out, ch, t, STEP * 16, mix.pad);
  if (on('bass')) {
    // eighths on the root while cruising; the octave sixteenths kick in with the drums
    if (b % 2 === 0) pulse(out, root + (b === 14 ? 7 : 0), t, mix.bass);
    else if (mix.kick > 0.3) pulse(out, root + 12, t, mix.bass * 0.7);
  }
  if (on('kick') && (b % 8 === 0 || (b === 10 && mix.kick > 0.7))) kick(out, t, mix.kick);
  if (on('snare') && (b === 4 || b === 12)) gated(out, t, mix.snare);
  if (on('hat')) {
    if (b % 4 === 2) hat(out, t, mix.hat, false);
    else if (mix.arp > 0.3 || mix.kick > 0.8) hat(out, t, mix.hat * (b % 2 ? 0.35 : 0.55), false);
  }
  if (on('arp')) {
    const a = ROAD_ARP[b];
    pluck(out, ch[a % 3] + 24 + (a === 3 ? 12 : 0), t, mix.arp);
  }
  if (on('lead')) {
    for (const [st, note, len] of ROAD_LEAD[bar]) if (st === b) lead(out, note, t, len * STEP, mix.lead, echoIn(out));
  }
}

// ---------------- Литейный цех: industrial, Phrygian i–♭II–i–♭VII at 104 BPM ----------------

/** Dm, E♭, Dm, C. */
const FOUNDRY_CHORDS = [[50, 53, 57], [51, 55, 58], [50, 53, 57], [48, 52, 55]];
/** Machine ostinato per sixteenth, semitones over the root; null = rest, 1 = the grinding ♭2. */
const FOUNDRY_BASS = [0, null, 0, 12, null, 0, null, 0, 0, null, 0, 12, null, 0, 1, null];
/** Press clangs in 3+3+2, index into the chord; -1 = rest. */
const FOUNDRY_CLANG = [0, -1, -1, 2, -1, -1, 1, -1, 3, -1, -1, 2, -1, -1, 1, -1];
const FOUNDRY_LEAD: [number, number, number][][] = [
  [[0, 74, 4], [4, 75, 2], [6, 74, 2], [8, 72, 4], [12, 69, 4]],
  [[0, 70, 4], [4, 72, 2], [6, 75, 2], [8, 74, 6], [14, 72, 2]],
  [[0, 74, 2], [2, 77, 2], [4, 81, 6], [10, 79, 2], [12, 77, 2], [14, 75, 2]],
  [[0, 72, 6], [6, 76, 2], [8, 79, 4], [12, 72, 2], [14, 76, 2]],
];

const FOUNDRY: Track = {
  bpm: 104,
  chords: FOUNDRY_CHORDS,
  // the shop floor clangs from the start; drums and the anvil join as the fight heats up
  targets: (mode, i) =>
    mode === 'play' ? {
      pad: 0.7 - 0.4 * i, bass: 0.45 + 0.55 * i, arp: 0.25 + 0.6 * ramp(0.5, 0.7, i), hat: ramp(0.1, 0.25, i),
      kick: ramp(0.2, 0.4, i), snare: ramp(0.4, 0.55, i),
    }
    : mode === 'boss' ? { pad: 0.3, bass: 1, hat: 1, kick: 1, snare: 1, arp: 0.6, lead: 1 }
    : mode === 'evac' ? { pad: 1, bass: 0.4, hat: 0.3, arp: 0.5 }
    : { pad: 0.8, bass: 0.2 },
  step: foundryStep,
};

function foundryStep(out: Out, s: number, t: number): void {
  const bar = Math.floor(s / 16), b = s % 16, ch = FOUNDRY_CHORDS[bar];
  const root = 33 + ((ch[0] - 33) % 12 + 12) % 12;
  const on = (l: Layer) => mix[l] > 0.02;

  if (b === 0 && on('pad')) pad(out, ch, t, STEP * 16, mix.pad);
  const bn = FOUNDRY_BASS[b];
  // only the eighths until the drums are in, then the whole ostinato
  if (on('bass') && bn !== null && (b % 2 === 0 || mix.kick > 0.3)) grind(out, root + bn, t, mix.bass);
  if (on('kick') && (b === 0 || b === 6 || b === 8 || (b === 11 && mix.kick > 0.7))) kick(out, t, mix.kick);
  if (on('snare') && (b === 4 || b === 12)) anvil(out, t, mix.snare);
  if (on('hat')) {
    if (b % 2 === 0) hat(out, t, mix.hat * (b % 4 === 2 ? 0.8 : 0.45), false);
    if (b === 14 && mix.hat > 0.5) steam(out, t, mix.hat);
  }
  const c = FOUNDRY_CLANG[b];
  if (on('arp') && c >= 0) clang(out, ch[c % 3] + 12 + (c === 3 ? 12 : 0), t, mix.arp);
  if (on('lead')) for (const [st, note, len] of FOUNDRY_LEAD[bar]) if (st === b) lead(out, note, t, len * STEP, mix.lead);
}

// ---------------- Мост: cold and suspended, open chords in half time at 112 BPM ----------------

/** Dsus2, B♭sus2, Gsus2, Asus4: no thirds, nothing warm. */
const BRIDGE_CHORDS = [[50, 52, 57], [46, 48, 53], [43, 45, 50], [45, 50, 52]];
/** Glass bells, index into the chord, -1 = rest; echoed a dotted eighth later. */
const BRIDGE_BELL = [3, -1, -1, 1, -1, -1, 2, -1, 3, -1, -1, 0, -1, 2, -1, -1];
const BRIDGE_LEAD: [number, number, number][][] = [
  [[0, 76, 6], [6, 74, 2], [8, 69, 8]],
  [[0, 72, 6], [6, 74, 2], [8, 77, 8]],
  [[0, 74, 6], [6, 72, 2], [8, 69, 4], [12, 67, 4]],
  [[0, 69, 4], [4, 74, 4], [8, 76, 8]],
];

const BRIDGE: Track = {
  bpm: 112,
  chords: BRIDGE_CHORDS,
  // wind and bells over the void → half-time drums → the cables start to pulse → the hook
  targets: (mode, i) =>
    mode === 'play' ? {
      pad: 0.9 - 0.4 * i, bass: 0.5 + 0.5 * i, arp: 0.3 + 0.5 * ramp(0.5, 0.7, i), hat: ramp(0.1, 0.25, i),
      kick: ramp(0.2, 0.4, i), snare: ramp(0.4, 0.55, i), lead: 0.4 * ramp(0.85, 1, i),
    }
    : mode === 'boss' ? { pad: 0.5, bass: 1, hat: 1, kick: 1, snare: 1, arp: 0.5, lead: 1 }
    : mode === 'evac' ? { pad: 1, bass: 0.3, arp: 0.8 }
    : { pad: 0.8, bass: 0.2, arp: 0.2 },
  step: bridgeStep,
};

function bridgeStep(out: Out, s: number, t: number): void {
  const bar = Math.floor(s / 16), b = s % 16, ch = BRIDGE_CHORDS[bar];
  const root = 33 + ((ch[0] - 33) % 12 + 12) % 12;
  const on = (l: Layer) => mix[l] > 0.02;

  if (b === 0 && on('pad')) {
    pad(out, ch, t, STEP * 16, mix.pad);
    if (bar % 2 === 0) wind(out, t, STEP * 32, mix.pad);
  }
  if (on('bass')) {
    // one long hum per bar; under pressure the cables pulse in eighths
    if (b === 0) sub(out, root, t, STEP * 14, mix.bass);
    else if (b % 2 === 0 && mix.kick > 0.6) sub(out, root + (b % 4 ? 0 : 12), t, STEP * 1.5, mix.bass * 0.5);
  }
  if (on('kick') && (b === 0 || b === 10 || (b === 6 && mix.kick > 0.8))) kick(out, t, mix.kick);
  if (on('snare') && b === 8) gated(out, t, mix.snare);
  if (on('hat') && (b % 4 === 2 || (b % 2 === 1 && mix.kick > 0.8))) hat(out, t, mix.hat * (b % 2 ? 0.35 : 0.7), false);
  const c = BRIDGE_BELL[b];
  if (on('arp') && c >= 0) bell(out, ch[c % 3] + 24 + (c === 3 ? 12 : 0), t, mix.arp);
  if (on('lead')) {
    for (const [st, note, len] of BRIDGE_LEAD[bar]) if (st === b) lead(out, note, t, len * STEP, mix.lead, echoIn(out));
  }
}

// ---------------- sequencer ----------------

const TRACKS: Record<TrackId, Track> = { menu: WASTE, field: WASTE, corridor: ROAD, foundry: FOUNDRY, bridge: BRIDGE };

const zero = (): Mix => ({ pad: 0, bass: 0, hat: 0, kick: 0, snare: 0, arp: 0, lead: 0 });
const mix = zero();
let track = WASTE;
let bpm = WASTE.bpm;
/** One sixteenth note at the current tempo, seconds. */
let STEP = 60 / bpm / 4;
let step = 0;
let next = 0;

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);
const ramp = (a: number, b: number, x: number): number => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/** Call every frame. Fades the layers toward the mode and schedules the notes that are due. */
export function updateMusic(dt: number, mode: MusicMode, intensity: number, id: TrackId): void {
  const out = musicOut();
  if (!out) return;
  const wanted = TRACKS[id];
  const m = track.targets(mode, intensity);
  const k = 1 - Math.exp(-dt * 3 / FADE);
  for (const l of LAYERS) mix[l] += ((m[l] ?? 0) - mix[l]) * k;
  bpm += (track.bpm - bpm) * (1 - Math.exp(-dt / 1.5));
  STEP = 60 / bpm / 4;
  const now = out.ctx.currentTime;
  // after a stall (hidden tab), pick up the beat again instead of firing every missed note at once
  if (next < now - 0.05) next = now + 0.05;
  while (next < now + LOOKAHEAD) {
    if (wanted !== track && step % 16 === 0) {
      track = wanted;
      step = 0;
    }
    track.step(out, step, next);
    step = (step + 1) % (track.chords.length * 16);
    next += STEP;
  }
}

// ---------------- voices ----------------

/** Attack to `peak`, then an exponential decay over `d` seconds. */
function env(out: Out, t: number, a: number, peak: number, d: number): GainNode {
  const g = out.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  g.connect(out.bus);
  return g;
}

function osc(out: Out, type: OscillatorType, f: number, t: number, dur: number, to: AudioNode, detune = 0): OscillatorNode {
  const o = out.ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  o.connect(to);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function filter(out: Out, type: BiquadFilterType, f: number, to: AudioNode, q = 1): BiquadFilterNode {
  const flt = out.ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = f;
  flt.Q.value = q;
  flt.connect(to);
  return flt;
}

function noise(out: Out, t: number, dur: number, to: AudioNode): void {
  const src = out.ctx.createBufferSource();
  src.buffer = out.noise;
  src.connect(to);
  src.start(t, Math.random() * (out.noise.duration - dur));
  src.stop(t + dur);
}

/** Slow swelling chord: two detuned saws per note under a soft lowpass. */
function pad(out: Out, notes: number[], t: number, dur: number, vol: number): void {
  const g = out.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05 * vol, t + 0.6);
  g.gain.setValueAtTime(0.05 * vol, t + dur - 0.4);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
  g.connect(out.bus);
  const lp = filter(out, 'lowpass', 1100, g);
  for (const n of notes) for (const d of [-7, 7]) osc(out, 'sawtooth', mtof(n + 12), t, dur + 0.2, lp, d);
}

/** Resonant saw bass; the filter opens as the drums come in. */
function bass(out: Out, note: number, t: number, vol: number): void {
  const lp = filter(out, 'lowpass', 260 + 900 * mix.kick, env(out, t, 0.005, 0.32 * vol, 0.22), 7);
  osc(out, 'sawtooth', mtof(note), t, 0.25, lp);
}

function kick(out: Out, t: number, vol: number): void {
  const o = osc(out, 'sine', 140, t, 0.3, env(out, t, 0.002, 0.9 * vol, 0.28));
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
}

function snare(out: Out, t: number, vol: number): void {
  noise(out, t, 0.18, filter(out, 'highpass', 1200, env(out, t, 0.002, 0.32 * vol, 0.16)));
  const o = osc(out, 'triangle', 190, t, 0.1, env(out, t, 0.002, 0.25 * vol, 0.08));
  o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
}

function hat(out: Out, t: number, vol: number, open: boolean): void {
  const d = open ? 0.14 : 0.035;
  noise(out, t, d + 0.02, filter(out, 'highpass', 8000, env(out, t, 0.001, 0.12 * vol, d)));
}

function arp(out: Out, note: number, t: number, vol: number): void {
  osc(out, 'square', mtof(note), t, 0.16, filter(out, 'lowpass', 2600, env(out, t, 0.004, 0.08 * vol, 0.14)));
}

/** Boss lead: saw plus a slightly detuned square, with a late vibrato on long notes. */
function lead(out: Out, note: number, t: number, dur: number, vol: number, send?: AudioNode): void {
  const g = out.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.11 * vol, t + 0.02);
  g.gain.setValueAtTime(0.11 * vol, t + Math.max(0.03, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
  g.connect(out.bus);
  if (send) g.connect(send);
  const lp = filter(out, 'lowpass', 2200, g);
  const oscs = [osc(out, 'sawtooth', mtof(note), t, dur + 0.1, lp), osc(out, 'square', mtof(note), t, dur + 0.1, lp, 5)];
  if (dur > 0.3) {
    const lfo = out.ctx.createOscillator(), depth = out.ctx.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(8, t + 0.25);
    lfo.connect(depth);
    for (const o of oscs) depth.connect(o.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
  }
}

// ---------------- road voices ----------------

let echo: { delay: DelayNode; inp: GainNode } | null = null;

/** Shared dotted-eighth echo with darkening repeats; its delay follows the tempo. */
function echoIn(out: Out): AudioNode {
  if (!echo) {
    const inp = out.ctx.createGain(), delay = out.ctx.createDelay(1), fb = out.ctx.createGain();
    inp.gain.value = 0.45;
    fb.gain.value = 0.4;
    inp.connect(delay);
    const lp = filter(out, 'lowpass', 2400, fb);
    delay.connect(lp);
    fb.connect(delay);
    lp.connect(out.bus);
    echo = { delay, inp };
  }
  echo.delay.delayTime.setTargetAtTime(STEP * 3, out.ctx.currentTime, 0.1);
  return echo.inp;
}

/** Plucky octave bass: saw over a square sub, the filter snaps shut on every note. */
function pulse(out: Out, note: number, t: number, vol: number): void {
  const lp = filter(out, 'lowpass', 300, env(out, t, 0.003, 0.26 * vol, 0.13), 5);
  lp.frequency.setValueAtTime(400 + 1600 * mix.kick, t);
  lp.frequency.exponentialRampToValueAtTime(220, t + 0.12);
  osc(out, 'sawtooth', mtof(note), t, 0.15, lp);
  osc(out, 'square', mtof(note - 12), t, 0.15, lp);
}

/** Big snare whose tail is cut short, the eighties way. */
function gated(out: Out, t: number, vol: number): void {
  const g = out.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.34 * vol, t + 0.003);
  g.gain.setValueAtTime(0.26 * vol, t + 0.16);
  g.gain.linearRampToValueAtTime(0.0001, t + 0.2);
  g.connect(out.bus);
  noise(out, t, 0.22, filter(out, 'bandpass', 2200, g, 0.6));
  const o = osc(out, 'triangle', 210, t, 0.1, env(out, t, 0.002, 0.28 * vol, 0.09));
  o.frequency.exponentialRampToValueAtTime(130, t + 0.09);
}

/** Bright detuned saw pluck that feeds the echo. */
function pluck(out: Out, note: number, t: number, vol: number): void {
  const g = env(out, t, 0.003, 0.06 * vol, 0.16);
  g.connect(echoIn(out));
  const lp = filter(out, 'lowpass', 3200, g);
  for (const d of [-9, 9]) osc(out, 'sawtooth', mtof(note), t, 0.18, lp, d);
}

// ---------------- foundry voices ----------------

/** Soft-clip curve for the grinding bass. */
const DRIVE = (() => {
  const c = new Float32Array(256);
  for (let i = 0; i < c.length; i++) c[i] = Math.tanh(3 * (i / 127.5 - 1));
  return c;
})();

/** Overdriven saw-and-square bass; the filter opens with the drums like the wasteland bass. */
function grind(out: Out, note: number, t: number, vol: number): void {
  const lp = filter(out, 'lowpass', 500 + 1200 * mix.kick, env(out, t, 0.004, 0.2 * vol, 0.16), 3);
  const sh = out.ctx.createWaveShaper();
  sh.curve = DRIVE;
  sh.connect(lp);
  osc(out, 'sawtooth', mtof(note), t, 0.2, sh);
  osc(out, 'square', mtof(note), t, 0.2, sh, 8);
}

/** Pitched press clang: two squares a non-harmonic ratio apart, so it rings like struck metal. */
function clang(out: Out, note: number, t: number, vol: number): void {
  const f = mtof(note);
  const bp = filter(out, 'bandpass', f * 2, env(out, t, 0.001, 0.09 * vol, 0.14), 2);
  osc(out, 'square', f, t, 0.16, bp);
  osc(out, 'square', f * 2.76, t, 0.16, bp);
}

/** Anvil in place of the snare: inharmonic metal, a spark of noise and a dull body. */
function anvil(out: Out, t: number, vol: number): void {
  const hp = filter(out, 'highpass', 900, env(out, t, 0.001, 0.12 * vol, 0.3));
  for (const r of [1, 1.47, 2.09, 2.71]) osc(out, 'square', 540 * r, t, 0.32, hp);
  noise(out, t, 0.05, filter(out, 'highpass', 3000, env(out, t, 0.001, 0.2 * vol, 0.04)));
  const o = osc(out, 'triangle', 170, t, 0.1, env(out, t, 0.002, 0.3 * vol, 0.08));
  o.frequency.exponentialRampToValueAtTime(110, t + 0.08);
}

/** Steam vent: a hiss whose band slides down. */
function steam(out: Out, t: number, vol: number): void {
  const bp = filter(out, 'bandpass', 5000, env(out, t, 0.02, 0.1 * vol, 0.28), 1);
  bp.frequency.setValueAtTime(5000, t);
  bp.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
  noise(out, t, 0.32, bp);
}

// ---------------- bridge voices ----------------

/** Wind over the void: looped noise through a band that rises and falls over `dur`. */
function wind(out: Out, t: number, dur: number, vol: number): void {
  const g = out.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.06 * vol, t + dur / 2);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  g.connect(out.bus);
  const bp = filter(out, 'bandpass', 400, g, 0.8);
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.linearRampToValueAtTime(1400, t + dur / 2);
  bp.frequency.linearRampToValueAtTime(500, t + dur);
  const src = out.ctx.createBufferSource();
  src.buffer = out.noise;
  src.loop = true;
  src.connect(bp);
  src.start(t);
  src.stop(t + dur);
}

/** Cable hum: a sine sub with a soft octave on top. */
function sub(out: Out, note: number, t: number, dur: number, vol: number): void {
  const lp = filter(out, 'lowpass', 500, env(out, t, 0.01, 0.3 * vol, dur));
  osc(out, 'sine', mtof(note), t, dur, lp);
  osc(out, 'triangle', mtof(note + 12), t, dur, lp);
}

/** Glass bell: a sine with a fast-fading third partial, fed to the echo. */
function bell(out: Out, note: number, t: number, vol: number): void {
  const f = mtof(note), g = env(out, t, 0.002, 0.05 * vol, 0.9);
  g.connect(echoIn(out));
  osc(out, 'sine', f, t, 0.95, g);
  osc(out, 'sine', f * 3.01, t, 0.3, env(out, t, 0.001, 0.012 * vol, 0.25));
}
