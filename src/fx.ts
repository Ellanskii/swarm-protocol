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
      g: 22, life, max: life, col, s: rand(0.6, 1.3),
    });
  }
}

/** Slow grey puff rising from a wreck. */
export function smoke(x: number, y: number, z: number): void {
  if (G.parts.length >= LIMITS.particles) return;
  const life = rand(0.8, 1.4);
  G.parts.push({
    x: x + rand(-0.3, 0.3), y, z: z + rand(-0.3, 0.3),
    vx: rand(-0.4, 0.4), vy: rand(1, 1.8), vz: rand(-0.4, 0.4),
    g: -0.6, life, max: life, col: 0x4a4f63, s: rand(1.6, 2.4),
  });
}

/** Fast white puff for venting heat. */
export function steam(x: number, y: number, z: number, spd = 2): void {
  if (G.parts.length >= LIMITS.particles) return;
  const life = rand(0.35, 0.7);
  G.parts.push({
    x: x + rand(-0.3, 0.3), y, z: z + rand(-0.3, 0.3),
    vx: rand(-1, 1) * spd, vy: rand(1.5, 3), vz: rand(-1, 1) * spd,
    g: -1, life, max: life, col: 0xdfe8ff, s: rand(1.2, 2),
  });
}

const DEBRIS_DARK = 0x2a2f45;

/**
 * A machine blows apart: lit chunks in its color and dark metal, a flash ring, shake by size.
 * Bigger machines also leave a smoking wreck behind.
 */
export function machineDeath(x: number, y: number, z: number, r: number, col: number, rot: number): void {
  const n = Math.round(3 + r * 6);
  for (let i = 0; i < n && G.debris.length < LIMITS.debris; i++) {
    const a = Math.random() * Math.PI * 2, sp = rand(2, 6) * (0.6 + r * 0.4);
    const life = rand(1.4, 2.4);
    G.debris.push({
      x: x + rand(-r, r) * 0.5, y: y * rand(0.6, 1.2), z: z + rand(-r, r) * 0.5,
      vx: Math.sin(a) * sp, vy: rand(4, 9), vz: Math.cos(a) * sp,
      ry: Math.random() * 6, spin: rand(-12, 12), life, max: life,
      col: Math.random() < 0.5 ? col : DEBRIS_DARK, s: rand(0.7, 1.3) * (0.7 + r * 0.5),
    });
  }
  if (r >= 0.6) {
    ringBurst(x, z, r * 1.8);
    G.shake = Math.min(1.2, G.shake + Math.min(0.5, r * 0.15));
    if (G.wrecks.length < LIMITS.wrecks) {
      const life = r > 2 ? 6 : 3;
      G.wrecks.push({ x, z, rot, s: r * 0.9, life, max: life, smokeT: 0 });
    }
  }
}

export function ringBurst(x: number, z: number, r: number): void {
  const ring = rings.find(o => o.life <= 0) ?? rings[0];
  ring.life = ring.max;
  ring.r = r;
  ring.m.position.set(x, 0.1, z);
  ring.m.visible = true;
}

/** Mushroom cloud over a big blast. Skipped when too many are up: the blast itself still happens. */
export function mushroom(x: number, z: number, r: number, dur = 2.4): void {
  if (G.mushrooms.length >= LIMITS.mushrooms) return;
  G.mushrooms.push({ x, z, r, t: 0, dur });
  G.shake = Math.min(1.2, G.shake + 0.1 + r * 0.05);
}

export function updateParticles(dt: number): void {
  for (const m of G.mushrooms) {
    m.t += dt;
    // dust rolling off the cap while it rises
    const p = m.t / m.dur;
    if (p < 0.6 && Math.random() < dt * 20) {
      const a = Math.random() * Math.PI * 2, h = m.r * 1.5 * Math.min(1, p / 0.6);
      if (G.parts.length < LIMITS.particles) G.parts.push({
        x: m.x + Math.sin(a) * m.r * 0.5, y: h, z: m.z + Math.cos(a) * m.r * 0.5,
        vx: Math.sin(a) * 1.5, vy: 0.5, vz: Math.cos(a) * 1.5, g: -0.4, life: 1, max: 1, col: 0x5a4a44, s: rand(2, 3),
      });
    }
  }
  for (const p of G.parts) {
    p.life -= dt;
    p.vy -= p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0.08) { p.y = 0.08; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
  }
  // debris tumbles until it lands, then slides to a stop
  for (const d of G.debris) {
    d.life -= dt;
    if (d.y > 0.07 || d.vy > 0) {
      d.vy -= 22 * dt;
      d.ry += d.spin * dt;
    }
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    if (d.y < 0.06) {
      d.y = 0.06;
      d.vy = Math.abs(d.vy) > 3 ? -d.vy * 0.3 : 0;
      d.vx *= 0.5;
      d.vz *= 0.5;
      d.spin *= 0.5;
    }
  }
  for (const w of G.wrecks) {
    w.life -= dt;
    if ((w.smokeT -= dt) <= 0 && w.life > 0.8) {
      w.smokeT = 0.09;
      smoke(w.x, 0.5 * w.s, w.z);
      if (Math.random() < 0.3) sparks(w.x, 0.4, w.z, 0xff8c42, 1, 2);
    }
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
