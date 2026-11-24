# Portal Runner

A 3D browser game built with Three.js. Hunt hidden dark gems in each world, carry them to the portal (each one slows you down), fill it and step through to the next world — Glacier → Alien → Desert — while each world's hunter tries to catch you.

## Run locally
No build step. From the repo root:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000 in landscape. Controls: WASD to move, Shift to run, mouse to look, Q drop gem, Space to take, wheel / 1–9 to pick an item and Space to open it, Esc pause, M mute. On touch: left thumb joystick, right side to look.

## Docs
- [`docs/GAME.md`](docs/GAME.md) — the game as designed: concept, principles, mechanics, tuning.
- [`CLAUDE.md`](CLAUDE.md) — how we work, engineering rules and where each kind of note lives (with scoped notes beside the code).
