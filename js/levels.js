/* Self-generating difficulty & feature unlocks */
import { FEATURES, SCORE_PER_LEVEL } from './config.js';
import { random, chance } from './rng.js';

export const diff = {
  sizeMul: 1.0,
  gapBase: 75,
  gapVar: 40,
  moveAmp: 28,
  moveSpeed: 0.025,
  vanishChance: 0.35,
  vanishRate: 0.035,
  springChance: 0.14,
  windStr: 0.06,
  intensity: 1.0
};

export function computeDifficulty(lvl) {
  const t = Math.max(0, lvl - 1);
  diff.sizeMul = Math.max(0.38, 1.0 - t * 0.018);
  diff.gapBase = 70 + t * 2.8;
  diff.gapVar = 35 + t * 1.6;
  diff.moveAmp = 22 + t * 1.4;
  diff.moveSpeed = 0.018 + t * 0.0018;
  diff.vanishChance = Math.min(0.85, 0.25 + t * 0.018);
  diff.vanishRate = Math.min(0.09, 0.03 + t * 0.0015);
  diff.springChance = Math.max(0.04, 0.16 - t * 0.003);
  diff.windStr = 0.04 + t * 0.0045;
  diff.intensity = 1 + t * 0.07;
}

export function applyLevelFeatures(lvl, activeFeatures, windAccelRef) {
  const unlockAt = {
    moving: 2, vanishing: 3, small: 4, narrow: 5,
    springs: 6, wind: 7, dark: 8
  };
  for (const f of FEATURES) {
    if (lvl >= unlockAt[f]) activeFeatures.add(f);
  }
  if (activeFeatures.has('wind')) {
    if (lvl === 7 || (lvl > 7 && chance(0.35))) {
      windAccelRef.value = (chance(0.5) ? 1 : -1) * diff.windStr;
    } else {
      windAccelRef.value = Math.sign(windAccelRef.value || 1) * diff.windStr;
    }
  }
}

export function levelFromScore(score) {
  return Math.floor(score / SCORE_PER_LEVEL) + 1;
}

export function milestoneMessage(level) {
  if (level === 8) return 'All features unlocked — intensity scaling begins';
  if (level === 16) return 'Hard zone: tighter gaps & faster movers';
  if (level === 26) return 'Extreme zone: tiny platforms';
  if (level === 36) return 'Nightmare scaling';
  if (level % 10 === 0) return `Milestone level ${level}`;
  return null;
}
