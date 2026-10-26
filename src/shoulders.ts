// Shoulder systems: auto-firing rockets, mortar and drones mounted in shoulder slots.
import * as THREE from 'three';
import { sfx } from './audio';
import { explode, spawnBullet } from './combat';
import { ARENA, MECHS, SHOULDERS, type ShoulderId } from './config';
import { ringBurst, sparks } from './fx';
import { forNear } from './grid';
import { setSlotPart, type SlotId } from './mech';
import { droneGeo, droneMat, scene } from './scene';
import { G, P, S, type Enemy, type ShoulderState } from './state';
import { rand } from './utils';

const SLOT_ORDER: SlotId[] = ['shoulderR', 'shoulderL'];

export function freeShoulderSlot(): SlotId | null {
  const slots = SLOT_ORDER.slice(0, MECHS[G.mech].shoulders);
  return slots.find(s => !G.shoulders.some(sh => sh.slot === s)) ?? null;
}

/** Mounts a system in a free shoulder slot, or levels it up if already mounted. */
export function installShoulder(id: ShoulderId): void {
  const own = G.shoulders.find(s => s.id === id);
  if (own) own.lv++;
  else {
    const slot = freeShoulderSlot();
    if (!slot) return;
    G.shoulders.push({ id, lv: 1, cd: 0.6, slot });
    setSlotPart(slot, id);
  }
  if (id === 'drone') addDrone();
}

const volley = (sh: ShoulderState) => SHOULDERS[sh.id].count + (sh.lv - 1) * SHOULDERS[sh.id].perLevel;

/** Launch point on top of the mech, roughly over the slot. */
function launchPoint(sh: ShoulderState): [number, number] {
  const side = sh.slot === 'shoulderR' ? 0.35 : -0.35;
  return [P.x + Math.cos(P.ang) * side, P.z - Math.sin(P.ang) * side];
}

function aliveInRange(range: number): Enemy[] {
  const r2 = range * range;
  return G.enemies.filter(e => !e.dead && (e.x - P.x) ** 2 + (e.z - P.z) ** 2 < r2);
}

export function updateShoulders(dt: number): void {
  for (const sh of G.shoulders) {
    if (sh.id === 'drone') continue;
    sh.cd -= dt;
    if (sh.cd > 0) continue;
    const ok = sh.id === 'rockets' ? fireRockets(sh) : fireMortar(sh);
    // nothing to shoot at: check again soon instead of waiting a full cycle
    sh.cd = ok ? SHOULDERS[sh.id].cd : 0.3;
  }
  updateRockets(dt);
  updateShells(dt);
  updateDrones(dt);
}

// ---------------- rockets ----------------

const ROCKET_SPEED = 19;
const ROCKET_LIFE = 3;
const ROCKET_Y = 2.4;

function fireRockets(sh: ShoulderState): boolean {
  const d = SHOULDERS.rockets;
  const targets = aliveInRange(d.range);
  if (!targets.length) return false;
  const [x, z] = launchPoint(sh);
  const n = volley(sh);
  for (let i = 0; i < n; i++) {
    // fan out sideways and back first, then home in
    const a = P.ang + Math.PI + (i - (n - 1) / 2) * 0.5 + rand(-0.2, 0.2);
    G.rockets.push({
      x, z, y: ROCKET_Y, vx: Math.sin(a) * ROCKET_SPEED * 0.6, vz: Math.cos(a) * ROCKET_SPEED * 0.6,
      target: targets[Math.floor(Math.random() * targets.length)], age: -i * 0.05, life: ROCKET_LIFE,
      dmg: d.dmg * S.dmg, blast: d.blast,
    });
  }
  sfx('rocket');
  return true;
}

function nearestTo(x: number, z: number): Enemy | null {
  let best: Enemy | null = null, bd = Infinity;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d2 = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d2 < bd) { bd = d2; best = e; }
  }
  return best;
}

function updateRockets(dt: number): void {
  for (const r of G.rockets) {
    if (r.life <= 0) continue;
    r.age += dt;
    r.life -= dt;
    if (r.age < 0) continue; // staggered launch
    if (!r.target || r.target.dead) r.target = nearestTo(r.x, r.z);
    const t = r.target;
    // turn rate grows with age so rockets never orbit their target forever
    const turn = (3 + r.age * 10) * dt;
    let ang = Math.atan2(r.vx, r.vz);
    if (t) {
      const want = Math.atan2(t.x - r.x, t.z - r.z);
      const diff = Math.atan2(Math.sin(want - ang), Math.cos(want - ang));
      ang += Math.max(-turn, Math.min(turn, diff));
    }
    const sp = ROCKET_SPEED * Math.min(1, 0.6 + r.age * 1.5);
    r.vx = Math.sin(ang) * sp;
    r.vz = Math.cos(ang) * sp;
    r.x += r.vx * dt;
    r.z += r.vz * dt;
    const dist = t ? Math.hypot(t.x - r.x, t.z - r.z) : 10;
    r.y = THREE.MathUtils.clamp(dist * 0.25, 0.8, ROCKET_Y);
    if (Math.random() < 0.5) sparks(r.x, r.y, r.z, 0xffb347, 1, 1);

    let hit = r.life <= 0 || Math.abs(r.x) > ARENA || Math.abs(r.z) > ARENA;
    if (!hit) forNear(r.x, r.z, e => {
      if (e.dead || (e.x - r.x) ** 2 + (e.z - r.z) ** 2 > (e.r + 0.3) ** 2) return;
      hit = true;
      return true;
    });
    if (hit) {
      r.life = 0;
      explode(r.x, r.z, r.blast, r.dmg);
    }
  }
}

// ---------------- mortar ----------------

const SHELL_TIME = 1.1;
const SHELL_ARC = 6;
const DENSITY_PROBES = 30;

function fireMortar(sh: ShoulderState): boolean {
  const d = SHOULDERS.mortar;
  const cands = aliveInRange(d.range);
  if (!cands.length) return false;
  const [x0, z0] = launchPoint(sh);
  const n = volley(sh);
  // pick the densest spots by sampling enemies and counting their neighbours
  const scored: [Enemy, number][] = [];
  for (let i = 0; i < Math.min(DENSITY_PROBES, cands.length); i++) {
    const c = cands[Math.floor(Math.random() * cands.length)];
    let k = 0;
    forNear(c.x, c.z, e => { if (!e.dead && (e.x - c.x) ** 2 + (e.z - c.z) ** 2 < d.blast * d.blast) k++; });
    scored.push([c, k]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < n; i++) {
    const [c] = scored[i % scored.length];
    const tx = c.x + (i ? rand(-2, 2) : 0), tz = c.z + (i ? rand(-2, 2) : 0);
    G.shells.push({ x0, z0, tx, tz, x: x0, z: z0, y: 2.4, t: -i * 0.15, dur: SHELL_TIME, dmg: d.dmg * S.dmg, blast: d.blast, life: 1 });
  }
  sfx('mortar');
  return true;
}

function updateShells(dt: number): void {
  for (const s of G.shells) {
    if (s.life <= 0) continue;
    const before = s.t;
    s.t += dt;
    if (before < 0 && s.t >= 0) ringBurst(s.tx, s.tz, s.blast); // landing warning
    if (s.t < 0) continue;
    const p = Math.min(1, s.t / s.dur);
    s.x = s.x0 + (s.tx - s.x0) * p;
    s.z = s.z0 + (s.tz - s.z0) * p;
    s.y = 2.4 * (1 - p) + 4 * SHELL_ARC * p * (1 - p);
    if (p >= 1) {
      s.life = 0;
      explode(s.tx, s.tz, s.blast, s.dmg);
    }
  }
}

// ---------------- drones ----------------

const DRONE_ORBIT = 2.4;

export function addDrone(): void {
  const mesh = new THREE.Mesh(droneGeo, droneMat);
  scene.add(mesh);
  G.drones.push({ mesh, cd: rand(0, 0.5), x: P.x, z: P.z });
}

export function removeAllDrones(): void {
  for (const d of G.drones) scene.remove(d.mesh);
}

function updateDrones(dt: number): void {
  const n = G.drones.length, def = SHOULDERS.drone;
  G.drones.forEach((dr, i) => {
    const a = G.time * 1.9 + (i / n) * Math.PI * 2;
    dr.x = P.x + Math.sin(a) * DRONE_ORBIT;
    dr.z = P.z + Math.cos(a) * DRONE_ORBIT;
    dr.mesh.position.set(dr.x, 1.7 + Math.sin(G.time * 5 + i) * 0.15, dr.z);
    dr.mesh.rotation.y += dt * 6;

    dr.cd -= dt;
    if (dr.cd > 0) return;
    let best = null, bd = def.range * def.range;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d2 = (e.x - dr.x) ** 2 + (e.z - dr.z) ** 2;
      if (d2 < bd) { bd = d2; best = e; }
    }
    if (!best) return;
    dr.cd = def.cd / Math.sqrt(S.rate);
    const dx = best.x - dr.x, dz = best.z - dr.z, l = Math.hypot(dx, dz) || 1;
    spawnBullet(dr.x, dr.z, 1.7, dx / l, dz / l, 40, def.dmg * S.dmg, 0.5, S.pierce, def.color);
    sfx('drone');
  });
}
