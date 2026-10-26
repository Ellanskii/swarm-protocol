// Arm weapons: every mounted gun fires at once, one shared SYNTHETIK-style active reload.
import { sfx } from './audio';
import { spawnBullet } from './combat';
import { WEAPON_LEVELS, type WeaponId } from './config';
import { showBanner } from './fx';
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
