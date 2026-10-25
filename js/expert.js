/**
 * Expert navigator v2 — multi-hop pathing between platforms.
 * Sees many blocks, picks reachable intermediate when best is too far.
 */
import { W, H, GRAV, JUMP, DOUBLE_JUMP, MAXVX } from './config.js';

const MAX_JUMP_H = (JUMP * JUMP) / (2 * GRAV); // ~169 px
const AIR_TIME = (2 * Math.abs(JUMP)) / GRAV;  // frames
const MAX_REACH_X = MAXVX * AIR_TIME * 0.5;    // ~180

function platCenter(p) {
  let x = p.x + p.w / 2;
  // lead moving platforms
  if (p.moveAmp && p.moveSpeed != null && p.baseX != null) {
    const dy = 80;
    const tEst = Math.sqrt(Math.max(1, 2 * dy / GRAV));
    x = p.baseX + Math.sin((p.movePhase || 0) + p.moveSpeed * tEst * 50) * p.moveAmp + p.w / 2;
  }
  return x;
}

/** Single-jump reachability (conservative) */
export function canSingleJump(player, p) {
  const dy = player.y - p.y;
  const dx = Math.abs(platCenter(p) - player.x);
  if (dy < 5 || dy > MAX_JUMP_H * 0.92) return false;
  // horizontal budget shrinks with height used
  const heightRatio = dy / MAX_JUMP_H;
  const maxX = MAX_REACH_X * (1.05 - heightRatio * 0.35);
  return dx < maxX + p.w * 0.35;
}

/** With double-jump */
export function canDoubleJump(player, p) {
  const dy = player.y - p.y;
  const dx = Math.abs(platCenter(p) - player.x);
  if (dy < 5 || dy > MAX_JUMP_H * 1.75) return false;
  const maxX = MAX_REACH_X * 1.15;
  return dx < maxX + p.w * 0.4;
}

function enemyOn(p, enemies) {
  if (!enemies) return false;
  const cx = p.x + p.w / 2;
  for (const e of enemies) {
    if (e.dead) continue;
    if (Math.abs(e.x - cx) < p.w / 2 + 12 && Math.abs(e.y - (p.y - 14)) < 22) return true;
  }
  return false;
}

/**
 * Score candidates. Strongly prefer reachable platforms.
 * Returns sorted list {p, score, reach: 0|1|2}
 */
function rankPlatforms(player, platforms, enemies) {
  const list = [];
  for (const p of platforms) {
    if (p.dead) continue;
    const dy = player.y - p.y;
    if (dy < 8 || dy > 420) continue;

    const dx = Math.abs(platCenter(p) - player.x);
    let reach = 0;
    if (canSingleJump(player, p)) reach = 2;
    else if (canDoubleJump(player, p)) reach = 1;

    let s = 0;
    // REACH is everything
    if (reach === 2) s += 500;
    else if (reach === 1) s += 280;
    else s -= 400;

    // progress up
    s += Math.min(dy, 280) * 0.9;
    // closer sideways better
    s -= dx * 0.7;
    // wider safer
    s += Math.min(p.w, 100) * 0.5;
    if (p.boost) s += 70;
    if (p.spring) s += 35;
    if (p.vanishing && p.touched) s -= 120;
    if (p.moveAmp) s -= 20;
    if (enemyOn(p, enemies)) s -= 150;

    // prefer not maxing jump height (harder land)
    if (dy > MAX_JUMP_H * 0.85) s -= (dy - MAX_JUMP_H * 0.85) * 1.2;

    list.push({ p, score: s, reach, dy, dx });
  }
  list.sort((a, b) => b.score - a.score);
  return list;
}

/**
 * If best is unreachable, find intermediate platform that is reachable
 * and gets us closer to the ideal target.
 */
function pickWithPath(player, platforms, enemies, urgency, safePlat) {
  if (urgency > 0.78 && safePlat) return safePlat;

  const ranked = rankPlatforms(player, platforms, enemies);
  if (!ranked.length) return null;

  // 1) Best fully reachable
  const easy = ranked.find(r => r.reach === 2);
  if (easy) return easy.p;

  // 2) Best double-jump reachable
  const mid = ranked.find(r => r.reach === 1);
  if (mid) return mid.p;

  // 3) Ideal is far — find ANY reachable platform above that reduces gap to ideal
  const ideal = ranked[0].p;
  const idealX = platCenter(ideal);
  let bridge = null;
  let bridgeS = -1e9;
  for (const r of ranked) {
    if (r.reach < 1) continue;
    // closer to ideal than we are now?
    const closer =
      Math.abs(platCenter(r.p) - idealX) < Math.abs(player.x - idealX) + 30;
    const up = r.dy > 15;
    let s = r.score;
    if (closer) s += 80;
    if (up) s += 40;
    if (s > bridgeS) { bridgeS = s; bridge = r.p; }
  }
  if (bridge) return bridge;

  // 4) fallback: nearest above by distance
  let nearest = null, nd = Infinity;
  for (const p of platforms) {
    if (p.dead || p.y >= player.y - 10) continue;
    const d = Math.hypot(platCenter(p) - player.x, player.y - p.y);
    if (d < nd) { nd = d; nearest = p; }
  }
  return nearest || ranked[0].p;
}

/**
 * Continuous steering: return desired horizontal intent -1..1
 * and whether to double-jump / fire.
 */
export function expertAction(state) {
  const player = state.player;
  const platforms = state.platforms;
  const enemies = state.enemies || [];

  // safe platform below/near
  let safePlat = null, safeDist = Infinity;
  for (const p of platforms) {
    if (p.y > player.y - 30 && p.y < player.y + 360) {
      const d = Math.abs(platCenter(p) - player.x) * 0.45 + Math.abs(p.y - player.y) * 0.3;
      if (d < safeDist) { safeDist = d; safePlat = p; }
    }
  }
  const urgency = player.y > H * 0.58
    ? Math.min(1, (player.y - H * 0.58) / (H - 40 - H * 0.58))
    : 0;

  const target = pickWithPath(player, platforms, enemies, urgency, safePlat);
  state.currentTarget = target;
  state.currentSafe = safePlat;
  state.urgency = urgency;

  // shoot nearby enemies
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < 110 && Math.abs(e.y - player.y) < 55) {
      if (e.x > player.x + 5) return { action: 2, fire: true, target };
      if (e.x < player.x - 5) return { action: 0, fire: true, target };
      return { action: 1, fire: true, target };
    }
  }

  if (!target) {
    if (player.vy > 3 && player.jumpsLeft > 0) return { action: 3, fire: false, target: null };
    if (player.x < W * 0.3) return { action: 2, fire: false, target: null };
    if (player.x > W * 0.7) return { action: 0, fire: false, target: null };
    return { action: 1, fire: false, target: null };
  }

  const aimX = platCenter(target);
  const dx = aimX - player.x;
  const dy = player.y - target.y;
  const absDx = Math.abs(dx);

  // --- horizontal: aggressive but with dead-zone on platform ---
  let move = 1;
  const dead = Math.max(5, Math.min(14, target.w * 0.22));
  if (dx > dead) move = 2;
  else if (dx < -dead) move = 0;
  // far = full commit
  if (absDx > 28) move = dx > 0 ? 2 : 0;

  // --- double jump logic ---
  let dbl = false;
  const airborne = state.frame - (player.lastBounce || 0) > 9;
  const pastApex = player.vy > 0.5;
  const needH = dy > MAX_JUMP_H * 0.68;
  const needX = absDx > MAX_REACH_X * 0.62;

  if (player.jumpsLeft > 0 && airborne) {
    // save when falling short
    if (pastApex && needH) dbl = true;
    else if (pastApex && needX && absDx > 50) dbl = true;
    else if (urgency > 0.5 && pastApex) dbl = true;
    // early double only if platform clearly needs it and we're still rising slowly
    else if (dy > MAX_JUMP_H * 0.95 && player.vy > -4 && player.vy < 2) dbl = true;
  }

  // emergency toward safe
  if (urgency > 0.82 && safePlat) {
    const sx = platCenter(safePlat) - player.x;
    move = sx > 6 ? 2 : (sx < -6 ? 0 : 1);
    if (player.jumpsLeft > 0 && pastApex) dbl = true;
  }

  if (dbl) return { action: 3, fire: false, target };
  return { action: move, fire: false, target };
}
