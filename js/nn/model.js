/**
 * nn/model.js — policy network weights + forward pass
 * Architecture: N_IN → N_HID (tanh) → N_OUT (softmax)
 */
import { N_IN, N_HID, N_OUT, LEARN_KEY } from '../config.js';
import { random } from '../rng.js';

export let W1, B1, W2, B2;
export let totalUpdates = 0;
export let lastLoss = 0;
export let bestScore = 0;
export let smartHistory = [];

export function handCraftedInit() {
  const zero = () => new Array(N_IN).fill(0);
  // Each hidden unit specializes on a physics cue
  const recipes = [
    r => { r[0] = 3; },                 // bias left
    r => { r[0] = -3; },                // bias right
    r => { r[3] = -1 / 8; },            // vy signal
    r => { r[2] = 1 / 6; },             // vx signal
    r => { r[4] = -1; },                // nearest plat dx
    r => { r[4] = 1; },
    r => { r[5] = 3; },                 // nearest plat dy
    r => { r[6] = 3; },
    r => { r[8] = 3; },                 // gap / reach features
    r => { r[9] = 3; },
    r => { r[10] = 3; },
    r => { r[11] = 3; },
    r => { r[12] = 1.5; },              // jumps left
    r => { r[13] = 4; },                // danger / height
    r => { r[14] = 2; },
    r => { r[15] = 1.5; }
  ];
  W1 = []; B1 = [];
  for (let i = 0; i < N_HID; i++) {
    const row = zero();
    if (recipes[i]) recipes[i](row);
    W1.push(row);
    B1.push(0);
  }
  W2 = [
    [0, 5, 0, 0, 0.5, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0],   // LEFT
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2.5],   // STAY
    [5, 0, 0, 0, 0, 0.5, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0],   // RIGHT
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 2, 0],     // DOUBLE
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 2]      // FIRE
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
  const sum = e.reduce((a, b) => a + b, 0) || 1;
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

export function entropy(p) {
  let h = 0;
  for (const v of p) if (v > 1e-9) h -= v * Math.log(v);
  return h;
}

export function setBestScore(s) {
  if (s > bestScore) bestScore = s;
}

export function getNetStats() {
  return { totalUpdates, lastLoss, bestScore, smart: smartHistory.slice(-1)[0] || 0 };
}

export function serialize() {
  return JSON.stringify({ W1, B1, W2, B2, totalUpdates, bestScore, smartHistory: smartHistory.slice(-50) });
}

export function deserialize(raw) {
  try {
    const o = JSON.parse(raw);
    if (o.W1 && o.W2) {
      W1 = o.W1; B1 = o.B1; W2 = o.W2; B2 = o.B2;
      totalUpdates = o.totalUpdates || 0;
      bestScore = o.bestScore || 0;
      smartHistory = o.smartHistory || [];
      return true;
    }
  } catch (e) {}
  return false;
}

export function saveLocal() {
  try { localStorage.setItem(LEARN_KEY, serialize()); } catch (e) {}
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LEARN_KEY);
    if (raw && deserialize(raw)) return true;
  } catch (e) {}
  return false;
}
