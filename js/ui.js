/* DOM UI helpers */
import { diff } from './levels.js';
import { getNetStats } from './network.js';
import { nowStamp } from './utils.js';

export function createUI() {
  const els = {
    topScore: document.getElementById('topScore'),
    topLevel: document.getElementById('topLevel'),
    hudHeight: document.getElementById('hudHeight'),
    hudLevel: document.getElementById('hudLevel'),
    hudBest: document.getElementById('hudBest'),
    hudJumps: document.getElementById('hudJumps'),
    sScore: document.getElementById('sScore'),
    sBest: document.getElementById('sBest'),
    sLevel: document.getElementById('sLevel'),
    sEps: document.getElementById('sEps'),
    sFeats: document.getElementById('sFeats'),
    sSize: document.getElementById('sSize'),
    sGap: document.getElementById('sGap'),
    sWind: document.getElementById('sWind'),
    sInt: document.getElementById('sInt'),
    sMode: document.getElementById('sMode'),
    sLearn: document.getElementById('sLearn'),
    sUpdates: document.getElementById('sUpdates'),
    sSmart: document.getElementById('sSmart'),
    log: document.getElementById('log'),
    overlay: document.getElementById('overlay'),
    levelBanner: document.getElementById('levelBanner'),
    btnMode: document.getElementById('btnMode'),
    btnLearn: document.getElementById('btnLearn'),
    btnPause: document.getElementById('btnPause')
  };

  function update(state, mode, learning, totalEps, bestScore) {
    const net = getNetStats();
    els.topScore.textContent = state.score;
    els.topLevel.textContent = state.level;
    els.hudHeight.textContent = state.score;
    els.hudLevel.textContent = state.level;
    els.hudBest.textContent = Math.max(bestScore, net.bestScore);
    els.hudJumps.textContent = state.jumps;

    els.sScore.textContent = state.score;
    els.sBest.textContent = Math.max(bestScore, net.bestScore);
    els.sLevel.textContent = state.level;
    els.sEps.textContent = totalEps;
    els.sFeats.textContent = state.activeFeatures.size
      ? [...state.activeFeatures].join(', ') : 'none';

    els.sSize.textContent = Math.round(diff.sizeMul * 100) + '%';
    els.sGap.textContent = Math.round(diff.gapBase) + ' / ' + diff.moveSpeed.toFixed(3);
    els.sWind.textContent =
      (state.activeFeatures.has('wind')
        ? (state.windAccel > 0 ? '→' : '←') + diff.windStr.toFixed(3)
        : '—') +
      ' / ' + Math.round(diff.vanishChance * 100) + '%';
    els.sInt.textContent = diff.intensity.toFixed(1) + '×';

    els.sMode.textContent = mode === 'ai' ? 'AI' : 'Human';
    els.sLearn.textContent = learning ? 'ON' : 'OFF';
    els.sUpdates.textContent = net.totalUpdates;
    const smart = net.smartHistory.length ? net.smartHistory[net.smartHistory.length - 1] : 0;
    els.sSmart.textContent = Math.round(smart);
  }

  function log(type, msg) {
    const div = document.createElement('div');
    div.className = 'log-line ' + type;
    div.innerHTML = `<span class="t">${nowStamp()}</span>${msg}`;
    els.log.appendChild(div);
    while (els.log.children.length > 70) els.log.removeChild(els.log.firstChild);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function showBanner(level) {
    els.levelBanner.textContent = 'LEVEL ' + level;
    els.levelBanner.classList.add('show');
    setTimeout(() => els.levelBanner.classList.remove('show'), 900);
  }

  function showOverlay(html) {
    els.overlay.style.display = 'flex';
    els.overlay.innerHTML = html;
  }

  function hideOverlay() {
    els.overlay.style.display = 'none';
  }

  function setModeBtn(mode) {
    els.btnMode.textContent = mode === 'ai' ? 'AI MODE' : 'HUMAN';
    els.btnMode.classList.toggle('active', mode === 'ai');
    els.btnMode.classList.toggle('lime', mode === 'human');
  }

  function setLearnBtn(learning) {
    els.btnLearn.textContent = learning ? 'LEARN ON' : 'LEARN OFF';
    els.btnLearn.classList.toggle('lime', learning);
  }

  function setPauseBtn(paused) {
    els.btnPause.textContent = paused ? 'RESUME' : 'PAUSE';
    els.btnPause.classList.toggle('active', paused);
  }

  return { update, log, showBanner, showOverlay, hideOverlay, setModeBtn, setLearnBtn, setPauseBtn, els };
}
