// Tiny WebAudio synth: every sound is generated, no assets.

export type Sfx =
  | 'pistol' | 'shotgun' | 'smg' | 'drone' | 'hit' | 'kill' | 'pick' | 'level' | 'hurt'
  | 'boom' | 'perfect' | 'jam' | 'reload' | 'dash' | 'boss';

let actx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
const lastPlayed: Partial<Record<Sfx, number>> = {};
/** Minimum gap between repeats, ms — keeps hordes from turning into white noise. */
const THROTTLE: Partial<Record<Sfx, number>> = { hit: 40, pick: 35, kill: 30, drone: 60 };

/** Must be called from a user gesture. */
export function initAudio(): void {
  if (actx) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    actx = new Ctx();
    master = actx.createGain();
    master.gain.value = 0.32;
    master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.4, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    actx = null;
  }
}

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number): void {
  if (!actx || !master) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number): void {
  if (!actx || !master || !noiseBuf) return;
  const t = actx.currentTime, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t);
  s.stop(t + dur);
}

export function sfx(n: Sfx): void {
  if (!actx || muted) return;
  const now = performance.now(), gap = THROTTLE[n] ?? 0;
  if (gap && now - (lastPlayed[n] ?? 0) < gap) return;
  lastPlayed[n] = now;
  switch (n) {
    case 'pistol': tone('square', 520, 140, 0.07, 0.05); noise(0.05, 0.08, 3000); break;
    case 'shotgun': noise(0.2, 0.25, 1300); tone('sawtooth', 160, 50, 0.12, 0.08); break;
    case 'smg': tone('square', 700, 220, 0.04, 0.03); noise(0.03, 0.05, 4000); break;
    case 'drone': tone('sine', 1300, 700, 0.05, 0.025); break;
    case 'hit': tone('triangle', 700, 250, 0.05, 0.03); break;
    case 'kill': tone('square', 260, 70, 0.08, 0.03); break;
    case 'pick': tone('sine', 900, 1500, 0.06, 0.035); break;
    case 'level': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone('triangle', f, f, 0.15, 0.08), i * 70)); break;
    case 'hurt': tone('sawtooth', 220, 60, 0.25, 0.12); break;
    case 'boom': noise(0.35, 0.3, 700); tone('sine', 120, 40, 0.3, 0.14); break;
    case 'perfect': tone('triangle', 880, 1760, 0.12, 0.08); break;
    case 'jam': tone('square', 140, 90, 0.22, 0.08); break;
    case 'reload': tone('square', 300, 300, 0.03, 0.03); break;
    case 'dash': noise(0.12, 0.1, 2500); break;
    case 'boss': tone('sawtooth', 90, 45, 1.2, 0.18); break;
  }
}
