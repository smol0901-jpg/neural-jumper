/* Platform generation & world reset */
import { W, H } from './config.js';
import { random, chance, range } from './rng.js';
import { diff } from './levels.js';

export function makePlatform(y, ref, activeFeatures) {
  let pw = (54 + random() * 38) * diff.sizeMul;
  if (activeFeatures.has('small')) pw *= 0.72;
  if (activeFeatures.has('narrow')) pw *= 0.55;
  pw = Math.max(18, pw);

  let x;
  if (ref) {
    const rc = (ref.baseX !== undefined ? ref.baseX : ref.x) + ref.w / 2;
    const maxD = chance(0.2) ? 300 : 200;
    const dir = chance(0.5) ? -1 : 1;
    const off = 36 + random() * (maxD - 36);
    x = rc + dir * off - pw / 2;
    x = Math.max(4, Math.min(W - pw - 4, x));
  } else {
    x = 8 + random() * (W - pw - 16);
  }

  const p = {
    x, y, w: pw, h: 11,
    flash: 0, touched: false, life: 1, dead: false, kind: 'normal',
    // 2.5D depth cue
    depth: 0.5 + random() * 0.5
  };

  if (activeFeatures.has('moving')) {
    p.moveAmp = diff.moveAmp * (0.7 + random() * 0.6);
    p.moveSpeed = diff.moveSpeed * (0.7 + random() * 0.7) * (chance(0.5) ? 1 : -1);
    p.movePhase = random() * Math.PI * 2;
    p.baseX = p.x;
  }
  if (activeFeatures.has('vanishing') && chance(diff.vanishChance)) {
    p.vanishing = true;
  }
  if (activeFeatures.has('springs') && chance(diff.springChance)) {
    p.spring = true;
    p.kind = 'spring';
  }
  if (activeFeatures.has('dark')) p.dark = true;

  return p;
}

export function createStarfield(count = 90) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: random() * W,
      y: random() * H,
      r: random() * 1.5 + 0.25,
      s: random() * 0.55 + 0.1,
      layer: chance(0.4) ? 0 : (chance(0.5) ? 1 : 2) // parallax layers
    });
  }
  return stars;
}

export function resetWorldState() {
  return {
    player: {
      x: W / 2, y: H - 120, w: 28, h: 28,
      vx: 0, vy: -12, jumpsLeft: 1,
      lastBounce: -100, maxHeight: 0,
      _lastScore: 0
    },
    platforms: [],
    starfield: createStarfield(),
    score: 0,
    jumps: 0,
    doubleJumps: 0,
    frame: 0,
    epStep: 0,
    gameOver: false,
    deadTimer: 0,
    level: 1,
    activeFeatures: new Set(),
    windAccel: 0,
    stuck: 0,
    urgency: 0,
    currentTarget: null,
    currentSafe: null,
    episodeBuffer: []
  };
}

export function seedPlatforms(state) {
  const start = {
    x: W / 2 - 55, y: H - 55, w: 110, h: 12,
    flash: 0, touched: false, life: 1, kind: 'normal', depth: 0.7
  };
  state.platforms = [start];
  let ref = start;
  let y = start.y;
  while (y > -1000) {
    const sp = diff.gapBase + random() * diff.gapVar;
    y -= sp;
    const p = makePlatform(y, ref, state.activeFeatures);
    state.platforms.push(p);
    ref = p;
  }
}
