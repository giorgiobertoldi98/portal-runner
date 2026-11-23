# Portal Runner — instructions for Claude

Portal Runner is Giorgio's personal 3D browser game (Three.js): gem hunting across worlds connected by portals.

## Read first, every session
- `docs/NOTES.md` is the living design + technical reference. Read it before working on anything.
- Keep it updated in the same commit as any change to behaviour, tuning, layout or architecture.
- It describes **the current state only**: no history, no "previously", no references to past implementations. Git history is the changelog.

@docs/NOTES.md

## How the code is organised
- No build step, no npm dependencies. Plain ES modules; Three.js 0.160 is loaded from jsDelivr via the importmap in `index.html`.
- `src/main.js` game loop and state · `src/config.js` default tuning · `src/settings.js` saved settings
- `src/worlds/` one module per world + `registry.js` (world order, optional hooks)
- `src/hunters/` hunter brains · `src/mechanics/` world-specific mechanics · `src/entities/` player, gems, portal, monster
- `src/engine/` terrain, audio (procedural Web Audio), input, camera · `src/ui/` HUD, menu, map, held items, settings
- Adding a world = a new file in `src/worlds/` + a registry entry; don't edit other worlds for it.

## Running it
- ES modules don't load from `file://`. Serve the repo root: `python3 -m http.server 8000`, then open http://localhost:8000.
- To try it on a phone: same Wi-Fi, open `http://<computer-ip>:8000` (landscape).

## Non-negotiables (details in NOTES.md)
- Landscape only, on mobile and PC. No portrait layouts; portrait shows the rotate notice.
- Every visible change must look right at 667×375, 932×430, 1024×768 (touch emulated), 1280×720, 1920×1080 and ~820×760. Screenshot these (e.g. with Playwright) and check for overlap, clipping and unwanted scrolling before calling a change done.
- Every build must work on mobile (touch) and PC (keyboard + mouse).
- One game mode, no difficulty levels, no stamina, no speed ramps over time; speeds are fractions of V.
- Never show level numbers to the player; worlds are named only.
- Fun but not impossible.

## Working style
- Before a large change, state the plan briefly. Challenge design ideas when they conflict with the rules above or seem likely to make the game less fun.
- Commit in small, descriptive commits. Run the game and check the browser console for errors before committing.
