# Portal Runner — instructions for Claude

Portal Runner is Giorgio's personal 3D browser game (Three.js): gem hunting across worlds connected by portals.

This repo is the only home of the project: the code and its docs here are the source of truth. There is no claude.ai Project or artifact to keep in sync. Work may happen from Claude Code in VS Code or from the Claude app, so always commit and push finished work, and start from the latest dev (see Working style).

## Read first, every session
`docs/GAME.md` is the game as designed: concept, design principles, mechanics and tuning. Read it before working on anything, and follow every design principle it lists when designing something new.

@docs/GAME.md

## Documentation: where knowledge lives
Each kind of knowledge has one home, so no file grows into a dump and each note loads only when it's needed. These rules hold however the code is organised; apply them as the repo changes.
- **The design doc** (`docs/GAME.md`): the game as the player experiences it and as the designer intends it. Ideas, principles, rules, mechanics, tuning values with their reasons. No implementation: no file or function names, no CSS, no pixel sizes.
- **This file**: how we work, the non-negotiables, a short map of the code, and the engineering rules that apply across the whole codebase.
- **Scoped notes**: the rules a part of the code must keep, and why. A `CLAUDE.md` in the folder it concerns (it loads automatically when that folder's files are read). A path-scoped rule in `.claude/rules/` only for a topic that spans several folders or root files. Scoped notes state contracts and invariants; they don't describe what the code already says.
- **Code comments**: the why behind a single file or function.
- **Sorting test**: would a player or the designer notice if this changed? Then it goes in the design doc. If only a programmer would, it goes next to the code, or nowhere if the code already makes it clear.
- **Principles**: a game-design principle (stated by Giorgio, or implied by feedback that goes beyond one feature) goes in the design doc's Design principles. A principle about how code or docs are written goes here.
- **Same commit**: a change updates its docs in the same commit: the design doc for a change in design, behaviour or tuning; the nearest scoped note or comment for a technical one.
- **Current state only**: every doc describes how things are now. No history, no "previously", no references to past implementations: git history is the changelog.
- **Move, don't lose**: when trimming or reorganising docs, each fact lands in its new home or is confirmed as readable from the code before it's removed.
- **Few notes**: create a scoped note only when an area has several rules worth knowing, never for a single fact. Each starts with one line saying what it covers. When code moves, its note moves with it; a note whose area is gone is deleted or merged.
- **Watch for drift**: a design-doc section that starts naming code, or keeps growing, gets trimmed; a scoped note that starts restating the code gets cut.

## How the code is organised
- No build step, no npm dependencies. Plain ES modules; Three.js 0.160 is loaded from jsDelivr via the importmap in `index.html`.
- `src/main.js` game loop and state · `src/config.js` default tuning · `src/settings.js` saved settings
- `src/worlds/` one module per world + `registry.js` (world order, the world contract and optional hooks)
- `src/hunters/` hunter brains · `src/mechanics/` world-specific mechanics · `src/entities/` player, gems, portal, hunter
- `src/engine/` terrain, audio (procedural Web Audio), input, camera · `src/ui/` HUD, menu, map, held items, settings
- `src/i18n/` the player's language: `tr()`, one catalogue per language (each world's own text is in its module)
- Adding a world = a new file in `src/worlds/` + a registry entry; don't edit other worlds for it.

## Engineering rules
- Default tuning lives in `src/config.js`; saved settings override it at startup. Every speed there is a fraction of the running speed V, fixed per state.
- Gameplay code stays world-agnostic: anything specific to one world lives in that world's module, its mechanics or its hunter brain, and reaches the game loop through the world contract's hooks.
- Audio is fully procedural: no audio files.
- Every word the player reads goes through `tr()` (`src/i18n/`): no literal player-facing text in code or markup, and no sentences built from pieces. Check text changes with `?lang=pseudo`. Rules in `src/i18n/CLAUDE.md`.
- Small rooms get a fixed camera shot (design principle in GAME.md): a world declares the room and its shot; how it behaves is in `src/engine/fixedShot.js`.

## Running it
- Quick start: `task` (or `task run`) serves the repo root and opens the browser; `task serve` skips the browser; `task run PORT=3000` changes the port (default 8000). Requires [Task](https://taskfile.dev) and [uv](https://docs.astral.sh/uv/) (uv provides Python; no packages are installed).
- ES modules don't load from `file://`. Manually: `python3 -m http.server 8000`, then open http://localhost:8000.
- To try it on a phone: same Wi-Fi, open `http://<computer-ip>:8000` (landscape).

## Non-negotiables (details in GAME.md)
- Landscape only, on mobile and PC. No portrait layouts; portrait shows the rotate notice.
- Think flexibly about screen sizes from the start (relative units, no fixed assumptions), but only check two while developing: a standard PC (1280×720) and a standard smartphone held sideways (667×375, touch emulated). Check for overlap, clipping and unwanted scrolling before calling a change done. Wider coverage (tablets, large monitors, near-square windows) is a pass for the end of development.
- Every build must work on mobile (touch) and PC (keyboard + mouse).
- One game mode, no difficulty levels, no stamina, no speed ramps over time; speeds are fractions of V.
- Never show level numbers to the player; worlds are named only.
- Fun but not impossible.
- Prompt visually rather than with toasts; keep toasts few, short and suggestive (see Design principles in GAME.md). When the game prompts the player to open a tool or press something, highlighting it is enough: no arrows, at most one or two plain words.

## Code quality
- Keep the code clean and easy to read, with concise, understandable comments (say why, not what the line already says).
- As development goes on, notice when something would clearly benefit from being modularised for reuse or decoupling, and do it, without overdoing it: no abstractions for a single use.

## Working style
- **Start from the latest dev**, at the start of every session and before every new piece of work, before reading any code or docs: the checkout may be an older copy, and a fetch alone doesn't update it. `git fetch origin`, then `git checkout dev && git pull --ff-only origin dev`, and confirm `git status -sb` shows nothing behind; branch new work from there. Fetch again before opening a PR or merging; if dev has moved, merge it into the branch and test again.
- When what I describe doesn't match the code, first check we're looking at the same version (branch, latest commit) before arguing from the code.
- Before a large change, state the plan briefly. Challenge design ideas when they conflict with the rules above or seem likely to make the game less fun.
- Commit in small, descriptive commits. Run the game and check the browser console for errors before committing.
- Always keep local and remote aligned: push every commit, and after a merge on GitHub pull it into the local branch, so nothing is left unpushed or behind when a piece of work ends.
- Never commit or merge to main. You can merge to the dev branch only if I tell you explictly. For new features / developments, branch off dev and open a PR to dev (which I must always approve) only once I've said I'm satisfied with the result: until then, push to the branch and let me test
- When something can't be done or checked because access or a tool is missing (a blocked host, an unavailable tool, a missing credential or permission), say so in a clearly marked note: what was blocked, what it prevented, and what access would fix it, so I can decide whether to grant it. Do what you can without it, but never skip it silently or work around it unannounced.
- Every PR description has a **Docs:** line naming the docs it updated, or "none" and why.
- When a piece of work is finished, say it's ready for me to test, and offer to open the PR once I'm satisfied, unless there is certainly more to do first.
