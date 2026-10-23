// Renderer, camera, lights, static arena and all reusable meshes.
import * as THREE from 'three';
import { ARENA, ENEMIES, ENEMY_TYPES, LIMITS, type EnemyType } from './config';

export const canvas = document.getElementById('c') as HTMLCanvasElement;

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d17);
scene.fog = new THREE.Fog(0x0b0d17, 34, 72);

export const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);

export function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------- lights ----------------
scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x20122a, 1.3));
export const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 90 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
export const muzzle = new THREE.PointLight(0xffd080, 0, 10, 2);
scene.add(muzzle);

// ---------------- floor & walls ----------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA * 2 + 30, ARENA * 2 + 30),
  new THREE.MeshStandardMaterial({ color: 0x141a30, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const gridLines = new THREE.GridHelper(ARENA * 2, ARENA, 0x2c3668, 0x1b2246);
gridLines.position.y = 0.01;
scene.add(gridLines);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x1b2246, emissive: 0x5a2bb0, emissiveIntensity: 0.9 });
const walls: [number, number, number, number][] = [
  [0, -ARENA - 0.5, ARENA * 2 + 2, 1],
  [0, ARENA + 0.5, ARENA * 2 + 2, 1],
  [-ARENA - 0.5, 0, 1, ARENA * 2 + 2],
  [ARENA + 0.5, 0, 1, ARENA * 2 + 2],
];
for (const [x, z, w, d] of walls) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wallMat);
  m.position.set(x, 0.6, z);
  scene.add(m);
}

// ---------------- player ----------------
export const playerMesh = new THREE.Group();
export const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.42, 0.7, 4, 12),
  new THREE.MeshStandardMaterial({ color: 0x4cc9f0, roughness: 0.35, metalness: 0.3 }),
);
body.position.y = 0.85;
body.castShadow = true;
const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
visor.position.set(0, 0.4, 0.33);
body.add(visor);
export const gun = new THREE.Mesh(
  new THREE.BoxGeometry(0.16, 0.16, 0.9),
  new THREE.MeshStandardMaterial({ color: 0x252b3d, metalness: 0.6, roughness: 0.4 }),
);
gun.position.set(0.32, 0.95, 0.5);
gun.castShadow = true;
playerMesh.add(body, gun);
scene.add(playerMesh);

export const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
export const laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.3 }));
laser.frustumCulled = false;
scene.add(laser);

export const auraMesh = new THREE.Mesh(
  new THREE.CircleGeometry(1, 48),
  new THREE.MeshBasicMaterial({ color: 0x7b9cff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false }),
);
auraMesh.rotation.x = -Math.PI / 2;
auraMesh.visible = false;
scene.add(auraMesh);
export const auraRing = new THREE.Mesh(
  new THREE.RingGeometry(0.96, 1, 64),
  new THREE.MeshBasicMaterial({ color: 0x9bb4ff, transparent: true, opacity: 0.5, depthWrite: false }),
);
auraRing.rotation.x = -Math.PI / 2;
auraRing.visible = false;
scene.add(auraRing);

// ---------------- instanced pools ----------------
function pool(geo: THREE.BufferGeometry, mat: THREE.Material, max: number, shadow = false): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color(1, 1, 1)); // allocates instanceColor
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = shadow;
  scene.add(m);
  return m;
}

const runnerGeo = new THREE.ConeGeometry(0.5, 1.1, 4);
runnerGeo.rotateX(Math.PI / 2); // tip points forward (+Z)
const ENEMY_GEOMETRY: Record<EnemyType, THREE.BufferGeometry> = {
  grunt: new THREE.BoxGeometry(1, 1.1, 1),
  runner: runnerGeo,
  spitter: new THREE.OctahedronGeometry(0.72),
  brute: new THREE.DodecahedronGeometry(1.2),
  boss: new THREE.IcosahedronGeometry(2.3, 0),
};

export const enemyMeshes = {} as Record<EnemyType, THREE.InstancedMesh>;
export const enemyColors = {} as Record<EnemyType, THREE.Color>;
for (const k of ENEMY_TYPES) {
  enemyColors[k] = new THREE.Color(ENEMIES[k].color);
  enemyMeshes[k] = pool(
    ENEMY_GEOMETRY[k],
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1 }),
    ENEMIES[k].max,
    true,
  );
}

const glow = () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
export const bulletMesh = pool(new THREE.BoxGeometry(0.13, 0.13, 0.75), glow(), LIMITS.bullets);
export const eshotMesh = pool(new THREE.SphereGeometry(0.28, 10, 8), glow(), LIMITS.enemyShots);
export const gemMesh = pool(new THREE.OctahedronGeometry(0.24), glow(), LIMITS.gems);
export const partMesh = pool(new THREE.BoxGeometry(0.17, 0.17, 0.17), glow(), LIMITS.particles);

export interface Ring {
  m: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  life: number;
  max: number;
  r: number;
}
export const rings: Ring[] = [];
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1, 40),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.1;
  m.visible = false;
  scene.add(m);
  rings.push({ m, life: 0, max: 0.35, r: 1 });
}

// ---------------- pickup / drone templates ----------------
export const heartTpl = new THREE.Group();
{
  const mat = new THREE.MeshBasicMaterial({ color: 0x5dffa0, toneMapped: false });
  heartTpl.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.2), mat), new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), mat));
}
export const magnetTpl = new THREE.Mesh(
  new THREE.TorusGeometry(0.32, 0.1, 8, 18, Math.PI),
  new THREE.MeshBasicMaterial({ color: 0xff5a5a, toneMapped: false }),
);
export const droneGeo = new THREE.OctahedronGeometry(0.28);
export const droneMat = new THREE.MeshBasicMaterial({ color: 0x80ffdb, toneMapped: false });
