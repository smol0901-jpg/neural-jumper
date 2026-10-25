/* Core physics step */
import {
  W, H, GRAV, JUMP, SPRING_JUMP, DOUBLE_JUMP,
  ACC, MAXVX, FRICTION, CAM_LINE, DANGER_START, DANGER_END,
  EPISODE_TIMEOUT, TRAIN_EVERY
} from './config.js';
import { random } from './rng.js';
import { diff, computeDifficulty, applyLevelFeatures, levelFromScore, milestoneMessage } from './levels.js';
import { makePlatform } from './world.js';
import { decide, trainBatch, setBestScore } from './network.js';
import { clamp } from './utils.js';

export function physicsStep(state, opts) {
  const {
    mode, learning, keys, humanJumpQueued,
    rewardHistory, onLog, onLevelUp, onEpisodeEnd, clearJumpQueue
  } = opts;

  if (state.gameOver) {
    state.deadTimer++;
    return { humanJumpQueued: false };
  }

  state.frame++;
  state.epStep++;

  if (state.epStep >= EPISODE_TIMEOUT) {
    endEpisode(state, 'timeout', rewardHistory, learning, onLog, onEpisodeEnd);
    return { humanJumpQueued: false };
  }

  let mx = 0;
  let doDouble = false;
  let decision = null;

  if (mode === 'human') {
    if (keys.left) mx = -1;
    if (keys.right) mx = 1;
    if (humanJumpQueued && state.player.jumpsLeft > 0) {
      doDouble = true;
      clearJumpQueue();
    }
  } else {
    decision = think(state, learning);
    const a = decision.action;
    if (a === 0) mx = -1;
    else if (a === 2) mx = 1;
    if (a === 3) doDouble = true;
    if (state.urgency > 0.85 && state.currentSafe) {
      const ex = (state.currentSafe.x + state.currentSafe.w / 2) - state.player.x;
      mx = ex > 8 ? 1 : (ex < -8 ? -1 : 0);
    }
  }

  const player = state.player;
  const airborne = state.frame - player.lastBounce > 7;
  if (doDouble && player.jumpsLeft > 0 && airborne && player.vy > -11) {
    player.vy = DOUBLE_JUMP;
    player.jumpsLeft = 0;
    state.doubleJumps++;
    if (mode === 'ai' && onLog) onLog('ai', 'double jump');
  }

  player.vx += mx * ACC;
  if (state.activeFeatures.has('wind')) player.vx += state.windAccel;
  player.vx *= FRICTION;
  player.vx = clamp(player.vx, -MAXVX, MAXVX);

  player.vy += GRAV;
  const prevY = player.y;
  player.x += player.vx;
  player.y += player.vy;

  if (player.x < -player.w / 2) player.x = W + player.w / 2;
  if (player.x > W + player.w / 2) player.x = -player.w / 2;

  // landing
  if (player.vy > 0) {
    const prevBottom = prevY + player.h / 2;
    const bottom = player.y + player.h / 2;
    for (const p of state.platforms) {
      if (p.dead) continue;
      if (prevBottom <= p.y && bottom >= p.y) {
        if (player.x + player.w / 2 > p.x && player.x - player.w / 2 < p.x + p.w) {
          player.vy = p.spring ? SPRING_JUMP : JUMP;
          player.y = p.y - player.h / 2;
          state.jumps++;
          p.flash = 1;
          if (p.vanishing) p.touched = true;
          player.jumpsLeft = 1;
          player.lastBounce = state.frame;
          break;
        }
      }
    }
  }

  // platform updates
  for (const p of state.platforms) {
    if (p.moveAmp) {
      p.movePhase += p.moveSpeed;
      p.x = p.baseX + Math.sin(p.movePhase) * p.moveAmp;
      p.x = clamp(p.x, 3, W - p.w - 3);
    }
    if (p.vanishing && p.touched) {
      p.life -= diff.vanishRate;
      if (p.life <= 0) p.dead = true;
    }
    if (p.flash) p.flash *= 0.86;
  }
  state.platforms = state.platforms.filter(p => !p.dead && p.y < H + 80);

  // camera + score
  if (player.y < CAM_LINE) {
    const d = CAM_LINE - player.y;
    player.y = CAM_LINE;
    for (const p of state.platforms) p.y += d;
    state.score += Math.round(d);
    if (state.score > player.maxHeight) player.maxHeight = state.score;
    checkLevel(state, onLog, onLevelUp);
  }

  // AI reward
  const scoreDelta = state.score - player._lastScore;
  let stepRew = 0;
  if (scoreDelta > 0) {
    stepRew = scoreDelta * 0.45;
    player._lastScore = state.score;
  }
  stepRew -= 0.0015;

  if (mode === 'ai' && learning && decision) {
    state.episodeBuffer.push({
      x: decision.cache.x,
      h: decision.cache.h.slice(),
      probs: decision.probs.slice(),
      action: decision.action,
      reward: stepRew
    });
    if (state.episodeBuffer.length > 1800) state.episodeBuffer.shift();
    if (state.epStep % TRAIN_EVERY === 0 && state.episodeBuffer.length >= 40) {
      state.episodeBuffer = trainBatch(state.episodeBuffer, learning, rewardHistory, onLog);
    }
  }

  // spawn higher
  let top = state.platforms[0];
  for (const p of state.platforms) if (p.y < top.y) top = p;
  let topY = top.y;
  while (topY > -300) {
    const sp = diff.gapBase + random() * diff.gapVar;
    topY -= sp;
    const p = makePlatform(topY, top, state.activeFeatures);
    state.platforms.push(p);
    top = p;
  }

  if (player.y - player.h / 2 > H + 50) {
    endEpisode(state, 'fell', rewardHistory, learning, onLog, onEpisodeEnd);
  }

  return { humanJumpQueued: false };
}

function think(state, learning) {
  const player = state.player;
  if (state.score > player._lastScore + 0.4) state.stuck = Math.max(0, state.stuck - 0.18);
  else state.stuck = Math.min(1, state.stuck + 0.007);

  let safePlat = null, safeDist = Infinity;
  for (const p of state.platforms) {
    if (p.y > player.y - 50 && p.y < player.y + 400) {
      const d = Math.abs((p.x + p.w / 2) - player.x) * 0.5 + Math.abs(p.y - player.y) * 0.3;
      if (d < safeDist) { safeDist = d; safePlat = p; }
    }
  }
  state.currentSafe = safePlat;

  state.urgency = 0;
  if (player.y > DANGER_START) {
    state.urgency = Math.min(1, (player.y - DANGER_START) / (DANGER_END - DANGER_START));
  }

  let target = null;
  if (state.urgency > 0.82 && safePlat) {
    target = safePlat;
  } else {
    let best = Infinity;
    for (const p of state.platforms) {
      if (p.y < player.y - 18) {
        const dx = (p.x + p.w / 2) - player.x;
        const dy = player.y - p.y;
        if (dy > 520) continue;
        const s = Math.abs(dx) * 0.55 + dy * 0.4;
        if (s < best) { best = s; target = p; }
      }
    }
  }
  state.currentTarget = target;

  let dx = 0, dy = 1, need2 = 0;
  if (target) {
    const tcx = target.x + target.w / 2;
    const ddx = tcx - player.x;
    const ddy = target.y - player.y;
    dx = ddx / (W / 2);
    dy = -ddy / 300;
    const hh = -ddy, hd = Math.abs(ddx);
    const maxH = (JUMP * JUMP) / (2 * GRAV);
    if (hh > maxH * 0.9 || hd > 145) need2 = 1;
    else if (player.jumpsLeft > 0 && player.vy > 0 && hh > maxH * 0.5) need2 = 0.45;
  }
  dx = clamp(dx, -1, 1);
  dy = clamp(dy, -1, 1);

  const vxn = clamp(player.vx / MAXVX, -1, 1);
  const vyn = clamp(player.vy / 16, -1, 1);
  const xn = (player.x / W) * 2 - 1;

  const inputs = [
    dx, dy, vxn, vyn, xn,
    state.stuck, state.urgency, Math.abs(dx),
    dx * state.stuck, -dx * state.stuck,
    dx * state.urgency, -dx * state.urgency,
    0, need2, 0.5, player.jumpsLeft, 1
  ];

  return decide(inputs, learning);
}

function checkLevel(state, onLog, onLevelUp) {
  const newLevel = levelFromScore(state.score);
  if (newLevel > state.level) {
    state.level = newLevel;
    computeDifficulty(state.level);
    const windRef = { value: state.windAccel };
    applyLevelFeatures(state.level, state.activeFeatures, windRef);
    state.windAccel = windRef.value;
    if (onLevelUp) onLevelUp(state.level);
    if (onLog) {
      onLog('lvl', `Level ${state.level} · intensity ${diff.intensity.toFixed(1)}×`);
      const msg = milestoneMessage(state.level);
      if (msg) onLog('warn', msg);
    }
  }
}

function endEpisode(state, reason, rewardHistory, learning, onLog, onEpisodeEnd) {
  rewardHistory.push(state.score);
  if (rewardHistory.length > 80) rewardHistory.shift();
  setBestScore(state.score);
  state.episodeBuffer = trainBatch(state.episodeBuffer, learning, rewardHistory, onLog);
  state.gameOver = true;
  state.deadTimer = 0;
  if (onLog) onLog('fail', `Ended · ${reason} · score ${state.score} · lvl ${state.level}`);
  if (onEpisodeEnd) onEpisodeEnd(reason);
}
