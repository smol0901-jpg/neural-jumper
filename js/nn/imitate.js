/**
 * nn/imitate.js — learn from human player actions (behavior cloning)
 * When you play in human mode with learning ON, every action is recorded
 * and mixed into training so the policy copies good human habits.
 */
import { N_IN, N_HID, N_OUT } from '../config.js';
import { W1, B1, W2, B2, forward, softmax } from './model.js';
import { pushDemo } from './buffer.js';
import { extractFeatures, humanToAction } from './features.js';

/**
 * Record one human frame into the demo buffer.
 */
export function recordHuman(state, keys, didDouble, didFire) {
  const action = humanToAction(keys, didDouble, didFire);
  // Skip pure idle spam somewhat
  if (action === 1 && Math.random() > 0.35) return;

  const x = extractFeatures(state);
  const cache = forward(x);
  const probs = softmax(cache.logits, 1.5);
  pushDemo({
    x: cache.x,
    h: cache.h,
    action,
    probs,
    reward: 0
  });
}

/**
 * Add supervised gradient: push policy toward demonstrated action.
 * grads mutated in place.
 */
export function imitateGradient(demos, grads, weight = 0.3) {
  if (!demos.length) return;
  const { dW1, dB1, dW2, dB2 } = grads;
  const T = demos.length;

  for (const tr of demos) {
    // Re-forward with current weights for fresh h/probs
    const cache = forward(tr.x);
    const probs = softmax(cache.logits, 1.2);
    const a = tr.action;
    // Cross-entropy gradient: (p - onehot)
    const dLogits = new Array(N_OUT);
    for (let k = 0; k < N_OUT; k++) {
      dLogits[k] = (probs[k] - (k === a ? 1 : 0)) * weight;
    }
    const dHid = new Array(N_HID).fill(0);
    for (let j = 0; j < N_HID; j++) {
      let s = 0;
      for (let k = 0; k < N_OUT; k++) s += dLogits[k] * W2[k][j];
      dHid[j] = s * (1 - cache.h[j] * cache.h[j]);
    }
    for (let k = 0; k < N_OUT; k++) {
      dB2[k] += dLogits[k] / T;
      for (let j = 0; j < N_HID; j++) dW2[k][j] += dLogits[k] * cache.h[j] / T;
    }
    for (let j = 0; j < N_HID; j++) {
      dB1[j] += dHid[j] / T;
      for (let i = 0; i < N_IN; i++) dW1[j][i] += dHid[j] * cache.x[i] / T;
    }
  }
}
