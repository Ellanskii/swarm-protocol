// Renderer, camera, lights, static arena and all reusable meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
/** Holds the current mech model, see mech.ts. */
export const mechRoot = new THREE.Group();
scene.add(mechRoot);

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

// ---------------- enemy machines ----------------
// Each machine is a few instanced parts sharing one transform. Static parts of one material are merged,
// so a type costs 3-5 draw calls whatever the crowd size. Geometry is in machine space: ground at y = 0, facing +Z.

/** How a part moves: faces the player (default), follows the hull, steps like a leg, or spins. */
export type PartAnim = 'face' | 'hull' | 'legL' | 'legR' | 'rotor';
export type PartMat = 'body' | 'dark' | 'glow';

export interface EnemyPart {
  mesh: THREE.InstancedMesh;
  mat: PartMat;
  anim: PartAnim;
  /** Fixed color of glow parts; body parts take the type color, dark parts a dark metal. */
  glow: THREE.Color;
}

const bx = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** Cylinder lying along +Z, starting at z. */
const barrelGeo = (r: number, len: number, x: number, y: number, z: number) =>
  new THREE.CylinderGeometry(r, r, len, 10).rotateX(Math.PI / 2).translate(x, y, z + len / 2);

interface PartSpec { mat: PartMat; anim?: PartAnim; glow?: number; geos: THREE.BufferGeometry[] }

const ENEMY_PARTS_SPEC: Record<EnemyType, PartSpec[]> = {
  // walking assembler: boxy body, two stepping legs, claws, one visor slit
  grunt: [
    { mat: 'body', geos: [bx(0.8, 0.55, 0.75, 0, 0.78, 0)] },
    { mat: 'dark', geos: [bx(0.5, 0.2, 0.42, 0, 1.15, -0.05), bx(0.12, 0.12, 0.45, -0.5, 0.72, 0.15), bx(0.12, 0.12, 0.45, 0.5, 0.72, 0.15)] },
    { mat: 'glow', glow: 0xffe066, geos: [bx(0.42, 0.08, 0.05, 0, 0.85, 0.39)] },
    { mat: 'dark', anim: 'legL', geos: [bx(0.18, 0.52, 0.24, -0.24, 0.26, 0)] },
    { mat: 'dark', anim: 'legR', geos: [bx(0.18, 0.52, 0.24, 0.24, 0.26, 0)] },
  ],
  // kamikaze drone: flat hull on four rotors, red warhead glowing at the nose
  runner: [
    { mat: 'body', geos: [new THREE.OctahedronGeometry(0.42).scale(1, 0.45, 1.35)] },
    { mat: 'dark', anim: 'rotor', geos: [bx(1.1, 0.05, 0.08), bx(0.08, 0.05, 1.1), ...[[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]].map(([x, z]) => new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10).translate(x, 0.06, z))] },
    { mat: 'glow', glow: 0xff3b3b, geos: [new THREE.SphereGeometry(0.14, 10, 8).translate(0, -0.02, 0.42)] },
  ],
  // light tank: hull and tracks follow the movement, the turret tracks the player
  spitter: [
    { mat: 'body', anim: 'hull', geos: [bx(0.9, 0.34, 1.1, 0, 0.4, 0)] },
    { mat: 'dark', anim: 'hull', geos: [bx(0.24, 0.32, 1.22, -0.53, 0.2, 0), bx(0.24, 0.32, 1.22, 0.53, 0.2, 0)] },
    { mat: 'body', geos: [bx(0.56, 0.26, 0.56, 0, 0.7, -0.05)] },
    { mat: 'dark', geos: [barrelGeo(0.07, 0.68, 0, 0.72, 0.2)] },
    { mat: 'glow', glow: 0xff8c42, geos: [bx(0.3, 0.06, 0.04, 0, 0.75, 0.24)] },
  ],
  // heavy tank: wide armored hull, big turret, long barrel
  brute: [
    { mat: 'body', anim: 'hull', geos: [bx(1.7, 0.6, 2.0, 0, 0.62, 0)] },
    { mat: 'dark', anim: 'hull', geos: [bx(0.42, 0.56, 2.2, -0.98, 0.3, 0), bx(0.42, 0.56, 2.2, 0.98, 0.3, 0), bx(1.74, 0.12, 0.5, 0, 0.98, 0.78)] },
    { mat: 'body', geos: [bx(1.0, 0.45, 1.0, 0, 1.15, -0.1)] },
    { mat: 'dark', geos: [barrelGeo(0.13, 1.4, 0, 1.18, 0.38)] },
    { mat: 'glow', glow: 0xff3b3b, geos: [bx(0.5, 0.08, 0.05, 0, 1.24, 0.41)] },
  ],
  // artillery platform: four struts and a barrel raised at the sky
  artillery: [
    { mat: 'body', geos: [bx(1.2, 0.4, 1.2, 0, 0.78, 0)] },
    { mat: 'dark', geos: [
      ...[[-0.52, -0.52], [0.52, -0.52], [-0.52, 0.52], [0.52, 0.52]].map(([x, z]) => bx(0.14, 0.78, 0.14, x, 0.39, z)),
      new THREE.CylinderGeometry(0.13, 0.15, 1.5, 10).translate(0, 0.75, 0).rotateX(0.75).translate(0, 0.9, -0.15),
    ] },
    { mat: 'glow', glow: 0xffb347, geos: [bx(0.6, 0.08, 0.05, 0, 0.82, 0.61)] },
  ],
  // shield bearer: walker carrying a glowing emitter on a mast
  shield: [
    { mat: 'body', geos: [bx(0.92, 0.7, 0.82, 0, 0.88, 0)] },
    { mat: 'dark', geos: [new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8).translate(0, 1.5, 0)] },
    { mat: 'glow', glow: 0x9fe8ff, geos: [new THREE.IcosahedronGeometry(0.22, 0).translate(0, 1.86, 0), bx(0.5, 0.07, 0.05, 0, 0.98, 0.42)] },
    { mat: 'dark', anim: 'legL', geos: [bx(0.22, 0.55, 0.28, -0.3, 0.27, 0)] },
    { mat: 'dark', anim: 'legR', geos: [bx(0.22, 0.55, 0.28, 0.3, 0.27, 0)] },
  ],
  // the Forge: a walking factory with chimneys and an open furnace
  boss: [
    { mat: 'body', geos: [bx(3.2, 2.0, 3.0, 0, 2.3, 0)] },
    { mat: 'dark', geos: [new THREE.CylinderGeometry(0.32, 0.36, 1.6, 10).translate(-0.9, 4.0, -0.8), new THREE.CylinderGeometry(0.32, 0.36, 1.6, 10).translate(0.9, 4.0, -0.8), bx(3.3, 0.25, 3.1, 0, 3.35, 0)] },
    { mat: 'glow', glow: 0xff6b1a, geos: [bx(1.8, 0.8, 0.05, 0, 2.1, 1.53), new THREE.CylinderGeometry(0.26, 0.26, 0.08, 10).translate(-0.9, 4.82, -0.8), new THREE.CylinderGeometry(0.26, 0.26, 0.08, 10).translate(0.9, 4.82, -0.8)] },
    { mat: 'dark', anim: 'legL', geos: [bx(0.6, 1.35, 0.6, -1.3, 0.67, 1.1), bx(0.6, 1.35, 0.6, 1.3, 0.67, -1.1)] },
    { mat: 'dark', anim: 'legR', geos: [bx(0.6, 1.35, 0.6, 1.3, 0.67, 1.1), bx(0.6, 1.35, 0.6, -1.3, 0.67, -1.1)] },
  ],
};

/** Hover height of flying machines. */
export const ENEMY_HOVER: Partial<Record<EnemyType, number>> = { runner: 0.8 };

const enemyMats: Record<PartMat, THREE.Material> = {
  body: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.25 }),
  dark: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.5 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
};

export const enemyParts = {} as Record<EnemyType, EnemyPart[]>;
export const enemyColors = {} as Record<EnemyType, THREE.Color>;
for (const k of ENEMY_TYPES) {
  enemyColors[k] = new THREE.Color(ENEMIES[k].color);
  enemyParts[k] = ENEMY_PARTS_SPEC[k].map(p => ({
    mesh: pool(mergeGeometries(p.geos.map(g => (g.index ? g.toNonIndexed() : g))), enemyMats[p.mat], ENEMIES[k].max, p.mat === 'body'),
    mat: p.mat,
    anim: p.anim ?? 'face',
    glow: new THREE.Color(p.glow ?? 0xffffff),
  }));
}

/** Lit chunks of destroyed machines and their burnt-out hulls. */
export const debrisMesh = pool(new THREE.BoxGeometry(0.24, 0.12, 0.32), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.4 }), LIMITS.debris);
export const wreckMesh = pool(bx(1.3, 0.45, 1.5, 0, 0.22, 0), new THREE.MeshStandardMaterial({ color: 0x1b1f2e, roughness: 0.9, metalness: 0.2 }), LIMITS.wrecks);

/** Mines lying on the ground; their color blinks when armed. */
export const mineMesh = pool(
  mergeGeometries([
    new THREE.CylinderGeometry(0.28, 0.32, 0.12, 12).translate(0, 0.06, 0),
    new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8).translate(0, 0.15, 0),
  ]),
  new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  64,
);

/** Hitscan shots (laser, railgun): stretched glowing boxes, additive so they fade by darkening. */
export const beamMesh = pool(
  new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5),
  new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  LIMITS.beams,
);

/** Decoy hologram: a ghostly column the size of a mech. */
export const decoyMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.55, 0.7, 2.2, 10, 1, true).translate(0, 1.1, 0),
  new THREE.MeshBasicMaterial({ color: 0x80ffdb, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
);
decoyMesh.visible = false;
scene.add(decoyMesh);

/** Flat rings on the ground: artillery warnings, napalm, designator marks, the decoy. Additive, so a dim color reads as faint. */
export const groundRingMesh = pool(
  new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2).translate(0, 0.06, 0),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  LIMITS.strikes * 2 + LIMITS.fires * 2 + 24,
);

/** Shield bearer domes: a flattened hemisphere that is clear in the middle and glows at the rim, with scan bands running up. */
export const domeMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: `
    varying float vRim;
    varying float vY;
    varying vec3 vCol;
    void main() {
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
      vRim = 1.0 - abs(dot(n, normalize(cameraPosition - wp.xyz)));
      vY = position.y;
      vCol = instanceColor;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    uniform float uTime;
    varying float vRim;
    varying float vY;
    varying vec3 vCol;
    void main() {
      float band = smoothstep(0.85, 1.0, sin(vY * 26.0 - uTime * 3.0));
      float k = 0.07 + pow(vRim, 3.0) * 0.9 + band * 0.12 + smoothstep(0.12, 0.0, vY) * 0.5;
      gl_FragColor = vec4(vCol * k, 1.0);
    }`,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
export const domeMesh = pool(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, ENEMIES.shield.max);

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
