// Keyboard / mouse state and aiming.
import * as THREE from 'three';
import { camera } from './scene';
import { P, aim } from './state';

export const keys: Record<string, boolean> = {};
export const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };

export interface InputHandlers {
  onKey(code: string): void;
  onWheel(dir: 1 | -1): void;
  onFocusLost(): void;
  onGesture(): void;
}

const cross = document.getElementById('cross') as HTMLElement;
const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown']);

export function bindInput(h: InputHandlers): void {
  addEventListener('keydown', e => {
    if (PREVENT.has(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (!e.repeat) h.onKey(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    cross.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  });
  addEventListener('mousedown', e => {
    if (e.button === 0) mouse.down = true;
    h.onGesture();
    // right button goes through the key handler, so it can be bound like a key
    if (e.button === 2) h.onKey('MouseRight');
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => h.onWheel(e.deltaY > 0 ? 1 : -1), { passive: true });
  const lost = () => {
    for (const k in keys) keys[k] = false;
    mouse.down = false;
    h.onFocusLost();
  };
  addEventListener('blur', lost);
  document.addEventListener('visibilitychange', () => { if (document.hidden) lost(); });
}

/** Normalized WASD / arrows direction in world XZ (screen up = -Z). */
export function moveInput(): [number, number] {
  const mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  const l = Math.hypot(mx, mz);
  return l ? [mx / l, mz / l] : [0, 0];
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1); // y = 1, gun height

export function updateAim(): void {
  ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(aimPlane, aim)) aim.set(P.x, 1, P.z + 1);
}
