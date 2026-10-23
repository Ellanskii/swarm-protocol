// XP gems, heart and magnet pickups, leveling.
import { sfx } from './audio';
import { LIMITS, xpFor } from './config';
import { showBanner } from './fx';
import { heartTpl, magnetTpl, scene } from './scene';
import { G, P, S, type Pickup } from './state';

export function dropGem(x: number, z: number, v: number): void {
  // at the cap, merge into a random existing gem instead of dropping XP
  if (G.gems.length >= LIMITS.gems) {
    G.gems[(Math.random() * G.gems.length) | 0].v += v;
    return;
  }
  G.gems.push({ x, z, v, vel: 0, pull: false, ph: Math.random() * 6, dead: false });
}

export function updateGems(dt: number): void {
  for (const g of G.gems) {
    if (g.dead) continue;
    const dx = P.x - g.x, dz = P.z - g.z, d = Math.hypot(dx, dz);
    if (d < S.magnet) g.pull = true;
    if (g.pull) {
      g.vel = Math.min(g.vel + 45 * dt, 30);
      const step = Math.min(d, g.vel * dt);
      g.x += (dx / (d || 1)) * step;
      g.z += (dz / (d || 1)) * step;
    }
    if (d < 0.8) { g.dead = true; gainXP(g.v); sfx('pick'); }
  }
}

export function spawnPickup(kind: Pickup['kind'], x: number, z: number): void {
  const mesh = (kind === 'heart' ? heartTpl : magnetTpl).clone();
  mesh.position.set(x, 0.8, z);
  scene.add(mesh);
  G.pickups.push({ kind, x, z, mesh, life: 45, dead: false });
}

export function updatePickups(dt: number): void {
  for (const p of G.pickups) {
    p.life -= dt;
    p.mesh.rotation.y += dt * 2.5;
    p.mesh.position.y = 0.8 + Math.sin(G.time * 4) * 0.15;
    if (Math.hypot(P.x - p.x, P.z - p.z) < 1.1) {
      p.dead = true;
      if (p.kind === 'heart') {
        P.hp = Math.min(P.maxHp, P.hp + 30);
        showBanner('+30 HP', 'blue', 0.7);
      } else {
        for (const g of G.gems) g.pull = true;
        showBanner('МАГНИТ', 'blue', 0.7);
      }
      sfx('perfect');
    }
    if (p.life <= 0) p.dead = true;
    if (p.dead) scene.remove(p.mesh);
  }
}

export function removeAllPickups(): void {
  for (const p of G.pickups) scene.remove(p.mesh);
}

/** Adds XP; level-ups queue up in G.pendingLevels and are shown by the main loop. */
export function gainXP(v: number): void {
  P.xp += v;
  while (P.xp >= P.xpNext) {
    P.xp -= P.xpNext;
    P.level++;
    P.xpNext = xpFor(P.level);
    G.pendingLevels++;
  }
}
