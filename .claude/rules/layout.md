---
paths:
  - "index.html"
  - "style.css"
  - "src/ui/**"
---

# Layout — screens, HUD placement and responsiveness

How every screen is laid out so it works on a phone held sideways and on a PC. This spans the markup, the stylesheet and the UI modules, so it lives here rather than in one folder.

- **Drawn look** (GAME.md, One drawn look): every screen or card outside the in-game HUD is a page surface (`.screen.paper`, `.card.paper`, `#rotate`) built from the tokens in `style.css`. Page surfaces redefine `--ink`, `--ink-soft`, `--ink-line` and `--on-ink` to the dusk palette (`--page-ink` on `--page-1` / `--page-2`, which set how light or dark the screens are), so anything coloured from `var(--ink)` (the shared `.paper …` controls, mixes via `color-mix`) works on both page and held-item paper. Never hard-code an ink or paper colour; mix from the tokens. `ui/menuArt.js` reads `--page-ink` and `--page-base`.
- **Landscape only.** Portrait has no layouts: the rotate notice (`#rotate`, shown by an `orientation: portrait` media query) covers everything, and `main.js` pauses a run and draws nothing while it matches. That query is the only orientation rule; every other responsive rule is written by height and width.
- **Responsive by screen height first.** Phones held sideways are short, not narrow: their rules use `max-height: 500px`. Reuse the breakpoints already in `style.css` before adding a new one.
- **Relative and safe-area aware**: sizes in `clamp()`, `vmin` and the like rather than fixed assumptions; anything at an edge adds the matching `env(safe-area-inset-*)`.
- **Touch gutters**: on touch, the sound / pause buttons sit on `--edge`; the two pads mirror each other, the same size, height and distance from their side of the screen (`--pad`, `--pad-y`, `--side`); the item bar (centred above the look pad) and Drop gem (left of it, level with its centre) are placed from those and keep the same `--gap` from the pad, so everything follows the pads when they shrink. Tool buttons share the system buttons' size and panel look.
- **Held items** are inset by `--held-m` on every side, so their proportions follow the screen's; they fill their own shape rather than a fixed aspect.
- **Room for longer text**: translations run up to ~35% longer; labels wrap or shrink rather than clip, and no width is sized to the English words. Check with `?lang=pseudo`.
- **Nothing scrolls** unless meant to: the menu never does (`overflow: hidden` is only a safeguard; the short-screen rules must make it fit).
- **Check before calling it done**: screenshot every visible change at 1280×720 and at 667×375 with touch emulated, and look for overlap, clipping and unwanted scrolling.
