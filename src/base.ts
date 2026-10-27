// Base screen: the tech tree as a pannable, zoomable graph, plus buying nodes.
import { sfx } from './audio';
import { icon } from './icons';
import { save } from './save';
import { G } from './state';
import { TECH, buyTech, canBuy, techCost, techLv, techNode, techOff, techOpen, toggleTechOff, type TechNode } from './tech';
import { $, clamp } from './utils';

/** Grid cell size on the map, px at zoom 1. */
const CELL_W = 240;
const CELL_H = 110;
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 1.6;
/** Pointer travel that turns a tap into a drag, px. */
const DRAG_PX = 6;

const screen = $('base');
const board = $('board');
const links = document.getElementById('links') as unknown as SVGSVGElement;
const nodesEl = $('nodes');
const detail = $('detail');
const buyBtn = $<HTMLButtonElement>('buyBtn');
const poolBtn = $<HTMLButtonElement>('poolBtn');

const view = { x: 0, y: 0, z: 1 };
let selected: TechNode | null = null;

const fmtCost = (n: TechNode): string => {
  const c = techCost(n);
  const scrap = `<span class="cur scrap"></span>${c.scrap}`;
  return c.cores ? `${scrap} <span class="cur core"></span>${c.cores}` : scrap;
};

function nodeState(n: TechNode): string {
  const lv = techLv(n.id);
  if (lv > 0 && techOff(n)) return 'maxed off';
  if (lv >= n.max) return 'maxed';
  if (lv > 0) return canBuy(n) ? 'owned afford' : 'owned';
  if (!techOpen(n)) return 'locked';
  return canBuy(n) ? 'open afford' : 'open';
}

/** The strip under a node: what tapping it would do, or why not. */
function nodeStatus(n: TechNode): string {
  const lv = techLv(n.id);
  if (n.id === 'core') return 'ОНЛАЙН';
  if (lv > 0 && techOff(n)) return 'ВЫКЛ ИЗ ПУЛА';
  if (lv >= n.max) return 'МАКСИМУМ';
  if (!techOpen(n)) return 'ЗАКРЫТО';
  return `<span>${lv ? 'УЛУЧШИТЬ' : 'ОТКРЫТЬ'}</span><span class="cost">${fmtCost(n)}</span>`;
}

function applyView(): void {
  board.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`;
}

/** Elbow line from parent to child: out horizontally, across at the midpoint, in horizontally. */
function linkPath(a: TechNode, b: TechNode): string {
  const ax = a.x * CELL_W, ay = a.y * CELL_H, bx = b.x * CELL_W, by = b.y * CELL_H;
  if (a.y === b.y || a.x === b.x) return `M${ax},${ay}L${bx},${by}`;
  const mx = (ax + bx) / 2;
  return `M${ax},${ay}H${mx}V${by}H${bx}`;
}

export function renderBase(): void {
  $('bScrap').textContent = G.infRes ? '∞' : String(save.scrap);
  $('bCores').textContent = G.infRes ? '∞' : String(save.cores);

  links.innerHTML = TECH.filter(n => n.parent).map(n => {
    const p = techNode(n.parent!)!;
    return `<path class="${techLv(n.id) > 0 ? 'on' : techOpen(n) ? 'open' : ''}" d="${linkPath(p, n)}"/>`;
  }).join('');

  nodesEl.replaceChildren(...TECH.map(n => {
    const el = document.createElement('button');
    el.className = `tnode ${n.branch} ${nodeState(n)}${selected === n ? ' sel' : ''}`;
    el.style.left = `${n.x * CELL_W}px`;
    el.style.top = `${n.y * CELL_H}px`;
    el.innerHTML = `<span class="ibox">${icon(n.id)}</span><span class="txt"><b>${n.name}</b>`
      + `<span class="lv">${n.id === 'core' ? 'БАЗА' : `УР ${techLv(n.id)} / ${n.max}`}</span></span><span class="stat">${nodeStatus(n)}</span>`;
    el.addEventListener('click', () => {
      if (dragged) return;
      selected = n;
      renderBase();
    });
    return el;
  }));

  renderDetail();
}

function renderDetail(): void {
  detail.hidden = !selected;
  if (!selected) return;
  const n = selected, lv = techLv(n.id);
  detail.className = n.branch;
  $('dIco').innerHTML = icon(n.id);
  $('dName').textContent = n.name;
  $('dDesc').textContent = n.desc;
  const maxed = lv >= n.max;
  $('dLv').textContent = n.max > 1 ? `Уровень ${lv} из ${n.max}` : lv ? 'Открыто' : techOpen(n) ? 'Не открыто' : 'Сначала откройте предыдущий узел';
  $('dCost').innerHTML = maxed ? '' : `Цена: ${fmtCost(n)}`;
  buyBtn.hidden = maxed || n.id === 'core';
  buyBtn.disabled = !canBuy(n);
  buyBtn.textContent = lv ? 'УЛУЧШИТЬ' : 'ОТКРЫТЬ';
  // bought unlocks can be taken out of the run pool
  poolBtn.hidden = !n.unlocks || lv === 0;
  poolBtn.textContent = `В пуле: ${techOff(n) ? 'ВЫКЛ' : 'ВКЛ'}`;
  poolBtn.classList.toggle('on', !techOff(n));
}

poolBtn.addEventListener('click', () => {
  if (!selected) return;
  toggleTechOff(selected);
  renderBase();
});

buyBtn.addEventListener('click', () => {
  if (!selected || !buyTech(selected)) return;
  sfx('perfect');
  renderBase();
});

export function openBase(): void {
  screen.hidden = false;
  // start centered on the command center
  view.x = innerWidth / 2;
  view.y = innerHeight / 2;
  // fit roughly the inner ring of branches on screen
  view.z = clamp(Math.min(innerWidth / 1300, innerHeight / 640), ZOOM_MIN, 1);
  applyView();
  selected = null;
  renderBase();
}

export function closeBase(): void {
  screen.hidden = true;
}

// ---------------- pan & zoom ----------------

const pointers = new Map<number, { x: number; y: number }>();
let dragged = false;
let downAt = { x: 0, y: 0 };
let pinchDist = 0;

function zoomAt(cx: number, cy: number, z: number): void {
  const nz = clamp(z, ZOOM_MIN, ZOOM_MAX);
  // keep the point under the cursor in place
  view.x = cx - ((cx - view.x) / view.z) * nz;
  view.y = cy - ((cy - view.y) / view.z) * nz;
  view.z = nz;
  applyView();
}

screen.addEventListener('pointerdown', e => {
  if ((e.target as Element).closest('#detail, .base-top, .base-actions')) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    dragged = false;
    downAt = { x: e.clientX, y: e.clientY };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
});

screen.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, view.z * (d / pinchDist));
    pinchDist = d;
    dragged = true;
    return;
  }
  if (!dragged && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < DRAG_PX) return;
  if (!dragged) screen.setPointerCapture(e.pointerId);
  dragged = true;
  view.x += dx;
  view.y += dy;
  applyView();
});

const release = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  pinchDist = 0;
  // a tap on empty space clears the selection
  if (!dragged && pointers.size === 0 && !(e.target as Element).closest('.tnode, #detail, .base-top, .base-actions')) {
    selected = null;
    renderBase();
  }
};
screen.addEventListener('pointerup', release);
screen.addEventListener('pointercancel', release);

screen.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, view.z * Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
