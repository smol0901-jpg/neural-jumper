/* REINFORCE policy network 17 → 16 → 4 */
import { N_IN, N_HID, N_OUT, LEARN_KEY } from './config.js';
import { random } from './rng.js';

let W1, B1, W2, B2;
let totalUpdates = 0;
let lastLoss = 0;
let smartHistory = [];
let bestScore = 0;

const learnRate = 0.005;
const gamma = 0.99;
const entropyCoef = 0.02;
const temp = 2.0;

function handCraftedInit() {
  const zero = () => new Array(N_IN).fill(0);
  const recipes = [
    r => { r[0] = 3; }, r => { r[0] = -3; }, r => { r[3] = -1 / 8; }, r => { r[2] = 1 / 6; },
    r => { r[4] = -1; }, r => { r[4] = 1; }, r => { r[5] = 3; }, r => { r[6] = 3; },
    r => { r[8] = 3; }, r => { r[9] = 3; }, r => { r[10] = 3; }, r => { r[11] = 3; },
    r => { r[12] = 1.5; }, r => { r[13] = 4; }, r => { r[14] = 2; }, r => { r[15] = 1.5; }
  ];
  W1 = []; B1 = [];
  for (let i = 0; i < N_HID; i++) {
    const row = zero();
    recipes[i](row);
    W1.push(row);
    B1.push(0);
  }
  W2 = [
    [0, 5, 0, 0, 0.5, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2.5],
    [5, 0, 0, 0, 0, 0.5, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 2, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 2]
  ];
  B2 = [0.2, -1.0, 0.2, -1.2, -0.5];
}

export function buildWeights(jit = 0.25) {
  handCraftedInit();
  if (jit) {
    for (let i = 0; i < N_HID; i++)
      for (let j = 0; j < N_IN; j++) W1[i][j] += (random() - 0.5) * jit;
    for (let i = 0; i < N_OUT; i++)
      for (let j = 0; j < N_HID; j++) W2[i][j] += (random() - 0.5) * jit * 0.4;
  }
}

export function forward(x) {
  const h = new Array(N_HID);
  const logits = new Array(N_OUT);
  for (let i = 0; i < N_HID; i++) {
    let s = B1[i];
    for (let j = 0; j < N_IN; j++) s += W1[i][j] * x[j];
    h[i] = Math.tanh(s);
  }
  for (let i = 0; i < N_OUT; i++) {
    let s = B2[i];
    for (let j = 0; j < N_HID; j++) s += W2[i][j] * h[j];
    logits[i] = s;
  }
  return { x: x.slice(), h, logits };
}

export function softmax(logits, t = 1) {
  const m = Math.max(...logits);
  const e = logits.map(l => Math.exp((l - m) / t));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / sum);
}

export function sample(probs) {
  const r = random();
  let c = 0;
  for (let i = 0; i < probs.length; i++) {
    c += probs[i];
    if (r < c) return i;
  }
  return probs.length - 1;
}

function entropy(p) {
  let h = 0;
  for (const v of p) if (v > 1e-9) h -= v * Math.log(v);
  return h;
}

export function trainBatch(episodeBuffer, learning, rewardHistory, logFn) {
  if (!learning || episodeBuffer.length < 10) return episodeBuffer;
  const T = episodeBuffer.length;
  const rets = new Array(T);
  let G = 0;
  for (let t = T - 1; t >= 0; t--) {
    G = episodeBuffer[t].reward + gamma * G;
    rets[t] = G;
  }
  const mean = rets.reduce((a, b) => a + b, 0) / T;
  let v = 0;
  for (const r of rets) v += (r - mean) ** 2;
  const std = Math.sqrt(v / T) + 1e-6;
  for (let t = 0; t < T; t++) rets[t] = (rets[t] - mean) / std;

  const dW1 = W1.map(r => r.map(() => 0));
  const dB1 = B1.map(() => 0);
  const dW2 = W2.map(r => r.map(() => 0));
  const dB2 = B2.map(() => 0);
  let totalLoss = 0;

  for (let t = 0; t < T; t++) {
    const tr = episodeBuffer[t];
    const p = tr.probs;
    const a = tr.action;
    const Gt = rets[t];
    const Hh = entropy(p);
    const dLogits = new Array(N_OUT);
    for (let k = 0; k < N_OUT; k++) {
      const oh = k === a ? 1 : 0;
      dLogits[k] = (p[k] - oh) * Gt + entropyCoef * p[k] * (Math.log(p[k] + 1e-9) + Hh);
    }
    totalLoss += -Math.log(p[a] + 1e-9) * Gt - entropyCoef * Hh;

    const dHid = new Array(N_HID).fill(0);
    for (let j = 0; j < N_HID; j++) {
      let s = 0;
      for (let k = 0; k < N_OUT; k++) s += dLogits[k] * W2[k][j];
      dHid[j] = s * (1 - tr.h[j] * tr.h[j]);
    }
    for (let k = 0; k < N_OUT; k++) {
      dB2[k] += dLogits[k];
      for (let j = 0; j < N_HID; j++) dW2[k][j] += dLogits[k] * tr.h[j];
    }
    for (let j = 0; j < N_HID; j++) {
      dB1[j] += dHid[j];
      for (let i = 0; i < N_IN; i++) dW1[j][i] += dHid[j] * tr.x[i];
    }
  }

  const clip = 1.0;
  for (let i = 0; i < N_HID; i++) {
    for (let j = 0; j < N_IN; j++) {
      dW1[i][j] = Math.max(-clip, Math.min(clip, dW1[i][j] / T));
      W1[i][j] -= learnRate * dW1[i][j];
    }
    dB1[i] = Math.max(-clip, Math.min(clip, dB1[i] / T));
    B1[i] -= learnRate * dB1[i];
  }
  for (let i = 0; i < N_OUT; i++) {
    for (let j = 0; j < N_HID; j++) {
      dW2[i][j] = Math.max(-clip, Math.min(clip, dW2[i][j] / T));
      W2[i][j] -= learnRate * dW2[i][j];
    }
    dB2[i] = Math.max(-clip, Math.min(clip, dB2[i] / T));
    B2[i] -= learnRate * dB2[i];
  }

  lastLoss = totalLoss / T;
  totalUpdates++;
  const recent = rewardHistory.slice(-30);
  const smart = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  smartHistory.push(smart);
  if (smartHistory.length > 200) smartHistory.shift();
  if (logFn) logFn('ok', `AI update #${totalUpdates}  loss=${lastLoss.toFixed(3)}  smart=${smart.toFixed(0)}`);
  if (totalUpdates % 4 === 0) saveWeights();
  return [];
}

export function saveWeights() {
  try {
    localStorage.setItem(LEARN_KEY, JSON.stringify({
      W1, B1, W2, B2, totalUpdates, bestScore, smartHistory: smartHistory.slice(-100)
    }));
  } catch (e) {}
}

export function loadWeights() {
  try {
    const raw = localStorage.getItem(LEARN_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s.W1 || s.W1.length !== N_HID) return false;
    W1 = s.W1; B1 = s.B1; W2 = s.W2; B2 = s.B2;
    totalUpdates = s.totalUpdates || 0;
    bestScore = s.bestScore || 0;
    smartHistory = s.smartHistory || [];
    return true;
  } catch (e) {
    return false;
  }
}

export function wipeWeights() {
  localStorage.removeItem(LEARN_KEY);
  totalUpdates = 0;
  smartHistory = [];
  bestScore = 0;
  buildWeights(0.3);
}

export function getNetStats() {
  return { totalUpdates, lastLoss, smartHistory, bestScore };
}

export function setBestScore(v) {
  if (v > bestScore) bestScore = v;
}

export function decide(inputs, learning) {
  const cache = forward(inputs);
  let action, probs;
  if (learning) {
    probs = softmax(cache.logits, temp);
    action = sample(probs);
  } else {
    const y = cache.logits;
    action = 0;
    let best = y[0];
    for (let i = 1; i < y.length; i++) if (y[i] > best) { best = y[i]; action = i; }
    probs = new Array(y.length).fill(0);
    probs[action] = 1;
  }
  return { action, probs, cache };
}
