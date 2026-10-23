// Passive auto-weapons: orbiting drones and the static field aura.
import * as THREE from 'three';
import { sfx } from './audio';
import { damage, spawnBullet } from './combat';
import { sparks } from './fx';
import { auraMesh, auraRing, droneGeo, droneMat, scene } from './scene';
import { G, P, S } from './state';
import { rand } from './utils';

const DRONE_ORBIT = 2.4;
const DRONE_RANGE = 15;

export function addDrone(): void {
  const mesh = new THREE.Mesh(droneGeo, droneMat);
  scene.add(mesh);
  G.drones.push({ mesh, cd: rand(0, 0.5), x: P.x, z: P.z });
}

export function removeAllDrones(): void {
  for (const d of G.drones) scene.remove(d.mesh);
}

export function updateDrones(dt: number): void {
  const n = G.drones.length;
  G.drones.forEach((dr, i) => {
    const a = G.time * 1.9 + (i / n) * Math.PI * 2;
    dr.x = P.x + Math.sin(a) * DRONE_ORBIT;
    dr.z = P.z + Math.cos(a) * DRONE_ORBIT;
    dr.mesh.position.set(dr.x, 1.7 + Math.sin(G.time * 5 + i) * 0.15, dr.z);
    dr.mesh.rotation.y += dt * 6;

    dr.cd -= dt;
    if (dr.cd > 0) return;
    let best = null, bd = DRONE_RANGE * DRONE_RANGE;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d2 = (e.x - dr.x) ** 2 + (e.z - dr.z) ** 2;
      if (d2 < bd) { bd = d2; best = e; }
    }
    if (!best) return;
    dr.cd = 0.65 / Math.sqrt(S.rate);
    const dx = best.x - dr.x, dz = best.z - dr.z, l = Math.hypot(dx, dz) || 1;
    spawnBullet(dr.x, dr.z, 1.7, dx / l, dz / l, 40, 10 * S.dmg, 0.5, S.pierce, 0x80ffdb);
    sfx('drone');
  });
}

const AURA_TICK = 0.45;

export function updateAura(dt: number): void {
  const on = S.aura > 0;
  auraMesh.visible = auraRing.visible = on;
  if (!on) return;

  const r = 2.4 + 0.5 * S.aura;
  const pulse = 1 + Math.sin(G.time * 6) * 0.03;
  auraMesh.position.set(P.x, 0.03, P.z);
  auraMesh.scale.setScalar(r * pulse);
  auraRing.position.set(P.x, 0.04, P.z);
  auraRing.scale.setScalar(r * pulse);

  G.auraT -= dt;
  if (G.auraT > 0) return;
  G.auraT = AURA_TICK;
  const dmg = (5 + 4 * S.aura) * S.dmg;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1;
    if (d < r + e.r) {
      damage(e, dmg, (dx / d) * 1.5 / e.r, (dz / d) * 1.5 / e.r, false);
      sparks(e.x, 0.8, e.z, 0x9bb4ff, 2, 3);
    }
  }
}
