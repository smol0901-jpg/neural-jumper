/**
 * tilt.js — cosmetic device-orientation stage tilt (NOT control).
 * Smoothly leans the whole game stage up to TILT_MAX degrees
 * based on phone gamma (L/R) and beta (F/B). Shadow follows.
 */
import { TILT_MAX } from './config.js';

const state = {
  beta: 0,   // front-back (-180..180)
  gamma: 0,  // left-right (-90..90)
  rx: 0,     // smoothed rotateX
  ry: 0,     // smoothed rotateY
  enabled: false,
  permission: 'unknown'
};

const SMOOTH = 0.12;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function onOrient(e) {
  if (e.beta != null) state.beta = e.beta;
  if (e.gamma != null) state.gamma = e.gamma;
}

export async function initTilt() {
  if (typeof window === 'undefined' || !window.DeviceOrientationEvent) {
    state.permission = 'unsupported';
    return false;
  }

  // iOS 13+ requires permission
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      state.permission = r;
      if (r !== 'granted') return false;
    } catch (err) {
      state.permission = 'denied';
      return false;
    }
  } else {
    state.permission = 'granted';
  }

  window.addEventListener('deviceorientation', onOrient, true);
  state.enabled = true;
  return true;
}

/** Call once per frame; updates CSS vars on stage element. */
export function updateTilt(stageEl) {
  if (!stageEl) return;

  // Map orientation → tilt. gamma: left/right, beta: forward/back
  // Center beta around ~45° typical phone-in-hand reading when possible
  let tx = clamp(state.gamma, -TILT_MAX, TILT_MAX);           // rotateY
  let ty = clamp((state.beta - 45) * 0.55, -TILT_MAX, TILT_MAX); // rotateX

  // Desktop / no sensor: subtle idle drift
  if (!state.enabled) {
    const t = performance.now() * 0.0004;
    tx = Math.sin(t) * 4;
    ty = Math.cos(t * 0.7) * 3;
  }

  state.ry += (tx - state.ry) * SMOOTH;
  state.rx += (ty - state.rx) * SMOOTH;

  const rx = state.rx.toFixed(2);
  const ry = state.ry.toFixed(2);
  // Shadow offset opposite to tilt
  const shx = (-state.ry * 0.9).toFixed(1);
  const shy = (state.rx * 0.9 + 18).toFixed(1);
  const blur = (18 + Math.hypot(state.rx, state.ry) * 0.35).toFixed(1);

  stageEl.style.transform =
    `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  stageEl.style.boxShadow =
    `${shx}px ${shy}px ${blur}px rgba(0,0,0,0.45), 0 0 40px rgba(34,211,238,0.08)`;
}

export function getTiltState() {
  return { ...state, rx: state.rx, ry: state.ry };
}

/** Manual nudge for testing without sensors (keyboard  I/J/K/L ) */
export function nudgeTilt(dx, dy) {
  state.gamma = clamp(state.gamma + dx, -TILT_MAX, TILT_MAX);
  state.beta = clamp(state.beta + dy, 45 - TILT_MAX, 45 + TILT_MAX);
  state.enabled = true;
}
