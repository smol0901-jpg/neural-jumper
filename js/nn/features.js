/**
 * nn/features.js — observation vector from game state
 * Encodes position, velocity, reachable platforms, danger, jumps.
 *
 * Physics reference (per frame @60Hz):
 *   gravity g = GRAV, jump impulse J = JUMP
 *   maxJumpHeight = J²/(2g) ≈ 169px
 *   timeToApex = |J|/g ≈ 26 frames
 *   airTime (full) ≈ 52 frames
 *   max horizontal during jump ≈ MAXVX * airTime * 0.5 (triangle)
 */
import { W, H, GRAV, JUMP, MAXVX, N_IN } from '../config.js';

export const MAX_JUMP_H = (JUMP * JUMP) / (2 * GRAV);
export const TIME_TO_APEX = Math.abs(JUMP) / GRAV;
export const APPROX_MAX_REACH_X = MAXVX * TIME_TO_APEX * 0.95;

function platCX(p) {
  if (p.moveAmp && p.baseX != null) {
    return p.baseX + Math.sin((p.movePhase || 0)) * p.moveAmp + p.w / 2;
  }
  return p.x + p.w / 2;
}

/** Build length-N_IN feature vector. */
export function extractFeatures(state) {
  const p = state.player;
  const plats = state.platforms || [];
  const enemies = state.enemies || [];

  // Candidate platforms ABOVE player, sorted by score (close + reachable)
  const cands = [];
  for (const pl of plats) {
    if (pl.dead) continue;
    const dy = p.y - pl.y;
    if (dy < 8 || dy > 360) continue;
    const dx = platCX(pl) - p.x;
    const adx = Math.abs(dx);
    const reachSingle = dy <= MAX_JUMP_H * 0.92 && adx < APPROX_MAX_REACH_X * (1.05 - (dy / MAX_JUMP_H) * 0.4) + pl.w * 0.3;
    const reachDouble = dy <= MAX_JUMP_H * 1.5 && adx < APPROX_MAX_REACH_X * 1.15 + pl.w * 0.35;
    let s = 0;
    if (reachSingle) s += 100;
    else if (reachDouble) s += 50;
    s += Math.max(0, 120 - dy) * 0.4;
    s -= adx * 0.8;
    s += Math.min(pl.w, 100) * 0.3;
    if (pl.boost) s += 20;
    cands.push({ pl, dx, dy, adx, reachSingle, reachDouble, s });
  }
  cands.sort((a, b) => b.s - a.s);

  const n0 = cands[0] || null;
  const n1 = cands[1] || null;
  const n2 = cands[2] || null;

  // Nearest enemy
  let eDx = 0, eDy = 0, eNear = 0;
  let bestEd = 1e9;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestEd) {
      bestEd = d;
      eDx = (e.x - p.x) / W;
      eDy = (e.y - p.y) / H;
      eNear = d < 120 ? 1 - d / 120 : 0;
    }
  }

  const danger = Math.max(0, Math.min(1, (p.y - H * 0.55) / (H * 0.4)));
  const nx = (p.x / W) * 2 - 1;
  const ny = (p.y / H) * 2 - 1;

  const x = new Array(N_IN).fill(0);
  x[0] = nx;                                    // normalized x
  x[1] = ny;                                    // normalized y
  x[2] = Math.max(-1, Math.min(1, p.vx / MAXVX));
  x[3] = Math.max(-1, Math.min(1, p.vy / 20));
  x[4] = n0 ? Math.max(-1, Math.min(1, n0.dx / W)) : 0;
  x[5] = n0 ? Math.max(-1, Math.min(1, n0.dy / MAX_JUMP_H)) : 0;
  x[6] = n0 ? (n0.reachSingle ? 1 : n0.reachDouble ? 0.5 : 0) : 0;
  x[7] = n0 ? Math.min(1, n0.pl.w / 100) : 0;
  x[8] = n1 ? Math.max(-1, Math.min(1, n1.dx / W)) : 0;
  x[9] = n1 ? Math.max(-1, Math.min(1, n1.dy / MAX_JUMP_H)) : 0;
  x[10] = n2 ? Math.max(-1, Math.min(1, n2.dx / W)) : 0;
  x[11] = n2 ? Math.max(-1, Math.min(1, n2.dy / MAX_JUMP_H)) : 0;
  x[12] = p.jumpsLeft > 0 ? 1 : 0;
  x[13] = danger;
  x[14] = eNear;
  x[15] = eDx;
  x[16] = eDy;
  x[17] = state.urgency || 0;
  x[18] = Math.min(1, (state.score % 450) / 450); // level progress
  return x;
}

/** Map human keys → discrete action index */
export function humanToAction(keys, didDouble, didFire) {
  if (didFire) return 4;
  if (didDouble) return 3;
  if (keys.left && !keys.right) return 0;
  if (keys.right && !keys.left) return 2;
  return 1;
}
