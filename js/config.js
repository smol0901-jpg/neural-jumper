export const VERSION = '7.1.4';
/* Neural Ascent — physics & game config
 *
 * Discrete integration @ 60 FPS (dt ≈ 1 frame):
 *   vy' = vy + GRAV + wind  (+ AIR_DRAG * vy when airborne)
 *   vx' = vx * AIR_FRICTION_X  (+ ACC * input), clamped to ±MAXVX
 *   x'  = x + vx ;  y' = y + vy
 *
 * Jump ballistic peak:
 *   maxJumpHeight = JUMP² / (2·GRAV) ≈ 169 px
 *   timeToApex    = |JUMP| / GRAV    ≈ 26 frames
 *   doubleJump adds another impulse mid-air
 *
 * Horizontal reach (triangle profile approx):
 *   ≈ MAXVX · timeToApex · 0.9 ≈ 180 px
 */
export const W = 420;
export const H = 620;

// ── Core forces ──────────────────────────────────────────────
export const GRAV = 0.52;           // slightly heavier feel
export const JUMP = -13.2;          // main bounce impulse
export const SPRING_JUMP = -20.0;
export const DOUBLE_JUMP = -13.8;
export const BOOST_IMPULSE = -23;

// ── Horizontal ───────────────────────────────────────────────
export const ACC = 1.05;            // ground/air accel per frame
export const MAXVX = 7.8;
export const FRICTION = 0.84;       // on "contact" residual (mostly unused in bounce-only)
export const AIR_FRICTION_X = 0.992; // gentle lateral drag in air
export const AIR_DRAG_Y = 0.0018;   // quadratic-ish vertical air resistance scale

// ── Timing ───────────────────────────────────────────────────
export const TICK = 1000 / 60;
export const CAM_LINE = H * 0.42;
export const DANGER_START = H * 0.62;
export const DANGER_END = H - 30;

export const EPISODE_TIMEOUT = 2800;
export const TRAIN_EVERY = 180;     // more frequent training (was 260)
export const SCORE_PER_LEVEL = 450;

// ── Network shape ────────────────────────────────────────────
export const N_IN = 19;
export const N_HID = 16;
export const N_OUT = 5; // LEFT STAY RIGHT DOUBLE FIRE

export const FEATURES = ['moving','vanishing','small','narrow','springs','wind','dark','enemies','boosts'];
export const FEATURE_NAMES = {
  moving: 'moving platforms', vanishing: 'vanishing platforms',
  small: 'small platforms', narrow: 'narrow platforms',
  springs: 'springs', wind: 'wind', dark: 'darkness',
  enemies: 'hostiles', boosts: 'accelerators'
};

export const LEARN_KEY = 'neural-ascent-v3';
export const COLORS = {
  lime: '#a3e635', rose: '#fb7185', cyan: '#22d3ee',
  amber: '#f59e0b', violet: '#a78bfa', graphite: '#3a4454',
  enemy: '#f43f5e', boost: '#fbbf24', bullet: '#67e8f9'
};

export const BULLET_SPEED = 11;
export const BULLET_LIFE = 45;
export const ENEMY_SPEED = 1.2;
export const MAX_FAIL_JUMPS = 3;

// Device tilt visual (degrees clamp)
export const TILT_MAX = 35;
