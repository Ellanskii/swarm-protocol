// Enemy spawning (director), AI, separation, enemy projectiles.
import { insidePillar, intoField, keepInField, outOfField, pushOutPillars } from './arena';
import { sfx } from './audio';
import { damage, explode, selfDestruct } from './combat';
import { ARTILLERY, CROWD, DECOY, TANK, ENEMIES, LIMITS, LOOT, MAPS, MECHS, PACING, REPEL, SHIELD_AURA, WAVES, type EnemyType, type WaveRow } from './config';
import { mushroom, ringBurst, showBanner, sparks } from './fx';
import { forNear } from './grid';
import { hurt } from './player';
import { G, P, S, type Enemy, type EnemyShot } from './state';
import { rand } from './utils';

/** Bosses ignore the crowd limits: a missing final boss would make the run unwinnable. */
export function spawnEnemy(type: EnemyType, x: number, z: number): Enemy | null {
  const t = ENEMIES[type];
  if (type !== 'boss' && (G.typeCount[type] >= t.max || G.enemies.length >= LIMITS.enemies)) return null;
  G.typeCount[type]++;
  // a type's HP never grows with time: upgrades are felt, the run gets harder through the WAVES mix and crowd size
  const e: Enemy = {
    id: G.nextId++, type, t, x, z, kx: 0, kz: 0, hp: t.hp, maxHp: t.hp, r: t.r,
    flash: 0, cd: rand(1.5, 3), side: Math.random() < 0.5 ? -1 : 1, rot: 0, mrot: 0, shielded: false, mark: 0, burn: 0, burnDps: 0, burnTick: 0, dashHit: 0, bump: 0, aim: 0,
    dead: false, born: G.time, boss: false,
  };
  G.enemies.push(e);
  return e;
}

/** Random point on a ring around the player. With `ahead`, a moving mech usually gets it in front. */
function spawnPos(minD: number, maxD: number, ahead = false): [number, number] {
  const front = ahead && P.moving && Math.random() < CROWD.ahead;
  const a = front ? P.legAng + rand(-1.1, 1.1) : Math.random() * Math.PI * 2, d = rand(minD, maxD);
  return intoField(P.x + Math.sin(a) * d, P.z + Math.cos(a) * d, d);
}

/** The WAVES row in force; the map's `rush` moves the run clock ahead. */
function waveRow(): WaveRow {
  const t = G.time + MAPS[G.map].rush;
  let row = WAVES[0];
  for (const w of WAVES) if (t >= w.at) row = w;
  return row;
}

/** A type from the row's mix, reweighted by the map. */
function pickType(row: WaveRow): EnemyType {
  const mix = MAPS[G.map].mix;
  let sum = 0;
  for (const [k, w] of Object.entries(row.mix) as [EnemyType, number][]) sum += w * (mix[k] ?? 1);
  let r = Math.random() * sum;
  for (const [k, w] of Object.entries(row.mix) as [EnemyType, number][]) if ((r -= w * (mix[k] ?? 1)) <= 0) return k;
  return 'grunt';
}

function spawnOne(row: WaveRow): void {
  const [x, z] = spawnPos(24, 31);
  spawnEnemy(pickType(row), x, z);
}

export function spawnDirector(dt: number): void {
  if (G.evacT > 0 || G.deathT > 0) return;
  const row = waveRow(), crowd = MAPS[G.map].spawn;
  // below the row's minimum: top the crowd up right away
  let alive = 0;
  for (const e of G.enemies) if (!e.dead && !e.boss) alive++;
  for (let i = Math.min(Math.round(row.min * crowd) - alive, PACING.refillPerFrame); i > 0; i--) spawnOne(row);
  // and the steady trickle on top
  if ((G.spawnAcc += dt) >= row.every / crowd) {
    G.spawnAcc = 0;
    for (let i = 0; i < row.batch; i++) spawnOne(row);
  }

  recycleStragglers();

  if (G.time >= G.nextBurst) {
    G.nextBurst += PACING.burstEvery;
    const n = Math.round((26 + G.time / 8) * MAPS[G.map].spawn);
    // at the crowd limit the ring is closed with the machines farthest from the mech
    const spare = G.enemies.length + n > LIMITS.enemies ? farthest(n) : [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const type: EnemyType = G.time > 40 && i % 3 === 0 ? 'runner' : 'grunt';
      const [x, z] = intoField(P.x + Math.sin(a) * PACING.burstR, P.z + Math.cos(a) * PACING.burstR, PACING.burstR);
      if (!spawnEnemy(type, x, z) && spare.length) relocate(spare.pop()!, x, z);
    }
    showBanner('ОКРУЖЕНИЕ', 'red', 1.4);
  }

  // one boss at a time: its countdown waits while the current one is alive
  if (G.enemies.some(e => e.boss && !e.dead)) G.nextBoss += dt;
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

/** Machines far behind the mech come back on the spawn ring, mostly ahead of it; the boss onto a closer ring. */
function recycleStragglers(): void {
  const far2 = CROWD.far ** 2, boss2 = CROWD.bossFar ** 2;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d2 = (e.x - P.x) ** 2 + (e.z - P.z) ** 2;
    if (e.boss ? d2 < boss2 : d2 < far2) continue;
    const [x, z] = e.boss ? spawnPos(20, 24, true) : spawnPos(24, 31, true);
    relocate(e, x, z);
  }
}

/** Up to `n` live non-boss machines, farthest from the mech last, all outside the view. */
function farthest(n: number): Enemy[] {
  return G.enemies
    .filter(e => !e.dead && !e.boss && (e.x - P.x) ** 2 + (e.z - P.z) ** 2 > 22 ** 2)
    .sort((a, b) => ((a.x - P.x) ** 2 + (a.z - P.z) ** 2) - ((b.x - P.x) ** 2 + (b.z - P.z) ** 2))
    .slice(-n);
}

function relocate(e: Enemy, x: number, z: number): void {
  e.x = x;
  e.z = z;
  e.kx = e.kz = 0;
  e.aim = 0;
  e.born = G.time; // grow in again instead of popping up
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

    // a boss left behind speeds up so it doesn't get lost in the crowd
    const spd = e.boss && d > CROWD.catchUp ? e.t.speed * Math.min(CROWD.catchUpMax, 1 + (d - CROWD.catchUp) * CROWD.catchUpRate) : e.t.speed;
    e.x += (mx * spd + e.kx) * dt + sx * 0.8;
    e.z += (mz * spd + e.kz) * dt + sz * 0.8;
    e.kx *= kDecay;
    e.kz *= kDecay;
    pushOutPillars(e, e.r);
    keepInField(e, e.r);
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
      if (s.left! <= 0 || s.life <= 0 || insidePillar(s.x, s.z) || outOfField(s.x, s.z) || Math.hypot(s.x - P.x, s.z - P.z) < 0.78) shellBurst(s);
      continue;
    }
    if (insidePillar(s.x, s.z) || outOfField(s.x, s.z)) { s.life = 0; continue; }
    if (P.inv <= 0 && Math.hypot(s.x - P.x, s.z - P.z) < 0.78) {
      hurt(s.dmg);
      s.life = 0;
    }
  }
}
