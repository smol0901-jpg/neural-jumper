/**
 * nn/buffer.js — episode trajectories + human demonstration buffer
 */
const MAX_EP = 2000;
const MAX_DEMO = 4000;

export const episodeBuffer = [];
export const demoBuffer = []; // {x, h, action, probs} from human play

export function pushStep(step) {
  episodeBuffer.push(step);
  if (episodeBuffer.length > MAX_EP) episodeBuffer.shift();
}

export function pushDemo(step) {
  demoBuffer.push(step);
  if (demoBuffer.length > MAX_DEMO) demoBuffer.shift();
}

export function clearEpisode() {
  episodeBuffer.length = 0;
}

export function takeEpisode() {
  const out = episodeBuffer.slice();
  episodeBuffer.length = 0;
  return out;
}

export function demoSize() {
  return demoBuffer.length;
}

export function sampleDemos(n) {
  if (!demoBuffer.length) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(demoBuffer[(Math.random() * demoBuffer.length) | 0]);
  }
  return out;
}
