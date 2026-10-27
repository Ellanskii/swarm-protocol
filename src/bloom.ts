// Experimental selective bloom: only unlit (neon) materials glow. Lit surfaces such as the mech's white hull are too bright for a plain
// threshold to tell apart from neon, and glowing hulls pulse as they move. So the scene is drawn twice: once for the glow with every
// other material black (they still hide what is behind them), and once normally; the blurred glow is added to the normal image.
// An optional setting ("Свечение" on the start and pause screens): it costs a second pass over the scene plus the blur chain,
// which a weak phone should not pay, so only a powerful desktop gets it by itself. The dev editor tunes the values.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { camera, renderer, scene } from './scene';

const KEY = 'swarm.glow';
/** A first-run guess: a desktop-class machine with a real GPU. Phones and tablets, small CPUs and software renderers stay off. */
function powerful(): boolean {
  if (matchMedia('(pointer: coarse)').matches) return false;
  if ((navigator.hardwareConcurrency ?? 0) < 6) return false;
  const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  return !/swiftshader|llvmpipe|software|basic render/i.test(gpu);
}

/** The player's own choice wins; without one, the guess above. The guess is not stored, so it can improve later. */
const readPref = (): boolean => {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return v === 'on';
  } catch { /* storage blocked */ }
  return powerful();
};

/** `on` is a device setting: the player's choice, or on by itself on a powerful desktop. `knee` is the width of the soft step around the threshold: a hard step makes pixels near it blink as they move. */
export const bloom = { on: readPref(), strength: 0.8, radius: 0.35, threshold: 0.4, knee: 0.25 };

interface Pipeline {
  /** Glow pass: only neon is lit, the rest is black. */
  glow: EffectComposer;
  /** The normal scene (multisampled: the canvas' own antialiasing does not reach render targets) plus the glow, then tone mapping. */
  main: EffectComposer;
  pass: UnrealBloomPass;
}

const target = (samples: number) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });

function build(): Pipeline {
  const glow = new EffectComposer(renderer, target(0));
  glow.renderToScreen = false;
  const pass = new UnrealBloomPass(new THREE.Vector2(1, 1), bloom.strength, bloom.radius, bloom.threshold);
  glow.addPass(new RenderPass(scene, camera));
  glow.addPass(pass);

  const main = new EffectComposer(renderer, target(4));
  main.addPass(new RenderPass(scene, camera));
  main.addPass(new ShaderPass(new THREE.ShaderMaterial({
    uniforms: { baseTexture: { value: null }, glowTexture: { value: glow.renderTarget2.texture } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D baseTexture; uniform sampler2D glowTexture; varying vec2 vUv; void main() { gl_FragColor = texture2D(baseTexture, vUv) + texture2D(glowTexture, vUv); }',
  }), 'baseTexture'));
  // tone mapping happens here: the renderer only applies it when drawing to the screen
  main.addPass(new OutputPass());
  return { glow, main, pass };
}

// the render targets are only allocated while bloom is on, so a device that leaves it off pays nothing
let pipe: Pipeline | null = null;

function fit(): void {
  if (!pipe) return;
  for (const c of [pipe.glow, pipe.main]) {
    c.setPixelRatio(renderer.getPixelRatio());
    c.setSize(innerWidth, innerHeight);
  }
}
addEventListener('resize', fit);

/** Switches bloom, remembers it on this device and frees its buffers when it goes off. */
export function setBloom(on: boolean): void {
  bloom.on = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ }
  if (!on && pipe) {
    pipe.glow.dispose();
    pipe.main.dispose();
    pipe = null;
  }
}

const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
const stash = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();

/** Unlit materials glow; a mesh may name its own material for the glow pass in `userData.bloomMaterial`. */
const glows = (m: THREE.Material | THREE.Material[]): boolean => !Array.isArray(m) && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial;

function darken(o: THREE.Object3D): void {
  const mesh = o as THREE.Mesh;
  if (!mesh.material) return;
  const own = o.userData.bloomMaterial as THREE.Material | undefined;
  if (!own && glows(mesh.material)) return;
  stash.set(o, mesh.material);
  mesh.material = own ?? black;
}

/** Draws one frame, with the glow when bloom is on. */
export function renderFrame(): void {
  if (!bloom.on) {
    renderer.render(scene, camera);
    return;
  }
  if (!pipe) {
    pipe = build();
    fit();
  }
  const { pass } = pipe;
  pass.strength = bloom.strength;
  pass.radius = bloom.radius;
  pass.threshold = bloom.threshold;
  (pass.highPassUniforms as Record<string, THREE.IUniform>).smoothWidth.value = bloom.knee;

  const background = scene.background;
  scene.background = null;
  scene.traverseVisible(darken);
  pipe.glow.render();
  for (const [o, m] of stash) (o as THREE.Mesh).material = m;
  stash.clear();
  scene.background = background;

  pipe.main.render();
}
