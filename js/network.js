/**
 * network.js — facade over modular NN (5 files in js/nn/)
 *   model.js    — weights, forward, softmax
 *   features.js — physics-aware observation vector
 *   buffer.js   — episode + human demo buffers
 *   train.js    — accelerated REINFORCE
 *   imitate.js  — learn from player actions
 */
import {
  buildWeights, forward, softmax, sample,
  setBestScore, getNetStats, saveLocal, loadLocal
} from './nn/model.js';
import { extractFeatures } from './nn/features.js';
import { trainBatch, getLr } from './nn/train.js';
import { recordHuman } from './nn/imitate.js';
import { demoSize } from './nn/buffer.js';

export {
  buildWeights, forward, softmax, sample,
  setBestScore, getNetStats, saveLocal, loadLocal,
  trainBatch, extractFeatures, recordHuman, getLr, demoSize
};

export function loadWeights() {
  return loadLocal();
}

export function wipeWeights() {
  try {
    localStorage.removeItem('neural-ascent-v3');
    localStorage.removeItem('neural-ascent-v2');
  } catch (e) {}
  buildWeights(0.25);
}

export function decide(state, temperature = 1.8) {
  const x = extractFeatures(state);
  const cache = forward(x);
  const probs = softmax(cache.logits, temperature);
  const action = sample(probs);
  return { action, probs, cache };
}

// Initialize weights once
if (!loadLocal()) buildWeights(0.22);
