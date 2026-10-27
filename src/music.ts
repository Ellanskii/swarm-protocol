// Procedural adaptive music: a 16-step sequencer on WebAudio, D minor, i–VI–iv–V at 116 BPM.
// Layers fade in and out with the game mode and how hot the fight is; nothing is pre-recorded.
import { musicOut } from './audio';
import { clamp } from './utils';

export type MusicMode = 'menu' | 'play' | 'boss' | 'evac' | 'over';
type Layer = 'pad' | 'bass' | 'hat' | 'kick' | 'snare' | 'arp' | 'lead';
type Mix = Record<Layer, number>;
type Out = NonNullable<ReturnType<typeof musicOut>>;

const LAYERS: Layer[] = ['pad', 'bass', 'hat', 'kick', 'snare', 'arp', 'lead'];
const BPM = 116;
/** One sixteenth note, seconds. */
const STEP = 60 / BPM / 4;
/** Notes are scheduled this far ahead of the audio clock, so frame hiccups don't stutter the beat. */
const LOOKAHEAD = 0.12;
/** Seconds for a layer to fade most of the way in or out. */
const FADE = 1.5;

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

const zero = (): Mix => ({ pad: 0, bass: 0, hat: 0, kick: 0, snare: 0, arp: 0, lead: 0 });
const mix = zero();
const want = zero();
let step = 0;
let next = 0;

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);
const ramp = (a: number, b: number, x: number): number => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/** `intensity` 0..1 only matters in 'play': calm start → drums → full groove with the arpeggio. */
function setTargets(mode: MusicMode, i: number): void {
  const m: Partial<Mix> =
    mode === 'menu' ? { pad: 1, bass: 0.35, arp: 0.25 }
    : mode === 'play' ? {
      pad: 0.7 - 0.4 * i, bass: 0.5 + 0.5 * i, hat: ramp(0.05, 0.2, i),
      kick: ramp(0.2, 0.4, i), snare: ramp(0.45, 0.6, i), arp: ramp(0.6, 0.8, i),
    }
    : mode === 'boss' ? { pad: 0.3, bass: 1, hat: 1, kick: 1, snare: 1, arp: 0.7, lead: 1 }
    : mode === 'evac' ? { pad: 1, bass: 0.4, arp: 0.8 }
    : { pad: 0.8, bass: 0.2 };
  for (const l of LAYERS) want[l] = m[l] ?? 0;
}

/** Call every frame. Fades the layers toward the mode and schedules the notes that are due. */
export function updateMusic(dt: number, mode: MusicMode, intensity: number): void {
  const out = musicOut();
  if (!out) return;
  setTargets(mode, intensity);
  const k = 1 - Math.exp(-dt * 3 / FADE);
  for (const l of LAYERS) mix[l] += (want[l] - mix[l]) * k;
  const now = out.ctx.currentTime;
  // after a stall (hidden tab), pick up the beat again instead of firing every missed note at once
  if (next < now - 0.05) next = now + 0.05;
  while (next < now + LOOKAHEAD) {
    playStep(out, step, next);
    step = (step + 1) % 64;
    next += STEP;
  }
}

function playStep(out: Out, s: number, t: number): void {
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
function lead(out: Out, note: number, t: number, dur: number, vol: number): void {
  const g = out.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.11 * vol, t + 0.02);
  g.gain.setValueAtTime(0.11 * vol, t + Math.max(0.03, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
  g.connect(out.bus);
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
