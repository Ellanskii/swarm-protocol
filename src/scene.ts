// Renderer, camera, lights, floor and all reusable meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ENEMIES, ENEMY_TYPES, LIMITS, type EnemyType, type Palette } from './config';

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

// ---------------- floor ----------------
// The field is endless: floor and grid follow the camera, snapped to the major grid step so the lines stay put.
// The grid is baked into the ground texture: thick lines with soft halos, one tile per major cell, redrawn on a map change.
// The GPU samples one texture, which is cheaper than a pass of line geometry.
const MAJOR = 10;
const GRID_PX = 512;
const gridCanvas = document.createElement('canvas');
gridCanvas.width = gridCanvas.height = GRID_PX;
const gridTex = new THREE.CanvasTexture(gridCanvas);
gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
gridTex.repeat.set(200 / MAJOR, 200 / MAJOR);
gridTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
gridTex.colorSpace = THREE.SRGBColorSpace;

const floor = new THREE.Group();
// the texture carries the ground color, and its lines also glow on their own
const groundMat = new THREE.MeshStandardMaterial({ roughness: 0.95, map: gridTex, emissiveMap: gridTex, emissive: 0xffffff, emissiveIntensity: 0.55 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
floor.add(ground);
scene.add(floor);

const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

function drawNeonGrid(p: Palette): void {
  const g = gridCanvas.getContext('2d')!, S = GRID_PX;
  g.fillStyle = css(p.ground);
  g.fillRect(0, 0, S, S);
  const lines = (at: number[], col: number, w: number, halo: number) => {
    // a zero width is ignored by canvas (the last width stays), so skip the lines instead
    if (w <= 0) return;
    g.strokeStyle = css(col);
    g.shadowColor = css(col);
    g.shadowBlur = halo;
    g.lineWidth = w;
    g.beginPath();
    for (const v of at) {
      g.moveTo(v, 0); g.lineTo(v, S);
      g.moveTo(0, v); g.lineTo(S, v);
    }
    g.stroke();
  };
  // minor lines every 2 world units; major lines sit on the tile edges, half on each side, so tiles join seamlessly
  const minor = S / (MAJOR / 2);
  lines([1, 2, 3, 4].map(i => i * minor), p.gridMinor, p.gridMinorW ?? 2, p.gridMinorGlow ?? 6);
  lines([0, S], p.gridMajor, p.gridMajorW ?? 8, p.gridMajorGlow ?? 18);
  lines([0, S], 0xffffff, p.gridCoreW ?? 1.5, 0);
  g.shadowBlur = 0;
  gridTex.needsUpdate = true;
}

/** Recolors the sky, fog and floor for the current map. */
export function applyPalette(p: Palette): void {
  (scene.background as THREE.Color).setHex(p.sky);
  (scene.fog as THREE.Fog).color.setHex(p.sky);
  drawNeonGrid(p);
}

export function followFloor(x: number, z: number): void {
  floor.position.set(Math.round(x / MAJOR) * MAJOR, 0, Math.round(z / MAJOR) * MAJOR);
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
export type PartMat = 'body' | 'dark' | 'glow' | 'halo';

export interface EnemyPart {
  mesh: THREE.InstancedMesh;
  mat: PartMat;
  anim: PartAnim;
  /** Fixed color of glow parts; body parts take the type color, dark parts a dark metal. */
  glow: THREE.Color;
  /** Neon outline: switched with the palette's `modelRim`, in the machine's type color. */
  rim: boolean;
}

const bx = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
/** Cylinder lying along +Z, starting at z. */
const barrelGeo = (r: number, len: number, x: number, y: number, z: number) =>
  new THREE.CylinderGeometry(r, r, len, 10).rotateX(Math.PI / 2).translate(x, y, z + len / 2);

/** Thin bar from one point to another at height y; outlines read as neon only when they are a bit thicker than a hairline. */
const RIM_THICK = 1.5;
const bar = (x1: number, z1: number, x2: number, z2: number, y: number, t: number) =>
  new THREE.BoxGeometry(t * RIM_THICK, t * RIM_THICK, Math.hypot(x2 - x1, z2 - z1)).rotateY(Math.atan2(x2 - x1, z2 - z1)).translate((x1 + x2) / 2, y, (z1 + z2) / 2);
/** Neon outline of a box's top face, as four bars; y sits a hair above the face so the top-down camera always sees it. */
const outline = (w: number, d: number, x: number, y: number, z: number, t = 0.05): THREE.BufferGeometry[] => {
  const l = x - w / 2, r = x + w / 2, f = z + d / 2, b = z - d / 2;
  return [bar(l, b, r, b, y, t), bar(l, f, r, f, y, t), bar(l, b, l, f, y, t), bar(r, b, r, f, y, t)];
};

/**
 * A neon outline is two parts: a thin hot core and, around it, a thicker additive halo like the glass of a neon tube.
 * `make(k)` builds the bars with their thickness multiplied by k. Own parts per anim, so the outline can be switched off.
 */
const neon = (anim: PartAnim, make: (k: number) => THREE.BufferGeometry[]): PartSpec[] => [
  { mat: 'glow', rim: true, anim, geos: make(1) },
  { mat: 'halo', rim: true, anim, geos: make(3) },
];

/** `rim` parts are the neon outlines, colored from the machine's type color. */
interface PartSpec { mat: PartMat; anim?: PartAnim; glow?: number; rim?: boolean; geos: THREE.BufferGeometry[] }

const ENEMY_PARTS_SPEC: Record<EnemyType, PartSpec[]> = {
  // walking assembler: boxy body, two stepping legs, claws, one visor slit
  grunt: [
    { mat: 'body', geos: [bx(0.8, 0.55, 0.75, 0, 0.78, 0)] },
    { mat: 'dark', geos: [bx(0.5, 0.2, 0.42, 0, 1.15, -0.05), bx(0.12, 0.12, 0.45, -0.5, 0.72, 0.15), bx(0.12, 0.12, 0.45, 0.5, 0.72, 0.15)] },
    { mat: 'glow', glow: 0xffe066, geos: [bx(0.42, 0.08, 0.05, 0, 0.85, 0.39)] },
    { mat: 'dark', anim: 'legL', geos: [bx(0.18, 0.52, 0.24, -0.24, 0.26, 0)] },
    { mat: 'dark', anim: 'legR', geos: [bx(0.18, 0.52, 0.24, 0.24, 0.26, 0)] },
    ...neon('face', k => outline(0.8, 0.75, 0, 1.06, 0, 0.05 * k)),
  ],
  // kamikaze drone: flat hull on four rotors, red warhead glowing at the nose
  runner: [
    { mat: 'body', geos: [new THREE.OctahedronGeometry(0.42).scale(1, 0.45, 1.35)] },
    { mat: 'dark', anim: 'rotor', geos: [bx(1.1, 0.05, 0.08), bx(0.08, 0.05, 1.1), ...[[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]].map(([x, z]) => new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10).translate(x, 0.06, z))] },
    { mat: 'glow', glow: 0xff3b3b, geos: [new THREE.SphereGeometry(0.14, 10, 8).translate(0, -0.02, 0.42)] },
    // the flat diamond of the hull
    ...neon('face', k => [bar(-0.42, 0, 0, 0.57, 0, 0.05 * k), bar(0, 0.57, 0.42, 0, 0, 0.05 * k), bar(0.42, 0, 0, -0.57, 0, 0.05 * k), bar(0, -0.57, -0.42, 0, 0, 0.05 * k)]),
  ],
  // light tank: hull and tracks follow the movement, the turret tracks the player
  spitter: [
    { mat: 'body', anim: 'hull', geos: [bx(0.9, 0.34, 1.1, 0, 0.4, 0)] },
    { mat: 'dark', anim: 'hull', geos: [bx(0.24, 0.32, 1.22, -0.53, 0.2, 0), bx(0.24, 0.32, 1.22, 0.53, 0.2, 0)] },
    { mat: 'body', geos: [bx(0.56, 0.26, 0.56, 0, 0.7, -0.05)] },
    { mat: 'dark', geos: [barrelGeo(0.07, 0.68, 0, 0.72, 0.2)] },
    { mat: 'glow', glow: 0xff8c42, geos: [bx(0.3, 0.06, 0.04, 0, 0.75, 0.24)] },
    ...neon('hull', k => outline(0.9, 1.1, 0, 0.58, 0, 0.045 * k)),
    ...neon('face', k => outline(0.56, 0.56, 0, 0.84, -0.05, 0.04 * k)),
  ],
  // heavy tank: wide armored hull, big turret, long barrel
  brute: [
    { mat: 'body', anim: 'hull', geos: [bx(1.7, 0.6, 2.0, 0, 0.62, 0)] },
    { mat: 'dark', anim: 'hull', geos: [bx(0.42, 0.56, 2.2, -0.98, 0.3, 0), bx(0.42, 0.56, 2.2, 0.98, 0.3, 0), bx(1.74, 0.12, 0.5, 0, 0.98, 0.78)] },
    { mat: 'body', geos: [bx(1.0, 0.45, 1.0, 0, 1.15, -0.1)] },
    { mat: 'dark', geos: [barrelGeo(0.13, 1.4, 0, 1.18, 0.38)] },
    { mat: 'glow', glow: 0xff3b3b, geos: [bx(0.5, 0.08, 0.05, 0, 1.24, 0.41)] },
    ...neon('hull', k => outline(1.7, 2.0, 0, 0.93, 0, 0.07 * k)),
    ...neon('face', k => outline(1.0, 1.0, 0, 1.385, -0.1, 0.06 * k)),
  ],
  // artillery platform: four struts and a barrel raised at the sky
  artillery: [
    { mat: 'body', geos: [bx(1.2, 0.4, 1.2, 0, 0.78, 0)] },
    { mat: 'dark', geos: [
      ...[[-0.52, -0.52], [0.52, -0.52], [-0.52, 0.52], [0.52, 0.52]].map(([x, z]) => bx(0.14, 0.78, 0.14, x, 0.39, z)),
      new THREE.CylinderGeometry(0.13, 0.15, 1.5, 10).translate(0, 0.75, 0).rotateX(0.75).translate(0, 0.9, -0.15),
    ] },
    { mat: 'glow', glow: 0xffb347, geos: [bx(0.6, 0.08, 0.05, 0, 0.82, 0.61)] },
    ...neon('face', k => outline(1.2, 1.2, 0, 0.99, 0, 0.06 * k)),
  ],
  // shield bearer: walker carrying a glowing emitter on a mast
  shield: [
    { mat: 'body', geos: [bx(0.92, 0.7, 0.82, 0, 0.88, 0)] },
    { mat: 'dark', geos: [new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8).translate(0, 1.5, 0)] },
    { mat: 'glow', glow: 0x9fe8ff, geos: [new THREE.IcosahedronGeometry(0.22, 0).translate(0, 1.86, 0), bx(0.5, 0.07, 0.05, 0, 0.98, 0.42)] },
    { mat: 'dark', anim: 'legL', geos: [bx(0.22, 0.55, 0.28, -0.3, 0.27, 0)] },
    { mat: 'dark', anim: 'legR', geos: [bx(0.22, 0.55, 0.28, 0.3, 0.27, 0)] },
    ...neon('face', k => outline(0.92, 0.82, 0, 1.24, 0, 0.05 * k)),
  ],
  // the Forge: a walking factory with chimneys and an open furnace
  boss: [
    { mat: 'body', geos: [bx(3.2, 2.0, 3.0, 0, 2.3, 0)] },
    { mat: 'dark', geos: [new THREE.CylinderGeometry(0.32, 0.36, 1.6, 10).translate(-0.9, 4.0, -0.8), new THREE.CylinderGeometry(0.32, 0.36, 1.6, 10).translate(0.9, 4.0, -0.8), bx(3.3, 0.25, 3.1, 0, 3.35, 0)] },
    { mat: 'glow', glow: 0xff6b1a, geos: [bx(1.8, 0.8, 0.05, 0, 2.1, 1.53), new THREE.CylinderGeometry(0.26, 0.26, 0.08, 10).translate(-0.9, 4.82, -0.8), new THREE.CylinderGeometry(0.26, 0.26, 0.08, 10).translate(0.9, 4.82, -0.8)] },
    { mat: 'dark', anim: 'legL', geos: [bx(0.6, 1.35, 0.6, -1.3, 0.67, 1.1), bx(0.6, 1.35, 0.6, 1.3, 0.67, -1.1)] },
    { mat: 'dark', anim: 'legR', geos: [bx(0.6, 1.35, 0.6, 1.3, 0.67, 1.1), bx(0.6, 1.35, 0.6, -1.3, 0.67, -1.1)] },
    ...neon('face', k => outline(3.3, 3.1, 0, 3.485, 0, 0.12 * k)),
  ],
};

/** Hover height of flying machines. */
export const ENEMY_HOVER: Partial<Record<EnemyType, number>> = { runner: 0.8 };

const enemyMats: Record<PartMat, THREE.Material> = {
  body: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.25 }),
  dark: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.5 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  halo: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
};

const hsl = { h: 0, s: 0, l: 0 };
export const enemyParts = {} as Record<EnemyType, EnemyPart[]>;
export const enemyColors = {} as Record<EnemyType, THREE.Color>;
/** Neon outline colors: the type color at full saturation and a high lightness, so the outline glows against its own body. */
export const enemyRimColors = {} as Record<EnemyType, THREE.Color>;
for (const k of ENEMY_TYPES) {
  enemyColors[k] = new THREE.Color(ENEMIES[k].color);
  enemyRimColors[k] = new THREE.Color().setHSL(enemyColors[k].getHSL(hsl).h, 1, 0.66);
  enemyParts[k] = ENEMY_PARTS_SPEC[k].map(p => ({
    mesh: pool(mergeGeometries(p.geos.map(g => (g.index ? g.toNonIndexed() : g))), enemyMats[p.mat], ENEMIES[k].max, p.mat === 'body'),
    mat: p.mat,
    anim: p.anim ?? 'face',
    glow: new THREE.Color(p.glow ?? 0xffffff),
    rim: !!p.rim,
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
  LIMITS.beams + 32, // plus tank sight lines
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

/**
 * Mushroom clouds: spheres (fireball, cap dome), tori (cap roll, ground skirt) and a stem.
 * One shader for all three: lumpy surface, light from above, per-instance alpha for the fade-out.
 */
export const cloudMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: `
    uniform float uTime;
    attribute float aAlpha;
    varying vec3 vCol;
    varying float vA;
    varying float vShade;
    void main() {
      vec3 p = position;
      float lump = sin(p.x * 7.0 + uTime * 2.0) + sin(p.y * 9.0 - uTime * 1.5) + sin(p.z * 8.0 + uTime * 1.2);
      p += normal * lump * 0.025;
      mat4 m = modelMatrix * instanceMatrix;
      vec3 n = normalize(mat3(m) * normal);
      vec4 wp = m * vec4(p, 1.0);
      // light from above, plus brighter silhouette edges so the puffs read as volume from the top-down camera
      float rim = 1.0 - abs(dot(n, normalize(cameraPosition - wp.xyz)));
      vShade = (0.6 + 0.3 * max(0.0, dot(n, normalize(vec3(0.3, 1.0, 0.4))))) * (0.8 + 0.5 * rim * rim);
      vCol = instanceColor;
      vA = aAlpha;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    varying vec3 vCol;
    varying float vA;
    varying float vShade;
    void main() { gl_FragColor = vec4(vCol * vShade, vA); }`,
  transparent: true,
});

function cloudPool(geo: THREE.BufferGeometry, max: number): THREE.InstancedMesh {
  geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage));
  return pool(geo, cloudMat, max);
}
export const cloudBall = cloudPool(new THREE.SphereGeometry(1, 28, 18), LIMITS.mushrooms * 2);
export const cloudRing = cloudPool(new THREE.TorusGeometry(1, 0.45, 14, 36).rotateX(Math.PI / 2), LIMITS.mushrooms * 2);
/** Unit stem from the ground up, narrower at the top. */
export const cloudStem = cloudPool(new THREE.CylinderGeometry(0.7, 1, 1, 12, 3, true).translate(0, 0.5, 0), LIMITS.mushrooms);

const glow = () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
export const bulletMesh = pool(new THREE.BoxGeometry(0.13, 0.13, 0.75), glow(), LIMITS.bullets);
export const eshotMesh = pool(new THREE.SphereGeometry(0.28, 10, 8), glow(), LIMITS.enemyShots);
export const gemMesh = pool(new THREE.OctahedronGeometry(0.24), glow(), LIMITS.gems);
/** Scrap pickup: a flat gear lying tilted, extruded from a 2D outline so it stays a few hundred triangles per instance. */
function gearGeometry(teeth: number, r: number, tooth: number, hole: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    // root, tooth flank up, tooth top, flank down: the top is narrower than the root so it reads as a gear tooth
    const pts: [number, number][] = [[a, r], [a + step * 0.2, r + tooth], [a + step * 0.45, r + tooth], [a + step * 0.65, r]];
    for (const [ang, rad] of pts) {
      const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
      if (i === 0 && ang === a) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
  }
  shape.closePath();
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  shape.holes.push(h);
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 })
    .translate(0, 0, -depth / 2)
    .rotateX(-Math.PI / 2 + 0.35);
}
export const scrapMesh = pool(
  gearGeometry(8, 0.22, 0.08, 0.08, 0.08),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.6, emissive: 0x30343c }),
  LIMITS.gems,
);
export const partMesh = pool(new THREE.BoxGeometry(0.17, 0.17, 0.17), glow(), LIMITS.particles);

/** Soft round falloff, drawn once. */
function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const haloMat = (k: number) =>
  new THREE.MeshBasicMaterial({ map: haloTex, color: new THREE.Color(k, k, k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const haloTex = haloTexture();
const flat = (w: number, d: number) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
/**
 * Projectile glow, two sprites per shot kind (the player's bullets and the enemies' shots), all flat and additive:
 * a halo around the shot itself and a glint on the floor under it, stretched along the flight, as if the floor were wet.
 * A cheap stand-in for real reflections: instanced draws only, no second scene pass.
 * Each pool is filled from its shot pool in render.ts, copying transforms and colors.
 */
export const bulletHalo = pool(flat(0.8, 1.7), haloMat(0.55), LIMITS.bullets);
export const bulletGlint = pool(flat(1.4, 3.2), haloMat(0.5), LIMITS.bullets);
export const eshotHalo = pool(flat(1.5, 1.5), haloMat(0.7), LIMITS.enemyShots);
export const eshotGlint = pool(flat(2.2, 2.2), haloMat(0.5), LIMITS.enemyShots);

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
