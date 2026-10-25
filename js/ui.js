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
    try {
      if (!state) return;
      const net = getNetStats() || {};
      const set = (el, v) => { if (el) el.textContent = v; };
      set(els.topScore, state.score);
      set(els.topLevel, state.level);
      set(els.hudHeight, state.score);
      set(els.hudLevel, state.level);
      set(els.hudBest, Math.max(bestScore || 0, net.bestScore || 0));
      set(els.hudJumps, state.jumps);
      set(els.sScore, state.score);
      set(els.sBest, Math.max(bestScore || 0, net.bestScore || 0));
      set(els.sLevel, state.level);
      set(els.sEps, totalEps);
      const feats = state.activeFeatures;
      set(els.sFeats, feats && feats.size ? [...feats].join(', ') : 'none');
      set(els.sSize, Math.round((diff.sizeMul || 1) * 100) + '%');
      set(els.sGap, Math.round(diff.gapBase || 0) + ' / ' + (diff.moveSpeed || 0).toFixed(3));
      const windStr = (feats && feats.has('wind'))
        ? ((state.windAccel > 0 ? '→' : '←') + (diff.windStr || 0).toFixed(3))
        : '—';
      set(els.sWind, windStr + ' / ' + Math.round((diff.vanishChance || 0) * 100) + '%');
      set(els.sInt, (diff.intensity || 1).toFixed(1) + '×');
      set(els.sMode, mode === 'ai' ? 'AI' : 'Human');
      set(els.sLearn, learning ? 'ON' : 'OFF');
      set(els.sUpdates, net.totalUpdates ?? 0);
      set(els.sSmart, Math.round(net.smart ?? 0));
    } catch (err) {
      console.warn('ui.update', err);
    }
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
