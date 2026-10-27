// XP gems, scrap and cores, heart and magnet pickups, leveling.
import { sfx } from './audio';
import { FIELD, LIMITS, xpFor } from './config';
import { showBanner } from './fx';
import { heartTpl, magnetTpl, scene } from './scene';
import { G, P, S, type Gem, type GemKind, type Pickup } from './state';

export function dropGem(x: number, z: number, v: number, kind: GemKind = 'xp'): void {
  if (G.gems.length >= LIMITS.gems) {
    // at the cap: XP merges into a random XP gem, meta currency is credited right away so it is never lost
    const g = G.gems[(Math.random() * G.gems.length) | 0];
    if (kind === 'xp' && g.kind === 'xp') g.v += v;
    else if (kind !== 'xp') collect(kind, v);
    return;
  }
  G.gems.push({ kind, x, z, v, vel: 0, pull: false, ph: Math.random() * 6, dead: false });
}

function collect(kind: GemKind, v: number): void {
  if (kind === 'xp') gainXP(v);
  else if (kind === 'scrap') G.loot.scrap += v;
  else G.loot.cores += v;
}

export function updateGems(dt: number): void {
  // XP left far behind merges into one crystal, other currency is credited, so stragglers don't pile up
  let bank: Gem | null = null;
  for (const g of G.gems) {
    if (g.dead) continue;
    const dx = P.x - g.x, dz = P.z - g.z, d = Math.hypot(dx, dz);
    if (d > FIELD.gemFar && !g.pull && G.evacT <= 0 && G.deathT <= 0) {
      if (g.kind !== 'xp') { g.dead = true; collect(g.kind, g.v); }
      else if (!bank) bank = g;
      else { bank.v += g.v; g.dead = true; }
      continue;
    }
    // during the evacuation and after the mech's death everything left on the field flies to it
    if (d < S.magnet || G.evacT > 0 || G.deathT > 0) g.pull = true;
    if (g.pull) {
      g.vel = Math.min(g.vel + 45 * dt, 30);
      const step = Math.min(d, g.vel * dt);
      g.x += (dx / (d || 1)) * step;
      g.z += (dz / (d || 1)) * step;
    }
    if (d < 0.8) {
      g.dead = true;
      collect(g.kind, g.v);
      sfx('pick');
      if (g.kind === 'core') showBanner(`+${g.v} ЯДР${g.v === 1 ? 'О' : 'А'}`, 'gold', 1);
    }
  }
}

/** Credits every gem still on the field, so nothing is lost when the run ends before it flies in. */
export function collectAllGems(): void {
  for (const g of G.gems) if (!g.dead) { g.dead = true; collect(g.kind, g.v); }
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
