// Keyboard / mouse / touch state and aiming.
import * as THREE from 'three';
import { camera } from './scene';
import { G, P, aim, armWeapons, type Enemy } from './state';

export const keys: Record<string, boolean> = {};
export const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };

export interface InputHandlers {
  onKey(code: string): void;
  onFocusLost(): void;
  onGesture(): void;
}

// ---------------- touch ----------------

const AUTO_AIM_KEY = 'swarm.autoAim';
function loadAutoAim(): boolean {
  try { return localStorage.getItem(AUTO_AIM_KEY) === '1'; } catch { return false; }
}

/** `on` is true while the last input came from a touchscreen. */
export const touch = { on: matchMedia('(pointer: coarse)').matches, autoAim: loadAutoAim() };

export function toggleAutoAim(): boolean {
  touch.autoAim = !touch.autoAim;
  try { localStorage.setItem(AUTO_AIM_KEY, touch.autoAim ? '1' : '0'); } catch { /* storage blocked */ }
  return touch.autoAim;
}

interface Stick {
  id: number;
  el: HTMLElement;
  knob: HTMLElement;
  /** Center, px. */
  ox: number;
  oy: number;
  /** Deflection, -1..1 per axis, length <= 1. */
  dx: number;
  dy: number;
  t0: number;
  moved: boolean;
}

const STICK_R = 60;
const MOVE_DEAD = 0.15;
const AIM_DEAD = 0.3;
const TAP_MS = 220;
/** Browsers emit compatibility mouse events after a touch; ignore mouse input this long after one. */
const MOUSE_AFTER_TOUCH_MS = 800;

let stickL: Stick | null = null;
let stickR: Stick | null = null;
let lastTouch = -Infinity;

function setTouchMode(on: boolean): void {
  if (touch.on === on) return;
  touch.on = on;
  document.body.classList.toggle('touch', on);
}

function beginStick(e: PointerEvent, el: HTMLElement): Stick {
  const s: Stick = {
    id: e.pointerId, el, knob: el.firstElementChild as HTMLElement,
    ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, t0: performance.now(), moved: false,
  };
  el.style.transform = `translate(${s.ox}px,${s.oy}px)`;
  s.knob.style.transform = '';
  el.classList.add('on');
  return s;
}

/** Floating stick: dragging past the rim pulls the center along. */
function moveStick(s: Stick, x: number, y: number): void {
  let vx = x - s.ox, vy = y - s.oy;
  const l = Math.hypot(vx, vy);
  if (l > STICK_R) {
    s.ox = x - (vx / l) * STICK_R;
    s.oy = y - (vy / l) * STICK_R;
    vx = (vx / l) * STICK_R;
    vy = (vy / l) * STICK_R;
    s.el.style.transform = `translate(${s.ox}px,${s.oy}px)`;
  }
  s.dx = vx / STICK_R;
  s.dy = vy / STICK_R;
  if (Math.hypot(s.dx, s.dy) > AIM_DEAD) s.moved = true;
  s.knob.style.transform = `translate(${vx}px,${vy}px)`;
}

function endStick(s: Stick | null): null {
  s?.el.classList.remove('on');
  return null;
}

const stickLEl = document.getElementById('stickL') as HTMLElement;
const stickREl = document.getElementById('stickR') as HTMLElement;

// ---------------- binding ----------------

const cross = document.getElementById('cross') as HTMLElement;
const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown']);
const fromTouch = () => performance.now() - lastTouch < MOUSE_AFTER_TOUCH_MS;

export function bindInput(h: InputHandlers): void {
  document.body.classList.toggle('touch', touch.on);

  addEventListener('keydown', e => {
    if (PREVENT.has(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (!e.repeat) h.onKey(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('mousemove', e => {
    if (fromTouch()) return;
    setTouchMode(false);
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    cross.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  });
  addEventListener('mousedown', e => {
    if (fromTouch()) return;
    if (e.button === 0) mouse.down = true;
    h.onGesture();
    // buttons go through the key handler, so they can be bound like keys
    if (e.button === 0) h.onKey('MouseLeft');
    if (e.button === 2) h.onKey('MouseRight');
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
  addEventListener('contextmenu', e => e.preventDefault());

  addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    lastTouch = performance.now();
    setTouchMode(true);
    h.onGesture();
    // buttons handle their own taps; sticks only exist during play
    if (G.state !== 'play' || (e.target as Element).closest('button')) return;
    e.preventDefault();
    if (e.clientX < innerWidth / 2) { if (!stickL) stickL = beginStick(e, stickLEl); }
    else if (!stickR) stickR = beginStick(e, stickREl);
  }, { passive: false });
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') return;
    lastTouch = performance.now();
    if (stickL?.id === e.pointerId) moveStick(stickL, e.clientX, e.clientY);
    else if (stickR?.id === e.pointerId) moveStick(stickR, e.clientX, e.clientY);
  });
  const up = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    lastTouch = performance.now();
    if (stickL?.id === e.pointerId) stickL = endStick(stickL);
    else if (stickR?.id === e.pointerId) {
      const tap = !stickR.moved && performance.now() - stickR.t0 < TAP_MS;
      stickR = endStick(stickR);
      if (tap && e.type === 'pointerup') h.onKey('TouchReload');
    }
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);

  const lost = () => {
    for (const k in keys) keys[k] = false;
    mouse.down = false;
    stickL = endStick(stickL);
    stickR = endStick(stickR);
    h.onFocusLost();
  };
  addEventListener('blur', lost);
  document.addEventListener('visibilitychange', () => { if (document.hidden) lost(); });
}

/** Keyboard plus left stick in world XZ (screen up = -Z), length <= 1. */
export function moveInput(): [number, number] {
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (stickL && Math.hypot(stickL.dx, stickL.dy) > MOVE_DEAD) {
    mx += stickL.dx;
    mz += stickL.dy;
  }
  const l = Math.hypot(mx, mz);
  return l > 1 ? [mx / l, mz / l] : [mx, mz];
}

const aimStick = (): boolean => !!stickR && Math.hypot(stickR.dx, stickR.dy) > AIM_DEAD;

/** Auto-aim target for this frame, or null. */
let target: Enemy | null = null;

function nearestEnemy(range: number): Enemy | null {
  let best: Enemy | null = null, bd = range * range;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d2 = (e.x - P.x) ** 2 + (e.z - P.z) ** 2;
    if (d2 < bd) { bd = d2; best = e; }
  }
  return best;
}

/** Auto-fire waits until the turning torso puts the fire line on the target, so it doesn't shoot into nothing. */
function locked(e: Enemy): boolean {
  const d = Math.hypot(e.x - P.x, e.z - P.z);
  return P.aimErr < Math.PI / 2 && d * Math.sin(P.aimErr) < e.r;
}

/** Fire the player is steering right now: mouse button or a deflected aim stick, not auto-fire. */
export const manualFire = (): boolean => (touch.on ? aimStick() : mouse.down);

export function fireHeld(): boolean {
  if (!touch.on) return mouse.down;
  return aimStick() || (touch.autoAim && !stickR && target !== null && locked(target));
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1); // y = 1, gun height
/** Last touch aim direction, so the aim point follows the player when nothing steers it. */
const touchDir = { x: 0, z: 1 };
const TOUCH_AIM_DIST = 8;

export function updateAim(): void {
  target = null;
  if (!touch.on) {
    ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(aimPlane, aim)) aim.set(P.x, 1, P.z + 1);
    return;
  }
  if (G.state === 'play') {
    if (stickR && aimStick()) {
      const l = Math.hypot(stickR.dx, stickR.dy);
      touchDir.x = stickR.dx / l;
      touchDir.z = stickR.dy / l;
    } else if (touch.autoAim && !stickR && (target = nearestEnemy(Math.max(...armWeapons().map(w => w.d.range))))) {
      aim.set(target.x, 1, target.z);
      return;
    } else {
      const [mx, mz] = moveInput();
      const l = Math.hypot(mx, mz);
      if (l > MOVE_DEAD) { touchDir.x = mx / l; touchDir.z = mz / l; }
    }
  }
  aim.set(P.x + touchDir.x * TOUCH_AIM_DIST, 1, P.z + touchDir.z * TOUCH_AIM_DIST);
}
