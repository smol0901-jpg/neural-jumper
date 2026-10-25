/**
 * Expert navigator v3 — anti-stuck, must-go-up, no same-platform loops.
 * Fixes from debug report: bounce loops, empty decisions, overreach.
 */
import { W, H, GRAV, JUMP, DOUBLE_JUMP, MAXVX } from './config.js';

const MAX_JUMP_H = (JUMP * JUMP) / (2 * GRAV); // ~169
const MAX_REACH_X = MAXVX * ((2 * Math.abs(JUMP)) / GRAV) * 0.48;

function platCenter(p) {
  let x = p.x + p.w / 2;
  if (p.moveAmp && p.moveSpeed != null && p.baseX != null) {
    const tEst = 0.35;
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
  if (dy < 12 || dy > MAX_JUMP_H * 0.88) return false;
  const hr = dy / MAX_JUMP_H;
  const maxX = MAX_REACH_X * (1.0 - hr * 0.4) + p.w * 0.3;
  return dx < maxX;
}

function canDouble(player, p) {
  const dy = player.y - p.y;
  const dx = Math.abs(platCenter(p) - player.x);
  if (dy < 12 || dy > MAX_JUMP_H * 1.55) return false;
  return dx < MAX_REACH_X * 1.05 + p.w * 0.35;
}

/**
 * Rank platforms. MUST be above player. Ban recent landings.
 */
function rankPlatforms(player, platforms, enemies, banned, progressStuck) {
  const list = [];
  for (const p of platforms) {
    if (p.dead) continue;
    const dy = player.y - p.y; // >0 means platform is above
    // Only platforms meaningfully ABOVE us
    if (dy < 18) continue;
    if (dy > 380) continue;

    const id = pid(p);
    if (banned.has(id)) continue;

    const dx = Math.abs(platCenter(p) - player.x);
    let reach = 0;
    if (canSingle(player, p)) reach = 2;
    else if (canDouble(player, p)) reach = 1;

    let s = 0;
    // Reach is critical
    if (reach === 2) s += 800;
    else if (reach === 1) s += 400;
    else s -= 600;

    // Prefer moderate height gains (stable climb), not max stretch
    if (dy < 50) s += 30;
    else if (dy < 100) s += 120;
    else if (dy < MAX_JUMP_H * 0.85) s += 90;
    else s += 20 - (dy - MAX_JUMP_H * 0.85) * 2;

    // Horizontal closeness
    s -= dx * 1.1;
    // Width
    s += Math.min(p.w, 110) * 0.55;
    if (p.boost) s += 60;
    if (p.spring) s += 30;
    if (p.vanishing && p.touched) s -= 150;
    if (p.moveAmp) s -= 25;

    // enemies
    if (enemies) {
      const cx = platCenter(p);
      for (const e of enemies) {
        if (!e.dead && Math.abs(e.x - cx) < p.w / 2 + 10 && Math.abs(e.y - (p.y - 14)) < 20)
          s -= 180;
      }
    }

    // When stuck, prefer ANY reachable even if sideways
    if (progressStuck && reach >= 1) s += 200;

    list.push({ p, score: s, reach, dy, dx, id });
  }
  list.sort((a, b) => b.score - a.score);
  return list;
}

function pickTarget(player, platforms, enemies, urgency, safePlat, banned, progressStuck) {
  // Emergency: only if about to die — use safe even if same height
  if (urgency > 0.88 && safePlat) {
    return { p: safePlat, reason: 'emergency-safe' };
  }

  const ranked = rankPlatforms(player, platforms, enemies, banned, progressStuck);

  // 1) Best single-jump
  const easy = ranked.find(r => r.reach === 2);
  if (easy) return { p: easy.p, reason: `single ${easy.id} dy=${Math.round(easy.dy)}` };

  // 2) Best double-jump
  const mid = ranked.find(r => r.reach === 1);
  if (mid) return { p: mid.p, reason: `double-reach ${mid.id} dy=${Math.round(mid.dy)}` };

  // 3) Bridge toward best unreachable: nearest reachable that is above
  const ideal = ranked[0];
  if (ideal) {
    let bridge = null, bs = -1e9;
    for (const r of ranked) {
      if (r.reach < 1) continue;
      let s = r.score;
      if (Math.abs(platCenter(r.p) - platCenter(ideal.p)) < Math.abs(player.x - platCenter(ideal.p)))
        s += 100;
      if (s > bs) { bs = s; bridge = r; }
    }
    if (bridge) return { p: bridge.p, reason: `bridge ${bridge.id}` };
  }

  // 4) Any platform above at all (even hard)
  if (ranked.length) return { p: ranked[0].p, reason: `fallback ${ranked[0].id}` };

  // 5) Nothing above in list — scan raw for anything higher
  let best = null, bestDy = 0;
  for (const p of platforms) {
    if (p.dead) continue;
    const dy = player.y - p.y;
    if (dy > 20 && dy < 400 && dy > bestDy) {
      bestDy = dy; best = p;
    }
  }
  if (best) return { p: best, reason: 'raw-above' };
  return { p: null, reason: 'no-target' };
}

// Persistent anti-stuck memory (module level)
const recentLandings = [];
const MAX_BAN = 5;
let lastScore = 0;
let stuckFrames = 0;
let exploreDir = 1;

export function expertNotifyLanding(platform, score) {
  const id = pid(platform);
  recentLandings.unshift(id);
  if (recentLandings.length > MAX_BAN) recentLandings.pop();
  if (score > lastScore + 5) {
    stuckFrames = 0;
    lastScore = score;
  }
}

export function expertReset() {
  recentLandings.length = 0;
  lastScore = 0;
  stuckFrames = 0;
  exploreDir = Math.random() < 0.5 ? 1 : -1;
}

export function expertAction(state) {
  const player = state.player;
  const platforms = state.platforms;
  const enemies = state.enemies || [];

  // progress stuck detection
  if (state.score <= lastScore + 2) stuckFrames++;
  else { stuckFrames = 0; lastScore = state.score; }
  const progressStuck = stuckFrames > 90;

  // safe platform (for emergency only)
  let safePlat = null, safeDist = Infinity;
  for (const p of platforms) {
    if (p.y > player.y - 25 && p.y < player.y + 300) {
      const d = Math.abs(platCenter(p) - player.x) * 0.5 + Math.abs(p.y - player.y) * 0.3;
      if (d < safeDist) { safeDist = d; safePlat = p; }
    }
  }
  const urgency = player.y > H * 0.55
    ? Math.min(1, (player.y - H * 0.55) / (H - 50 - H * 0.55))
    : 0;

  const banned = new Set(recentLandings.slice(0, progressStuck ? 3 : 2));
  // Always ban last landing so we don't re-target same block immediately
  if (recentLandings[0]) banned.add(recentLandings[0]);

  const pick = pickTarget(player, platforms, enemies, urgency, safePlat, banned, progressStuck);
  const target = pick.p;
  state.currentTarget = target;
  state.currentSafe = safePlat;
  state.urgency = urgency;

  // shoot
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < 100 && Math.abs(e.y - player.y) < 50) {
      const a = e.x > player.x + 4 ? 2 : e.x < player.x - 4 ? 0 : 1;
      return { action: a, fire: true, target, reason: 'shoot' };
    }
  }

  if (!target) {
    // explore horizontally when no target
    if (progressStuck) {
      if (player.x < 80) exploreDir = 1;
      if (player.x > W - 80) exploreDir = -1;
      return { action: exploreDir > 0 ? 2 : 0, fire: false, target: null, reason: 'explore-stuck' };
    }
    if (player.vy > 4 && player.jumpsLeft > 0)
      return { action: 3, fire: false, target: null, reason: 'no-tgt-double' };
    if (player.x < W * 0.28) return { action: 2, fire: false, target: null, reason: 'center' };
    if (player.x > W * 0.72) return { action: 0, fire: false, target: null, reason: 'center' };
    return { action: 1, fire: false, target: null, reason: 'no-tgt' };
  }

  const aimX = platCenter(target);
  const dx = aimX - player.x;
  const dy = player.y - target.y;
  const absDx = Math.abs(dx);

  // horizontal
  let move = 1;
  const dead = Math.max(4, Math.min(12, target.w * 0.2));
  if (dx > dead) move = 2;
  else if (dx < -dead) move = 0;
  if (absDx > 22) move = dx > 0 ? 2 : 0;

  // If progress stuck, add slight oscillation
  if (progressStuck && state.frame % 40 < 20) {
    move = exploreDir > 0 ? 2 : 0;
  }

  // double jump — conservative, only past apex when short
  let dbl = false;
  const airborne = state.frame - (player.lastBounce || 0) > 10;
  const pastApex = player.vy > 1;
  const needH = dy > MAX_JUMP_H * 0.7;
  const needX = absDx > MAX_REACH_X * 0.65;

  if (player.jumpsLeft > 0 && airborne && pastApex) {
    if (needH) dbl = true;
    else if (needX && absDx > 45) dbl = true;
    else if (urgency > 0.6) dbl = true;
  }

  if (urgency > 0.85 && safePlat) {
    const sx = platCenter(safePlat) - player.x;
    move = sx > 5 ? 2 : sx < -5 ? 0 : 1;
    if (player.jumpsLeft > 0 && pastApex) dbl = true;
  }

  if (dbl) {
    return {
      action: 3, fire: false, target,
      reason: needH ? `dbl-H ${pick.reason}` : needX ? `dbl-X ${pick.reason}` : `dbl ${pick.reason}`
    };
  }
  const why = move === 1 ? 'hold' : move === 2 ? 'R' : 'L';
  return {
    action: move, fire: false, target,
    reason: `${why} ${pick.reason} dx=${Math.round(dx)} dy=${Math.round(dy)}`
  };
}
