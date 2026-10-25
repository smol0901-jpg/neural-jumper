import { W, H } from './config.js';
import { random, chance } from './rng.js';
import { diff } from './levels.js';

export function makePlatform(y, ref, activeFeatures) {
  let pw = (54 + random() * 38) * diff.sizeMul;
  if (activeFeatures.has('small')) pw *= 0.72;
  if (activeFeatures.has('narrow')) pw *= 0.55;
  pw = Math.max(18, pw);

  let x;
  if (ref) {
    const rc = (ref.baseX !== undefined ? ref.baseX : ref.x) + ref.w / 2;
    // Keep horizontal offset within jump reach (~150px typical)
    const maxD = 40 + random() * 110; // 40..150
    const dir = chance(0.5) ? -1 : 1;
    const off = maxD;
    x = rc + dir * off - pw / 2;
    x = Math.max(4, Math.min(W - pw - 4, x));
  } else {
    x = 8 + random() * (W - pw - 16);
  }

  const p = {
    x, y, w: pw, h: 11,
    flash: 0, touched: false, life: 1, dead: false, kind: 'normal',
    depth: 0.5 + random() * 0.5
  };

  if (activeFeatures.has('moving')) {
    p.moveAmp = diff.moveAmp * (0.7 + random() * 0.6);
    p.moveSpeed = diff.moveSpeed * (0.7 + random() * 0.7) * (chance(0.5) ? 1 : -1);
    p.movePhase = random() * Math.PI * 2;
    p.baseX = p.x;
  }
  if (activeFeatures.has('vanishing') && chance(diff.vanishChance)) p.vanishing = true;
  if (activeFeatures.has('springs') && chance(diff.springChance)) {
    p.spring = true; p.kind = 'spring';
  }
  if (activeFeatures.has('boosts') && chance(diff.boostChance)) {
    p.boost = true; p.kind = 'boost';
  }
  if (activeFeatures.has('dark')) p.dark = true;
  return p;
}

export function makeEnemy(platform) {
  return {
    x: platform.x + platform.w / 2,
    y: platform.y - 14,
    w: 18, h: 18,
    vx: (chance(0.5) ? 1 : -1) * (0.8 + random() * 1.2),
    plat: platform,
    hp: 1,
    dead: false,
    flash: 0
  };
}

export function createStarfield(count = 120) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: random() * W,
      y: random() * H,
      r: random() * 1.6 + 0.2,
      s: random() * 0.6 + 0.08,
      layer: Math.floor(random() * 4) // 0..3 = 4 parallax layers
    });
  }
  return stars;
}

export function resetWorldState() {
  return {
    player: {
      x: W / 2, y: H - 120, w: 26, h: 30,
      vx: 0, vy: -12, jumpsLeft: 1,
      lastBounce: -100, maxHeight: 0,
      _lastScore: 0, facing: 1,
      hp: 3, invuln: 0
    },
    platforms: [],
    enemies: [],
    bullets: [],
    starfield: createStarfield(),
    score: 0, jumps: 0, doubleJumps: 0,
    frame: 0, epStep: 0,
    gameOver: false, deadTimer: 0, level: 1,
    activeFeatures: new Set(),
    windAccel: 0, stuck: 0, urgency: 0,
    currentTarget: null, currentSafe: null,
    episodeBuffer: [],
    failJumps: 0, lastTargetId: null,
    kills: 0
  };
}

export function seedPlatforms(state) {
  const start = {
    x: W / 2 - 55, y: H - 55, w: 110, h: 12,
    flash: 0, touched: false, life: 1, kind: 'normal', depth: 0.7
  };
  state.platforms = [start];
  state.enemies = [];
  let ref = start, y = start.y;
  while (y > -1000) {
    const sp = diff.gapBase + random() * diff.gapVar;
    y -= sp;
    const p = makePlatform(y, ref, state.activeFeatures);
    state.platforms.push(p);
    if (state.activeFeatures.has('enemies') && chance(diff.enemyChance) && !p.spring) {
      state.enemies.push(makeEnemy(p));
    }
    ref = p;
  }
}
