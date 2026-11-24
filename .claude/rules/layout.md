---
paths:
  - "index.html"
  - "style.css"
  - "src/ui/**"
---

# Layout — screens, HUD placement and responsiveness

How every screen is laid out so it works on a phone held sideways and on a PC. This spans the markup, the stylesheet and the UI modules, so it lives here rather than in one folder.

- **Landscape only.** Portrait has no layouts: the rotate notice (`#rotate`, shown by an `orientation: portrait` media query) covers everything, and `main.js` pauses a run and draws nothing while it matches. That query is the only orientation rule; every other responsive rule is written by height and width.
- **Responsive by screen height first.** Phones held sideways are short, not narrow: their rules use `max-height: 500px`. Reuse the breakpoints already in `style.css` before adding a new one.
- **Relative and safe-area aware**: sizes in `clamp()`, `vmin` and the like rather than fixed assumptions; anything at an edge adds the matching `env(safe-area-inset-*)`.
- **One touch gutter**: on touch, the right-hand elements (sound / pause, the look pad, and Drop gem centred above the pad) all align on `--edge`; the pad's size and height are `--pad` / `--pad-y`, so Drop gem follows the pad when it shrinks. Tool buttons share the system buttons' size and panel look.
- **Held items** are inset by `--held-m` on every side, so their proportions follow the screen's; they fill their own shape rather than a fixed aspect.
- **Nothing scrolls** unless meant to: the menu never does (`overflow: hidden` is only a safeguard; the short-screen rules must make it fit).
- **Check before calling it done**: screenshot every visible change at 1280×720 and at 667×375 with touch emulated, and look for overlap, clipping and unwanted scrolling.
