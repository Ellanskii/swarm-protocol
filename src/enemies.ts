// Enemy spawning (director), AI, separation, enemy projectiles.
import { insidePillar, pushOutPillars } from './arena';
import { sfx } from './audio';
import { ARENA, ENEMIES, LIMITS, PACING, type EnemyType } from './config';
import { showBanner } from './fx';
import { forNear } from './grid';
import { hurt } from './player';
import { G, P, type Enemy } from './state';
import { clamp, rand } from './utils';

export function spawnEnemy(type: EnemyType, x: number, z: number): Enemy | null {
  const t = ENEMIES[type];
  if (G.typeCount[type] >= t.max || G.enemies.length >= LIMITS.enemies) return null;
  G.typeCount[type]++;
  const hp = t.hp * (1 + (G.time / 60) * PACING.hpPerMinute);
  const e: Enemy = {
    id: G.nextId++, type, t, x, z, kx: 0, kz: 0, hp, maxHp: hp, r: t.r,
    flash: 0, cd: rand(1.5, 3), side: Math.random() < 0.5 ? -1 : 1, rot: 0,
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
  ];
  let sum = 0;
  for (const [, w] of weights) sum += w;
  let r = Math.random() * sum;
  for (const [k, w] of weights) if ((r -= w) <= 0) return k;
  return 'grunt';
}

export function spawnDirector(dt: number): void {
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

  if (G.time >= G.nextBoss) {
    G.nextBoss += PACING.bossEvery;
    G.bossN++;
    const [x, z] = spawnPos(22, 26);
    const b = spawnEnemy('boss', x, z);
    if (b) {
      b.hp = b.maxHp = ENEMIES.boss.hp * (1 + (G.bossN - 1) * 0.9) * (1 + G.time / 600);
      b.boss = true;
    }
    showBanner('МАТКА ИДЁТ', 'red', 2);
    sfx('boss');
    G.shake = 1;
  }
}

function fireEShot(x: number, z: number, dx: number, dz: number, speed: number, dmg: number): void {
  if (G.eshots.length >= LIMITS.enemyShots) return;
  G.eshots.push({ x, z, vx: dx * speed, vz: dz * speed, dmg, life: 4 });
}

export function updateEnemies(dt: number): void {
  const dmgMul = 1 + G.time / PACING.dmgDoubleEvery;
  const kDecay = Math.exp(-8 * dt);

  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 0.001;
    const nx = dx / d, nz = dz / d;
    let mx = nx, mz = nz;

    if (e.type === 'spitter') {
      // keep distance, strafe, spit
      if (d < 9) { mx = -nx; mz = -nz; } else if (d < 13) { mx = -nz * e.side; mz = nx * e.side; }
      e.cd -= dt;
      if (e.cd <= 0 && d < 18) { e.cd = rand(2, 3.2); fireEShot(e.x, e.z, nx, nz, 9, 8 * dmgMul); }
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
    e.flash -= dt;

    if (d < e.r + 0.5) {
      hurt(e.t.dmg * dmgMul);
      e.kx -= nx * 6;
      e.kz -= nz * 6;
    }
  }
}

export function updateEnemyShots(dt: number): void {
  for (const s of G.eshots) {
    if (s.life <= 0) continue;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    if (Math.abs(s.x) > ARENA || Math.abs(s.z) > ARENA || insidePillar(s.x, s.z)) { s.life = 0; continue; }
    if (P.inv <= 0 && Math.hypot(s.x - P.x, s.z - P.z) < 0.78) {
      hurt(s.dmg);
      s.life = 0;
    }
  }
}
