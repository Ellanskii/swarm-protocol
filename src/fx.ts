// Particles, explosion rings, floating damage numbers, banners, hurt vignette.
import * as THREE from 'three';
import { LIMITS } from './config';
import { camera, rings } from './scene';
import { G } from './state';
import { $, rand } from './utils';

export function sparks(x: number, y: number, z: number, col: number, n: number, spd = 6): void {
  for (let i = 0; i < n && G.parts.length < LIMITS.particles; i++) {
    const life = rand(0.25, 0.6);
    G.parts.push({
      x, y, z,
      vx: rand(-1, 1) * spd, vy: rand(0.4, 1.4) * spd * 0.6, vz: rand(-1, 1) * spd,
      life, max: life, col, s: rand(0.6, 1.3),
    });
  }
}

export function ringBurst(x: number, z: number, r: number): void {
  const ring = rings.find(o => o.life <= 0) ?? rings[0];
  ring.life = ring.max;
  ring.r = r;
  ring.m.position.set(x, 0.1, z);
  ring.m.visible = true;
}

export function updateParticles(dt: number): void {
  for (const p of G.parts) {
    p.life -= dt;
    p.vy -= 22 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0.08) { p.y = 0.08; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
  }
  for (const r of rings) {
    if (r.life <= 0) continue;
    r.life -= dt;
    const k = 1 - Math.max(r.life, 0) / r.max;
    r.m.scale.setScalar(r.r * (0.3 + 0.7 * k));
    r.m.material.opacity = (1 - k) * 0.9;
    if (r.life <= 0) r.m.visible = false;
  }
}

// ---------------- damage numbers ----------------
interface Num { el: HTMLSpanElement; life: number; x: number; y: number; z: number }
const numPool: Num[] = [];
const numsEl = $('nums');
for (let i = 0; i < 48; i++) {
  const el = document.createElement('span');
  numsEl.appendChild(el);
  numPool.push({ el, life: 0, x: 0, y: 0, z: 0 });
}
let numIdx = 0;
const NUM_LIFE = 0.6;
const projV = new THREE.Vector3();

export function dmgNumber(x: number, z: number, v: number, crit: boolean): void {
  const n = numPool[numIdx++ % numPool.length];
  n.life = NUM_LIFE;
  n.x = x + rand(-0.3, 0.3);
  n.z = z;
  n.y = 1.8;
  n.el.textContent = String(Math.round(v));
  n.el.className = crit ? 'crit' : '';
}

export function updateNumbers(dt: number): void {
  for (const n of numPool) {
    if (n.life <= 0) continue;
    n.life -= dt;
    n.y += dt * 2.2;
    projV.set(n.x, n.y, n.z).project(camera);
    const sx = ((projV.x + 1) / 2) * innerWidth, sy = ((1 - projV.y) / 2) * innerHeight;
    n.el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-50%)`;
    n.el.style.opacity = String(Math.max(0, n.life / NUM_LIFE));
  }
}

export function clearNumbers(): void {
  for (const n of numPool) { n.life = 0; n.el.style.opacity = '0'; }
}

// ---------------- banner / vignette ----------------
export type BannerColor = 'red' | 'gold' | 'blue';
const banner = $('banner');
let bannerTimer = 0;

export function showBanner(text: string, cls: BannerColor, dur: number): void {
  banner.textContent = text;
  banner.className = 'show ' + cls;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => { banner.className = cls; }, dur * 1000);
}

const vignette = $('vignette');
export function flashVignette(): void {
  vignette.style.opacity = '0.55';
  setTimeout(() => { vignette.style.opacity = '0'; }, 120);
}
