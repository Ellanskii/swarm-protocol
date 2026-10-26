// Entry point: game flow (start / pause / level-up / game over) and the frame loop.
import './style.css';
import { updateAura } from './abilities';
import { initAudio, toggleMute } from './audio';
import { closeBase, openBase, renderBase } from './base';
import { updateBullets } from './combat';
import { MECHS, MECH_ORDER, type MechId } from './config';
import { spawnDirector, spawnEnemy, updateEnemies, updateEnemyShots, updateStrikes } from './enemies';
import { clearNumbers, showBanner, updateNumbers, updateParticles } from './fx';
import { buildGrid } from './grid';
import { resetHUD, updateHUD } from './hud';
import { bindInput, mouse, toggleAutoAim, touch, updateAim } from './input';
import { rebuildMech } from './mech';
import { updateModules } from './modules';
import { gainXP, removeAllPickups, updateGems, updatePickups } from './pickups';
import { tryDash, updatePlayer, updateTrails } from './player';
import { camTarget, renderWorld, updateCamera } from './render';
import { camera, renderer, scene } from './scene';
import { addDrone, installShoulder, removeAllDrones, updateShoulders } from './shoulders';
import { persist, resetSave, save } from './save';
import { G, P, S, aim, resetState } from './state';
import { applyTech, mechUnlocked } from './tech';
import { choose, openLevelUp } from './upgrades';
import { watchForUpdates } from './update';
import { $, fmtTime } from './utils';
import { firePressed, giveWeapon, reloadPressed, syncArms, updateWeapons } from './weapons';

// ---------------- flow ----------------

function resetGame(): void {
  removeAllPickups();
  removeAllDrones();
  resetState();
  applyTech();
  rebuildMech();
  camTarget.set(0, 0, 0);
  clearNumbers();
  resetHUD();
  syncArms();
  const mech = MECHS[G.mech];
  if (mech.startShoulder) installShoulder(mech.startShoulder);
  for (let i = 0; i < (mech.bay ?? 0) + S.bay; i++) addDrone();
}

function showOnly(id: 'start' | 'levelup' | 'pause' | 'over' | null): void {
  for (const s of ['start', 'levelup', 'pause', 'over'] as const) $(s).hidden = s !== id;
}

function startGame(): void {
  initAudio();
  resetGame();
  closeBase();
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

/** Ends the run either way: everything picked up goes to the save. */
function endRun(won: boolean): void {
  G.state = 'over';
  mouse.down = false;
  document.body.classList.add('menu');
  save.scrap += G.loot.scrap;
  save.cores += G.loot.cores;
  save.runs++;
  if (won) save.wins++;
  persist();
  const title = $('oTitle');
  title.textContent = won ? 'ЭВАКУАЦИЯ' : 'МЕХ УНИЧТОЖЕН';
  title.className = won ? 'win' : 'dead';
  $('oTime').textContent = fmtTime(G.time);
  $('oKills').textContent = String(G.kills);
  $('oLvl').textContent = String(P.level);
  $('oScrap').textContent = String(G.loot.scrap);
  $('oCores').textContent = String(G.loot.cores);
  $('oNote').textContent = won
    ? 'Финальный босс повержен. Добыча доставлена на базу.'
    : `Добыча сохранена. На базе: ${save.scrap} лома, ${save.cores} ядер.`;
  $('over').hidden = false;
}

function showBase(): void {
  G.state = 'base';
  showOnly(null);
  $('hud').hidden = true;
  document.body.classList.add('menu');
  openBase();
}

function showMenu(): void {
  closeBase();
  G.state = 'start';
  showOnly('start');
  $('hud').hidden = true;
  document.body.classList.add('menu');
  renderMechs();
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

const DIGITS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 };

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
      case 'base':
        if (code === 'Escape') showMenu();
        else if (code === 'Enter') startGame();
        break;
    }
  },
});

// ---------------- mech select ----------------

const MECH_KEY = 'swarm.mech';
const mechCards = $('mechs');

function selectMech(id: MechId): void {
  if (!mechUnlocked(id)) return; // the card itself says where to unlock it
  G.mech = id;
  try { localStorage.setItem(MECH_KEY, id); } catch { /* storage blocked */ }
  for (const c of mechCards.children) c.classList.toggle('on', (c as HTMLElement).dataset.mech === id);
  $('mechInfo').textContent = MECHS[id].passive;
  resetGame(); // rebuilds the model, so the title screen shows the chosen mech
}

function renderMechs(): void {
  // a mech locked again (save reset) falls back to the starter
  if (!mechUnlocked(G.mech)) selectMech('guard');
  mechCards.replaceChildren(...MECH_ORDER.map((id, i) => {
    const m = MECHS[id];
    const open = mechUnlocked(id);
    const b = document.createElement('button');
    b.className = `card mech${id === G.mech ? ' on' : ''}${open ? '' : ' locked'}`;
    b.dataset.mech = id;
    const extra = (m.dash.charges > 1 ? ` · рывков ${m.dash.charges}` : '') + (m.bay ? ` · дронов ${m.bay}` : '');
    // the passive of the selected mech is shown once under the row, so five cards fit on one line
    b.innerHTML = `<small class="desk-only">${i + 1}</small><h3>${m.name}</h3><em>${open ? m.role : 'Открывается на базе'}</em>`
      + `<span class="mono">HP ${m.hp} · плеч ${m.shoulders}${extra}</span>`;
    b.addEventListener('click', () => selectMech(id));
    return b;
  }));
  $('mechInfo').textContent = MECHS[G.mech].passive;
}

try {
  const saved = localStorage.getItem(MECH_KEY) as MechId | null;
  if (saved && saved in MECHS && mechUnlocked(saved)) G.mech = saved;
} catch { /* storage blocked */ }
renderMechs();

$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('baseBtn').addEventListener('click', showBase);
$('overBaseBtn').addEventListener('click', showBase);
$('baseBackBtn').addEventListener('click', showMenu);
$('basePlayBtn').addEventListener('click', startGame);
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
  if (G.evacT > 0 && (G.evacT -= dt) <= 0) G.won = true;
  updatePlayer(dt);
  updateWeapons(dt);
  spawnDirector(dt);
  buildGrid();
  updateEnemies(dt);
  updateBullets(dt);
  updateEnemyShots(dt);
  updateStrikes(dt);
  updateShoulders(dt);
  updateTrails(dt);
  updateModules(dt);
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
  G.debris = G.debris.filter(d => d.life > 0);
  G.wrecks = G.wrecks.filter(w => w.life > 0);
  G.strikes = G.strikes.filter(s => s.t < s.dur);
  G.mines = G.mines.filter(m => !m.dead);
  G.beams = G.beams.filter(b => b.life > 0);
  G.fires = G.fires.filter(f => f.life > 0);
  G.bomblets = G.bomblets.filter(b => b.t > 0);
}

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  updateAim();
  if (G.state === 'play') {
    update(dt);
    if (P.hp <= 0) endRun(false);
    else if (G.won) endRun(true);
    else if (G.pendingLevels > 0 && G.evacT <= 0) openLevelUp();
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
watchForUpdates();
requestAnimationFrame(frame);

// debug handle for the console and automated tests
declare global {
  interface Window { __swarm: unknown }
}
/** Debug: adds meta currency, e.g. to test the tech tree. */
function rich(scrap = 5000, cores = 30): void {
  save.scrap += scrap;
  save.cores += cores;
  persist();
  if (G.state === 'base') renderBase();
}

window.__swarm = { G, P, S, save, gainXP, startGame, choose, god, allUps, rich, resetSave, installShoulder, giveWeapon, spawnEnemy };
