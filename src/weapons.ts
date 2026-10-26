// Firing, switching and the SYNTHETIK-style active reload.
import { sfx } from './audio';
import { spawnBullet } from './combat';
import { WEAPONS, WEAPON_ORDER, type WeaponId } from './config';
import { showBanner } from './fx';
import { fireHeld } from './input';
import { setSlotPart } from './mech';
import { muzzle } from './scene';
import { G, P, S, curWeapon, magSize, mkWeapon, type WeaponState } from './state';
import { clamp, rand } from './utils';

const PERFECT_BONUS = 1.5;
const PERFECT_COLOR = 0xffd166;

export function giveWeapon(id: WeaponId): void {
  G.owned[id] = mkWeapon(id);
  switchTo(id);
}

export function switchTo(id: WeaponId): void {
  if (!G.owned[id] || id === G.cur) return;
  curWeapon().reloading = false; // switching cancels the reload
  G.cur = id;
  G.fireCd = Math.max(G.fireCd, 0.15);
  syncGunModel();
}

export function cycleWeapon(dir: 1 | -1): void {
  const own = WEAPON_ORDER.filter(id => G.owned[id]);
  const i = own.indexOf(G.cur);
  switchTo(own[(i + dir + own.length) % own.length]);
}

export function syncGunModel(): void {
  setSlotPart('armR', WEAPONS[G.cur].part);
}

// ---------------- firing ----------------

function fire(w: WeaponState): void {
  const d = w.d;
  w.ammo--;
  G.fireCd = 1 / (d.rate * S.rate);

  // shots go where the torso faces, converging from the arm on the torso aim point
  const base = Math.atan2(P.tx - P.mx, P.tz - P.mz);

  const perfect = w.perfect > 0;
  if (perfect) w.perfect--;
  const isShotgun = d.pellets > 1;
  const n = d.pellets + S.multi * (isShotgun ? 2 : 1);
  const dmg = d.dmg * S.dmg * (perfect ? PERFECT_BONUS : 1);
  const color = perfect ? PERFECT_COLOR : d.color;

  for (let i = 0; i < n; i++) {
    // shotgun: random cone; others: fan of parallel-ish shots for multishot
    const ang = isShotgun
      ? base + rand(-d.spread, d.spread)
      : base + (i - (n - 1) / 2) * 0.1 + rand(-d.spread, d.spread);
    const speed = d.speed * rand(0.92, 1.05);
    const life = (d.range / d.speed) * rand(0.9, 1.1);
    spawnBullet(P.mx, P.mz, P.my, Math.sin(ang), Math.cos(ang), speed, dmg, life, S.pierce, color);
  }

  muzzle.position.set(P.mx, P.my + 0.2, P.mz);
  muzzle.intensity = 45;
  muzzle.color.setHex(color);
  G.shake = Math.min(1.2, G.shake + d.kick * 0.3);
  G.gunKick = 1;
  sfx(w.id);
}

// ---------------- reload ----------------

export function startReload(w: WeaponState): void {
  if (w.reloading || w.ammo >= magSize(w.d)) return;
  w.reloading = true;
  w.t = 0;
  w.dur = w.d.reload / S.reload;
  w.arUsed = false;
  const width = clamp(0.14 + S.arW, 0.1, 0.34);
  w.arS = rand(0.3, 0.82 - width);
  w.arE = w.arS + width;
}

function finishReload(w: WeaponState): void {
  w.ammo = magSize(w.d);
  w.reloading = false;
  sfx('reload');
}

/** Second R press during reload: inside the window — instant + bonus; outside — jam. */
function tryActive(w: WeaponState): void {
  if (!w.reloading || w.arUsed) return;
  w.arUsed = true;
  const f = w.t / w.dur;
  if (f >= w.arS && f <= w.arE) {
    finishReload(w);
    w.perfect = magSize(w.d);
    showBanner('ИДЕАЛЬНО · +50% УРОНА', 'gold', 0.9);
    sfx('perfect');
  } else {
    w.dur += 0.75;
    showBanner('ЗАКЛИНИЛО', 'red', 0.7);
    sfx('jam');
  }
}

export function reloadPressed(): void {
  const w = curWeapon();
  if (w.reloading) tryActive(w);
  else startReload(w);
}

export function updateWeapons(dt: number): void {
  G.fireCd -= dt;
  const w = curWeapon();
  if (w.reloading) {
    w.t += dt;
    if (w.t >= w.dur) finishReload(w);
  }
  if (fireHeld() && G.fireCd <= 0 && !w.reloading) {
    if (w.ammo <= 0) startReload(w);
    else {
      fire(w);
      if (w.ammo === 0) startReload(w);
    }
  }
}
