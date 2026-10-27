// Enemy spawning (director), AI, separation, enemy projectiles.
import { insidePillar, pushOutPillars } from './arena';
import { sfx } from './audio';
import { damage, explode, selfDestruct } from './combat';
import { ARENA, ARTILLERY, DECOY, TANK, ENEMIES, LIMITS, LOOT, MECHS, PACING, REPEL, SHIELD_AURA, type EnemyType } from './config';
import { mushroom, ringBurst, showBanner, sparks } from './fx';
import { forNear } from './grid';
import { hurt } from './player';
import { G, P, S, type Enemy, type EnemyShot } from './state';
import { clamp, rand } from './utils';

/** Bosses ignore the crowd limits: a missing final boss would make the run unwinnable. */
export function spawnEnemy(type: EnemyType, x: number, z: number): Enemy | null {
  const t = ENEMIES[type];
  if (type !== 'boss' && (G.typeCount[type] >= t.max || G.enemies.length >= LIMITS.enemies)) return null;
  G.typeCount[type]++;
  const hp = t.hp * (1 + (G.time / 60) * PACING.hpPerMinute);
  const e: Enemy = {
    id: G.nextId++, type, t, x, z, kx: 0, kz: 0, hp, maxHp: hp, r: t.r,
    flash: 0, cd: rand(1.5, 3), side: Math.random() < 0.5 ? -1 : 1, rot: 0, mrot: 0, shielded: false, mark: 0, dashHit: 0, bump: 0, aim: 0,
    dead: false, born: G.time, boss: false,
  };
  G.enemies.push(e);
  return e;
}

/** Random point on a ring around the player, inside the arena. */
function spawnPos(minD: number, maxD: number): [number, number] {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, d = rand(minD, maxD);
    const x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
    if (Math.abs(x) < ARENA - 1 && Math.abs(z) < ARENA - 1) return [x, z];
  }
  const a = Math.random() * Math.PI * 2;
  return [
    clamp(P.x + Math.sin(a) * minD, -ARENA + 1, ARENA - 1),
    clamp(P.z + Math.cos(a) * minD, -ARENA + 1, ARENA - 1),
  ];
}

/** Enemy mix shifts toward tougher types over time. */
function pickType(): EnemyType {
  const t = G.time;
  const weights: [EnemyType, number][] = [
    ['grunt', 1],
    ['runner', t > 25 ? 0.55 : 0],
    ['spitter', t > 55 ? 0.2 : 0],
    ['brute', t > 85 ? 0.08 + t / 1800 : 0],
    ['artillery', t > 150 ? 0.05 : 0],
    ['shield', t > 180 ? 0.05 : 0],
  ];
  let sum = 0;
  for (const [, w] of weights) sum += w;
  let r = Math.random() * sum;
  for (const [k, w] of weights) if ((r -= w) <= 0) return k;
  return 'grunt';
}

export function spawnDirector(dt: number): void {
  if (G.evacT > 0) return;
  G.spawnAcc += Math.min(1.1 + G.time * 0.05, 18) * dt;
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    const [x, z] = spawnPos(24, 31);
    spawnEnemy(pickType(), x, z);
  }

  if (G.time >= G.nextBurst) {
    G.nextBurst += PACING.burstEvery;
    const n = Math.round(26 + G.time / 8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const type: EnemyType = G.time > 40 && i % 3 === 0 ? 'runner' : 'grunt';
      spawnEnemy(type, clamp(P.x + Math.sin(a) * 19, -ARENA + 1, ARENA - 1), clamp(P.z + Math.cos(a) * 19, -ARENA + 1, ARENA - 1));
    }
    showBanner('ОКРУЖЕНИЕ', 'red', 1.4);
  }

  if (G.time >= G.nextBoss && G.bossN < PACING.bossCount) {
    G.nextBoss += PACING.bossEvery;
    G.bossN++;
    const final = G.bossN === PACING.bossCount;
    const [x, z] = spawnPos(22, 26);
    const b = spawnEnemy('boss', x, z);
    if (b) {
      b.hp = b.maxHp = ENEMIES.boss.hp * (1 + (G.bossN - 1) * 0.9) * (1 + G.time / 600) * (final ? PACING.finalBossHp : 1);
      b.boss = true;
      b.final = final;
      b.cores = LOOT.bossCores[Math.min(G.bossN, LOOT.bossCores.length) - 1];
      if (final) b.r *= 1.35;
    }
    showBanner(final ? 'ФИНАЛЬНЫЙ БОСС' : 'КУЗНЯ ИДЁТ', 'red', 2);
    sfx('boss');
    G.shake = 1;
  }
}

function fireEShot(x: number, z: number, dx: number, dz: number, speed: number, dmg: number): void {
  if (G.eshots.length >= LIMITS.enemyShots) return;
  G.eshots.push({ x, z, vx: dx * speed, vz: dz * speed, dmg, life: 4 });
}

/** Machines that walk into the mech; the decoy only fools these. */
const MELEE = new Set<EnemyType>(['grunt', 'runner', 'brute']);

export function updateEnemies(dt: number): void {
  const dmgMul = 1 + G.time / PACING.dmgDoubleEvery;
  const kDecay = Math.exp(-8 * dt);
  const hullTurn = 1 - Math.exp(-4 * dt);

  // shield bearers protect everyone around them (but not each other's bearer status)
  for (const e of G.enemies) e.shielded = false;
  for (const b of G.enemies) {
    if (b.dead || b.type !== 'shield') continue;
    forNear(b.x, b.z, o => {
      if (o !== b && !o.dead && (o.x - b.x) ** 2 + (o.z - b.z) ** 2 < SHIELD_AURA.r ** 2) o.shielded = true;
    });
  }

  const dc = G.decoy;
  for (const e of G.enemies) {
    if (e.dead) continue;
    // melee machines near a decoy go for it instead of the mech
    let gx = P.x, gz = P.z;
    if (dc.life > 0 && MELEE.has(e.type) && (dc.x - e.x) ** 2 + (dc.z - e.z) ** 2 < DECOY.pull ** 2) { gx = dc.x; gz = dc.z; }
    const dx = gx - e.x, dz = gz - e.z, d = Math.hypot(dx, dz) || 0.001;
    const nx = dx / d, nz = dz / d;
    let mx = nx, mz = nz;

    if (e.type === 'spitter') {
      // keep distance, strafe, spit
      if (d < 9) { mx = -nx; mz = -nz; } else if (d < 13) { mx = -nz * e.side; mz = nx * e.side; }
      e.cd -= dt;
      if (e.cd <= 0 && d < 18) { e.cd = rand(2, 3.2); fireEShot(e.x, e.z, nx, nz, 9, 8 * dmgMul); }
    } else if (e.type === 'brute') {
      // heavy tank: keeps rolling in; every few seconds it halts, aims and fires a slow shell at the mech's spot
      if (e.aim > 0) {
        mx = 0; mz = 0;
        if ((e.aim -= dt) <= 0) {
          const tx = P.x, tz = P.z, sx = e.x + nx * e.r, sz = e.z + nz * e.r;
          const dist = Math.hypot(tx - sx, tz - sz) || 0.001;
          if (G.eshots.length < LIMITS.enemyShots) {
            G.eshots.push({ x: sx, z: sz, vx: (tx - sx) / dist * TANK.speed, vz: (tz - sz) / dist * TANK.speed, dmg: TANK.dmg * dmgMul, life: 4, blast: TANK.r, left: dist });
          }
          e.kx -= nx * 3; e.kz -= nz * 3; // recoil
          sparks(sx, 1, sz, 0xff6b35, 8, 5);
          sfx('cannon');
        }
      } else if ((e.cd -= dt) <= 0 && gx === P.x && d > TANK.minRange && d < TANK.range) {
        e.cd = TANK.every * rand(0.85, 1.15);
        e.aim = TANK.aim;
      }
    } else if (e.type === 'artillery') {
      // hold a firing distance and shell the spot the player stands on
      if (d > ARTILLERY.far) { mx = nx; mz = nz; } else if (d < ARTILLERY.near) { mx = -nx; mz = -nz; } else { mx = 0; mz = 0; }
      e.cd -= dt;
      if (e.cd <= 0 && d < ARTILLERY.range) {
        e.cd = ARTILLERY.every * rand(0.85, 1.15);
        if (G.strikes.length < LIMITS.strikes) G.strikes.push({ x: P.x, z: P.z, t: 0, dur: ARTILLERY.warn, r: ARTILLERY.r, dmg: ARTILLERY.dmg * dmgMul });
        sparks(e.x, 1.6, e.z, 0xffb347, 4, 4);
        sfx('mortar');
      }
    } else if (e.type === 'boss') {
      // radial bullet ring
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = 2.8;
        const off = Math.random() * 6;
        for (let k = 0; k < 18; k++) {
          const a = (k / 18) * Math.PI * 2 + off;
          fireEShot(e.x, e.z, Math.sin(a), Math.cos(a), 7.5, 12 * dmgMul);
        }
      }
    }

    // soft separation: heavier (bigger) enemies get pushed less
    let sx = 0, sz = 0;
    forNear(e.x, e.z, o => {
      if (o === e || o.dead) return;
      const ox = e.x - o.x, oz = e.z - o.z, rr = e.r + o.r, d2 = ox * ox + oz * oz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const dd = Math.sqrt(d2), push = ((rr - dd) / dd) * (o.r / rr);
        sx += ox * push;
        sz += oz * push;
      }
    });

    e.x += (mx * e.t.speed + e.kx) * dt + sx * 0.8;
    e.z += (mz * e.t.speed + e.kz) * dt + sz * 0.8;
    e.kx *= kDecay;
    e.kz *= kDecay;
    pushOutPillars(e, e.r);
    e.x = clamp(e.x, -ARENA + e.r, ARENA - e.r);
    e.z = clamp(e.z, -ARENA + e.r, ARENA - e.r);
    e.rot = Math.atan2(nx, nz);
    // hulls turn smoothly toward where they drive
    if (mx || mz) {
      const want = Math.atan2(mx, mz);
      e.mrot += Math.atan2(Math.sin(want - e.mrot), Math.cos(want - e.mrot)) * hullTurn;
    }
    e.flash -= dt;
    e.bump -= dt;

    const toMech = gx === P.x && gz === P.z ? d : Math.hypot(P.x - e.x, P.z - e.z) || 0.001;
    if (e.type === 'runner' && d < e.r + 0.5) {
      // kamikaze: one hit, then it is gone (a decoy takes the blast for the mech)
      if (toMech < e.r + 0.5) hurt(e.t.dmg * dmgMul);
      selfDestruct(e);
    } else if (toMech < e.r + 0.5) {
      hurt(e.t.dmg * dmgMul);
      // Bastion: machines bounce off the hull and get dented
      if (MECHS[G.mech].repel && e.bump <= 0) {
        e.bump = REPEL.cd;
        const ux = (e.x - P.x) / toMech, uz = (e.z - P.z) / toMech;
        damage(e, REPEL.dmg * S.dmg, ux * REPEL.push / e.r, uz * REPEL.push / e.r, false);
        sparks(e.x - ux * e.r, 0.8, e.z - uz * e.r, 0xffd166, 6, 5);
      }
      e.kx -= (P.x - e.x) / toMech * 6;
      e.kz -= (P.z - e.z) / toMech * 6;
    }
  }
}

/** Artillery shells: the marked zone explodes when the warning runs out, hitting the mech and machines alike. */
export function updateStrikes(dt: number): void {
  for (const s of G.strikes) {
    if (s.t >= s.dur) continue;
    s.t += dt;
    if (s.t < s.dur) continue;
    if (s.friendly) {
      // orbital strike: a column of light, machines only
      explode(s.x, s.z, s.r, s.dmg);
      mushroom(s.x, s.z, s.r, 3);
      continue;
    }
    ringBurst(s.x, s.z, s.r);
    sparks(s.x, 0.5, s.z, 0xff8c42, 16, 9);
    G.shake = Math.min(1.2, G.shake + 0.2);
    sfx('boom');
    if (Math.hypot(P.x - s.x, P.z - s.z) < s.r + 0.4) hurt(s.dmg);
    // friendly fire: armor and shields still apply, kills count as the player's with their loot
    for (const e of G.enemies) {
      if (e.dead) continue;
      const ox = e.x - s.x, oz = e.z - s.z, d = Math.hypot(ox, oz) || 1;
      if (d < s.r + e.r) damage(e, s.dmg * ARTILLERY.friendlyMult, (ox / d) * 8 / e.r, (oz / d) * 8 / e.r, false);
    }
  }
}

function shellBurst(s: EnemyShot): void {
  s.life = 0;
  ringBurst(s.x, s.z, s.blast!);
  sparks(s.x, 0.6, s.z, 0xff6b35, 12, 7);
  G.shake = Math.min(1.2, G.shake + 0.15);
  sfx('boom');
  if (Math.hypot(P.x - s.x, P.z - s.z) < s.blast! + 0.4) hurt(s.dmg);
}

export function updateEnemyShots(dt: number): void {
  for (const s of G.eshots) {
    if (s.life <= 0) continue;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    if (s.blast) {
      // tank shell: bursts on its target spot, on a pillar, or on the mech
      s.left! -= Math.hypot(s.vx, s.vz) * dt;
      if (s.left! <= 0 || s.life <= 0 || insidePillar(s.x, s.z) || Math.hypot(s.x - P.x, s.z - P.z) < 0.78) shellBurst(s);
      continue;
    }
    if (Math.abs(s.x) > ARENA || Math.abs(s.z) > ARENA || insidePillar(s.x, s.z)) { s.life = 0; continue; }
    if (P.inv <= 0 && Math.hypot(s.x - P.x, s.z - P.z) < 0.78) {
      hurt(s.dmg);
      s.life = 0;
    }
  }
}
