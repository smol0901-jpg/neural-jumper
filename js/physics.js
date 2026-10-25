import {
  W, H, GRAV, JUMP, SPRING_JUMP, DOUBLE_JUMP, BOOST_IMPULSE,
  ACC, MAXVX, FRICTION, CAM_LINE, DANGER_START, DANGER_END,
  EPISODE_TIMEOUT, TRAIN_EVERY, BULLET_SPEED, BULLET_LIFE,
  ENEMY_SPEED, MAX_FAIL_JUMPS
} from './config.js';
import { random, chance } from './rng.js';
import { diff, computeDifficulty, applyLevelFeatures, levelFromScore, milestoneMessage } from './levels.js';
import { makePlatform, makeEnemy } from './world.js';
import { decide, trainBatch, setBestScore } from './network.js';
import { clamp } from './utils.js';
import { expertAction, expertNotifyLanding } from './expert.js';

function reachable(player, p) {
  const dx = Math.abs((p.x + p.w / 2) - player.x);
  const dy = player.y - p.y;
  if (dy < 10 || dy > 280) return false;
  const maxH = (JUMP * JUMP) / (2 * GRAV);
  const maxX = 150;
  return dy < maxH * 1.35 && dx < maxX;
}

export function physicsStep(state, opts) {
  const { mode, learning, keys, humanJumpQueued, fireQueued,
    rewardHistory, onLog, onLevelUp, onEpisodeEnd, clearJumpQueue, clearFire, onLanding, onDecision, onSample } = opts;

  if (state.gameOver) { state.deadTimer++; return; }
  state.frame++; state.epStep++;
  if (state.epStep >= EPISODE_TIMEOUT) {
    endEp(state, 'timeout', rewardHistory, learning, onLog, onEpisodeEnd); return;
  }

  const player = state.player;
  if (player.invuln > 0) player.invuln--;

  let mx = 0, doDouble = false, doFire = false, decision = null;

  if (mode === 'human') {
    if (keys.left) mx = -1;
    if (keys.right) mx = 1;
    if (humanJumpQueued && player.jumpsLeft > 0) { doDouble = true; clearJumpQueue(); }
    if (fireQueued) { doFire = true; clearFire(); }
  } else {
    // Expert pathfinder (primary) — near-automatic climbing
    const exp = expertAction(state);
    const a = exp.action;
    if (a === 0) mx = -1;
    else if (a === 2) mx = 1;
    if (a === 3) doDouble = true;
    if (exp.fire) doFire = true;
    // keep a light decision object for optional learning buffer
    decision = { action: a, probs: [0,0,0,0,0], cache: { x: new Array(19).fill(0), h: new Array(16).fill(0), logits: [0,0,0,0,0] } };
    decision.probs[a] = 1;
  }
  if (mx) player.facing = mx;

  const airborne = state.frame - player.lastBounce > 7;
  if (doDouble && player.jumpsLeft > 0 && airborne && player.vy > -11) {
    player.vy = DOUBLE_JUMP;
    player.jumpsLeft = 0;
    state.doubleJumps++;
    if (mode === 'ai' && onLog) onLog('ai', 'double jump');
  }

  // fire
  if (doFire && state.frame % 8 === 0) {
    state.bullets.push({
      x: player.x, y: player.y - 8,
      vx: player.facing * BULLET_SPEED, vy: -1.5,
      life: BULLET_LIFE, dead: false
    });
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

  // land
  if (player.vy > 0) {
    const prevBottom = prevY + player.h / 2;
    const bottom = player.y + player.h / 2;
    for (const p of state.platforms) {
      if (p.dead) continue;
      if (prevBottom <= p.y && bottom >= p.y) {
        if (player.x + player.w / 2 > p.x && player.x - player.w / 2 < p.x + p.w) {
          if (p.boost) player.vy = BOOST_IMPULSE;
          else player.vy = p.spring ? SPRING_JUMP : JUMP;
          player.y = p.y - player.h / 2;
          state.jumps++;
          p.flash = 1;
          if (p.vanishing) p.touched = true;
          player.jumpsLeft = 1;
          player.lastBounce = state.frame;
          // success toward target?
          if (state.currentTarget === p) state.failJumps = 0;
          if (onLanding) onLanding(state, p);
          expertNotifyLanding(p, state.score);
          break;
        }
      }
    }
  }

  // platforms
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

  // enemies
  for (const e of state.enemies) {
    if (e.dead) continue;
    e.x += e.vx;
    if (e.plat && !e.plat.dead) {
      if (e.x < e.plat.x + 4 || e.x > e.plat.x + e.plat.w - 4) e.vx *= -1;
      e.y = e.plat.y - 14;
    } else {
      e.y += 2; // fall if platform gone
      if (e.y > H + 40) e.dead = true;
    }
    // collide player
    if (player.invuln <= 0 && Math.abs(e.x - player.x) < 16 && Math.abs(e.y - player.y) < 18) {
      player.hp--;
      player.invuln = 50;
      player.vy = -8;
      if (onLog) onLog('warn', 'hit! hp=' + player.hp);
      if (player.hp <= 0) {
        endEp(state, 'killed', rewardHistory, learning, onLog, onEpisodeEnd);
        return;
      }
    }
    if (e.flash) e.flash *= 0.85;
  }

  // bullets
  for (const b of state.bullets) {
    if (b.dead) continue;
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.life <= 0 || b.y < -20) b.dead = true;
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (Math.abs(b.x - e.x) < 12 && Math.abs(b.y - e.y) < 12) {
        e.hp--; e.flash = 1; b.dead = true;
        if (e.hp <= 0) {
          e.dead = true;
          state.kills++;
          state.score += 40;
        }
      }
    }
  }
  state.bullets = state.bullets.filter(b => !b.dead);
  state.enemies = state.enemies.filter(e => !e.dead && e.y < H + 60);

  // camera
  if (player.y < CAM_LINE) {
    const d = CAM_LINE - player.y;
    player.y = CAM_LINE;
    for (const p of state.platforms) p.y += d;
    for (const e of state.enemies) e.y += d;
    for (const b of state.bullets) b.y += d;
    state.score += Math.round(d);
    if (state.score > player.maxHeight) player.maxHeight = state.score;
    checkLevel(state, onLog, onLevelUp);
  }

  // AI reward
  const scoreDelta = state.score - player._lastScore;
  let stepRew = scoreDelta > 0 ? scoreDelta * 0.45 : 0;
  if (scoreDelta > 0) player._lastScore = state.score;
  stepRew -= 0.0015;
  if (mode === 'ai' && learning && decision) {
    state.episodeBuffer.push({
      x: decision.cache.x, h: decision.cache.h.slice(),
      probs: decision.probs.slice(), action: decision.action, reward: stepRew
    });
    if (state.episodeBuffer.length > 1800) state.episodeBuffer.shift();
    if (state.epStep % TRAIN_EVERY === 0 && state.episodeBuffer.length >= 40) {
      state.episodeBuffer = trainBatch(state.episodeBuffer, learning, rewardHistory, onLog);
    }
  }

  // spawn
  let top = state.platforms[0];
  for (const p of state.platforms) if (p.y < top.y) top = p;
  let topY = top.y;
  while (topY > -300) {
    const sp = diff.gapBase + random() * diff.gapVar;
    topY -= sp;
    const p = makePlatform(topY, top, state.activeFeatures);
    state.platforms.push(p);
    if (state.activeFeatures.has('enemies') && chance(diff.enemyChance) && !p.spring) {
      state.enemies.push(makeEnemy(p));
    }
    top = p;
  }

  if (player.y - player.h / 2 > H + 50) {
    endEp(state, 'fell', rewardHistory, learning, onLog, onEpisodeEnd);
  }
}

function think(state, learning) {
  const player = state.player;
  if (state.score > player._lastScore + 0.4) state.stuck = Math.max(0, state.stuck - 0.18);
  else state.stuck = Math.min(1, state.stuck + 0.007);

  // safe platform
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

  // ---- STUCK RECOVERY: after MAX_FAIL_JUMPS switch to nearest reachable ----
  let target = null;
  const forceRetarget = state.failJumps >= MAX_FAIL_JUMPS;

  if (state.urgency > 0.82 && safePlat) {
    target = safePlat;
    state.failJumps = 0;
  } else if (forceRetarget) {
    // pick closest reachable platform above
    let best = Infinity;
    for (const p of state.platforms) {
      if (p.y >= player.y - 15) continue;
      if (!reachable(player, p)) continue;
      const d = Math.hypot((p.x + p.w / 2) - player.x, player.y - p.y);
      if (d < best) { best = d; target = p; }
    }
    if (!target) {
      // any closest above
      best = Infinity;
      for (const p of state.platforms) {
        if (p.y >= player.y - 15) continue;
        const d = Math.hypot((p.x + p.w / 2) - player.x, player.y - p.y);
        if (d < best) { best = d; target = p; }
      }
    }
    state.failJumps = 0;
  } else {
    let best = Infinity;
    for (const p of state.platforms) {
      if (p.y < player.y - 18) {
        const dx = (p.x + p.w / 2) - player.x;
        const dy = player.y - p.y;
        if (dy > 520) continue;
        // prefer reachable
        const reachBias = reachable(player, p) ? 0 : 80;
        const s = Math.abs(dx) * 0.55 + dy * 0.4 + reachBias;
        if (s < best) { best = s; target = p; }
      }
    }
  }

  // track fail jumps if same target and we bounce without landing on it
  if (target && target !== state.lastTargetId) {
    state.failJumps = 0;
    state.lastTargetId = target;
  }

  state.currentTarget = target;

  // enemy threat & boost sensors
  let enemyThreat = 0, boostNear = 0;
  for (const e of state.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < 120) enemyThreat = Math.max(enemyThreat, 1 - d / 120);
  }
  for (const p of state.platforms) {
    if (p.boost && Math.abs(p.y - player.y) < 200) {
      const d = Math.hypot(p.x + p.w / 2 - player.x, p.y - player.y);
      if (d < 180) boostNear = Math.max(boostNear, 1 - d / 180);
    }
  }

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
    0, need2, 0.5, player.jumpsLeft, 1,
    enemyThreat, boostNear
  ];

  // pad to N_IN if network still 17
  while (inputs.length < 19) inputs.push(0);

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

function endEp(state, reason, rewardHistory, learning, onLog, onEpisodeEnd) {
  rewardHistory.push(state.score);
  if (rewardHistory.length > 80) rewardHistory.shift();
  setBestScore(state.score);
  state.episodeBuffer = trainBatch(state.episodeBuffer, learning, rewardHistory, onLog);
  state.gameOver = true;
  state.deadTimer = 0;
  if (onLog) onLog('fail', `Ended · ${reason} · score ${state.score} · lvl ${state.level}`);
  if (onEpisodeEnd) onEpisodeEnd(reason);
}
