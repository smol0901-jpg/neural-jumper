# Neural Jumper

A polished browser game inspired by Doodle Jump, with an optional neural network agent that learns to play using the REINFORCE policy gradient algorithm.

**Play online:** [https://smol0901-jpg.github.io/neural-jumper/](https://smol0901-jpg.github.io/neural-jumper/)

## Features

- **Human mode** — classic controls (← → / A D to move, Space / W for double-jump)
- **AI mode** — watch a small neural net (17→16→4) learn and improve in real time
- Progressive difficulty: every 500 points unlocks new hazards
  - Moving platforms
  - Vanishing platforms
  - Small / narrow platforms
  - Springs
  - Wind
  - Darkness
- Pure client-side. Weights are saved in `localStorage`.
- Mobile-friendly touch controls (left / right thirds of the screen + center to jump)

## Controls

| Key | Action |
|-----|--------|
| ← A / → D | Move |
| Space / W | Double jump |
| P | Pause |
| R | Restart |
| M | Toggle Human / AI |
| L | Toggle learning |

## Technical

- Vanilla JS + Canvas
- REINFORCE + entropy bonus
- Reward = height gained
- Episode timeout + automatic training every ~280 steps

Originally based on the NA++ RL-LAB experiment.

---

Made for fun. No backend, no tracking.
