// Shoulder systems: auto-firing rockets, mortar and drones mounted in shoulder slots.
import * as THREE from 'three';
import { sfx } from './audio';
import { beamHit, explode, spawnBullet } from './combat';
import { ARENA, BRACE, EVOLUTIONS, LIMITS, MECHS, SHOULDERS, type ShoulderId } from './config';
import { ringBurst, sparks } from './fx';
import { forNear } from './grid';
import { setSlotPart, type SlotId } from './mech';
import { droneGeo, droneMat, scene } from './scene';
import { G, P, S, braced, type Enemy, type ShoulderState } from './state';
import { rand } from './utils';

const SLOT_ORDER: SlotId[] = ['shoulderR', 'shoulderL'];
/** Evolved shoulder systems cycle this much faster. */
const EVO_CD = 0.7;

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

/** Display name: the evolution's once evolved. */
export function shoulderName(sh: ShoulderState): string {
  const evo = sh.evo && Object.values(EVOLUTIONS).find(e => e.base === sh.id);
  return evo ? evo.name : SHOULDERS[sh.id].name;
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
    sh.cd -= dt * (braced() ? BRACE.shoulderRate : 1);
    if (sh.cd > 0) continue;
    const ok = sh.id === 'rockets' ? fireRockets(sh) : sh.id === 'mortar' ? fireMortar(sh) : sh.id === 'mines' ? dropMine(sh)
      : sh.id === 'repair' ? repair(sh) : fireFlak(sh);
    // nothing to shoot at: check again soon instead of waiting a full cycle
    sh.cd = ok ? SHOULDERS[sh.id].cd * (sh.evo ? EVO_CD : 1) : 0.3;
  }
  updateRockets(dt);
  updateShells(dt);
  updateMines(dt);
  updateDrones(dt);
}

// ---------------- repair drone ----------------

/** Restores HP while the mech is damaged; waits at full health. */
function repair(sh: ShoulderState): boolean {
  if (P.hp >= P.maxHp) return false;
  P.hp = Math.min(P.maxHp, P.hp + volley(sh));
  sparks(P.x, 1.8, P.z, SHOULDERS.repair.color, 10, 3);
  sfx('repair');
  return true;
}

// ---------------- rockets ----------------

const ROCKET_SPEED = 19;
const ROCKET_LIFE = 3;
const ROCKET_Y = 2.4;

function fireRockets(sh: ShoulderState): boolean {
  const d = SHOULDERS.rockets;
  let targets = aliveInRange(d.range);
  if (!targets.length) return false;
  const [x, z] = launchPoint(sh);
  // micro-rocket swarm: twice the rockets, marked machines first
  const n = volley(sh) * (sh.evo ? 2 : 1);
  if (sh.evo) {
    const marked = targets.filter(e => e.mark > 0);
    if (marked.length) targets = marked;
  }
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

// ---------------- mines ----------------

const MINE_ARM = 0.5;
const MINE_LIFE = 25;

/** Drops a mine under the mech unless the field is full. */
function dropMine(sh: ShoulderState): boolean {
  const d = SHOULDERS.mines;
  if (G.mines.filter(m => !m.dead).length >= volley(sh)) return false;
  G.mines.push({ x: P.x, z: P.z, arm: MINE_ARM, life: MINE_LIFE, dmg: d.dmg * S.dmg, blast: d.blast, dead: false });
  sfx('mine');
  return true;
}

function updateMines(dt: number): void {
  const trigger = SHOULDERS.mines.range;
  for (const m of G.mines) {
    if (m.dead) continue;
    m.arm -= dt;
    m.life -= dt;
    if (m.life <= 0) { m.dead = true; continue; }
    if (m.arm > 0) continue;
    let hit = false;
    forNear(m.x, m.z, e => {
      if (e.dead || (e.x - m.x) ** 2 + (e.z - m.z) ** 2 > (trigger + e.r) ** 2) return;
      hit = true;
      return true;
    });
    if (hit) {
      m.dead = true;
      explode(m.x, m.z, m.blast, m.dmg);
    }
  }
}

// ---------------- flak ----------------

/** Shoots down enemy shells first (they threaten the mech), then kamikaze drones. */
function fireFlak(sh: ShoulderState): boolean {
  const d = SHOULDERS.flak, r2 = d.range * d.range;
  const [x, z] = launchPoint(sh);
  let n = volley(sh), fired = false;
  const near = <T extends { x: number; z: number }>(list: T[], ok: (o: T) => boolean): T[] =>
    list.filter(o => ok(o) && (o.x - P.x) ** 2 + (o.z - P.z) ** 2 < r2)
      .sort((a, b) => (a.x - P.x) ** 2 + (a.z - P.z) ** 2 - ((b.x - P.x) ** 2 + (b.z - P.z) ** 2));
  for (const s of near(G.eshots, s => s.life > 0)) {
    if (n-- <= 0) break;
    s.life = 0;
    tracer(x, z, s.x, s.z, 0);
    sparks(s.x, 1, s.z, d.color, 5, 4);
    fired = true;
  }
  for (const e of near(G.enemies, e => !e.dead && e.type === 'runner')) {
    if (n-- <= 0) break;
    tracer(x, z, e.x, e.z, d.dmg * S.dmg);
    fired = true;
  }
  if (fired) sfx('flak');
  return fired;
}

/** Fast flak round from the shoulder; with 0 damage it is only the visual of a shot-down shell. */
function tracer(x: number, z: number, tx: number, tz: number, dmg: number): void {
  const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
  spawnBullet(x, z, 2.2, dx / l, dz / l, 60, dmg, dmg ? 0.4 : l / 60, 0, SHOULDERS.flak.color, { size: 0.7 });
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
  const laserDrones = G.shoulders.some(s => s.id === 'drone' && s.evo);
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
    if (laserDrones) {
      // laser drones: a short beam through everything on the line, ignoring shields
      const len = def.range * 0.8;
      beamHit(dr.x, dr.z, dx / l, dz / l, len, 0.2, def.dmg * 1.4 * S.dmg, 0.3, true, 0);
      if (G.beams.length < LIMITS.beams) {
        G.beams.push({ x1: dr.x, z1: dr.z, x2: dr.x + dx / l * len, z2: dr.z + dz / l * len, y: 1.6, life: 0.1, max: 0.1, w: 0.1, col: 0xff4df0, flicker: true });
      }
      sfx('laser');
    } else {
      spawnBullet(dr.x, dr.z, 1.7, dx / l, dz / l, 40, def.dmg * S.dmg, 0.5, S.pierce, def.color);
      sfx('drone');
    }
  });
}
