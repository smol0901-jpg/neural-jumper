/**
 * Expert navigation module — physics-aware pathing between platforms.
 * Replaces weak pure-RL for near-automatic climbing.
 */
import { W, H, GRAV, JUMP, DOUBLE_JUMP, MAXVX, BOOST_IMPULSE } from './config.js';

const MAX_JUMP_H = (JUMP * JUMP) / (2 * GRAV);           // ~169
const MAX_DJ_H  = ((-JUMP) + (-DOUBLE_JUMP)) / GRAV * (-JUMP) * 0.5; // rough
const AIR_TIME  = (2 * Math.abs(JUMP)) / GRAV;           // ~52 frames
const MAX_REACH_X = MAXVX * AIR_TIME * 0.55;             // ~200

export function jumpHeight(vy0 = JUMP) {
  return (vy0 * vy0) / (2 * GRAV);
}

/** Can player reach platform p from current state (approx)? */
export function canReach(player, p, allowDouble = true) {
  const tcx = p.x + p.w / 2;
  const dx = tcx - player.x;
  const dy = player.y - p.y; // positive = platform above
  if (dy < -20) return false; // below
  if (dy > MAX_JUMP_H * 1.55 && !allowDouble) return false;
  if (dy > MAX_JUMP_H * 2.2) return false;

  // horizontal: need enough air time
  const needAir = Math.abs(dx) / MAXVX;
  const haveAir = Math.sqrt(Math.max(0, 2 * dy / GRAV)) + (allowDouble ? 12 : 0);
  if (needAir > haveAir + 8) return false;

  // must land on platform width with margin
  const landMargin = Math.max(4, p.w * 0.15);
  return true;
}

/** Score platform as next target (higher = better) */
function scorePlatform(player, p, enemies) {
  const tcx = p.x + p.w / 2;
  const dx = tcx - player.x;
  const dy = player.y - p.y;
  if (dy < 8) return -1e9; // not above enough

  let s = 0;
  // prefer higher platforms (progress)
  s += Math.min(dy, 320) * 1.2;
  // prefer closer horizontally
  s -= Math.abs(dx) * 0.85;
  // prefer wider
  s += p.w * 0.4;
  // boost pads valuable
  if (p.boost) s += 90;
  if (p.spring) s += 40;
  // reachable bonus
  if (canReach(player, p, true)) s += 120;
  else if (canReach(player, p, false)) s += 60;
  else s -= 200;

  // penalty if enemy on it
  for (const e of enemies || []) {
    if (e.dead) continue;
    if (Math.abs(e.x - tcx) < p.w / 2 + 10 && Math.abs(e.y - (p.y - 14)) < 20) {
      s -= 100;
    }
  }
  // vanishing already touched — risky
  if (p.vanishing && p.touched) s -= 80;
  // moving — slight penalty unless we aim center
  if (p.moveAmp) s -= 15;

  // soft preference for not extreme height (harder to land)
  if (dy > MAX_JUMP_H * 0.95) s -= (dy - MAX_JUMP_H * 0.95) * 0.5;

  return s;
}

/** Pick best next platform */
export function pickTarget(player, platforms, enemies, urgency, safePlat) {
  if (urgency > 0.8 && safePlat) return safePlat;

  let best = null;
  let bestS = -1e9;
  for (const p of platforms) {
    if (p.dead) continue;
    if (p.y >= player.y - 12) continue;
    if (player.y - p.y > 480) continue;
    const s = scorePlatform(player, p, enemies);
    if (s > bestS) { bestS = s; best = p; }
  }
  return best;
}

/**
 * Compute action: 0 LEFT, 1 STAY, 2 RIGHT, 3 DOUBLE, 4 FIRE
 * Pure expert — deterministic, fast.
 */
export function expertAction(state) {
  const player = state.player;
  const platforms = state.platforms;
  const enemies = state.enemies || [];

  // urgency / safe
  let safePlat = null, safeDist = Infinity;
  for (const p of platforms) {
    if (p.y > player.y - 40 && p.y < player.y + 380) {
      const d = Math.abs((p.x + p.w / 2) - player.x) * 0.5 + Math.abs(p.y - player.y) * 0.25;
      if (d < safeDist) { safeDist = d; safePlat = p; }
    }
  }
  const urgency = player.y > H * 0.62
    ? Math.min(1, (player.y - H * 0.62) / (H - 30 - H * 0.62))
    : 0;

  const target = pickTarget(player, platforms, enemies, urgency, safePlat);
  state.currentTarget = target;
  state.currentSafe = safePlat;
  state.urgency = urgency;

  // enemy fire priority
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < 100 && Math.abs(e.y - player.y) < 50) {
      // face enemy and shoot
      if (e.x > player.x + 6) return { action: 2, fire: true, target };
      if (e.x < player.x - 6) return { action: 0, fire: true, target };
      return { action: 1, fire: true, target };
    }
  }

  if (!target) {
    // no target — drift to center, prepare double if falling
    if (player.vy > 2 && player.jumpsLeft > 0) return { action: 3, fire: false, target: null };
    if (player.x < W * 0.35) return { action: 2, fire: false, target: null };
    if (player.x > W * 0.65) return { action: 0, fire: false, target: null };
    return { action: 1, fire: false, target: null };
  }

  // aim at predicted platform center (if moving)
  let aimX = target.x + target.w / 2;
  if (target.moveAmp && target.moveSpeed) {
    // simple lead: estimate time to land
    const dy = Math.max(20, player.y - target.y);
    const tEst = Math.sqrt(2 * dy / GRAV);
    aimX = target.baseX !== undefined
      ? target.baseX + Math.sin((target.movePhase || 0) + target.moveSpeed * tEst * 60) * target.moveAmp + target.w / 2
      : aimX;
  }

  const dx = aimX - player.x;
  const dy = player.y - target.y;
  const absDx = Math.abs(dx);

  // horizontal control — strong steering
  let move = 1; // stay
  const edge = Math.max(6, target.w * 0.28);
  if (dx > edge) move = 2;
  else if (dx < -edge) move = 0;
  // if far, always commit direction
  if (absDx > 40) move = dx > 0 ? 2 : 0;

  // double-jump decision
  let dbl = false;
  const needHeight = dy > MAX_JUMP_H * 0.72;
  const needDist = absDx > MAX_REACH_X * 0.7;
  const falling = player.vy > 1;
  const midAir = state.frame - player.lastBounce > 10;

  if (player.jumpsLeft > 0 && midAir) {
    if (needHeight && falling) dbl = true;
    else if (needDist && falling && absDx > 55) dbl = true;
    // late save
    else if (urgency > 0.55 && falling) dbl = true;
    // overshoot correction: if past apex and still short
    else if (player.vy > 0 && dy > MAX_JUMP_H * 0.55 && absDx < 90) dbl = true;
  }

  // emergency: about to fall — go to safe
  if (urgency > 0.85 && safePlat) {
    const sx = (safePlat.x + safePlat.w / 2) - player.x;
    move = sx > 8 ? 2 : (sx < -8 ? 0 : 1);
    if (player.jumpsLeft > 0 && player.vy > 0) dbl = true;
  }

  if (dbl) return { action: 3, fire: false, target };
  return { action: move, fire: false, target };
}
