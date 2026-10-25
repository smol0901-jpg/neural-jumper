/**
 * Expert navigator v5 — hard anti-loop.
 * Never re-target same platform after 2 landings.
 * Only aim at reachable steps; force lateral break when stuck.
 */
import { W, H, GRAV, JUMP, DOUBLE_JUMP, MAXVX } from './config.js';

const MAX_JUMP_H = (JUMP * JUMP) / (2 * GRAV); // ~169
const MAX_REACH_X = MAXVX * ((2 * Math.abs(JUMP)) / GRAV) * 0.48; // ~180

function platCenter(p) {
  let x = p.x + p.w / 2;
  if (p.moveAmp && p.moveSpeed != null && p.baseX != null) {
    const tEst = 0.3;
    x = p.baseX + Math.sin((p.movePhase || 0) + p.moveSpeed * tEst * 60) * p.moveAmp + p.w / 2;
  }
  return x;
}

function pid(p) {
  return `P${Math.round(p.y)}:${Math.round(p.x)}`;
}

function canSingle(player, p) {
  const dy = player.y - p.y;
  const dx = Math.abs(platCenter(p) - player.x);
  if (dy < 14 || dy > MAX_JUMP_H * 0.92) return false;
  const hr = dy / MAX_JUMP_H;
  const maxX = MAX_REACH_X * (1.05 - hr * 0.45) + p.w * 0.35;
  return dx < maxX;
}

function canDouble(player, p) {
  const dy = player.y - p.y;
  const dx = Math.abs(platCenter(p) - player.x);
  if (dy < 14 || dy > MAX_JUMP_H * 1.48) return false;
  return dx < MAX_REACH_X * 1.1 + p.w * 0.4;
}

// ── persistent memory ──────────────────────────────────────────
const landCount = new Map();   // id -> consecutive landings
const hardBan = new Set();     // banned for whole episode
const missCount = new Map();   // target id -> failed attempts
let lastLandId = null;
let lastScore = 0;
let stuckFrames = 0;
let exploreDir = 1;
let lastTargetId = null;
let framesOnTarget = 0;

export function expertNotifyLanding(platform, score) {
  const id = pid(platform);

  if (id === lastLandId) {
    landCount.set(id, (landCount.get(id) || 1) + 1);
  } else {
    landCount.set(id, 1);
    lastLandId = id;
  }

  // Hard-ban after 2 consecutive landings on same platform
  if ((landCount.get(id) || 0) >= 2) {
    hardBan.add(id);
  }

  // If we had a target and landed elsewhere, count as miss on old target
  if (lastTargetId && lastTargetId !== id) {
    missCount.set(lastTargetId, (missCount.get(lastTargetId) || 0) + 1);
    if ((missCount.get(lastTargetId) || 0) >= 2) {
      hardBan.add(lastTargetId);
    }
  }

  if (score > lastScore + 8) {
    stuckFrames = 0;
    lastScore = score;
    // Clear soft misses on progress
    missCount.clear();
  }
}

export function isAiLooping() {
  // true if any platform has been landed on 3+ times consecutively
  for (const n of landCount.values()) if (n >= 3) return true;
  return hardBan.size >= 3 && stuckFrames > 40;
}

export function expertReset() {
  landCount.clear();
  hardBan.clear();
  missCount.clear();
  lastLandId = null;
  lastScore = 0;
  stuckFrames = 0;
  exploreDir = Math.random() < 0.5 ? 1 : -1;
  lastTargetId = null;
  framesOnTarget = 0;
}

function rankPlatforms(player, platforms, enemies, progressStuck) {
  const list = [];
  for (const p of platforms) {
    if (p.dead) continue;
    const dy = player.y - p.y; // positive = above
    if (dy < 16) continue;     // must be above
    if (dy > 320) continue;

    const id = pid(p);
    if (hardBan.has(id)) continue;
    if ((missCount.get(id) || 0) >= 2) continue;

    const dx = Math.abs(platCenter(p) - player.x);
    let reach = 0;
    if (canSingle(player, p)) reach = 2;
    else if (canDouble(player, p)) reach = 1;

    // When stuck, only consider reachable platforms
    if (progressStuck && reach === 0) continue;

    let s = 0;
    if (reach === 2) s += 1000;
    else if (reach === 1) s += 500;
    else s -= 800;

    // Prefer comfortable step heights (40–110)
    if (dy >= 35 && dy <= 110) s += 200;
    else if (dy < 35) s += 40;
    else if (dy <= MAX_JUMP_H * 0.85) s += 80;
    else s -= (dy - MAX_JUMP_H * 0.85) * 3;

    s -= dx * 1.2;
    s += Math.min(p.w, 100) * 0.6;
    if (p.boost) s += 70;
    if (p.spring) s += 40;
    if (p.vanishing && p.touched) s -= 200;
    if (p.moveAmp) s -= 30;

    if (enemies) {
      const cx = platCenter(p);
      for (const e of enemies) {
        if (!e.dead && Math.abs(e.x - cx) < p.w / 2 + 12 && Math.abs(e.y - p.y) < 40) {
          s -= 250;
        }
      }
    }

    // Prefer opposite side when stuck (break lateral loop)
    if (progressStuck) {
      const side = platCenter(p) - player.x;
      if ((exploreDir > 0 && side > 0) || (exploreDir < 0 && side < 0)) s += 80;
    }

    list.push({ p, id, dy, dx, reach, score: s });
  }
  list.sort((a, b) => b.score - a.score);
  return list;
}

function pickTarget(player, platforms, enemies, progressStuck, urgency) {
  // Emergency: nearest platform we can land on (even same height-ish) if about to die
  if (urgency > 0.9) {
    let safe = null, best = 1e9;
    for (const p of platforms) {
      if (p.dead || hardBan.has(pid(p))) continue;
      const dy = player.y - p.y;
      if (dy < -20 || dy > 200) continue;
      const dx = Math.abs(platCenter(p) - player.x);
      const cost = Math.abs(dy) * 2 + dx;
      if (cost < best && (canSingle(player, p) || dy < 30)) {
        best = cost; safe = p;
      }
    }
    if (safe) return { p: safe, reason: 'emergency' };
  }

  const ranked = rankPlatforms(player, platforms, enemies, progressStuck);

  // Stuck: highest reachable step
  if (progressStuck) {
    const reach = ranked.filter(r => r.reach >= 1).sort((a, b) => b.dy - a.dy || b.score - a.score);
    if (reach.length) {
      // Flip explore direction so next attempt goes other way
      return { p: reach[0].p, reason: `break-loop ${reach[0].id}` };
    }
    // Nothing reachable — return null so caller explores
    return { p: null, reason: 'stuck-no-reach' };
  }

  // Best single-jump
  const easy = ranked.find(r => r.reach === 2);
  if (easy) return { p: easy.p, reason: `step ${easy.id} dy=${Math.round(easy.dy)}` };

  // Double-jump reachable
  const mid = ranked.find(r => r.reach === 1);
  if (mid) return { p: mid.p, reason: `dbl-reach ${mid.id}` };

  // Bridge toward best
  if (ranked.length) {
    const ideal = ranked[0];
    let bridge = null, bs = -1e9;
    for (const r of ranked) {
      if (r.reach < 1) continue;
      let s = r.score;
      if (Math.abs(platCenter(r.p) - platCenter(ideal.p)) < Math.abs(player.x - platCenter(ideal.p)))
        s += 120;
      if (s > bs) { bs = s; bridge = r; }
    }
    if (bridge) return { p: bridge.p, reason: `bridge ${bridge.id}` };
    // Only if somewhat close in X
    if (ideal.dx < MAX_REACH_X * 1.2)
      return { p: ideal.p, reason: `stretch ${ideal.id}` };
  }

  return { p: null, reason: 'no-target' };
}

export function expertAction(state) {
  const player = state.player;
  const platforms = state.platforms;
  const enemies = state.enemies || [];

  if (state.score > lastScore + 8) {
    stuckFrames = 0;
    lastScore = state.score;
  } else {
    stuckFrames++;
  }
  const progressStuck = stuckFrames > 50;

  // Flip explore every ~2s when stuck
  if (progressStuck && stuckFrames % 90 === 0) {
    exploreDir *= -1;
  }

  const urgency = Math.max(0, Math.min(1, (player.y - H * 0.55) / (H * 0.45)));
  const pick = pickTarget(player, platforms, enemies, progressStuck, urgency);
  const target = pick.p;

  // Track target persistence
  const tid = target ? pid(target) : null;
  if (tid === lastTargetId) framesOnTarget++;
  else { lastTargetId = tid; framesOnTarget = 0; }

  // If chasing same target too long without landing → ban and retarget
  if (tid && framesOnTarget > 120) {
    hardBan.add(tid);
    missCount.set(tid, 3);
    lastTargetId = null;
    framesOnTarget = 0;
  }

  state.currentTarget = target;
  state.urgency = urgency;

  // Shoot nearby enemies
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < 95 && Math.abs(e.y - player.y) < 45) {
      const a = e.x > player.x + 4 ? 2 : e.x < player.x - 4 ? 0 : 1;
      return { action: a, fire: true, target, reason: 'shoot' };
    }
  }

  // No target → explore / center / double
  if (!target) {
    if (player.x < 60) exploreDir = 1;
    if (player.x > W - 60) exploreDir = -1;

    if (progressStuck) {
      // Force full lateral + double at apex to break bounce column
      const airborne = state.frame - (player.lastBounce || 0) > 8;
      if (airborne && player.vy > 0 && player.jumpsLeft > 0) {
        return { action: 3, fire: false, target: null, reason: 'unstuck-dbl' };
      }
      return { action: exploreDir > 0 ? 2 : 0, fire: false, target: null, reason: 'unstuck-run' };
    }

    if (player.vy > 3 && player.jumpsLeft > 0)
      return { action: 3, fire: false, target: null, reason: 'no-tgt-dbl' };
    if (player.x < W * 0.3) return { action: 2, fire: false, target: null, reason: 'center-R' };
    if (player.x > W * 0.7) return { action: 0, fire: false, target: null, reason: 'center-L' };
    return { action: 1, fire: false, target: null, reason: 'idle' };
  }

  const aimX = platCenter(target);
  const dx = aimX - player.x;
  const dy = player.y - target.y;
  const absDx = Math.abs(dx);

  // Move toward target
  let move = 1;
  const deadzone = Math.max(5, Math.min(14, target.w * 0.22));
  if (dx > deadzone) move = 2;
  else if (dx < -deadzone) move = 0;
  if (absDx > 18) move = dx > 0 ? 2 : 0;

  // When stuck, bias toward exploreDir to leave bounce column
  if (progressStuck && absDx < 40) {
    move = exploreDir > 0 ? 2 : 0;
  }

  // Double jump timing
  let dbl = false;
  const airborne = state.frame - (player.lastBounce || 0) > 9;
  const pastApex = player.vy > 0.5;
  const needH = dy > MAX_JUMP_H * 0.68;
  const needX = absDx > MAX_REACH_X * 0.6;

  if (player.jumpsLeft > 0 && airborne && pastApex) {
    if (needH || (needX && absDx > 40) || urgency > 0.7 || progressStuck) {
      dbl = true;
    }
  }

  if (dbl) {
    return {
      action: 3, fire: false, target,
      reason: (needH ? 'dbl-H ' : needX ? 'dbl-X ' : 'dbl ') + pick.reason
    };
  }

  const why = move === 1 ? 'hold' : move === 2 ? 'R' : 'L';
  return {
    action: move, fire: false, target,
    reason: `${why} ${pick.reason} dx=${Math.round(dx)} dy=${Math.round(dy)}`
  };
}
