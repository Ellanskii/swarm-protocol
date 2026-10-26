// Entry point: game flow (start / pause / level-up / game over) and the frame loop.
import './style.css';
import { updateAura } from './abilities';
import { initAudio, toggleMute } from './audio';
import { updateBullets } from './combat';
import { MECHS, MECH_ORDER, type MechId } from './config';
import { spawnDirector, updateEnemies, updateEnemyShots } from './enemies';
import { clearNumbers, showBanner, updateNumbers, updateParticles } from './fx';
import { buildGrid } from './grid';
import { resetHUD, updateHUD } from './hud';
import { bindInput, mouse, toggleAutoAim, touch, updateAim } from './input';
import { rebuildMech } from './mech';
import { gainXP, removeAllPickups, updateGems, updatePickups } from './pickups';
import { tryDash, updatePlayer, updateTrails } from './player';
import { camTarget, renderWorld, updateCamera } from './render';
import { camera, renderer, scene } from './scene';
import { installShoulder, removeAllDrones, updateShoulders } from './shoulders';
import { G, P, S, aim, resetState } from './state';
import { choose, openLevelUp } from './upgrades';
import { $, fmtTime } from './utils';
import { firePressed, giveWeapon, reloadPressed, syncArms, updateWeapons } from './weapons';

// ---------------- flow ----------------

function resetGame(): void {
  removeAllPickups();
  removeAllDrones();
  resetState();
  rebuildMech();
  camTarget.set(0, 0, 0);
  clearNumbers();
  resetHUD();
  syncArms();
}

function showOnly(id: 'start' | 'levelup' | 'pause' | 'over' | null): void {
  for (const s of ['start', 'levelup', 'pause', 'over'] as const) $(s).hidden = s !== id;
}

function startGame(): void {
  initAudio();
  resetGame();
  showOnly(null);
  $('hud').hidden = false;
  document.body.classList.remove('menu');
  G.state = 'play';
  mouse.down = false;
  showBanner('ПРОДЕРЖИСЬ', 'blue', 1.2);
}

function setPause(on: boolean): void {
  if (on ? G.state !== 'play' : G.state !== 'pause') return;
  G.state = on ? 'pause' : 'play';
  $('pause').hidden = !on;
  document.body.classList.toggle('menu', on);
  mouse.down = false;
}

function gameOver(): void {
  G.state = 'over';
  mouse.down = false;
  document.body.classList.add('menu');
  $('oTime').textContent = fmtTime(G.time);
  $('oKills').textContent = String(G.kills);
  $('oLvl').textContent = String(P.level);
  $('over').hidden = false;
}

/** Debug cheat: toggles invulnerability, or sets it when `on` is given. */
function god(on = !G.god): boolean {
  G.god = on;
  showBanner(on ? 'БЕССМЕРТИЕ ВКЛ' : 'БЕССМЕРТИЕ ВЫКЛ', 'gold', 0.8);
  return on;
}

/** Debug cheat: level-up offers every available upgrade. Toggles, or sets it when `on` is given. */
function allUps(on = !G.allUps): boolean {
  G.allUps = on;
  showBanner(on ? 'ВСЕ АПГРЕЙДЫ ВКЛ' : 'ВСЕ АПГРЕЙДЫ ВЫКЛ', 'gold', 0.8);
  return on;
}

// ---------------- input ----------------

const DIGITS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2 };

bindInput({
  onGesture: initAudio,
  onFocusLost: () => setPause(true),
  onKey: code => {
    if (code === 'KeyM') {
      showBanner(toggleMute() ? 'ЗВУК ВЫКЛ' : 'ЗВУК ВКЛ', 'blue', 0.8);
      return;
    }
    switch (G.state) {
      case 'play':
        if (code === 'MouseLeft') firePressed();
        else if (code === 'KeyR' || code === 'MouseRight' || code === 'TouchReload') reloadPressed();
        else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') tryDash();
        else if (code === 'Escape' || code === 'KeyP') setPause(true);
        else if (code === 'KeyG' && import.meta.env.DEV) god();
        else if (code === 'KeyU' && import.meta.env.DEV) allUps();
        break;
      case 'levelup':
        if (code in DIGITS) choose(DIGITS[code]);
        break;
      case 'pause':
        if (code === 'Escape' || code === 'KeyP') setPause(false);
        break;
      case 'start':
        if (code === 'Enter' || code === 'Space') startGame();
        else if (code in DIGITS && MECH_ORDER[DIGITS[code]]) selectMech(MECH_ORDER[DIGITS[code]]);
        break;
      case 'over':
        if (code === 'Enter') startGame();
        break;
    }
  },
});

// ---------------- mech select ----------------

const MECH_KEY = 'swarm.mech';
const mechCards = $('mechs');

function selectMech(id: MechId): void {
  G.mech = id;
  try { localStorage.setItem(MECH_KEY, id); } catch { /* storage blocked */ }
  for (const c of mechCards.children) c.classList.toggle('on', (c as HTMLElement).dataset.mech === id);
  resetGame(); // rebuilds the model, so the title screen shows the chosen mech
}

mechCards.replaceChildren(...MECH_ORDER.map((id, i) => {
  const m = MECHS[id];
  const b = document.createElement('button');
  b.className = 'card mech';
  b.dataset.mech = id;
  const dash = m.dash.charges > 1 ? `${m.dash.charges} заряда` : '1 заряд';
  b.innerHTML = `<small class="desk-only">${i + 1}</small><h3>${m.name}</h3><em>${m.role}</em>`
    + `<p>${m.passive}</p><span class="mono">HP ${m.hp} · рывок ${dash} · плеч ${m.shoulders}</span>`;
  b.addEventListener('click', () => selectMech(id));
  return b;
}));

try {
  const saved = localStorage.getItem(MECH_KEY) as MechId | null;
  if (saved && saved in MECHS) G.mech = saved;
} catch { /* storage blocked */ }
for (const c of mechCards.children) c.classList.toggle('on', (c as HTMLElement).dataset.mech === G.mech);

$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', () => setPause(false));
$('pauseBtn').addEventListener('click', () => setPause(true));
$('dashBtn').addEventListener('pointerdown', e => {
  e.preventDefault();
  if (G.state === 'play') tryDash();
});

const autoAimBtns = document.querySelectorAll<HTMLButtonElement>('[data-autoaim]');
function syncAutoAimBtns(): void {
  for (const b of autoAimBtns) {
    b.textContent = `Автоприцел: ${touch.autoAim ? 'ВКЛ' : 'ВЫКЛ'}`;
    b.classList.toggle('on', touch.autoAim);
  }
}
for (const b of autoAimBtns) b.addEventListener('click', () => { toggleAutoAim(); syncAutoAimBtns(); });
syncAutoAimBtns();
document.body.classList.add('menu');

// ---------------- simulation ----------------

function update(dt: number): void {
  G.time += dt;
  updatePlayer(dt);
  updateWeapons(dt);
  spawnDirector(dt);
  buildGrid();
  updateEnemies(dt);
  updateBullets(dt);
  updateEnemyShots(dt);
  updateShoulders(dt);
  updateTrails(dt);
  updateAura(dt);
  updateGems(dt);
  updatePickups(dt);
  updateParticles(dt);

  // compact dead entities once per frame (grid indices are only valid until here)
  G.enemies = G.enemies.filter(e => {
    if (e.dead) G.typeCount[e.type]--;
    return !e.dead;
  });
  G.bullets = G.bullets.filter(b => b.life > 0);
  G.eshots = G.eshots.filter(s => s.life > 0);
  G.gems = G.gems.filter(g => !g.dead);
  G.pickups = G.pickups.filter(p => !p.dead);
  G.parts = G.parts.filter(p => p.life > 0);
  G.rockets = G.rockets.filter(r => r.life > 0);
  G.shells = G.shells.filter(s => s.life > 0);
  G.trails = G.trails.filter(t => t.life > 0);
}

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  updateAim();
  if (G.state === 'play') {
    update(dt);
    if (P.hp <= 0) gameOver();
    else if (G.pendingLevels > 0) openLevelUp();
    updateHUD();
  }
  if (G.state === 'play' || G.state === 'over') updateNumbers(dt);
  if (G.state === 'start') {
    // idle spin on the title screen
    P.ang += dt * 0.6;
    aim.set(P.x + Math.sin(P.ang) * 5, 1, P.z + Math.cos(P.ang) * 5);
  }
  updateCamera(dt);
  renderWorld(G.state === 'play' ? dt : 0, G.state === 'play');
  renderer.render(scene, camera);
}

resetGame();
requestAnimationFrame(frame);

// debug handle for the console and automated tests
declare global {
  interface Window { __swarm: unknown }
}
window.__swarm = { G, P, S, gainXP, startGame, choose, god, allUps, installShoulder, giveWeapon };
