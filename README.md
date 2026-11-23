# Portal Runner

A 3D browser game built with Three.js. Hunt hidden dark gems in each world, carry them to the portal (each one slows you down), fill it and step through to the next world — Glacier → Alien → Desert — while each world's hunter tries to catch you.

## Run locally
No build step. From the repo root:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000 in landscape. Controls: WASD / arrows to move, Shift to run, mouse to look, Q drop gem, E take, J journal, Tab map, Esc pause, M mute. On touch: left thumb joystick, right side to look.

## Docs
- [`docs/NOTES.md`](docs/NOTES.md) — full design and technical reference (current state).
- [`CLAUDE.md`](CLAUDE.md) — instructions for Claude Code.
