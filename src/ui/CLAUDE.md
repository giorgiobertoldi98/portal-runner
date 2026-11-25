# UI — HUD, items, held items, menu and settings

The rules the interface code keeps. How each screen looks and behaves for the player is in `docs/GAME.md`; layout conventions shared with `style.css` and `index.html` are in `.claude/rules/layout.md`.

- **The HUD is DOM**, over the canvas: markup in `index.html`, styles in `style.css`, behaviour in `hud.js`. The HUD layer ignores the pointer so drags reach the canvas and the pads; only actual controls take clicks.
- **Prompting** goes through `hud.attention(btn, on)` (glows and keeps its name shown until used: a newly found item that couldn't be held up at once) `hud.fresh(btn)` (a short glow and name when a tool first appears) and `hud.introduce(btn)` (an item that opened by itself when found: its name and a glow the first time it's put away). Toasts go through `hud.toast`; a new toast must be added to GAME.md's Toasts list.
- **Items** (things you hold up to read): a new kind of item needs an entry in `ITEMS` (`main.js`: `has()`, `isOpen()`, `open()`), a button with class `tool item` inside `#items` in `index.html`, and an entry in `hud.itemBtns`. The world decides whether you have it, through its hooks. Items never take each other's place.
- **Held items** share `held.js`: each has `open`, a `hold = { pads, zoom, pauses }` and `zoomBy(f)`, and builds its corner controls with `heldControls()`. `main.js` routes input from `hold` (`syncHolding()` → body classes and `input.setHold`); an item never reads input itself. The item element ignores the pointer (only its controls take clicks), so a drag on it still turns the camera.
- **Contextual actions** are `{ id, label, icon }` from the world's `action()` hook; their icons live in the `ICONS` table in `hud.js`.
- **The menu** shares the game camera: it is framed to the right of the measured menu text and released before any world is drawn. Anything placed behind the menu text must stay on screen, or the menu could scroll.
- **Settings**: general ones in `settings.js`, per-world ones in the world module's `settings` list; on / off switches are `.switch` buttons bound in `main.js`, remembered under their own keys and left alone by Reset to defaults.
