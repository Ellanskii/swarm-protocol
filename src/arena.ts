// Random cover pillars and circle-vs-pillar collision.
import * as THREE from 'three';
import { ARENA } from './config';
import { scene } from './scene';
import { rand } from './utils';

export interface Pillar { x: number; z: number; r: number }

export const pillars: Pillar[] = [];

const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a3360, roughness: 0.55, metalness: 0.25 });
const capMat = new THREE.MeshBasicMaterial({ color: 0x4cc9f0 });

for (let i = 0; i < 22; i++) {
  let x = 0, z = 0, r = 1, ok = false;
  for (let tries = 0; tries < 50 && !ok; tries++) {
    x = rand(-ARENA + 6, ARENA - 6);
    z = rand(-ARENA + 6, ARENA - 6);
    r = rand(0.8, 1.9);
    // keep the spawn point clear and leave corridors between pillars
    ok = Math.hypot(x, z) > 10 && pillars.every(p => Math.hypot(p.x - x, p.z - z) > p.r + r + 4);
  }
  if (!ok) continue;
  const h = rand(1.6, 3.8);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 8), pillarMat);
  m.position.set(x, h / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.08, 8), capMat);
  cap.position.set(x, h + 0.04, z);
  scene.add(cap);
  pillars.push({ x, z, r });
}

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
