# Neural Ascent

Endless climber with optional neural agent (REINFORCE).  
**2.5D canvas renderer · modular ES modules · 40+ self-generating levels.**

## Play

Open `index.html` in a modern browser (Chrome / Firefox / Edge).  
No build step. No server required for local play.

For GitHub Pages: enable **Settings → Pages → Deploy from branch `main` / root**.

## Controls

| Key | Action |
|-----|--------|
| ← A / → D | Move |
| Space / W | Double jump |
| P | Pause |
| R | Restart |
| M | Toggle Human / AI |
| L | Toggle learning |

Touch: left / right thirds of the screen to move, center to jump.

## Project structure

```
neural-ascent/
├── index.html
├── css/
│   ├── theme.css
│   ├── layout.css
│   └── game.css
├── js/
│   ├── config.js
│   ├── utils.js
│   ├── rng.js
│   ├── network.js      # REINFORCE policy net
│   ├── levels.js       # procedural difficulty
│   ├── world.js
│   ├── physics.js
│   ├── renderer25d.js  # 2.5D perspective + shadows
│   ├── ui.js
│   └── main.js
├── libs/               # reserved for future vendors
├── assets/
├── README.md
├── LICENSE
└── .nojekyll
```

## Features

- Human & AI modes
- Progressive feature unlocks (moving / vanishing / small / narrow / springs / wind / dark)
- Continuous intensity scaling past level 8 (no hard cap at 40)
- 2.5D: perspective, parallax stars, volumetric platforms, drop shadows, glow
- Weights saved in `localStorage`

## Tech

Vanilla JS (ES modules) + Canvas 2D.  
No heavy frameworks. Fonts via Google Fonts CDN.

---

Originally evolved from NA++ RL-LAB.
