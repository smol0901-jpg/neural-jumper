# Neural Ascent v2

Endless 2.5D climber · neural AI · enemies · weapons · PWA

## Features

- **Responsive**: distinct layouts for phone / tablet / desktop
- **PWA**: installable, offline via service worker
- **AI anti-stuck**: after 3 failed jumps retargets to nearest reachable platform
- **4-layer parallax** starfield
- **Accelerators** (boost pads)
- **Enemies** + **weapon** (F / touch fire)
- **Cyber pilot** character (procedural 2.5D)
- 40+ self-generating levels

## Controls

| Input | Action |
|-------|--------|
| ← → / A D | Move |
| Space / W | Double jump |
| F | Fire |
| P | Pause |
| M | Human / AI |
| L | Learning |

Phone: on-screen touch pad (left / fire+jump / right).

## Install as app

Open in Chrome/Edge → “Install” banner, or browser menu → Install app.

## Structure

Modular ES modules + CSS + PWA manifest + service worker.

## Neural net (5 modules)

```
js/nn/model.js     — weights, forward, softmax
js/nn/features.js  — physics-aware 19-dim observation
js/nn/buffer.js    — episode + human demo buffers
js/nn/train.js     — accelerated REINFORCE (multi-epoch, adaptive LR)
js/nn/imitate.js   — learn from player actions (behavior cloning)
js/network.js      — facade
```

Play in **HUMAN** mode with **LEARN ON** — your moves train the policy.

## Physics

- Gravity, jump impulse, double-jump, air friction (X), vertical air drag
- maxJumpHeight = JUMP²/(2·GRAV) ≈ 169px
- Horizontal reach ≈ MAXVX · timeToApex

## Cosmetic tilt

Rotate the phone — the stage leans up to 35° with dynamic shadow (not controls). Desktop: keys **I/J/K/L** to preview.
