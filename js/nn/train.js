/**
 * nn/train.js — accelerated REINFORCE + optional imitation mix
 *
 * Accelerations:
 *  - higher base LR with adaptive shrink
 *  - advantage normalization
 *  - entropy bonus
 *  - multi-epoch mini passes over episode
 *  - mix in human demos (behavior cloning gradient)
 */
import { N_IN, N_HID, N_OUT } from '../config.js';
import {
  W1, B1, W2, B2, entropy,
  totalUpdates, lastLoss, smartHistory, bestScore
} from './model.js';
import * as model from './model.js';
import { sampleDemos, demoSize } from './buffer.js';
import { imitateGradient } from './imitate.js';

const GAMMA = 0.985;
const ENTROPY = 0.025;
let lr = 0.012; // accelerated vs old 0.005
const LR_MIN = 0.002;
const LR_MAX = 0.02;
const EPOCHS = 3; // multi-pass over same trajectory

function applyGrads(dW1, dB1, dW2, dB2, scale) {
  const clip = 1.2;
  for (let i = 0; i < N_HID; i++) {
    for (let j = 0; j < N_IN; j++) {
      const g = Math.max(-clip, Math.min(clip, dW1[i][j] * scale));
      W1[i][j] -= lr * g;
    }
    B1[i] -= lr * Math.max(-clip, Math.min(clip, dB1[i] * scale));
  }
  for (let i = 0; i < N_OUT; i++) {
    for (let j = 0; j < N_HID; j++) {
      const g = Math.max(-clip, Math.min(clip, dW2[i][j] * scale));
      W2[i][j] -= lr * g;
    }
    B2[i] -= lr * Math.max(-clip, Math.min(clip, dB2[i] * scale));
  }
}

function zeroGrads() {
  return {
    dW1: W1.map(r => r.map(() => 0)),
    dB1: B1.map(() => 0),
    dW2: W2.map(r => r.map(() => 0)),
    dB2: B2.map(() => 0)
  };
}

function accumulatePolicy(buf, rets, grads) {
  const { dW1, dB1, dW2, dB2 } = grads;
  let loss = 0;
  const T = buf.length;
  for (let t = 0; t < T; t++) {
    const tr = buf[t];
    const p = tr.probs;
    const a = tr.action;
    const Gt = rets[t];
    const Hh = entropy(p);
    const dLogits = new Array(N_OUT);
    for (let k = 0; k < N_OUT; k++) {
      const oh = k === a ? 1 : 0;
      dLogits[k] = (p[k] - oh) * Gt + ENTROPY * p[k] * (Math.log(p[k] + 1e-9) + Hh);
    }
    loss += -Math.log(p[a] + 1e-9) * Gt - ENTROPY * Hh;

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
  return loss / T;
}

export function trainBatch(episodeBuffer, learning, rewardHistory, logFn) {
  if (!learning || !episodeBuffer || episodeBuffer.length < 8) return episodeBuffer || [];

  const T = episodeBuffer.length;
  const rets = new Array(T);
  let G = 0;
  for (let t = T - 1; t >= 0; t--) {
    G = episodeBuffer[t].reward + GAMMA * G;
    rets[t] = G;
  }
  const mean = rets.reduce((a, b) => a + b, 0) / T;
  let v = 0;
  for (const r of rets) v += (r - mean) ** 2;
  const std = Math.sqrt(v / T) + 1e-6;
  for (let t = 0; t < T; t++) rets[t] = (rets[t] - mean) / std;

  let totalLoss = 0;
  for (let ep = 0; ep < EPOCHS; ep++) {
    const grads = zeroGrads();
    totalLoss = accumulatePolicy(episodeBuffer, rets, grads);
    // Mix human demonstrations (behavior cloning) — stronger early, always a bit
    const nDemo = Math.min(48, demoSize());
    if (nDemo >= 8) {
      const demos = sampleDemos(nDemo);
      imitateGradient(demos, grads, 0.35); // BC weight
    }
    applyGrads(grads.dW1, grads.dB1, grads.dW2, grads.dB2, 1 / T);
  }

  model.lastLoss = totalLoss;
  model.totalUpdates++;

  const recent = (rewardHistory || []).slice(-40);
  const smart = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  model.smartHistory.push(smart);
  if (model.smartHistory.length > 100) model.smartHistory.shift();

  // Adaptive LR
  if (smart > 400) lr = Math.max(LR_MIN, lr * 0.98);
  else if (smart < 80) lr = Math.min(LR_MAX, lr * 1.02);

  if (logFn && model.totalUpdates % 5 === 0) {
    logFn('learn', `upd ${model.totalUpdates} loss ${totalLoss.toFixed(3)} lr ${lr.toFixed(4)} demos ${demoSize()}`);
  }
  model.saveLocal();
  return [];
}

export function getLr() { return lr; }
