/* Neural Ascent — entry point */
import { W, H, TICK } from './config.js';
import { setSeed } from './rng.js';
import { buildWeights, loadWeights, wipeWeights, getNetStats } from './network.js';
import { computeDifficulty, applyLevelFeatures } from './levels.js';
import { resetWorldState, seedPlatforms } from './world.js';
import { physicsStep } from './physics.js';
import { drawFrame } from './renderer25d.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const ui = createUI();

let state = null;
let mode = 'human';
let learning = true;
let paused = false;
let started = false;
let keys = { left: false, right: false };
let humanJumpQueued = false;
let fireQueued = false;
let totalEps = 0;
let rewardHistory = [];
let bestScore = 0;

function bootWorld() {
  computeDifficulty(1);
  state = resetWorldState();
  applyLevelFeatures(1, state.activeFeatures, { value: 0 });
  seedPlatforms(state);
  humanJumpQueued = false;
}

function startGame(m) {
  mode = m;
  ui.setModeBtn(mode);
  totalEps++;
  bootWorld();
  ui.hideOverlay();
  started = true;
  ui.log('info', `Episode ${totalEps} · ${mode.toUpperCase()}`);
}

function onEpisodeEnd(reason) {
  const net = getNetStats();
  bestScore = Math.max(bestScore, net.bestScore, state.score);
  ui.showOverlay(`
    <h1 style="color:var(--rose)">RUN OVER</h1>
    <div class="big-score">${state.score}</div>
    <p class="sub">Level ${state.level} · ${reason === 'fell' ? 'Fell into the void' : 'Time out'} · Best ${bestScore}</p>
    <button class="btn active" id="btnRestart">PLAY AGAIN</button>
    <button class="btn" id="btnWatchAI2">WATCH AI</button>
  `);
  document.getElementById('btnRestart').onclick = () => startGame('human');
  document.getElementById('btnWatchAI2').onclick = () => startGame('ai');
}

function onLevelUp(level) {
  ui.showBanner(level);
}

// Input
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
  if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  if (e.code === 'Space' || e.key === 'w' || e.key === 'W') {
    e.preventDefault();
    if (mode === 'human') humanJumpQueued = true;
  }
  if (e.key === 'f' || e.key === 'F' || e.code === 'KeyF') {
    if (mode === 'human') fireQueued = true;
  }
  if (e.key === 'p' || e.key === 'P') togglePause();
  if (e.key === 'r' || e.key === 'R') startGame(mode);
  if (e.key === 'm' || e.key === 'M') toggleMode();
  if (e.key === 'l' || e.key === 'L') toggleLearn();
});

document.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
  if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

let touchLeft = false, touchRight = false;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  const x = (t.clientX - rect.left) / rect.width;
  if (x < 0.4) { keys.left = true; touchLeft = true; }
  else if (x > 0.6) { keys.right = true; touchRight = true; }
  else humanJumpQueued = true;
}, { passive: false });

canvas.addEventListener('touchend', () => {
  if (touchLeft) { keys.left = false; touchLeft = false; }
  if (touchRight) { keys.right = false; touchRight = false; }
});

// Buttons
document.getElementById('btnStart').onclick = () => startGame('human');
document.getElementById('btnWatchAI').onclick = () => startGame('ai');
document.getElementById('btnMode').onclick = toggleMode;
document.getElementById('btnLearn').onclick = toggleLearn;
document.getElementById('btnPause').onclick = togglePause;
document.getElementById('btnReset').onclick = () => startGame(mode);
document.getElementById('btnWipe').onclick = () => {
  wipeWeights();
  ui.log('warn', 'AI weights wiped');
  if (started) startGame(mode);
};
document.getElementById('btnSide').onclick = () => {
  document.getElementById('side').classList.toggle('open');
};

document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.dataset.tab;
    document.getElementById('panelStats').style.display = tab === 'stats' ? '' : 'none';
    document.getElementById('panelHelp').style.display = tab === 'help' ? '' : 'none';
    document.getElementById('panelLog').style.display = tab === 'log' ? '' : 'none';
  };
});

function toggleMode() {
  mode = mode === 'ai' ? 'human' : 'ai';
  ui.setModeBtn(mode);
  ui.log('info', `Switched to ${mode.toUpperCase()}`);
}

function toggleLearn() {
  learning = !learning;
  ui.setLearnBtn(learning);
  ui.log('info', learning ? 'Learning enabled' : 'Learning frozen');
}

function togglePause() {
  paused = !paused;
  ui.setPauseBtn(paused);
}

// Loop
let last = performance.now();
let acc = 0;

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(50, t - last);
  last = t;

  if (started && !paused && state && !state.gameOver) {
    acc += dt;
    let steps = 0;
    while (acc >= TICK && steps < 6) {
      physicsStep(state, {
        mode,
        learning,
        keys,
        humanJumpQueued,
        fireQueued,
        rewardHistory,
        onLog: ui.log,
        onLevelUp,
        onEpisodeEnd,
        clearJumpQueue: () => { humanJumpQueued = false; },
        clearFire: () => { fireQueued = false; }
      });
      acc -= TICK;
      steps++;
    }
  } else if (started && state && state.gameOver && mode === 'ai') {
    // auto restart AI after delay
    if (state.deadTimer > 100) startGame('ai');
  }

  if (state) {
    drawFrame(ctx, state, mode);
    ui.update(state, mode, learning, totalEps, bestScore);
  }
}

// Fit canvas
function fitCanvas() {
  const wrap = document.getElementById('gameWrap');
  const maxH = wrap.clientHeight - 10;
  const maxW = wrap.clientWidth - 10;
  const scale = Math.min(maxW / W, maxH / H, 1.4);
  canvas.style.width = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
}
window.addEventListener('resize', fitCanvas);

// Boot
setSeed(42);
if (!loadWeights()) {
  buildWeights(0.28);
  ui.log('info', 'Fresh neural weights');
} else {
  const net = getNetStats();
  bestScore = net.bestScore;
  ui.log('ok', `Loaded AI · updates=${net.totalUpdates} · best=${net.bestScore}`);
}
bootWorld();
ui.setModeBtn(mode);
ui.setLearnBtn(learning);
ui.update(state, mode, learning, totalEps, bestScore);
fitCanvas();
requestAnimationFrame(loop);

// Touch controls
const tLeft = document.getElementById('tLeft');
const tRight = document.getElementById('tRight');
const tFire = document.getElementById('tFire');
if (tLeft) {
  const bind = (el, down, up) => {
    el.addEventListener('touchstart', e => { e.preventDefault(); down(); }, {passive:false});
    el.addEventListener('touchend', e => { e.preventDefault(); up(); });
    el.addEventListener('mousedown', e => { e.preventDefault(); down(); });
    el.addEventListener('mouseup', up);
  };
  bind(tLeft, () => { keys.left = true; }, () => { keys.left = false; });
  bind(tRight, () => { keys.right = true; }, () => { keys.right = false; });
  bind(tFire, () => { fireQueued = true; humanJumpQueued = true; }, () => {});
}

// PWA install
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  const bar = document.getElementById('installBar');
  if (bar) bar.classList.add('show');
});
document.getElementById('btnInstall')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installBar')?.classList.remove('show');
});
document.getElementById('btnInstallDismiss')?.addEventListener('click', () => {
  document.getElementById('installBar')?.classList.remove('show');
});
