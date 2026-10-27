// Entry point: game flow (start / pause / level-up / game over) and the frame loop.
import './style.css';
import { updateAura } from './abilities';
import { updateField } from './arena';
import { duckMusic, initAudio, musicEnabled, toggleMusic, toggleMute } from './audio';
import { closeBase, openBase, renderBase } from './base';
import { meltdown, updateBullets } from './combat';
import { MAPS, MAP_ORDER, MECHS, MECH_ORDER, PACING, type MapId, type MechId } from './config';
import { spawnDirector, spawnEnemy, updateEnemies, updateEnemyShots, updateStrikes } from './enemies';
import { clearNumbers, showBanner, sparks, updateNumbers, updateParticles } from './fx';
import { buildGrid } from './grid';
import { resetHUD, updateHUD } from './hud';
import { bindInput, mouse, toggleAutoAim, touch, updateAim } from './input';
import { rebuildMech } from './mech';
import { updateModules } from './modules';
import { updateMusic, type MusicMode } from './music';
import { collectAllGems, gainXP, removeAllPickups, updateGems, updatePickups } from './pickups';
import { tryDash, updatePlayer, updateTrails } from './player';
import { camTarget, renderWorld, updateCamera } from './render';
import { camera, renderer, scene } from './scene';
import { addDrone, installShoulder, removeAllDrones, updateShoulders } from './shoulders';
import { platform } from './platform';
import { loadSave, persist, resetSave, save } from './save';
import { G, P, S, aim, resetState } from './state';
import { applyTech, mechUnlocked } from './tech';
import { choose, openLevelUp } from './upgrades';
import { $, clamp, fmtTime } from './utils';
import { firePressed, giveWeapon, reloadPressed, syncArms, updateWeapons } from './weapons';

// the site SDK and the save come first: the title screen already shows unlocked mechs
await platform.init();
await loadSave();

// ---------------- flow ----------------

function resetGame(): void {
  removeAllPickups();
  removeAllDrones();
  resetState();
  updateField();
  applyTech();
  S.scrap *= MAPS[G.map].loot;
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
/** `quit`: the player ended the run from the pause menu; the loot is kept like on death. */
function endRun(won: boolean, quit = false): void {
  showOnly(null);
  G.state = 'over';
  mouse.down = false;
  document.body.classList.add('menu');
  save.scrap += G.loot.scrap;
  save.cores += G.loot.cores;
  save.runs++;
  if (won) save.wins++;
  // the first evacuation from a map opens the next one
  const opened = won && !save.cleared.includes(G.map) ? MAP_ORDER.find(id => MAPS[id].after === G.map) : undefined;
  if (won && !save.cleared.includes(G.map)) save.cleared.push(G.map);
  persist();
  const title = $('oTitle');
  title.textContent = won ? 'ЭВАКУАЦИЯ' : quit ? 'ЗАБЕГ ПРЕРВАН' : 'МЕХ УНИЧТОЖЕН';
  title.className = won ? 'win' : 'dead';
  $('oTime').textContent = fmtTime(G.time);
  $('oKills').textContent = String(G.kills);
  $('oLvl').textContent = String(P.level);
  $('oScrap').textContent = String(G.loot.scrap);
  $('oCores').textContent = String(G.loot.cores);
  $('oNote').textContent = won
    ? `Финальный босс повержен. Добыча доставлена на базу.${opened ? ` Открыта карта «${MAPS[opened].name}».` : ''}`
    : `Добыча сохранена. На базе: ${save.scrap} лома, ${save.cores} ядер.`;
  if (opened) syncMap();
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
  syncMap();
}

/** Debug cheat: toggles invulnerability, or sets it when `on` is given. */
function god(on = !G.god): boolean {
  G.god = on;
  showBanner(on ? 'БЕССМЕРТИЕ ВКЛ' : 'БЕССМЕРТИЕ ВЫКЛ', 'gold', 0.8);
  return on;
}

/** Debug cheat: the final boss arrives in a moment, to check the evacuation without a full run. */
function final(): void {
  if (G.state !== 'play' || G.bossN >= PACING.bossCount) return;
  G.bossN = PACING.bossCount - 1;
  G.nextBoss = G.time + 0.5;
}

/** Debug cheat: buying tech costs nothing. Toggles, or sets it when `on` is given. */
function inf(on = !G.infRes): boolean {
  G.infRes = on;
  showBanner(on ? 'БЕСКОНЕЧНЫЕ РЕСУРСЫ ВКЛ' : 'БЕСКОНЕЧНЫЕ РЕСУРСЫ ВЫКЛ', 'gold', 0.8);
  if (G.state === 'base') renderBase();
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
    if (code === 'KeyN') {
      switchMusic();
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
        else if (code === 'KeyF' && import.meta.env.DEV) final();
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
        else if (code === 'KeyI' && import.meta.env.DEV) inf();
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

// ---------------- map select ----------------

const MAP_KEY = 'swarm.map';
const mapBtn = $('mapBtn');

const mapUnlocked = (id: MapId): boolean => { const after = MAPS[id].after; return !after || save.cleared.includes(after); };

/** Shows the chosen map and what the next locked one needs; a map locked again (save reset) falls back to the first. */
function syncMap(): void {
  if (!mapUnlocked(G.map)) G.map = MAP_ORDER[0];
  const m = MAPS[G.map], next = MAP_ORDER.find(id => !mapUnlocked(id));
  mapBtn.textContent = `Карта: ${m.name}`;
  mapBtn.hidden = MAP_ORDER.filter(mapUnlocked).length < 2;
  $('mapInfo').textContent = `${m.name}: ${m.desc}${m.loot > 1 ? `, лом ×${m.loot}` : ''}.`
    + (next ? ` Эвакуация с карты «${MAPS[MAPS[next].after!].name}» откроет «${MAPS[next].name}».` : '');
  updateField(); // the title screen shows the chosen map behind it
}

mapBtn.addEventListener('click', () => {
  const open = MAP_ORDER.filter(mapUnlocked);
  G.map = open[(open.indexOf(G.map) + 1) % open.length];
  try { localStorage.setItem(MAP_KEY, G.map); } catch { /* storage blocked */ }
  syncMap();
});

try {
  const saved = localStorage.getItem(MAP_KEY) as MapId | null;
  if (saved && saved in MAPS) G.map = saved;
} catch { /* storage blocked */ }
syncMap();

$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('baseBtn').addEventListener('click', showBase);
$('overBaseBtn').addEventListener('click', showBase);
$('baseBackBtn').addEventListener('click', showMenu);
$('basePlayBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', () => setPause(false));
// ending a run takes a second press, so a stray tap on the pause screen can't throw the run away
const quitBtn = $('quitBtn');
let quitArmed = 0;
quitBtn.addEventListener('click', () => {
  if (G.state !== 'pause') return;
  if (performance.now() < quitArmed) {
    quitArmed = 0;
    quitBtn.textContent = 'ЗАВЕРШИТЬ ЗАБЕГ';
    endRun(false, true);
    return;
  }
  quitArmed = performance.now() + 3000;
  quitBtn.textContent = 'ТОЧНО ЗАВЕРШИТЬ?';
  setTimeout(() => { if (performance.now() >= quitArmed) quitBtn.textContent = 'ЗАВЕРШИТЬ ЗАБЕГ'; }, 3050);
});
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

const musicBtns = document.querySelectorAll<HTMLButtonElement>('[data-music]');
function syncMusicBtns(): void {
  for (const b of musicBtns) {
    b.textContent = `Музыка: ${musicEnabled() ? 'ВКЛ' : 'ВЫКЛ'}`;
    b.classList.toggle('on', musicEnabled());
  }
}
function switchMusic(): void {
  const on = toggleMusic();
  syncMusicBtns();
  if (G.state === 'play') showBanner(on ? 'МУЗЫКА ВКЛ' : 'МУЗЫКА ВЫКЛ', 'blue', 0.8);
}
for (const b of musicBtns) b.addEventListener('click', switchMusic);
syncMusicBtns();

/** Which music the current moment calls for; the fight builds up with time and crowd size. */
function musicFor(): [MusicMode, number] {
  if (G.state === 'start' || G.state === 'base') return ['menu', 0];
  if (G.state === 'over' || G.deathT > 0) return [G.won ? 'evac' : 'over', 0];
  if (G.evacT > 0) return ['evac', 0];
  if (G.enemies.some(e => e.boss && !e.dead)) return ['boss', 1];
  return ['play', clamp(G.time / 600 + G.enemies.length / 220, 0, 1)];
}
document.body.classList.add('menu');

// ---------------- simulation ----------------

function update(dt: number): void {
  G.time += dt;
  if (G.evacT > 0 && (G.evacT -= dt) <= 0) G.won = true;
  // a destroyed mech neither moves nor shoots: the world plays out the blast and the loot flies in
  const alive = G.deathT <= 0;
  if (alive) updatePlayer(dt);
  updateField();
  if (alive) updateWeapons(dt);
  spawnDirector(dt);
  buildGrid();
  updateEnemies(dt);
  updateBullets(dt);
  updateEnemyShots(dt);
  updateStrikes(dt);
  if (alive) updateShoulders(dt);
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
  G.mushrooms = G.mushrooms.filter(m => m.t < m.dur);
}

let last = performance.now();
let playing = false;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  updateAim();
  if (G.state === 'play') {
    update(dt);
    if (G.deathT > 0) {
      if ((G.deathT -= dt) <= 0) { collectAllGems(); endRun(false); }
    } else if (P.hp <= 0) {
      meltdown();
      // the drones go down with the mech
      for (const d of G.drones) sparks(d.x, 1.6, d.z, 0xffb347, 6, 6);
      removeAllDrones();
      G.drones.length = 0;
    }
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
  const [mode, heat] = musicFor();
  duckMusic(G.state === 'pause' ? 0.35 : G.state === 'levelup' ? 0.6 : 1);
  updateMusic(dt, mode, heat);
  updateCamera(dt);
  renderWorld(G.state === 'play' ? dt : 0, G.state === 'play' && G.deathT <= 0);
  renderer.render(scene, camera);

  // sites time ads and their own pause around active play
  if ((G.state === 'play') !== playing) {
    playing = !playing;
    if (playing) platform.gameplayStart();
    else platform.gameplayStop();
  }
}

const updateBtns = document.querySelectorAll<HTMLElement>('[data-update]');
for (const b of updateBtns) b.addEventListener('click', () => location.reload());
platform.watchUpdates?.(() => { for (const b of updateBtns) b.hidden = false; });

resetGame();
requestAnimationFrame(frame);
platform.ready();

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

window.__swarm = { G, P, S, save, platform, gainXP, startGame, choose, god, allUps, inf, final, rich, resetSave, installShoulder, giveWeapon, spawnEnemy };
