// Arm weapons: every mounted gun fires at once, one shared SYNTHETIK-style active reload.
import { sfx } from './audio';
import { insidePillar } from './arena';
import { damage, spawnBullet } from './combat';
import { WEAPON_LEVELS, type WeaponId } from './config';
import { showBanner, sparks } from './fx';
import { fireHeld } from './input';
import { muzzleOffset, setSlotPart, type ArmSlot } from './mech';
import { muzzle } from './scene';
import { G, P, S, armWeapons, magSize, mkWeapon, type WeaponState } from './state';
import { clamp, rand } from './utils';

const PERFECT_BONUS = 1.5;
const PERFECT_COLOR = 0xffd166;
/** Fire-button presses this early in a reload are leftover shots, not active-reload attempts. */
const CLICK_GRACE = 0.15;
const ARM_SLOTS: ArmSlot[] = ['armR', 'armL'];

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
  w.ammo--;
  w.cd = 1 / (d.rate * S.rate);

  // each arm fires along the torso facing, converging on the torso aim point
  const [fwd, right, y] = muzzleOffset(w.slot);
  const fx = Math.sin(P.ang), fz = Math.cos(P.ang);
  const mx = P.x + fx * fwd + fz * right, mz = P.z + fz * fwd - fx * right;
  const base = Math.atan2(P.tx - mx, P.tz - mz);

  const perfect = G.reload.perfect;
  if (d.beam) {
    fireBeam(w, mx, y, mz, base, perfect);
    return;
  }
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
    spawnBullet(mx, mz, y, Math.sin(ang), Math.cos(ang), speed, dmg, life, S.pierce + d.pierce, color, d.size);
  }

  muzzle.position.set(mx, y + 0.2, mz);
  muzzle.intensity = 45;
  muzzle.color.setHex(color);
  G.shake = Math.min(1.2, G.shake + d.kick * 0.3);
  G.gunKick = 1;
  sfx(w.id);
}

/** Laser: hitscan line from the arm, stops at a pillar, hits every machine on it. */
function fireBeam(w: WeaponState, mx: number, y: number, mz: number, ang: number, perfect: boolean): void {
  const d = w.d, dx = Math.sin(ang), dz = Math.cos(ang);
  let len = d.range;
  for (let s = 0.5; s < d.range; s += 0.5) {
    if (insidePillar(mx + dx * s, mz + dz * s)) { len = s; break; }
  }
  // extra barrels widen the beam instead of adding projectiles
  const width = 0.15 + 0.12 * (S.multi + levelBarrels(w.lv));
  const dmg = d.dmg * S.dmg * (1 + WEAPON_LEVELS.dmg * (w.lv - 1)) * (perfect ? PERFECT_BONUS : 1);
  for (const e of G.enemies) {
    if (e.dead) continue;
    const ox = e.x - mx, oz = e.z - mz;
    const along = ox * dx + oz * dz;
    if (along < 0 || along > len + e.r) continue;
    const side = Math.abs(ox * dz - oz * dx);
    if (side > e.r + width) continue;
    damage(e, dmg, dx * 0.4 / e.r, dz * 0.4 / e.r, true, true);
    if (Math.random() < 0.3) sparks(e.x, 1, e.z, d.color, 1, 3);
  }
  const color = perfect ? PERFECT_COLOR : d.color;
  Object.assign(G.beam, { x1: mx, z1: mz, x2: mx + dx * len, z2: mz + dz * len, y, t: 0.06, col: color });
  muzzle.position.set(mx, y + 0.2, mz);
  muzzle.intensity = 25;
  muzzle.color.setHex(color);
  sfx('laser');
}

// ---------------- reload ----------------

/** Reloads every arm weapon at once; takes as long as the slowest one. */
export function startReload(): void {
  const r = G.reload;
  if (r.on || armWeapons().every(w => w.ammo >= magSize(w.d))) return;
  r.on = true;
  r.t = 0;
  r.dur = Math.max(...armWeapons().map(w => w.d.reload)) / S.reload;
  r.arUsed = false;
  r.perfect = false;
  const width = clamp(0.14 + S.arW, 0.1, 0.34);
  r.arS = rand(0.3, 0.82 - width);
  r.arE = r.arS + width;
}

function finishReload(): void {
  for (const w of armWeapons()) w.ammo = magSize(w.d);
  G.reload.on = false;
  sfx('reload');
}

/** Active-reload attempt during reload: inside the window — instant + bonus; outside — jam. */
function tryActive(): void {
  const r = G.reload;
  if (!r.on || r.arUsed) return;
  r.arUsed = true;
  const f = r.t / r.dur;
  if (f >= r.arS && f <= r.arE) {
    finishReload();
    r.perfect = true;
    showBanner('ИДЕАЛЬНО · +50% УРОНА', 'gold', 0.9);
    sfx('perfect');
  } else {
    r.dur += 0.75;
    showBanner('ЗАКЛИНИЛО', 'red', 0.7);
    sfx('jam');
  }
}

export function reloadPressed(): void {
  if (G.reload.on) tryActive();
  else startReload();
}

/** Fire button pressed: during a reload it is the active-reload attempt, like a tap on touch. */
export function firePressed(): void {
  if (G.reload.on && G.reload.t > CLICK_GRACE) tryActive();
}

export function updateWeapons(dt: number): void {
  const r = G.reload;
  if (r.on) {
    r.t += dt;
    if (r.t >= r.dur) finishReload();
  }
  let empty = false;
  for (const w of armWeapons()) {
    w.cd -= dt;
    if (r.on || !fireHeld() || w.cd > 0 || w.ammo <= 0) continue;
    fire(w);
    if (w.ammo === 0) empty = true;
  }
  // the first magazine to run dry reloads them all
  if (empty) startReload();
}
