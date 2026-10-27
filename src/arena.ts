// Endless field: map bounds and walls, cover pillars generated per chunk around the mech, circle-vs-pillar collision.
import * as THREE from 'three';
import { FIELD, MAPS, MAP_ORDER } from './config';
import { applyPalette, scene } from './scene';
import { G, P } from './state';

export interface Pillar { x: number; z: number; r: number; h: number }

/** Pillars of the chunks around the mech; rebuilt when the mech crosses into another chunk. */
export const pillars: Pillar[] = [];

const MAX = (2 * FIELD.near + 1) ** 2 * Math.max(...MAP_ORDER.map(id => MAPS[id].pillars));
const pillarMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 });
const capMat = new THREE.MeshBasicMaterial();
const bodyMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.08, 1, 8), pillarMat, MAX);
const capMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.01, 1.01, 0.08, 8), capMat, MAX);
bodyMesh.castShadow = bodyMesh.receiveShadow = true;
// instances move with the mech, so the meshes' own bounds would cull them wrongly
bodyMesh.frustumCulled = capMesh.frustumCulled = false;
bodyMesh.count = capMesh.count = 0;
scene.add(bodyMesh, capMesh);

// ---------------- bounds ----------------
// Z is always endless; a corridor map bounds X with walls that slide along with the mech.

const halfX = (): number => MAPS[G.map].halfX;

/** Keeps a circle of radius `r` inside the map. */
export function keepInField(o: { x: number }, r: number): void {
  const h = halfX() - r;
  if (o.x > h) o.x = h;
  else if (o.x < -h) o.x = -h;
}

export const outOfField = (x: number): boolean => Math.abs(x) > halfX();

/** Moves a spawn point that falls outside the walls onto the wall line, keeping its distance `d` from the mech. */
export function intoField(x: number, z: number, d: number): [number, number] {
  const h = halfX() - 1;
  if (Math.abs(x) <= h) return [x, z];
  const cx = Math.sign(x) * h, dx = cx - P.x;
  return [cx, P.z + Math.sign(z - P.z || 1) * Math.sqrt(Math.max(0, d * d - dx * dx))];
}

const WALL_LEN = 200;
const walls = new THREE.Group();
const wallMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.9 });
// beyond the walls the floor grid is covered with the background color
const voidMat = new THREE.MeshBasicMaterial();
for (const side of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, WALL_LEN), wallMat);
  wall.position.set(side * 0.5, 0.6, 0);
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(120, WALL_LEN), voidMat);
  cover.rotation.x = -Math.PI / 2;
  cover.position.set(side * 61, 0.03, 0);
  const g = new THREE.Group();
  g.add(wall, cover);
  g.userData.side = side;
  walls.add(g);
}
scene.add(walls);

// ---------------- pillars ----------------

/** Same chunk and seed always give the same pillars, so walking back finds the same cover. */
function chunkRng(cx: number, cz: number, seed: number): () => number {
  let s = (Math.imul(cx, 0x27d4eb2d) ^ Math.imul(cz, 0x165667b1) ^ seed) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkPillars(cx: number, cz: number, out: Pillar[]): void {
  const map = MAPS[G.map], [r0, r1] = map.pillarR;
  const rng = chunkRng(cx, cz, G.fieldSeed), C = FIELD.chunk, from = out.length;
  for (let i = 0; i < map.pillars; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const r = r0 + rng() * (r1 - r0);
      // the edge margin keeps corridors between pillars of neighboring chunks too
      const m = r + FIELD.gap / 2;
      const x = cx * C + m + rng() * (C - 2 * m), z = cz * C + m + rng() * (C - 2 * m);
      // keep the start point clear and leave corridors between pillars
      if (Math.hypot(x, z) < FIELD.clear || Math.abs(x) + r > halfX() - FIELD.gap) continue;
      let ok = true;
      for (let j = from; j < out.length && ok; j++) ok = Math.hypot(out[j].x - x, out[j].z - z) > out[j].r + r + FIELD.gap;
      if (!ok) continue;
      out.push({ x, z, r, h: 1.6 + rng() * 2.2 });
      break;
    }
  }
}

let curX = NaN, curZ = NaN, curSeed = NaN, curMap = '';
const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), rot = new THREE.Quaternion();

function paint(): void {
  const p = MAPS[G.map].palette;
  applyPalette(p);
  pillarMat.color.setHex(p.pillar);
  capMat.color.setHex(p.cap);
  wallMat.color.setHex(p.wall);
  wallMat.emissive.setHex(p.wallGlow);
  voidMat.color.setHex(p.sky);
}

/** Slides the walls along with the mech; loads the pillars around it when it enters another chunk or a new run starts. */
export function updateField(): void {
  if (G.map !== curMap) paint();
  const h = halfX();
  walls.visible = h < Infinity;
  if (walls.visible) {
    walls.position.z = Math.round(P.z / 10) * 10;
    for (const g of walls.children) g.position.x = g.userData.side * h;
  }
  const cx = Math.floor(P.x / FIELD.chunk), cz = Math.floor(P.z / FIELD.chunk);
  if (cx === curX && cz === curZ && G.fieldSeed === curSeed && G.map === curMap) return;
  curX = cx;
  curZ = cz;
  curSeed = G.fieldSeed;
  curMap = G.map;
  pillars.length = 0;
  for (let dx = -FIELD.near; dx <= FIELD.near; dx++) {
    for (let dz = -FIELD.near; dz <= FIELD.near; dz++) chunkPillars(cx + dx, cz + dz, pillars);
  }
  pillars.forEach((p, i) => {
    bodyMesh.setMatrixAt(i, m4.compose(pos.set(p.x, p.h / 2, p.z), rot, scl.set(p.r, p.h, p.r)));
    capMesh.setMatrixAt(i, m4.compose(pos.set(p.x, p.h + 0.04, p.z), rot, scl.set(p.r, 1, p.r)));
  });
  bodyMesh.count = capMesh.count = pillars.length;
  bodyMesh.instanceMatrix.needsUpdate = capMesh.instanceMatrix.needsUpdate = true;
}

updateField();

/** Moves a circle of radius `r` out of any pillar it overlaps. */
export function pushOutPillars(o: { x: number; z: number }, r: number): void {
  for (const p of pillars) {
    const ox = o.x - p.x, oz = o.z - p.z, rr = p.r + r, d2 = ox * ox + oz * oz;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 0.001;
      o.x = p.x + (ox / d) * rr;
      o.z = p.z + (oz / d) * rr;
    }
  }
}

export function insidePillar(x: number, z: number): boolean {
  for (const p of pillars) {
    const ox = x - p.x, oz = z - p.z;
    if (ox * ox + oz * oz < p.r * p.r) return true;
  }
  return false;
}
