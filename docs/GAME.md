# Portal Runner — the game

> The game as designed: its ideas, principles, mechanics and tuning, as the player experiences them. It describes the current state only (git history is the changelog), and holds no implementation: how things are built lives in the code and in the notes beside it (see `CLAUDE.md`, Documentation).

## Concept
Portal Runner is a personal 3D game played in the browser. It has polished graphics and sound. It must be fun but not impossible.

## Design principles
General principles that guide every design decision. New ones are added here as they come up.
- **Show, don't tell.** When the game wants you to do something (open a new item, take something, notice a tool), it prompts visually (a glow, a pulse, the item's name beside it) rather than with a toast. Toasts are for what can't be shown. Highlighting the thing itself is enough: no arrows pointing at it. A prompt carries at most one or two plain words (the item's name, "Take the note").
- **Let the player work it out.** Hints and toasts suggest rather than explain: short, a little cryptic, often in the explorer's own voice ("This gem is slowing me down..."). It's fine if a player doesn't get it straight away: figuring it out is part of the fun.
- **Don't spoil.** A world's arrival line (shown as you start) gives only its atmosphere, in a few words and no verbs: never what is there or what hunts you.
- **Keep the HUD quiet.** Few toasts, small and out of the way, in the HUD's own style; nothing covers the middle of the screen unless you asked for it (a held item).
- **What you find stays with you in that world.** Items gather as you find them and stay until you leave the world through its portal; being caught doesn't take them away.
- **Small rooms get a fixed camera.** In a clearly bounded small room (one you can see all of from one spot) the camera stops following and holds one shot that shows the whole room, and you only walk there; it eases in as you enter and swings behind you as you leave. Passages and open ground keep the following camera.
- **Tension comes from what you carry, not from a timer.** The decision that matters is how many gems to risk carrying at once. Speeds are fixed per state and never ramp up over time.

## Design rules
- One calibrated game mode: no difficulty levels, no stamina. Tuning happens through Settings.
- Every speed is a fixed fraction of the running speed V.
- No level numbers shown to the player: worlds are referred to by name only.
- Landscape only, on every device (see Screens and orientation).
- Every build works on touch (phone) and on PC.
- PC is played with keyboard and mouse together: WASD to move, the mouse to look. No arrow keys and no keyboard-only path (hints and guides assume a mouse).
- Your items are kept together in one bar; Drop gem is a separate control, since gems are not items. Both stay apart from the system buttons (sound, pause) but share their look.
- Items you hold up to read are kept per world and picked from one place; adding a new kind of item never takes another item's place.
- Anything you hold up to read (a map, a note, future documents) is a held item (see Held items).
- The map's arrow always shows the explorer's heading, never the camera's.
- Gems are heard only with a gem-finding tool: without one, in any world, they are silent and only glimmer when you're right next to them (see Gems).
- Toasts are rare and terse; see Design principles and the list under Toasts.

## Screens and orientation
- **Landscape only**, on mobile and on PC. Every screen (menu, Settings, the run, the note, the map, pause and end screens) is designed for a screen wider than it is tall.
- On a screen taller than it is wide (a phone held upright, or a PC window narrower than it is tall) a full-screen notice covers everything: a phone icon turning sideways, "Portal Runner plays sideways" and, on touch, "Turn your device to landscape. If it doesn't rotate, switch off rotation lock" (on PC: "Make the window wider than it is tall"). Nothing is drawn behind it. A run in progress pauses, so turning the phone back shows the pause screen and nothing happens until you press Resume.
- Browsers don't let a page lock the orientation (outside fullscreen), which is why the game blocks portrait with the notice instead of rotating itself.
- Every screen must look right on small and large screens alike: nothing overlaps, is cut off or scrolls where it shouldn't, and controls stay comfortable to reach on touch.

## Structure
- The game is a sequence of themed worlds. World order: **Glacier → Alien → Desert**.
- Each world can bring its own hunter behaviour, its own mechanics (e.g. the Glacier's snow storms and ice hole) and its own settings. A world without its own hunter behaviour gets the plain chase.
- Default rules: 3 lives; 3 gems needed in each of the three worlds. Each world holds exactly the number of gems it needs: no spares. All values in this document are defaults and can be changed in Settings.

## Main menu (landing view)
- **Drawn, not rendered**: the menu (like Settings and the loading screen) is a page in the same hand-drawn style as the explorers' note: ink outlines and watercolour washes on warm paper. It sets the look for the game's illustrations.
- The drawing shows the void between worlds: a winding chain of floating islands climbs into the distance, each carrying a portal (one per world) washed in its world's colours, its swirl turning slowly, with no name on it. The nearest is large and clear; the farther ones are smaller and paler, so you only glimpse what's coming. A dotted route links them like a path on a map. Dark gems, sketched in each world's design, drift past and glint now and then; tiny stars twinkle. The islands bob gently. A new world appears here automatically. With reduced motion on, everything is still.
- It names no specific world: the copy is about the expedition as a whole. The title is inked in the worlds' colours, darkened so it reads on paper, drifting slowly (still when reduced motion is on).
- Layout: the text sits on the left, vertically centred; the drawing fills the rest of the screen on the right and never sits under the text. On short screens the summary is hidden and the title gets smaller.
- **The menu never scrolls**: everything fits on one screen.
- Buttons: **Begin the expedition** (inked) and **Settings**. Below the intro, a three-line summary of the core loop, handwritten like notes in the margin: hunt the dark gems hidden in every world, carry them to the portal (each one slows you down), fill the portal and step through to the next world. The copy doesn't describe how gems are found. Below the buttons, the controls for the device in use (see Controls).
- **Sound**: one calm background track shared by the main menu and Settings, belonging to no single world: a slow C-major pad, a low drone, a rare glass note and a faint airy hush. Browsers allow sound only after a gesture, so it fades in on the first touch, click or key. A run plays at a lower overall level so the game doesn't jump out at you after the menu. Returning to the menu crossfades back to the menu track and silences all in-game sounds (gem hum, portal hum, heartbeat).

## Settings
- Opened from the main menu. Changes apply from the next run and are remembered in the browser. **Reset to defaults** restores the values in this document (on / off switches stay as they are).
- **Layout** (landscape): a paper page like the menu. On the left, the title, the tabs in a column (General, then one per world, named after it with a dab of its colour, no numbers) and, at the bottom, "Changes apply from the next run", **Done** and **Reset to defaults**. On the right, the chosen tab's name and its settings, in two columns where there is room; only that side scrolls when they don't fit, never the page. Esc also closes it.
- **General**: footstep sounds on/off (default on), debug mode on/off (default off; see below), language (see below), base speed V (12 m/s), speed lost per gem (11% of V per gem carried, 0–30%; never below 45% of V), portal safe radius (13 m), lives (3).
- **Debug mode**: for testing. While it's on, every world starts with all the items it lets you find already among your items (in the Glacier: the note and the explorers' map), quietly: none glows or opens by itself, and the first one is selected; the paper in the snow and the map on the crate are gone, and the storm devices don't shift as they do when you take the map. Everything else plays as normal. It applies from the next world you enter.
- **Language**: the game starts in the browser's language when it has it, otherwise in English. The choice appears only once the game speaks more than one language: each language named in itself, and choosing one restarts the game at the menu in that language (settings are kept). Reset to defaults leaves it alone. Key names (WASD, Shift, Space, Q, Esc, A / D) are the same in every language.
- Hints that quote your carrying speeds (Yeti approach speed, storm close chase) update to match the speed lost per gem.
- **Worlds** (each in its own tab):
  - Every world: gems needed (3, range 1–12). Exactly this many gems are hidden in the world.
  - Glacier: Yeti approach distance (45 m), Yeti approach speed (65% of V), Yeti storm sprint (260% of V, 100–400%; its speed in a storm while farther than its approach distance), Yeti storm close chase (115% of V, 40–200%; its speed in a storm within its approach distance), Yeti forget time (8 s), number of storm devices (10), device trigger radius (15 m), storm radius min and max (45 m and 80 m; each storm picks a random radius in that range; min and max push each other so min ≤ max), ice hole distance (110 m, 30–220; the hole with the explorers' map never opens closer than this to the portal or to the spawn point).

## Controls
- **Touch**: the left thumb moves with a joystick (it jumps to where the thumb lands anywhere on the left side); directions are relative to the camera, the explorer turns to face the way it walks, and pushing to the edge runs. The right side of the screen moves the camera (drag sideways to look around, up and down to tilt). Tapping an item's button holds it up.
- **PC**: keyboard and mouse together. WASD moves (relative to the camera), Shift runs, the mouse moves the camera (drag, or move once the pointer is locked by a click). Q drops a gem. Space takes things when something is within reach and otherwise holds up the selected item (Space again puts it away). The mouse wheel (or 1–9) picks one of your items. Esc / P pause, M mute.
- **Holding an item up** (see Held items): the game's own controls stop: you can't walk, run or move the camera, and both touch pads are hidden. Whatever an item lets you do, it does on itself.
- **With the map open** (see The map), its own controls work. On the chart, touch: pinch to zoom, drag to move it, double tap to go back to the whole map; PC: the mouse wheel zooms, a drag moves it, a double-click goes back to the whole map. To turn, drag the needle of the heading dial on the right page round, or tap (click) where you want to face on it; on PC A / D turn too. Turning turns the explorer and the camera together, so the map's arrow turns with them and you can point yourself. With the map closed the camera never turns the explorer.
- **In a room with a fixed camera**, the direction you walk in is kept while you keep moving that way, so the camera switching never bends your path.
- Standing still (letting go of the joystick, or no movement key held) is what sends the Resonance Call in worlds that allow it.

## HUD and camera
- The HUD, the arrival banner and the end screen name the world only (e.g. "The Frozen Peaks"). The end screen shows time, gems delivered and catches, plus the world you were caught in (on a loss) or the lives left (on a win).
- **Top left**: one compact chip, the same design on every screen: the world name, then the gem icon (a snapshot of that world's own gem in its revealed colours, with a soft glow) with "0 / 3 in the portal" (the label always stays, so it is clear the count is gems already inserted). The gems you carry are counted only on Drop gem. The portal opening is shown by the chip's glowing border (no toast). Your lives (hearts) sit just right of the chip, outside it, aligned with its top.
- **Top right**: sound and pause only (system buttons, not game tools).
- **Toasts**: one short line in a small chip in the HUD's style (translucent panel, thin border, a dot in the world's colour), centred just below the top row so it never meets the world chip. It fades in with a slight drop. While an item is held up it sits on the item's top edge. The full list is under Toasts.
- **Tools**: the same layout on PC and touch.
  - **The action** (e.g. "Take the map" next to the crate, "Take the note") is a pill at the bottom centre of the screen that glows and pulses so it's noticed; it always shows its label, and on PC its key (Space). On PC it sits right on top of the tools row (the item's name label and the Space hint under the bar step aside meanwhile, since Space now takes), or in the row's place when the row is empty; on touch it sits low between the two pads and is tapped.
  - **Items** (things you hold up to read: the note, the map, future documents) form a slot bar: at the bottom centre on PC; on touch in a row right above the look pad, centred on it, within the right thumb's reach (as many side by side as fit on screen; more wrap into new rows above, so the first row stays next to the pad): icon buttons in the look of the system buttons, with nothing written on them. The selected slot is ringed in the world's colour and the others are dimmed; a small label above the bar names the selected item for a moment after the selection changes. The mouse wheel picks (1–9 work too, but aren't shown); Space, a click or a tap holds one up. On PC a quiet hint just left of the bar (the bar itself stays centred), with no words: the mouse-wheel icon (once there is more than one item) and Space. Nothing is written under it on touch. Items gather in the order you find them and stay until you leave the world through its portal (being caught doesn't take them). A newly found item is selected and held up straight away, as if you had tapped it, so you see it at once; the first time you put it away, its name shows above the bar for a few seconds and its button glows briefly, so you see where it went. From then on it opens only by hand. (Should it ever be unable to open at that moment, it glows with a slow, repeating pulse until you first hold it up.)
  - **Drop gem** (while carrying) is a separate round button showing that world's gem, in its colour, with the number of gems you carry. On PC it sits to the right of the item bar, a little apart, with its key (Q) just below it; on touch it sits just left of the look pad, level with its centre, as far from the pad as the item bar is. Its name shows beside it for a few seconds the first time it appears.
- **Touch pads**: compact, without labels, low in the bottom corners, the same size and the same distance from their side of the screen: the joystick on the left, the look pad on the right. On phones held sideways everything shrinks a little and the Resonance Call chip moves low, just above the action's spot at the bottom centre.
- **Camera**: a third-person orbit (62° field of view, 7.5 m behind the explorer). Dragging turns it; dragging up looks up. While you walk without touching the camera for over a second, it swings gently behind the explorer, except while you walk backward: then the explorer turns and walks straight towards the camera instead of circling. The camera never swings much below the explorer's head height (it would dig into the ground): past that point the gaze tilts upward instead, up to about 24°, keeping the explorer in the lower part of the view.

## Held items (the map, the note)
- Things you hold up to read share one behaviour. They open **almost full screen**, inset by a thin border where the world stays visible, so their proportions always follow the screen's. Each fills its own shape with its own background: the map's square chart sits on an unrolled scroll, the note's sketch on a handwritten page.
- While one is open, the HUD steps aside (world chip and hearts, sound / pause, tools, Resonance Call chip, arrival banner and both touch pads are hidden), and the game's own controls stop (see Controls). On PC the pointer is released so the cursor can reach the controls, and taken back as soon as the item is put away, so the mouse looks again with no extra click.
- **Each item decides** whether the game pauses while it's open, and brings any controls of its own (zoom, turning), shaped for that item and working only on the item itself. No current item pauses the game.
  - **Map**: zooms, moves and turns you (see The map), the game keeps running.
  - **Note**: nothing to do but read, the game keeps running.
- A round close button in the top-right corner, on every item.
- Closing: the close button on both, or Space; the map also with Esc; the note also with Esc / Enter. Opening one item puts the other away; being caught or leaving the world puts both away (they stay among your items).

## Toasts
Every toast in the game (see Design principles: anything that can be shown instead isn't a toast):
- **"Let go of the stick to send a Resonance Call"** (touch) / **"Stand still to send a Resonance Call"** (PC): once per run, 3.8 s after the first world that allows the call opens (the Alien world in a full run). A world's own intro hint replaces it; a world where the call is silent (the Glacier) skips it.
- **"This gem is slowing me down..."**: the first time you pick up a gem in the first world, once per run (not again after dropping it or being caught).
- **"<Hunter> caught you — n lives left · m gems dropped"**: after a catch with lives left; the gems part only if you were carrying some (plus a world's own respawn note, if it has one).
- **"Winds are changing…"** (Glacier): whenever the storm devices shift (taking the map; a gem going into the portal, at most once every 10 s, never the gem that opens it).
- **"Snow storms... make the Yeti so hungry!"** (Glacier): the first storm each time the Glacier is set up.

## Scale
- The player is 1.8 m tall.
- The glacier's playable area is a disc ~258 m in radius (~515 m across); about 70% of it is walkable (the rest is lake or steep slopes). Running across it takes about 45 seconds.

## The explorer (player character)
- A low-poly explorer in a slim, belted trench coat: cool explorer vibes rather than a space suit. Palette: a light leaf-green coat (deeper green on lapels, collar, hood peak, cuffs and hem), brown leather (belt, straps, gloves, pack, boots), warm taupe trousers, orange trims (scarf, boot collars and toe caps, pack pocket, antenna base, wrist scanner) and cyan suit lights. The green is light enough to stay green in shade, and the orange keeps the figure readable against snow, sand and the alien ground alike.
- Hood up, black wraparound sports goggles and an orange scarf pulled up to the nose: the face is never shown.
- The coat hangs a little below the knee, split front and back on each side, so it swings with the legs and opens at the sides and back as you run instead of hiding the stride.
- The back, which the game camera sees most, carries a compact leather pack: an orange pocket, a glowing light column, a bedroll underneath, a whip antenna that sways with movement, and a gem emitter on top that the carried gems orbit above. A wrist scanner sits on the left forearm.
- Suit lights (along the lapels, the coat's hem, the belt buckle, the goggles' brow, the pack, the wrist scanner, the boot soles) glow steadily while moving and brighten with a slow pulse while you stand still, matching the moment you search for gems.

## Speeds
Every speed is a fixed fraction of the player's running speed **V = 12 m/s**. Changing V rescales the whole game. Hunter speeds depend only on the hunter's state, never on time spent in the world.

| Who / state | Speed | m/s |
|---|---|---|
| Player walking | 0.5 V | 6 |
| Player running | V | 12 |
| Player running with n gems | (1 − 0.11·n) V, never below 0.45 V (0.11 = speed lost per gem, editable) | 10.7 / 9.4 / 8.0 with 1 / 2 / 3 gems |
| Yeti searching | 0.4 V | 4.8 |
| Yeti approaching | 0.65 V | 7.8 |
| Yeti in a storm, farther than its approach distance (storm sprint, editable) | 2.6 V | 31.2 |
| Yeti in a storm, within its approach distance (storm close chase, editable) | 1.15 V | 13.8 |
| Plain-chase hunters (Alien, Desert) | 0.65 V | 7.8 |
| Plain-chase hunters while you're in the portal safe zone (moving away) | 0.4 V | 4.8 |

Why these values:
- **Each hunter speed sits at or below a carrying speed** rather than rising over time, so what you carry decides the danger.
- **Searching (0.4 V)** is slower than walking: a wandering Yeti is scenery, never a threat on its own.
- **Approaching (0.65 V)** is just below your running speed even with a full load of 3 gems (0.67 V), so you can always outrun it in the open, but with all 3 gems only barely: a 2% margin that any turn or obstacle eats up. The danger is otherwise a short approach distance (45 m, under 4 seconds of running) and the storms, not raw speed.
- **Storm sprint (2.6 V)** is how storms turn a distant Yeti into an immediate one. From 250 m away it reaches the edge of its approach distance in about 7 seconds; running out of a storm from its centre takes about 4–7 s carrying nothing and 6–10 s carrying 3 gems, so a Yeti that starts far away usually still catches you if you carry gems. Lowering the sprint makes far-away storms safer.
- **Storm close chase (1.15 V)** is faster than your gem-free running speed, so once the Yeti is within its approach distance in a storm you can't outrun it: you must reach the storm's edge or the portal safe zone before it closes in, and carrying gems only makes that harder. It switches abruptly from the sprint to this speed at the Yeti's approach distance (the same setting decides both). The sprint only happens beyond that distance, which is deep inside the storm's fog, so you rarely see it run at sprint speed.
- **Plain chase (0.65 V)** is gentler because those hunters always know where you are. You outrun them carrying up to 3 gems, only just with all 3.

## Core loop (per world)
1. Explore the world looking for **dark gems**. The world holds exactly as many as the portal needs, so every gem counts.
2. Pick up gems and carry them to the portal.
3. Insert the gems into the portal to activate it. Gems go in one every 0.35 s while you're within 7.5 m of the portal.
4. The portal to the next world appears only once the current world is completed. It never names the world it leads to: the next world is a surprise.

## Gems
- Dark gems are hidden. In most worlds they are found by **standing still** (the Resonance Call): a ring of light illuminates nearby gems, and a trail points toward the closest one. A world can silence the call: in the Glacier it never works, and the explorers' map shows the gems instead (see below).
- **Proximity hum**, the same rule in every world: a gem only hums once you hold a gem-finding tool. Without one, a gem on the ground is silent and glimmers (turning its colour) only within 4 m, barely beyond the 1.9 m pickup reach, so you can't find gems by wandering around; the glimmer only confirms a gem you're practically touching. With one, it hums and glimmers from within 14 m, louder and brighter as you close in. The tools: the explorers' map in the Glacier, and the Resonance Call in the worlds where it works (for now the call counts as a tool you always hold there).
- The first hint explaining how to send the call appears the first time the call is available in a run (see Toasts).
- Gems can be carried, at the speed cost above. A carried gem can be dropped (Q, or the Drop gem tool) and picked up again. It is set down about 1 m behind you.
- If the hunter catches you, the gems you were carrying drop around where you were caught, about 2.5 m apart. Every dropped gem lands on ground you can walk back to: never inside a prop, off the map, or past a height step of more than 1 m (into the ice hole, onto a cliff); if no spot nearby qualifies, it lands where you stood. Gems already in the portal stay there. Since there are no spares, a dropped gem must be fetched again. Dropped gems keep a faint glow.
- **Look**: every world has its own gem: a solid (not transparent), rough, faceted crystal about 1.6 m across its longest side, floating and turning slowly. Hidden it shows a dark tone; close by (the proximity hum) it glimmers and turns its colour, so in the Glacier a gem lights up only when you're right next to it until you hold the map; revealed by the call it turns its full colour, glows and sends up a plume of particles in its glow colour. A dropped gem keeps most of its colour and a faint glow.
  - **Glacier: glacier cluster**: a fist of hexagonal ice prisms growing from a frozen lump; dark grey hidden, clear mid blue revealed.
  - **Alien: geode**: a rough, round stone of dark rock, pierced by small holes spread unevenly all around it, through which a pink crystal lining shows from any angle; only the lining glows and turns pink (the rock just catches the light). Hidden, the lining is dark too, so the holes barely show.
  - **Desert: desert rose**: a bloom of rounded crystal petals, a tight bud opening into wider, outward-leaning rings; brown hidden, amber revealed (softer glow so the petals keep their shading).
  - The gems you carry (orbiting the backpack) and the ones in the portal sockets are small versions of the same shape, in the world's revealed colour (the geode's is its pink core). The portal has one socket per gem needed, grouped in one cluster floating in the middle of its opening, above head height so you walk through beneath it: one gem alone in the middle, two side by side, three or more evenly round a faint ring of light in the portal's colour that brightens as they fill (with many gems the ring stops growing and the gems get smaller). An empty socket is a silhouette of that gem, near-black with a thin pale rim, filled by the gem when it goes in. The menu's drawn gems mix all three designs.

## Enemies
- Each world has one hunter, and each hunter's behaviour is custom to its world.
- Hunters aim slightly ahead of where you're running rather than at where you are.
- **Portal safe zone (every world)**: within 13 m of the portal (beyond the 7.5 m insertion range, so you can always feed gems in safely), no hunter can follow you, whatever its distance or state, storms included. While you're inside, it stops chasing, can't enter the zone and can't reach you from its edge, and the danger cues are off. Once you step out, its normal behaviour resumes straight away. Each hunter decides what it does meanwhile (the Yeti goes back to searching, heading away from you; plain-chase hunters walk away from the portal). A radius of 0 turns the safe zone off.
- You start each level (and respawn after being caught) facing the middle of the world, just inside the edge of the safe zone (1.5 m in from the ring), never on the portal platform. If that spot isn't walkable, the start swings around the portal at the same distance, then a little closer.
- The zone is marked by a faint ring on the ground in the portal's glow colour. It follows the terrain, breathes gently and fades out when the portal opens.
- The hunter vanishes once the portal is activated (last needed gem inserted).
- Danger cues (red screen-edge vignette and heartbeat) tell you the hunter is close. Each hunter defines what "close" means; by default it is within 55 m, getting stronger as it nears.

### Glacier — the Yeti
- **Search** (default): wanders between random waypoints. It doesn't know where you are.
- **Approach**: when you come within 45 m, it heads for you.
- **Giving up**: once you're outside its approach distance (45 m) again, it gives up, turns toward a waypoint well away from you and won't approach again for 8 s (a storm still brings it). Whenever it gives up on you (here, or when you reach the portal safe zone or the ice hole), the waypoint is chosen to lead away from you, never past or around you, so it never drifts closer first.
- **In the portal safe zone**: it goes back to searching, heading for a waypoint well away from you. Once you step out, the normal rules apply straight away (no forget time): if it's within 45 m, it approaches.
- **In the ice hole** (the pit, its ledge or the cave): it can't come in (the ledge and tunnel are too narrow for it) and loses track of you while you're inside, exactly as in the portal safe zone. Any snow storm dies the moment you enter, and none can start while you're down there, so it has nothing to find you by when you climb out. It can still catch you standing on the rim outside.
- **Storm chase**: while you're outside the portal safe zone and inside a snow storm, it knows where you are: it sprints (storm sprint speed) while farther than its approach distance (45 m), then switches abruptly to its close-chase speed. The approach distance setting moves this switch point too.
- **When you leave a storm**: it loses track of you. If you're within 45 m it approaches; otherwise it searches, walking toward a random waypoint.
- Danger cues are on exactly while it is hunting you (never inside the portal safe zone or the ice hole): approaching, or within 45 m in a storm. They start at a clear level and grow stronger as it gets closer, and switch off the moment it gives up, so you know you got away.

### Alien and Desert hunters
- Plain chase: always know where you are and head for you; in the portal safe zone they walk away from the portal. Custom behaviours to be designed.

## Glacier — the ice hole and the explorers' map
- **The Resonance Call is silent in the Glacier**: standing still never sends a ring or a trail here. Nothing says so: you find out by standing still. Until you hold the map, gems are silent and only glimmer from within 4 m (see Gems), so the map is effectively the way to find them.
- **The note**: a handwritten page lying in the snow a few steps from where you start (about 4.5 m ahead, a little to one side): a sheet of amber paper that stands out against the snow, floating about a metre up, bobbing and turning slowly, with a glow around it and no shadow. Within reach a glowing "Take the note" action appears; taking it makes the note your first item and holds it up straight away. No toast. After that it opens only by hand and, like the map, stays among your items for the whole world.
  - The page shows a quick hand-drawn sketch (ink and blue wash) of a ring of blue ice spikes standing in the snow, seen from almost ground level, with four spires a little above the rest, and mountains and pines behind; and one handwritten line: "Thought I saw ice spikes in a circle somewhere...". No title, no figure, nothing else.
  - It deliberately gives nothing away: no opening, no way in, no map, no hole: only what the spikes look like, never where they are or what they are.
  - It is a held item (nothing to do but read, the game keeps running). On wide screens the sketch (pasted on the page, slightly tilted) fills the left and the line sits on the right beside it; on squarer screens the sketch is on top and the line below it.
- **The hole**: a sinkhole 14 m across and 7.5 m deep, ringed by a crown of blue-ice shards leaning outward, with a faint blue glow rising from inside. Four spires (3.1–3.8 m) stand a little above the rest of the crown (shards 1.2–3.5 m). It is kept low on purpose, so the hole doesn't give itself away from across the map. One wide gap in the shards, marked by an old explorers' marker pole (red tip, blue cloth), is the only way in. Behind it, a flat landing at ground level (about 3.5 m along the rim) tops a ledge about 3 m wide that spirals down the wall (about 300° in all) to the floor, so you can step in or out anywhere along the landing; walking down takes a few seconds. Every other edge is a sheer wall you can't step off or climb, so you leave the way you came.
- **Spotting it**: the low crown shows only from fairly close (it hides behind small ridges and drifts). Within 50 m (outside the cave), a hollow wind moans out of the hole every 3–5.5 s, louder as you get closer.
- **The cave**: at the bottom, a vaulted tunnel leads under the ground into a domed chamber: an abandoned explorers' camp (crates with a lit lantern, bedroll, backpack, rope, pickaxe), icicles and glowing ice crystals, water dripping now and then. The map lies rolled up on a crate, glowing warmly. Above the cave, a mound of snowy rock marks ground you can't walk on.
- **Camera in the hole**: it lowers and comes closer gradually as you walk from the shaft floor towards the tunnel mouth, so it is already low when the vault closes over you, with no sudden jump. Rock never comes between you and the camera for long: when a wall would come in the way, the camera swings round you towards open space (across the shaft, along the tunnel) rather than pulling in close; against a wall it slides along it, and when it must come in, it eases in rather than lurching. While you turn the camera yourself it follows you and only moves in as needed; a moment after you let go it glides back to open space. Low camp props (crates, bedroll) never push it in.
  - **In the chamber** the camera holds a fixed shot (see Design principles: small rooms get a fixed camera) from the end of the tunnel, high under the vault, so the whole camp is in view.
- **Where it opens**: a dozen clearings are prepared when the world is built (gentle ground, spread out, away from the landmarks, the lake and the portals, kept free of props). Each run picks one at random at least the ice hole distance (110 m) from the portal and from the spawn point, with a random orientation. Gems, Yeti waypoints and storm devices never use any of the clearings, and devices stay well clear of the hole and the cave.
- **The map**: within about 2 m of the crate, a glowing "Take the map" action appears in the tools group. The map is taken only when you use it: rustle and chime, and the map joins your items and is held up straight away (no toast). Taking it also makes the storm devices shift (see Glacier snow storms); their chime and toast come after the map's own. After that the map opens only by hand. It is a held item (its own zoom, moving and turning; the game keeps running).
  - It is an unrolled scroll filling the screen: wooden rods with knobs at both ends, parchment between them, and in the middle a square hand-drawn chart of the Frozen Peaks (contour lines, lake, cliffs, trees, landmarks: Camp, Watchtower, Mammoth, Ice arches, Frozen lake, Frozen falls) as tall as the scroll allows, keeping some parchment on each side.
  - On the left parchment: the world's name and the legend (You, Gems, Portal, Ice hole; each with the same little symbol the chart draws, the hole as the same spiral), then, under a thin rule, three handwritten lines on using the chart, for the controls in use: "Pinch zoom", "Drag move", "Double tap reset" (touch) or "Wheel zoom", "Drag move", "Double-click reset" (PC). On the right: the heading dial, a compass inked on the parchment (north up, as on the chart) whose needle is you: the chart's orange arrow, ending in a wooden bead on the rim, always pointing the way the explorer faces. Drag it round, or tap anywhere on the dial, and the explorer turns to face that way (quickly, the shortest way round, easing in at the end), so you can point yourself straight at a gem you see on the chart. On PC the A and D keys sit under it, drawn as small keycaps with turn arrows (they turn at about 125° per second), and "Turn" is written below. In the top-right corner, the close button.
  - On the chart: you as an orange arrow pointing the way the explorer faces (plus a faint view cone), the portal as a blue ring with a soft pulsing halo, the ice hole as a blue spiral labelled "Ice hole", and every gem lying on the ground as a pulsing diamond with a glow, in the colour of that world's gems. Marks keep the same size on screen whatever the zoom. Gems lying closer together than a diamond's width (e.g. the ones you lose when caught) share one diamond with a count badge, so a pile never reads as a single gem.
- **Zoom** (1× to 4×): at 1× the whole world shows. Pinching or the wheel zooms around the fingers or the cursor, and only while they are on the chart (not on the parchment around it); a drag moves the chart, stopping at the map's edge; a double tap or double-click goes back to 1×. The map opens centred on you. It stays sharp at every zoom. Anything out of view (gems, the portal, the hole) gets a small pointer in its colour at the chart's edge, pointing towards it. The zoom level is kept between openings.
- **It can't be dropped or lost.** If the Yeti catches you, it stays in your hands when you come back.
- The map belongs to one run of the Glacier; other worlds have no map.

## Glacier snow storms
- 10 hidden storm devices, placed at the start of each run. They are spread evenly over the walkable map, away from its border, and stay at least 45 m from the portal and 55 m from the spawn point, and clear of the ice hole.
- No gem ever starts inside a trigger zone: devices are always placed at least the trigger radius + 6 m from every gem on the ground, so fetching a gem never forces a storm.
- **Devices shift** (all together, to new spots following the same placement rules and also staying at least 70 m from you) on two occasions: when you take the explorers' map, and when a gem goes into the portal. After a shift, further insertions don't shift them again for 10 s, so feeding several gems at once causes one shift. Every shift is marked by a falling glassy chime and the toast "Winds are changing…". The gem that opens the portal doesn't shift them, since devices stop triggering once the portal is open.
- Devices are invisible and silent: nothing warns you before you cross a device's 15 m trigger radius (a hum would be mistaken for a gem's).
- Crossing a device's trigger radius starts a storm: a fixed circle centred where you stood, with a random radius of 45–80 m.
- Inside a storm: thick fog and a blizzard cut visibility to ~30 m (never zero). A glowing line on the ground and a snow curtain mark its edge. A gust, a roar from the Yeti and wind sound announce it; the first storm of a run also brings its toast (see Toasts).
- Only one storm at a time. Devices don't trigger once the portal is open, nor for 4 seconds after a storm ends.
- Leaving the circle ends the storm, and so does going down into the ice hole. The device stays where it is: walking back into its trigger radius starts a new storm. Between shifts you can learn where devices are; taking the map and each delivery reshuffle them.
