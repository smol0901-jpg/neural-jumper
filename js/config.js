/* Neural Ascent — global config */
export const W = 420;
export const H = 620;

export const GRAV = 0.5;
export const JUMP = -13;
export const SPRING_JUMP = -19.5;
export const DOUBLE_JUMP = -13.5;
export const BOOST_IMPULSE = -22;
export const ACC = 0.95;
export const MAXVX = 7.6;
export const FRICTION = 0.86;
export const TICK = 1000 / 60;

export const CAM_LINE = H * 0.42;
export const DANGER_START = H * 0.62;
export const DANGER_END = H - 30;

export const EPISODE_TIMEOUT = 2800;
export const TRAIN_EVERY = 260;
export const SCORE_PER_LEVEL = 450;

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

export const LEARN_KEY = 'neural-ascent-v2';
export const COLORS = {
  lime: '#a3e635', rose: '#fb7185', cyan: '#22d3ee',
  amber: '#f59e0b', violet: '#a78bfa', graphite: '#3a4454',
  enemy: '#f43f5e', boost: '#fbbf24', bullet: '#67e8f9'
};

export const BULLET_SPEED = 11;
export const BULLET_LIFE = 45;
export const ENEMY_SPEED = 1.2;
export const MAX_FAIL_JUMPS = 3;
