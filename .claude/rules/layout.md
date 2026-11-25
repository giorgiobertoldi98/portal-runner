---
paths:
  - "index.html"
  - "style.css"
  - "src/ui/**"
---

# Layout — screens, HUD placement and responsiveness

How every screen is laid out so it works on a phone held sideways and on a PC. This spans the markup, the stylesheet and the UI modules, so it lives here rather than in one folder.

- **Drawn look** (GAME.md, One drawn look): every screen or card outside the in-game HUD is a paper surface (`.screen.paper`, `.card.paper`) built from the shared ink / paper tokens in `style.css` (`--ink`, `--paper-sheet`, `--paper-grain`). It gets the inked controls from the shared `.paper …` rules. Don't add new dark panels or one-off colours; extend the shared rules instead.
- **Landscape only.** Portrait has no layouts: the rotate notice (`#rotate`, shown by an `orientation: portrait` media query) covers everything, and `main.js` pauses a run and draws nothing while it matches. That query is the only orientation rule; every other responsive rule is written by height and width.
- **Responsive by screen height first.** Phones held sideways are short, not narrow: their rules use `max-height: 500px`. Reuse the breakpoints already in `style.css` before adding a new one.
- **Relative and safe-area aware**: sizes in `clamp()`, `vmin` and the like rather than fixed assumptions; anything at an edge adds the matching `env(safe-area-inset-*)`.
- **Touch gutters**: on touch, the sound / pause buttons sit on `--edge`; the two pads mirror each other, the same size, height and distance from their side of the screen (`--pad`, `--pad-y`, `--side`); the item bar (centred above the look pad) and Drop gem (left of it, level with its centre) are placed from those and keep the same `--gap` from the pad, so everything follows the pads when they shrink. Tool buttons share the system buttons' size and panel look.
- **Held items** are inset by `--held-m` on every side, so their proportions follow the screen's; they fill their own shape rather than a fixed aspect.
- **Room for longer text**: translations run up to ~35% longer; labels wrap or shrink rather than clip, and no width is sized to the English words. Check with `?lang=pseudo`.
- **Nothing scrolls** unless meant to: the menu never does (`overflow: hidden` is only a safeguard; the short-screen rules must make it fit).
- **Check before calling it done**: screenshot every visible change at 1280×720 and at 667×375 with touch emulated, and look for overlap, clipping and unwanted scrolling.
