// Player projectiles, damage, explosions, enemy death.
import { insidePillar } from './arena';
import { sfx } from './audio';
import { ARENA, BRACE, CHAIN, CLUSTER, DESIGNATOR, LIMITS, LOOT, NAPALM, PACING, SHIELD_AURA } from './config';
import { dmgNumber, machineDeath, ringBurst, showBanner, sparks } from './fx';
import { forNear } from './grid';
import { dropGem, spawnPickup } from './pickups';
import { G, S, braced, type Bullet, type Enemy } from './state';
import { rand } from './utils';

/** Optional shot traits; see Bullet. */
export interface ShotOpts { size?: number; blast?: number; pen?: number; chain?: number; energy?: boolean }

export function spawnBullet(
  x: number, z: number, y: number,
  dx: number, dz: number, speed: number,
  dmg: number, life: number, pierce: number, col: number, o: ShotOpts = {},
): void {
  if (G.bullets.length >= LIMITS.bullets) return;
  G.bullets.push({
    x, z, y, vx: dx * speed, vz: dz * speed, dmg, life, pierce, col, last: -1,
    s: o.size ?? 1, blast: o.blast ?? 0, pen: o.pen ?? 0, chain: o.chain ?? 0, energy: o.energy ?? false,
  });
}

/** A rocket shot ends: it explodes wherever it stops. */
function detonate(b: Bullet): void {
  b.life = 0;
  explode(b.x, b.z, b.blast, b.dmg);
  if (b.chain) chainLightning(b.x, b.z, b.chain, b.dmg * 0.6, CHAIN.jump);
}

/**
 * Hits every machine on a line from (x, z) along (dx, dz), `len` long and `width` wide.
 * `push` scales the knockback; calls `onHit` for effects.
 */
export function beamHit(
  x: number, z: number, dx: number, dz: number, len: number, width: number,
  dmg: number, push: number, pierceShield: boolean, pen: number, onHit?: (e: Enemy) => void,
): void {
  for (const e of G.enemies) {
    if (e.dead) continue;
    const ox = e.x - x, oz = e.z - z;
    const along = ox * dx + oz * dz;
    if (along < 0 || along > len + e.r) continue;
    if (Math.abs(ox * dz - oz * dx) > e.r + width) continue;
    damage(e, dmg, dx * push / e.r, dz * push / e.r, true, pierceShield, pen);
    onHit?.(e);
  }
}

/** Lightning from (x, z) to the nearest machine within `reach`, then on to the next one `jumps` more times. Ignores shields. */
export function chainLightning(x: number, z: number, jumps: number, dmg: number, reach: number): void {
  const hit = new Set<Enemy>();
  for (let i = 0; i <= jumps; i++) {
    let best: Enemy | null = null, bd = reach * reach;
    for (const e of G.enemies) {
      if (e.dead || hit.has(e)) continue;
      const d2 = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d2 < bd) { bd = d2; best = e; }
    }
    if (!best) return;
    hit.add(best);
    if (G.beams.length < LIMITS.beams) {
      G.beams.push({ x1: x, z1: z, x2: best.x, z2: best.z, y: 1.1, life: 0.15, max: 0.15, w: 0.12, col: 0x9fe8ff, flicker: true });
    }
    sparks(best.x, 1, best.z, 0x9fe8ff, 4, 4);
    damage(best, dmg, 0, 0, false, true);
    x = best.x;
    z = best.z;
  }
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
      if (insidePillar(b.x, b.z)) {
        if (b.blast) detonate(b);
        else { b.life = 0; sparks(b.x, 1, b.z, 0x8899cc, 3, 4); }
        break;
      }
      // zero-damage rounds are visual tracers only
      if (b.dmg > 0) forNear(b.x, b.z, e => {
        if (e.dead || e.id === b.last) return;
        const ox = e.x - b.x, oz = e.z - b.z, rr = e.r + 0.22;
        if (ox * ox + oz * oz >= rr * rr) return;
        b.last = e.id;
        damage(e, b.dmg, (b.vx / speed) * 3 / e.r, (b.vz / speed) * 3 / e.r, true, b.energy, b.pen);
        sparks(b.x, 1, b.z, e.t.color, 3, 5);
        if (b.blast) { detonate(b); return true; }
        if (S.explode > 0 && Math.random() < S.explode) explode(b.x, b.z, 2.8, b.dmg * 0.8);
        if (b.pierce > 0) b.pierce--;
        else { b.life = 0; return true; }
      });
    }
    if (b.blast && b.life > 0) {
      if (Math.random() < dt * 30) sparks(b.x, b.y, b.z, 0x8a8f9e, 1, 1);
      if ((b.life -= dt) <= 0) detonate(b);
    } else b.life -= dt;
  }
}

const CRIT_MULT = 2.2;

/** `pierceShield`: energy weapons burn through shield auras. `pen`: armor the hit ignores. */
export function damage(e: Enemy, amount: number, kx: number, kz: number, canCrit: boolean, pierceShield = false, pen = 0): void {
  if (e.dead) return;
  let crit = false;
  if (canCrit && Math.random() < S.crit) { amount *= CRIT_MULT; crit = true; }
  if (e.mark > 0) amount *= 1 + DESIGNATOR.bonus;
  if (braced()) amount *= BRACE.dmg;
  // armor takes a flat bite out of every hit (never more than 75%), the shield aura halves what is left
  const armor = e.t.armor - pen;
  if (armor > 0) amount = Math.max(amount * 0.25, amount - armor);
  if (e.shielded && !pierceShield) amount *= SHIELD_AURA.mult;
  e.hp -= amount;
  e.flash = 0.08;
  e.kx += kx;
  e.kz += kz;
  dmgNumber(e.x, e.z, amount, crit);
  sfx('hit');
  if (e.hp <= 0) kill(e);
}

/**
 * Area damage. Explosions never trigger the "explosive rounds" upgrade. Primary blasts scatter cluster bomblets
 * and leave napalm when those modifiers are taken; `secondary` blasts (the bomblets themselves) do neither.
 */
export function explode(x: number, z: number, r: number, dmg: number, secondary = false): void {
  r *= S.blast;
  ringBurst(x, z, r);
  sparks(x, 0.6, z, 0xffb347, 12, 9);
  for (const e of G.enemies) {
    if (e.dead) continue;
    const ox = e.x - x, oz = e.z - z, d = Math.hypot(ox, oz) || 1;
    if (d < r + e.r) damage(e, dmg, (ox / d) * 6 / e.r, (oz / d) * 6 / e.r, false);
  }
  G.shake = Math.min(1.2, G.shake + 0.12);
  sfx('boom');
  if (secondary) return;
  for (let i = 0; i <= S.cluster && S.cluster && G.bomblets.length < LIMITS.bomblets; i++) {
    const a = Math.random() * Math.PI * 2, d = r * 0.5 + rand(0.5, CLUSTER.spread);
    G.bomblets.push({ x: x + Math.sin(a) * d, z: z + Math.cos(a) * d, t: CLUSTER.delay * rand(0.8, 1.4), r: CLUSTER.r, dmg: dmg * CLUSTER.dmg });
  }
  if (S.napalm && G.fires.length < LIMITS.fires) {
    G.fires.push({ x, z, r: r * NAPALM.rMul, life: NAPALM.life, tick: 0, dps: NAPALM.dps * S.napalm * S.dmg });
  }
}

export function kill(e: Enemy): void {
  e.dead = true;
  G.kills++;
  sparks(e.x, e.t.y, e.z, e.t.color, Math.round(6 + e.r * 8), 7);
  machineDeath(e.x, e.t.y * (e.r / e.t.r), e.z, e.r, e.t.color, e.rot);
  sfx(e.r >= 0.6 ? 'boom' : 'kill');
  if (e.boss) {
    for (let i = 0; i < 14; i++) dropGem(e.x + rand(-2.5, 2.5), e.z + rand(-2.5, 2.5), 6);
    const scrap = Math.round(LOOT.bossScrap * S.scrap);
    for (let i = 0; i < 8; i++) dropGem(e.x + rand(-3, 3), e.z + rand(-3, 3), Math.ceil(scrap / 8), 'scrap');
    if (e.cores) dropGem(e.x, e.z, e.cores, 'core');
    spawnPickup('heart', e.x + 1, e.z);
    spawnPickup('magnet', e.x - 1, e.z);
    explode(e.x, e.z, 5, 200);
    if (e.final) startEvacuation();
    else showBanner('КУЗНЯ УНИЧТОЖЕНА', 'gold', 1.6);
    return;
  }
  dropGem(e.x, e.z, e.t.xp);
  // fractional scrap is a chance for one more piece
  const s = e.t.scrap * S.scrap;
  const n = Math.floor(s) + (Math.random() < s % 1 ? 1 : 0);
  if (n > 0) dropGem(e.x + rand(-0.4, 0.4), e.z + rand(-0.4, 0.4), n, 'scrap');
  const r = Math.random();
  if (r < 0.012) spawnPickup('heart', e.x, e.z);
  else if (r < 0.016) spawnPickup('magnet', e.x, e.z);
}

/** Final boss down: the remaining machines shut down, loot flies to the mech, victory after a short delay. */
function startEvacuation(): void {
  G.evacT = PACING.evacDelay;
  for (const e of G.enemies) if (!e.dead) kill(e);
  for (const s of G.eshots) s.life = 0;
  G.shake = 1.2;
  showBanner('ЭВАКУАЦИЯ', 'blue', PACING.evacDelay);
}

/** Kamikaze drone hits the mech: blows up without loot, it was not shot down. */
export function selfDestruct(e: Enemy): void {
  e.dead = true;
  ringBurst(e.x, e.z, 1.6);
  sparks(e.x, 0.8, e.z, 0xff3b3b, 14, 8);
  machineDeath(e.x, 0.8, e.z, e.r, e.t.color, e.rot);
  G.shake = Math.min(1.2, G.shake + 0.25);
  sfx('boom');
}
