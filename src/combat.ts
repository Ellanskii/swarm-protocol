// Player projectiles, damage, explosions, enemy death.
import { insidePillar } from './arena';
import { sfx } from './audio';
import { ARENA, LIMITS } from './config';
import { dmgNumber, ringBurst, showBanner, sparks } from './fx';
import { forNear } from './grid';
import { dropGem, spawnPickup } from './pickups';
import { G, S, type Enemy } from './state';
import { rand } from './utils';

export function spawnBullet(
  x: number, z: number, y: number,
  dx: number, dz: number, speed: number,
  dmg: number, life: number, pierce: number, col: number,
): void {
  if (G.bullets.length >= LIMITS.bullets) return;
  G.bullets.push({ x, z, y, vx: dx * speed, vz: dz * speed, dmg, life, pierce, col, last: -1 });
}

/** Max distance a bullet travels per collision substep — prevents tunnelling through small enemies. */
const SUBSTEP = 0.35;

export function updateBullets(dt: number): void {
  for (const b of G.bullets) {
    if (b.life <= 0) continue;
    const speed = Math.hypot(b.vx, b.vz) || 1;
    const steps = Math.max(1, Math.ceil((speed * dt) / SUBSTEP)), sdt = dt / steps;
    for (let s = 0; s < steps && b.life > 0; s++) {
      b.x += b.vx * sdt;
      b.z += b.vz * sdt;
      if (Math.abs(b.x) > ARENA || Math.abs(b.z) > ARENA) { b.life = 0; break; }
      if (insidePillar(b.x, b.z)) { b.life = 0; sparks(b.x, 1, b.z, 0x8899cc, 3, 4); break; }
      forNear(b.x, b.z, e => {
        if (e.dead || e.id === b.last) return;
        const ox = e.x - b.x, oz = e.z - b.z, rr = e.r + 0.22;
        if (ox * ox + oz * oz >= rr * rr) return;
        b.last = e.id;
        damage(e, b.dmg, (b.vx / speed) * 3 / e.r, (b.vz / speed) * 3 / e.r, true);
        sparks(b.x, 1, b.z, e.t.color, 3, 5);
        if (S.explode > 0 && Math.random() < S.explode) explode(b.x, b.z, 2.8, b.dmg * 0.8);
        if (b.pierce > 0) b.pierce--;
        else { b.life = 0; return true; }
      });
    }
    b.life -= dt;
  }
}

const CRIT_MULT = 2.2;

export function damage(e: Enemy, amount: number, kx: number, kz: number, canCrit: boolean): void {
  if (e.dead) return;
  let crit = false;
  if (canCrit && Math.random() < S.crit) { amount *= CRIT_MULT; crit = true; }
  e.hp -= amount;
  e.flash = 0.08;
  e.kx += kx;
  e.kz += kz;
  dmgNumber(e.x, e.z, amount, crit);
  sfx('hit');
  if (e.hp <= 0) kill(e);
}

/** Area damage. Explosions never trigger further explosions. */
export function explode(x: number, z: number, r: number, dmg: number): void {
  ringBurst(x, z, r);
  sparks(x, 0.6, z, 0xffb347, 12, 9);
  for (const e of G.enemies) {
    if (e.dead) continue;
    const ox = e.x - x, oz = e.z - z, d = Math.hypot(ox, oz) || 1;
    if (d < r + e.r) damage(e, dmg, (ox / d) * 6 / e.r, (oz / d) * 6 / e.r, false);
  }
  G.shake = Math.min(1.2, G.shake + 0.12);
  sfx('boom');
}

export function kill(e: Enemy): void {
  e.dead = true;
  G.kills++;
  sparks(e.x, e.t.y, e.z, e.t.color, Math.round(6 + e.r * 8), 7);
  sfx('kill');
  if (e.boss) {
    for (let i = 0; i < 14; i++) dropGem(e.x + rand(-2.5, 2.5), e.z + rand(-2.5, 2.5), 6);
    spawnPickup('heart', e.x + 1, e.z);
    spawnPickup('magnet', e.x - 1, e.z);
    explode(e.x, e.z, 5, 200);
    showBanner('МАТКА ПОВЕРЖЕНА', 'gold', 1.6);
    return;
  }
  dropGem(e.x, e.z, e.t.xp);
  const r = Math.random();
  if (r < 0.012) spawnPickup('heart', e.x, e.z);
  else if (r < 0.016) spawnPickup('magnet', e.x, e.z);
}
