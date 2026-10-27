// Procedural player mech: model assembled from primitives, slot parts, walk animation.
import * as THREE from 'three';
import { JUMP, MECHS, type MechDef, type PartId } from './config';
import { mechRoot } from './scene';
import { G, P, braced } from './state';

export type ArmSlot = 'armR' | 'armL';
export type SlotId = ArmSlot | 'shoulderR' | 'shoulderL';

interface Leg { hip: THREE.Group; knee: THREE.Group }

interface MechRig {
  def: MechDef;
  root: THREE.Group;
  /** Pelvis and everything above it; bobs while walking. */
  pelvis: THREE.Group;
  torso: THREE.Group;
  legs: [Leg, Leg];
  slots: Record<SlotId, THREE.Group>;
  parts: Partial<Record<SlotId, { id: PartId; mesh: THREE.Object3D; len: number }>>;
  /** 0..1, eases in while moving so the legs settle when stopping. */
  stride: number;
  /** Neon outline of the torso roof. */
  rim: THREE.Group;
}

// ---------------- materials ----------------

const hullMat = new THREE.MeshStandardMaterial({ color: 0xdfe8f5, roughness: 0.4, metalness: 0.35 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x252b3d, roughness: 0.45, metalness: 0.6 });
const trimMats = new Map<number, THREE.MeshStandardMaterial>();
const glowMats = new Map<number, THREE.MeshBasicMaterial>();
const haloMats = new Map<number, THREE.MeshBasicMaterial>();

const trimMat = (c: number) => {
  let m = trimMats.get(c);
  if (!m) trimMats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.3 })));
  return m;
};
const glowMat = (c: number) => {
  let m = glowMats.get(c);
  if (!m) glowMats.set(c, (m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false })));
  return m;
};

/** Additive glass of a neon tube: sits around a thinner, whiter core. */
const haloMat = (c: number) => {
  let m = haloMats.get(c);
  if (!m) haloMats.set(c, (m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  return m;
};

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Cylinder lying along +Z. */
function barrel(r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r, len, 10);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z + len / 2);
  m.castShadow = true;
  return m;
}

// ---------------- slot parts ----------------

interface PartBuild { mesh: THREE.Object3D; /** Muzzle distance along +Z from the mount. */ len: number }

/** Every part points along +Z from its mount point. */
const PART_BUILDERS: Record<PartId, (trim: number) => PartBuild> = {
  mg: trim => {
    const g = new THREE.Group();
    g.add(box(0.22, 0.24, 0.45, darkMat, 0, 0, 0.1), barrel(0.06, 0.75, darkMat, 0, 0.03, 0.3), box(0.24, 0.05, 0.3, trimMat(trim), 0, 0.14, 0.05));
    return { mesh: g, len: 1.05 };
  },
  cannon: trim => {
    const g = new THREE.Group();
    g.add(box(0.3, 0.3, 0.55, darkMat, 0, 0, 0.12), barrel(0.1, 0.8, darkMat, 0, 0, 0.38), box(0.32, 0.08, 0.2, trimMat(trim), 0, 0, 1.08));
    return { mesh: g, len: 1.2 };
  },
  shotgun: trim => {
    const g = new THREE.Group();
    g.add(box(0.34, 0.26, 0.5, darkMat, 0, 0, 0.1), barrel(0.075, 0.55, darkMat, -0.08, 0, 0.33), barrel(0.075, 0.55, darkMat, 0.08, 0, 0.33), box(0.36, 0.06, 0.2, trimMat(trim), 0, 0.15, 0.05));
    return { mesh: g, len: 0.9 };
  },
  laser: trim => {
    // emitter: slim housing, focusing rings, glowing lens
    const g = new THREE.Group();
    g.add(box(0.22, 0.22, 0.5, darkMat, 0, 0, 0.1), barrel(0.05, 0.6, darkMat, 0, 0, 0.3), box(0.26, 0.05, 0.3, trimMat(trim), 0, 0.13, 0.05));
    for (const z of [0.45, 0.62]) g.add(barrel(0.09, 0.05, darkMat, 0, 0, z));
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glowMat(0xff4df0));
    lens.position.z = 0.92;
    g.add(lens);
    return { mesh: g, len: 0.95 };
  },
  railgun: trim => {
    // two long rails with glowing coils between them
    const g = new THREE.Group();
    g.add(box(0.26, 0.26, 0.5, darkMat, 0, 0, 0.05), box(0.05, 0.1, 1.1, darkMat, -0.08, 0, 0.6), box(0.05, 0.1, 1.1, darkMat, 0.08, 0, 0.6));
    for (const z of [0.3, 0.55, 0.8]) g.add(box(0.12, 0.05, 0.05, glowMat(0x9fd8ff), 0, 0, z));
    g.add(box(0.28, 0.05, 0.3, trimMat(trim), 0, 0.15, 0));
    return { mesh: g, len: 1.15 };
  },
  launcher: trim => {
    // a fat tube with an orange-lit mouth
    const g = new THREE.Group();
    const tube = barrel(0.15, 0.85, darkMat, 0, 0.02, 0.15);
    g.add(box(0.28, 0.26, 0.4, darkMat, 0, 0, 0), tube, box(0.3, 0.06, 0.2, trimMat(trim), 0, 0.2, 0.05));
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12), glowMat(0xff8c42));
    mouth.rotation.x = Math.PI / 2;
    mouth.position.set(0, 0.02, 1);
    g.add(mouth);
    return { mesh: g, len: 1 };
  },
  rockets: trim => {
    const g = new THREE.Group();
    g.add(box(0.46, 0.36, 0.5, darkMat, 0, 0.1, 0), box(0.48, 0.06, 0.52, trimMat(trim), 0, 0.3, 0));
    for (const [x, y] of [[-0.11, 0.02], [0.11, 0.02], [-0.11, 0.18], [0.11, 0.18]]) {
      g.add(box(0.13, 0.11, 0.02, glowMat(0xff8c42), x, y, 0.255));
    }
    return { mesh: g, len: 0.3 };
  },
  mortar: trim => {
    const g = new THREE.Group();
    const tube = barrel(0.14, 0.7, darkMat);
    const pivot = new THREE.Group();
    pivot.add(tube, box(0.3, 0.06, 0.06, trimMat(trim), 0, 0, 0.66));
    pivot.rotation.x = -Math.PI / 4; // tilted up
    pivot.position.y = 0.1;
    g.add(box(0.36, 0.18, 0.36, darkMat), pivot);
    return { mesh: g, len: 0.6 };
  },
  mines: trim => {
    // dispenser: a drum feeding a chute that points backward
    const g = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 12), darkMat);
    drum.rotation.z = Math.PI / 2;
    drum.position.y = 0.15;
    drum.castShadow = true;
    g.add(drum, box(0.2, 0.12, 0.36, darkMat, 0, 0.05, -0.28), box(0.42, 0.05, 0.12, trimMat(trim), 0, 0.33, 0));
    g.add(box(0.1, 0.06, 0.02, glowMat(0xff3b3b), 0, 0.15, 0.21));
    return { mesh: g, len: 0 };
  },
  flak: trim => {
    // twin short barrels on a swivel, raised to the sky
    const g = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.add(box(0.3, 0.2, 0.3, darkMat), barrel(0.045, 0.45, darkMat, -0.07, 0.05, 0.1), barrel(0.045, 0.45, darkMat, 0.07, 0.05, 0.1), box(0.32, 0.04, 0.1, trimMat(trim), 0, 0.12, -0.05));
    pivot.rotation.x = -0.5;
    pivot.position.y = 0.18;
    g.add(box(0.2, 0.16, 0.2, darkMat, 0, 0.05, 0), pivot);
    return { mesh: g, len: 0 };
  },
  drone: trim => {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.1, 12), darkMat);
    pad.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), glowMat(trim));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    g.add(pad, ring);
    return { mesh: g, len: 0 };
  },
  repair: trim => {
    // a small dock with a green cross: the repair drone hovers over it
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 12), darkMat);
    pad.castShadow = true;
    g.add(pad, box(0.26, 0.04, 0.08, glowMat(0x7dff9a), 0, 0.08, 0), box(0.08, 0.04, 0.26, glowMat(0x7dff9a), 0, 0.08, 0));
    g.add(box(0.3, 0.03, 0.06, trimMat(trim), 0, 0.02, -0.2));
    return { mesh: g, len: 0 };
  },
};

const shieldBubble = new THREE.Mesh(
  new THREE.SphereGeometry(1.35, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
);

// ---------------- assembly ----------------

function buildLeg(f: MechDef['frame'], x: number): Leg {
  const thighLen = f.hipH * 0.52, shinLen = f.hipH * 0.42, w = f.legW;
  const hip = new THREE.Group();
  hip.position.set(x, f.hipH, 0);
  hip.add(box(w * 1.3, w * 1.3, w * 1.3, darkMat), box(w, thighLen, w * 1.15, hullMat, 0, -thighLen / 2, 0));
  const knee = new THREE.Group();
  knee.position.y = -thighLen;
  // shin leans back a little, foot sits flat on the ground
  knee.add(
    box(w * 1.2, w * 1.1, w * 1.4, darkMat),
    box(w * 0.9, shinLen, w * 1.05, hullMat, 0, -shinLen / 2, -0.04),
    box(w * 1.5, 0.1, w * 2.3, darkMat, 0, -f.hipH + thighLen + 0.05, 0.06),
  );
  hip.add(knee);
  return { hip, knee };
}

function buildMech(def: MechDef): MechRig {
  const f = def.frame;
  const [tw, th, td] = f.torso;
  const root = new THREE.Group();
  root.scale.setScalar(def.scale);

  const pelvis = new THREE.Group();
  pelvis.add(box(tw * 0.65, 0.26, td * 0.55, darkMat, 0, f.hipH + 0.05, 0));
  const legs: [Leg, Leg] = [buildLeg(f, tw * 0.33), buildLeg(f, -tw * 0.33)];
  pelvis.add(legs[0].hip, legs[1].hip);

  const torso = new THREE.Group();
  torso.position.y = f.hipH + 0.2;
  torso.add(
    box(tw, th, td, hullMat, 0, th / 2, 0),
    box(tw * 1.02, th * 0.18, td * 1.02, trimMat(def.trim), 0, th * 0.82, 0),
    // cockpit visor
    box(tw * 0.5, th * 0.16, 0.05, glowMat(0xffffff), 0, th * 0.6, td / 2 + 0.01),
    // back radiators with glowing nozzles
    box(tw * 0.6, th * 0.6, 0.2, darkMat, 0, th * 0.45, -td / 2 - 0.08),
    box(tw * 0.14, th * 0.14, 0.04, glowMat(def.trim), -tw * 0.17, th * 0.3, -td / 2 - 0.19),
    box(tw * 0.14, th * 0.14, 0.04, glowMat(def.trim), tw * 0.17, th * 0.3, -td / 2 - 0.19),
  );
  // neon outline of the roof, the part the top-down camera sees most
  const rim = new THREE.Group();
  const core = new THREE.Color(def.trim).lerp(new THREE.Color(1, 1, 1), 0.6).getHex();
  // a hot core in a tube of the trim color: the same bars twice, the second one thicker and additive
  for (const [t, mat] of [[0.05, glowMat(core)], [0.15, haloMat(def.trim)]] as const) {
    const edge = (w: number, d: number, x: number, z: number) => rim.add(box(w, t, d, mat, x, th, z));
    edge(tw + t, t, 0, td / 2);
    edge(tw + t, t, 0, -td / 2);
    edge(t, td + t, tw / 2, 0);
    edge(t, td + t, -tw / 2, 0);
  }
  rim.visible = rimOn;
  torso.add(rim);

  const slot = (x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    torso.add(g);
    return g;
  };
  const slots: Record<SlotId, THREE.Group> = {
    armR: slot(tw / 2 + 0.17, th * 0.45, 0.05),
    armL: slot(-tw / 2 - 0.17, th * 0.45, 0.05),
    shoulderR: slot(tw * 0.3, th + 0.02, -td * 0.12),
    shoulderL: slot(-tw * 0.3, th + 0.02, -td * 0.12),
  };
  // arm shoulder pads are always there, weapons hang below them
  for (const s of [slots.armR, slots.armL]) s.add(box(0.3, 0.32, 0.42, trimMat(def.trim), 0, 0.12, 0));

  pelvis.add(torso);
  root.add(pelvis);
  if (def.shield) {
    shieldBubble.position.y = f.hipH + 0.3;
    root.add(shieldBubble);
  }
  return { def, root, pelvis, torso, legs, slots, parts: {}, stride: 0, rim };
}

/** Arm parts hang from this point inside the arm slot. */
const ARM_MOUNT_Y = -0.12;
const ARM_MOUNT_Z = 0.1;

/** Whether the roof outline shows; kept here so a rebuilt model starts the same. */
let rimOn = false;
export function setMechRim(on: boolean): void {
  rimOn = on;
  rig.rim.visible = on;
}

let rig = buildMech(MECHS[G.mech]);
mechRoot.add(rig.root);

// ---------------- wreck ----------------
/** Charred metal of the destroyed mech, one shade for every part. */
const wreckMat = new THREE.MeshStandardMaterial({ color: 0x1e2230, roughness: 0.9, metalness: 0.3 });
let wreck: THREE.Group | null = null;

/** Leaves a burnt-out copy of the mech in its current pose and loadout; lights, neon and the shield are dropped. */
export function wreckMech(): void {
  clearWreck();
  wreck = rig.root.clone();
  wreck.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.material instanceof THREE.MeshBasicMaterial) o.visible = false;
    else o.material = wreckMat;
  });
  wreck.position.y = 0;
  mechRoot.add(wreck);
}

/** Sinks the wreck by `sink`; `null` once its time is up. */
export function placeMechWreck(sink: number | null): void {
  if (!wreck) return;
  if (sink === null) clearWreck();
  else wreck.position.y = -sink;
}

function clearWreck(): void {
  if (wreck) mechRoot.remove(wreck);
  wreck = null;
}

/** Rebuilds the model for the selected mech. Slot parts are cleared. */
export function rebuildMech(): void {
  clearWreck();
  mechRoot.remove(rig.root);
  rig = buildMech(MECHS[G.mech]);
  mechRoot.add(rig.root);
}

export function setSlotPart(slot: SlotId, id: PartId | null): void {
  const cur = rig.parts[slot];
  if (cur?.id === id) return;
  if (cur) rig.slots[slot].remove(cur.mesh);
  delete rig.parts[slot];
  if (!id) return;
  const { mesh, len } = PART_BUILDERS[id](rig.def.trim);
  if (slot === 'armR' || slot === 'armL') mesh.position.set(0, ARM_MOUNT_Y, ARM_MOUNT_Z);
  rig.slots[slot].add(mesh);
  rig.parts[slot] = { id, mesh, len };
}

/** Arm muzzle relative to the mech center, in torso space: forward, right, height. */
export function muzzleOffset(slot: ArmSlot): [number, number, number] {
  const s = rig.def.scale, arm = rig.slots[slot].position, len = rig.parts[slot]?.len ?? 0.3;
  return [(arm.z + ARM_MOUNT_Z + len) * s, arm.x * s, (rig.torso.position.y + arm.y + ARM_MOUNT_Y) * s];
}

// ---------------- animation ----------------
/** Height of the mech above ground during a jump-jet leap. */
export function jumpHeight(): number {
  if (G.dashMod !== 'jump' || P.dashT <= 0) return 0;
  const p = 1 - P.dashT / P.dashMax;
  return 4 * JUMP.height * p * (1 - p);
}


let crouch = 0;

/** Walk cycle: radians of phase per world unit travelled. */
const STEP_RATE = 2.4;
const KICK_BACK = 0.2;

export function animateMech(dt: number, playing: boolean): void {
  const r = rig;
  // a braced Artillerist squats onto its supports
  crouch += ((braced() ? 1 : 0) - crouch) * (1 - Math.exp(-12 * dt));
  r.root.position.set(P.x, jumpHeight() - crouch * 0.14 * r.def.scale, P.z);
  r.root.rotation.y = P.legAng;
  r.torso.rotation.y = P.ang - P.legAng;

  if (playing) P.walkPh += P.speed * STEP_RATE * dt / r.def.scale;
  const target = playing && P.moving ? 1 : 0;
  r.stride += (target - r.stride) * (1 - Math.exp(-10 * dt));
  const a = r.stride, ph = P.walkPh;

  r.legs.forEach((leg, i) => {
    const p = ph + i * Math.PI;
    leg.hip.rotation.x = Math.sin(p) * 0.55 * a;
    // knee bends on the forward swing only
    leg.knee.rotation.x = Math.max(0, Math.cos(p)) * 0.7 * a;
  });
  r.pelvis.position.y = -Math.abs(Math.cos(ph)) * 0.08 * a;
  r.pelvis.rotation.x = P.dashT > 0 ? 0.22 : 0;
  r.torso.rotation.z = Math.sin(ph) * 0.04 * a;

  G.gunKick *= Math.exp(-18 * dt);
  for (const slot of ['armR', 'armL'] as const) {
    const gun = r.parts[slot]?.mesh;
    if (gun) gun.position.z = ARM_MOUNT_Z - G.gunKick * KICK_BACK;
  }

  if (P.maxShield) {
    shieldBubble.material.opacity = 0.14 * (P.shield / P.maxShield) * (1 + Math.sin(G.time * 4) * 0.15);
    shieldBubble.visible = P.shield > 0.5;
  }

  // the wreck takes the mech's place until the next run
  r.root.visible = !wreck && !(P.blink > 0 && Math.floor(P.blink * 20) % 2 === 0);
}
