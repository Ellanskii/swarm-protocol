// Arm weapons: every mounted gun fires at once. Ballistic guns share one SYNTHETIK-style active reload,
// energy weapons share one heat gauge that vents with the same timing window.
import { sfx } from './audio';
import { insidePillar } from './arena';
import { damage, explode, spawnBullet } from './combat';
import { HEAT, LIMITS, OVERLOAD, WEAPON_LEVELS, type WeaponId } from './config';
import { ringBurst, showBanner, sparks, steam } from './fx';
import { fireHeld, manualFire } from './input';
import { muzzleOffset, setSlotPart, type ArmSlot } from './mech';
import { hurt } from './player';
import { muzzle } from './scene';
import { G, P, S, armWeapons, magSize, mkWeapon, type ReloadState, type WeaponState } from './state';
import { clamp, rand } from './utils';

const PERFECT_BONUS = 1.5;
const PERFECT_COLOR = 0xffd166;
/** Energy weapons glow orange while running hot. */
const HOT_COLOR = 0xff8a3d;
/** Fire-button presses this early in a reload are leftover shots, not active-reload attempts. */
const CLICK_GRACE = 0.15;
const ARM_SLOTS: ArmSlot[] = ['armR', 'armL'];

const ammoWeapons = (): WeaponState[] => armWeapons().filter(w => !w.d.heat);
export const heatWeapons = (): WeaponState[] => armWeapons().filter(w => !!w.d.heat);

export function freeArmSlot(): ArmSlot | null {
  return ARM_SLOTS.find(s => !armWeapons().some(w => w.slot === s)) ?? null;
}

/** Mounts a weapon in a free arm, or levels it up if already mounted. */
export function giveWeapon(id: WeaponId): void {
  const own = G.owned[id];
  if (own) {
    own.lv = Math.min(WEAPON_LEVELS.max, own.lv + 1);
    return;
  }
  const slot = freeArmSlot();
  if (!slot) return;
  G.owned[id] = mkWeapon(id, slot);
  setSlotPart(slot, G.owned[id].d.part);
}

export function syncArms(): void {
  for (const w of armWeapons()) setSlotPart(w.slot, w.d.part);
}

/** Extra barrels from levels: +1 at level 3, +2 at level 5. */
export const levelBarrels = (lv: number): number => Math.floor((lv - 1) / WEAPON_LEVELS.barrelEvery);

// ---------------- firing ----------------

function fire(w: WeaponState): void {
  const d = w.d;
  if (d.heat) heatUp(d.heat * S.heat);
  else w.ammo--;
  w.cd = 1 / (d.rate * S.rate);

  // each arm fires straight along the torso facing: parallel lines from both arms, no crossing at the aim point
  const [fwd, right, y] = muzzleOffset(w.slot);
  const fx = Math.sin(P.ang), fz = Math.cos(P.ang);
  const mx = P.x + fx * fwd + fz * right, mz = P.z + fz * fwd - fx * right;
  const base = P.ang;

  if (d.beam) {
    fireBeam(w, mx, y, mz, base);
    return;
  }
  const perfect = G.reload.perfect;
  const isShotgun = d.pellets > 1;
  const n = d.pellets + (S.multi + levelBarrels(w.lv)) * (isShotgun ? 2 : 1);
  const dmg = d.dmg * S.dmg * (1 + WEAPON_LEVELS.dmg * (w.lv - 1)) * (perfect ? PERFECT_BONUS : 1);
  const color = perfect ? PERFECT_COLOR : d.color;

  for (let i = 0; i < n; i++) {
    // shotgun: random cone; others: fan of parallel-ish shots for extra barrels
    const ang = isShotgun
      ? base + rand(-d.spread, d.spread)
      : base + (i - (n - 1) / 2) * 0.1 + rand(-d.spread, d.spread);
    const speed = d.speed * rand(0.92, 1.05);
    const life = (d.range / d.speed) * rand(0.9, 1.1);
    // rockets don't pierce: they burst on the first machine
    const pierce = d.blast ? 0 : S.pierce + d.pierce;
    spawnBullet(mx, mz, y, Math.sin(ang), Math.cos(ang), speed, dmg, life, pierce, color, d.size, d.blast ?? 0, S.pen);
  }

  muzzle.position.set(mx, y + 0.2, mz);
  muzzle.intensity = 45;
  muzzle.color.setHex(color);
  G.shake = Math.min(1.2, G.shake + d.kick * 0.3);
  G.gunKick = 1;
  sfx(w.id);
}

/**
 * Hitscan line from the arm, stops at a pillar, hits every machine on it.
 * Laser (energy): runs on heat, burns through shield auras. Railgun (ballistic): runs on ammo, gets the perfect reload and armor piercing.
 */
function fireBeam(w: WeaponState, mx: number, y: number, mz: number, ang: number): void {
  const d = w.d, dx = Math.sin(ang), dz = Math.cos(ang);
  let len = d.range;
  for (let s = 0.5; s < d.range; s += 0.5) {
    if (insidePillar(mx + dx * s, mz + dz * s)) { len = s; break; }
  }
  // extra barrels widen the beam instead of adding projectiles
  const width = 0.15 * d.size + 0.12 * (S.multi + levelBarrels(w.lv));
  const energy = !!d.heat;
  const hot = energy && G.heat >= S.hotAt;
  const perfect = !energy && G.reload.perfect;
  const mult = hot ? S.hotDmg : perfect ? PERFECT_BONUS : 1;
  const dmg = d.dmg * S.dmg * (1 + WEAPON_LEVELS.dmg * (w.lv - 1)) * mult;
  const push = energy ? 0.4 : 5;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const ox = e.x - mx, oz = e.z - mz;
    const along = ox * dx + oz * dz;
    if (along < 0 || along > len + e.r) continue;
    const side = Math.abs(ox * dz - oz * dx);
    if (side > e.r + width) continue;
    damage(e, dmg, dx * push / e.r, dz * push / e.r, true, energy, energy ? 0 : S.pen);
    if (!energy) sparks(e.x, 1, e.z, d.color, 6, 6);
    else if (Math.random() < 0.3) sparks(e.x, 1, e.z, d.color, 1, 3);
  }
  const color = hot ? HOT_COLOR : perfect ? PERFECT_COLOR : d.color;
  if (G.beams.length < LIMITS.beams) {
    G.beams.push({
      x1: mx, z1: mz, x2: mx + dx * len, z2: mz + dz * len, y, col: color,
      life: energy ? 0.06 : 0.3, max: energy ? 0.06 : 0.3, w: energy ? 0.14 : width, flicker: energy,
    });
  }
  muzzle.position.set(mx, y + 0.2, mz);
  muzzle.intensity = energy ? 25 : 60;
  muzzle.color.setHex(color);
  if (!energy) {
    G.shake = Math.min(1.2, G.shake + d.kick * 0.3);
    G.gunKick = 1;
  }
  sfx(w.id);
}

// ---------------- reload and vent ----------------

/** Opens a timed bar with a random active window, shared by the reload and the vent. */
function openWindow(r: ReloadState, dur: number): void {
  r.on = true;
  r.t = 0;
  r.dur = dur;
  r.arUsed = false;
  r.perfect = false;
  const width = clamp(0.14 + S.arW, 0.1, 0.34);
  r.arS = rand(0.3, 0.82 - width);
  r.arE = r.arS + width;
}

/** Reloads every ballistic weapon at once; takes as long as the slowest one. */
export function startReload(): void {
  const guns = ammoWeapons();
  if (G.reload.on || guns.every(w => w.ammo >= magSize(w.d))) return;
  openWindow(G.reload, Math.max(...guns.map(w => w.d.reload)) / S.reload);
}

function finishReload(): void {
  for (const w of ammoWeapons()) w.ammo = magSize(w.d);
  G.reload.on = false;
  sfx('reload');
}

/** Vents energy weapons: manual vents scale with heat, an overheat forces the long one. */
function startVent(forced: boolean): void {
  if (G.vent.on || (!forced && G.heat < HEAT.minVent)) return;
  G.ventFrom = G.heat;
  openWindow(G.vent, (forced ? HEAT.overVent : HEAT.ventBase + HEAT.ventPerHeat * G.heat) / S.cool);
  sfx('vent');
}

function finishVent(): void {
  G.heat = 0;
  G.vent.on = false;
}

function heatUp(amount: number): void {
  G.heat += amount;
  G.heatIdle = 0;
  if (G.heat < 1) return;
  G.heat = 1;
  if (S.overload) overload();
  else {
    hurt(HEAT.overDmg);
    showBanner('ПЕРЕГРЕВ', 'red', 0.9);
  }
  sparks(P.x, 1.6, P.z, HOT_COLOR, 14, 6);
  sfx('overheat');
  startVent(true);
}

/** Overload: the overheat discharges as lightning into every machine around instead of into the mech. */
function overload(): void {
  ringBurst(P.x, P.z, OVERLOAD.r);
  for (const e of G.enemies) {
    if (e.dead || (e.x - P.x) ** 2 + (e.z - P.z) ** 2 > (OVERLOAD.r + e.r) ** 2) continue;
    damage(e, OVERLOAD.dmg * S.dmg, 0, 0, true, true);
    sparks(e.x, 1.2, e.z, 0x9fe8ff, 6, 6);
  }
  G.shake = Math.min(1.2, G.shake + 0.5);
  showBanner('ПЕРЕГРУЗКА', 'blue', 0.9);
}

/** Perfect vent: instant cooldown and a steam blast, stronger the hotter the guns were. */
function steamBurst(): void {
  finishVent();
  explode(P.x, P.z, HEAT.steamR, HEAT.steamDmg * S.dmg * Math.max(0.4, G.ventFrom));
  for (let i = 0; i < 16; i++) steam(P.x, 1, P.z, 6);
  showBanner('СБРОС ТЕПЛА', 'blue', 0.9);
  sfx('vent');
}

/** Active attempt: inside the window — instant + bonus; outside — jam. */
function tryActive(r: ReloadState, onPerfect: () => void): void {
  if (!r.on || r.arUsed) return;
  r.arUsed = true;
  const f = r.t / r.dur;
  if (f >= r.arS && f <= r.arE) {
    onPerfect();
    sfx('perfect');
  } else {
    r.dur += 0.75;
    showBanner('ЗАКЛИНИЛО', 'red', 0.7);
    sfx('jam');
  }
}

function perfectReload(): void {
  finishReload();
  G.reload.perfect = true;
  showBanner('ИДЕАЛЬНО · +50% УРОНА', 'gold', 0.9);
}

/** The one skill button: reloads and vents, or is the active attempt for whichever bar is running. */
export function reloadPressed(): void {
  if (G.reload.on || G.vent.on) {
    tryActive(G.reload, perfectReload);
    tryActive(G.vent, steamBurst);
    return;
  }
  startReload();
  startVent(false);
}

/** Fire button pressed: during a reload or vent it is the active attempt, like a tap on touch. */
export function firePressed(): void {
  if (G.reload.on && G.reload.t > CLICK_GRACE) tryActive(G.reload, perfectReload);
  if (G.vent.on && G.vent.t > CLICK_GRACE) tryActive(G.vent, steamBurst);
}

export function updateWeapons(dt: number): void {
  const r = G.reload, v = G.vent;
  if (r.on) {
    r.t += dt;
    if (r.t >= r.dur) finishReload();
  }
  if (v.on) {
    v.t += dt;
    G.heat = G.ventFrom * Math.max(0, 1 - v.t / v.dur);
    if (Math.random() < dt * 25) steam(P.x, 1.6, P.z);
    if (v.t >= v.dur) finishVent();
  } else {
    G.heatIdle += dt;
    if (G.heatIdle > HEAT.coolDelay) G.heat = Math.max(0, G.heat - HEAT.cool * S.cool * dt);
    if (G.heat >= S.hotAt && Math.random() < dt * 6) steam(P.x, 1.6, P.z, 1);
  }

  const held = fireHeld();
  // auto-fire never overheats on its own; overheating is a choice of the player holding the trigger
  const heatOk = !v.on && (G.heat < HEAT.autoStop || manualFire());
  let empty = false;
  for (const w of armWeapons()) {
    w.cd -= dt;
    if (!held || w.cd > 0) continue;
    if (w.d.heat) {
      if (heatOk && !G.vent.on) fire(w);
      continue;
    }
    if (r.on || w.ammo <= 0) continue;
    fire(w);
    if (w.ammo === 0) empty = true;
  }
  // the first magazine to run dry reloads them all
  if (empty) startReload();
}
