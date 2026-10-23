// Entry point: game flow (start / pause / level-up / game over) and the frame loop.
import './style.css';
import { removeAllDrones, updateAura, updateDrones } from './abilities';
import { initAudio, toggleMute } from './audio';
import { updateBullets } from './combat';
import { spawnDirector, updateEnemies, updateEnemyShots } from './enemies';
import { clearNumbers, showBanner, updateNumbers, updateParticles } from './fx';
import { buildGrid } from './grid';
import { resetHUD, updateHUD } from './hud';
import { bindInput, mouse, updateAim } from './input';
import { gainXP, removeAllPickups, updateGems, updatePickups } from './pickups';
import { tryDash, updatePlayer } from './player';
import { camTarget, renderWorld, updateCamera } from './render';
import { camera, renderer, scene } from './scene';
import { G, P, S, aim, resetState } from './state';
import { choose, openLevelUp } from './upgrades';
import { $, fmtTime } from './utils';
import { cycleWeapon, reloadPressed, switchTo, syncGunModel, updateWeapons } from './weapons';

// ---------------- flow ----------------

function resetGame(): void {
  removeAllPickups();
  removeAllDrones();
  resetState();
  camTarget.set(0, 0, 0);
  clearNumbers();
  resetHUD();
  syncGunModel();
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

// ---------------- input ----------------

const DIGITS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2 };

bindInput({
  onGesture: initAudio,
  onFocusLost: () => setPause(true),
  onWheel: dir => { if (G.state === 'play') cycleWeapon(dir); },
  onKey: code => {
    if (code === 'KeyM') {
      showBanner(toggleMute() ? 'ЗВУК ВЫКЛ' : 'ЗВУК ВКЛ', 'blue', 0.8);
      return;
    }
    switch (G.state) {
      case 'play':
        if (code === 'Digit1') switchTo('pistol');
        else if (code === 'Digit2') switchTo('shotgun');
        else if (code === 'Digit3') switchTo('smg');
        else if (code === 'KeyR') reloadPressed();
        else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') tryDash();
        else if (code === 'Escape' || code === 'KeyP') setPause(true);
        else if (code === 'KeyG' && import.meta.env.DEV) god();
        break;
      case 'levelup':
        if (code in DIGITS) choose(DIGITS[code]);
        break;
      case 'pause':
        if (code === 'Escape' || code === 'KeyP') setPause(false);
        break;
      case 'start':
        if (code === 'Enter' || code === 'Space') startGame();
        break;
      case 'over':
        if (code === 'Enter') startGame();
        break;
    }
  },
});

$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', () => setPause(false));
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
  updateDrones(dt);
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
window.__swarm = { G, P, S, gainXP, startGame, choose, god };
