/* Neural Ascent — entry point */
import { W, H, TICK } from './config.js';
import { setSeed } from './rng.js';
import { buildWeights, loadWeights, wipeWeights, getNetStats } from './network.js';
import { computeDifficulty, applyLevelFeatures } from './levels.js';
import { resetWorldState, seedPlatforms } from './world.js';
import { physicsStep } from './physics.js';
import { drawFrame } from './renderer25d.js';
import {
  createDebugState, startRun, logDecision, logLanding, logSample,
  endRun, buildReport, reportToText, drawDebugOverlay
} from './debug.js';
import { expertReset } from './expert.js';
import { createUI } from './ui.js';
import { initTilt, updateTilt, nudgeTilt } from './tilt.js';

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const ui = createUI();

let state = null;
let dbg = createDebugState();
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
  try { setSideOpen(false); } catch(e) {}
  mode = m;
  ui.setModeBtn(mode);
  totalEps++;
  bootWorld();
  state._peakScore = 0;
  state._stagnantFrames = 0;
  ui.hideOverlay();
  started = true;
  ui.log('info', `Episode ${totalEps} · ${mode.toUpperCase()}`);
  expertReset();
  if (dbg.enabled) startRun(dbg);
}

function onEpisodeEnd(reason) {
  const net = getNetStats();
  bestScore = Math.max(bestScore, net.bestScore, state.score);
  // Debug batch handling
  if (dbg.enabled && dbg.batchMode) {
    endRun(dbg, state, reason);
    dbg.batchIndex++;
    if (dbg.batchIndex < dbg.batchTarget) {
      ui.log('ai', `Debug run ${dbg.batchIndex}/${dbg.batchTarget} done · score ${state.score}`);
      setTimeout(() => {
        startGame('ai');
        startRun(dbg);
      }, 500);
      return; // skip overlay during batch
    }
    // finished batch
    dbg.batchMode = false;
    const report = buildReport(dbg);
    const text = reportToText(report);
    downloadBlob(text, 'ai-debug-report.txt', 'text/plain');
    downloadBlob(JSON.stringify(report, null, 2), 'ai-debug-report.json', 'application/json');
    console.log('AI DEBUG REPORT', report);
    ui.showOverlay(`
      <h1 style="color:var(--cyan)">DEBUG DONE</h1>
      <div class="big-score">${report.summary.avgScore}</div>
      <p class="sub">Avg score · Best ${report.summary.bestScore} · ${report.summary.runs} runs</p>
      <p class="sub">Report files downloaded (txt + json)</p>
      <button class="btn active" id="btnRestart">PLAY AGAIN</button>
      <button class="btn" id="btnWatchAI2">WATCH AI</button>
    `);
    document.getElementById('btnRestart').onclick = () => { dbg.enabled = false; startGame('human'); };
    document.getElementById('btnWatchAI2').onclick = () => { dbg.enabled = false; startGame('ai'); };
    return;
  }
  if (dbg.enabled && dbg.current) endRun(dbg, state, reason);

  ui.showOverlay(`
    <h1 style="color:var(--rose)">RUN OVER</h1>
    <div class="big-score">${state.score}</div>
    <p class="sub">Level ${state.level} · ${reason === 'fell' ? 'Fell into the void' : reason} · Best ${bestScore}</p>
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
  // Desktop tilt preview (not control)
  if (e.key === 'i' || e.key === 'I') nudgeTilt(0, -4);
  if (e.key === 'k' || e.key === 'K') nudgeTilt(0, 4);
  if (e.key === 'j' || e.key === 'J') nudgeTilt(-4, 0);
  if (e.key === 'l' || e.key === 'L') nudgeTilt(4, 0);
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
document.getElementById('btnReset').onclick = () => {
  try { setSideOpen(false); } catch(e) {}
  startGame(mode);
};
document.getElementById('btnWipe').onclick = () => {
  wipeWeights();
  ui.log('warn', 'AI weights wiped');
  if (started) startGame(mode);
};
function bindDebugButtons() {
  const ids = ['btnDebug', 'btnDebugTop', 'btnDebugOverlay', 'btnDebugHelp'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // open side on mobile so user sees progress in log
      const side = document.getElementById('side');
      if (side && window.innerWidth <= 960) {
        side.classList.add('open');
        side.style.display = 'flex';
      }
      startDebugBatch();
    };
  }
}
bindDebugButtons();

function setSideOpen(open) {
  const side = document.getElementById('side');
  const btn = document.getElementById('btnSide');
  if (!side) return;
  if (open) {
    side.classList.add('open');
    side.style.display = 'flex';
    if (btn) { btn.textContent = 'ЗАКРЫТЬ'; btn.classList.add('active'); }
  } else {
    side.classList.remove('open');
    if (window.innerWidth <= 960) side.style.display = 'none';
    else side.style.display = '';
    if (btn) { btn.textContent = 'INFO'; btn.classList.remove('active'); }
    // If game never started — bring back start overlay (fixes empty black screen)
    if (!started) {
      const ov = document.getElementById('overlay');
      if (ov && ov.style.display === 'none') {
        ov.style.display = 'flex';
      }
    }
  }
}
function toggleSide() {
  const side = document.getElementById('side');
  setSideOpen(!(side && side.classList.contains('open')));
}
document.getElementById('btnSide').onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleSide();
};
document.getElementById('btnSideClose')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setSideOpen(false);
});
// Escape closes panel
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setSideOpen(false);
});


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
// Cosmetic 3D tilt of the stage (not player control)
const _tiltBoot = () => {
  initTilt().then(ok => {
    document.getElementById('gameWrap')?.classList.add('tilt-ready');
    if (ok) try { ui.log('info', 'Tilt view ON (style only)'); } catch(e) {}
  });
};
document.getElementById('btnStart')?.addEventListener('click', _tiltBoot, { once: true });
document.getElementById('btnWatchAI')?.addEventListener('click', _tiltBoot, { once: true });
document.getElementById('btnDebugOverlay')?.addEventListener('click', _tiltBoot, { once: true });

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
        clearFire: () => { fireQueued = false; },
        onLanding: (st, plat) => { if (dbg.enabled) logLanding(dbg, st, plat); },
        onDecision: (st, a, exp) => {
          if (!dbg.enabled || !dbg.current) return;
          if (a === 3 || a === 4 || st.frame % 4 === 0) {
            logDecision(dbg, st, a, { reason: (exp && exp.reason) || '', reach: null });
          }
        },
        onSample: (st) => { if (dbg.enabled) logSample(dbg, st); }
      });
      acc -= TICK;
      steps++;
    }
  } else if (started && state && state.gameOver && mode === 'ai' && !(dbg.batchMode)) {
    if (state.deadTimer > 100) startGame('ai');
  }

  if (state) {
    drawFrame(ctx, state, mode);
    if (dbg && dbg.enabled) drawDebugOverlay(ctx, state, dbg);
    ui.update(state, mode, learning, totalEps, bestScore);
  }
  updateTilt(document.getElementById('gameWrap'));
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
// Cosmetic 3D tilt of the stage (not player control)
const _tiltBoot = () => {
  initTilt().then(ok => {
    document.getElementById('gameWrap')?.classList.add('tilt-ready');
    if (ok) try { ui.log('info', 'Tilt view ON (style only)'); } catch(e) {}
  });
};
document.getElementById('btnStart')?.addEventListener('click', _tiltBoot, { once: true });
document.getElementById('btnWatchAI')?.addEventListener('click', _tiltBoot, { once: true });
document.getElementById('btnDebugOverlay')?.addEventListener('click', _tiltBoot, { once: true });

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


// ===== AI DEBUG BATCH =====
function startDebugBatch() {
  dbg.enabled = true;
  dbg.batchMode = true;
  dbg.batchIndex = 0;
  dbg.batchTarget = 10;
  dbg.runs = [];
  dbg.showGrid = true;
  expertReset();
  console.log('DEBUG BATCH: 10 AI runs');
  try { ui.log('warn', 'DEBUG BATCH ×10 started'); } catch(e) {}
  startGame('ai');
  startRun(dbg);
}

function onDebugEpisodeEnd(reason) {
  if (!dbg.enabled) return;
  endRun(dbg, state, reason);
  if (dbg.batchMode) {
    dbg.batchIndex++;
    if (dbg.batchIndex < dbg.batchTarget) {
      setTimeout(() => {
        startGame('ai');
        startRun(dbg);
        if (window.__naLog) window.__naLog('ai', `Debug run ${dbg.batchIndex + 1}/${dbg.batchTarget}`);
      }, 600);
    } else {
      dbg.batchMode = false;
      finishDebugBatch();
    }
  }
}

function finishDebugBatch() {
  const report = buildReport(dbg);
  const text = reportToText(report);
  const json = JSON.stringify(report, null, 2);
  // download both
  downloadBlob(text, 'ai-debug-report.txt', 'text/plain');
  downloadBlob(json, 'ai-debug-report.json', 'application/json');
  console.log('AI DEBUG REPORT', report);
  alert(`Debug batch done: ${report.summary.runs} runs, avg score ${report.summary.avgScore}, best ${report.summary.bestScore}. Files downloaded.`);
  dbg.enabled = false;
}

function downloadBlob(content, name, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

window.startDebugBatch = startDebugBatch;
window.toggleDebugLive = () => {
  dbg.enabled = !dbg.enabled;
  dbg.showGrid = dbg.enabled;
  if (dbg.enabled && !dbg.current && mode === 'ai') startRun(dbg);
};
