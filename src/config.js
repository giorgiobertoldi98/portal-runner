// Global tuning. Everything gameplay-related that you may want to tweak lives here.

export const PLAYER = {
  height: 1.8,          // metres — the scale reference for the whole game
  radius: 0.45,
  walkSpeed: 6.0,       // m/s (always V/2)
  runSpeed: 12.0,       // m/s: V, the running speed every other speed is a share of
};

// Portal opening: ~4x the character's height so portals feel imposing.
export const PORTAL = {
  width: 4.8,
  height: 7.6,
  insertRadius: 7.5,    // stand this close to the portal to feed it your carried gems
  insertInterval: 0.35, // seconds between two gems going in
  safeRadius: 13,       // safe zone (every world): within this distance of the portal no hunter can follow you or come in. 0 = off
};

export const GEMS = {
  pickupRadius: 1.9,
  portalClearance: 50,  // gems are hidden at least this far beyond the portal's safe zone edge (soft: the best spot is used if none fits)
  extraPerLevel: 0,    // gems in each level on top of the quota (0 = exactly the gems needed)
  humRadius: 14,        // a dark gem starts humming (and faintly glimmering) inside this distance once you have a way to find gems (the Resonance Call, or a world's map)…
  humRadiusBlind: 4,    // …and only this close before that (e.g. the Glacier before you find the explorers' map), so gems aren't found by stumbling around
  slowPerGem: 0.15,     // each carried gem removes 15% of your speed… (editable: Speed lost per gem)
  minSpeedFactor: 0.45, // …but you never drop below 45%
};

// Resonance Call: stand still and a ring of light grows around you. Gems inside it light up.
export const CALL = {
  stillDelay: 0.35,     // seconds of standing still before the ring starts growing
  baseGrowth: 18,       // m/s at the start…
  growthPerMetre: 0.25, // …plus this much per metre of radius (it accelerates)
  maxRadius: 110,
  trailRadius: 60,      // if no gem is inside the ring when it reaches this width, a trail points to the nearest one
  collapseSpeed: 170,   // m/s when you start moving again
  trailLength: 70,      // metres of trail drawn towards the nearest gem
  trailLinger: 3,       // seconds the trail stays after the ring collapses
};

// Overall sound level. The menu track is written quiet; a run plays at a lower level so it sits close to it.
// Lower runLevel if the game still feels louder than the menu, raise it if it feels too faint (1 = as written).
export const AUDIO = {
  menuLevel: 1,
  runLevel: 0.4,
};

// Game rules.
export const GAME = {
  quotas: [3, 3, 3],        // gems to bring to the portal in each level
  openWorlds: 1,            // worlds open so far: the last one's portal leads to the path not yet drawn
  lives: 3,
  monsterSpawnMinDist: 90,  // metres from the player
  monsterPrediction: 0.35,  // 0 = hunters aim where you are, 1 = where you're going
};

// Hunter speeds, as fractions of your running speed (PLAYER.runSpeed). Fixed per state, never growing over time.
// The reasoning behind each value is in docs/GAME.md (Speeds).
export const SPEED = {
  chase: 0.65,              // plain-chase hunters (worlds without their own brain): gentle, they always know where you are
  retreat: 0.4,             // plain-chase hunters while you're in the portal safe zone: they amble away from it
};
export const hunterSpeed = (k) => k * PLAYER.runSpeed;
// your speed factor (fraction of V) while carrying n gems
export const carryFactor = (n) => Math.max(GEMS.minSpeedFactor, 1 - GEMS.slowPerGem * n);
// your running speed with 1 / 2 / 3 gems, in % of V, as hints quote it (the text around it adds the % sign)
export const carryText = () => [1, 2, 3].map((n) => Math.round(carryFactor(n) * 100)).join(' / ');

// ── The Frozen Peaks: the Yeti and its snow-storm devices ──
export const GLACIER = {
  // Scale reference: the playable area is a disc ~258 m in radius (~515 m across) and you run at 12 m/s,
  // so crossing the whole map takes about 45 seconds and 45 m is under 4 seconds of running.
  speed: {                  // fractions of your running speed
    search: 0.4,            // wandering: slower than you walking
    approach: 0.65,         // below your speed with 2 gems (70%), above it with 3 (55%): a full load can't outrun it
    stormFar: 2.6,          // in a storm while beyond detectIn: crosses the map in seconds (editable: Yeti storm sprint)
    stormNear: 1.15,        // in a storm within detectIn: faster than you at any load, so you can't outrun it (editable: Yeti storm close chase)
  },
  detectIn: 45,             // the Yeti approaches you inside this distance and gives up once you're outside it
  forget: 8,                // seconds after giving up during which it won't approach you again (storms still bring it)
  waypointReach: 5,         // metres: close enough to a search waypoint to pick the next one
  devices: 10,              // hidden storm devices on the map
  reach: 20,                // trigger radius of a device
  deviceAvoidPortal: 45,    // devices stay this far from the portal…
  deviceAvoidBase: 55,      // …from where you spawn
  deviceGemClearance: 6,    // …and from any gem on the ground by this much MORE than their trigger radius (so no gem sits inside a trigger zone)
  deviceAvoidPlayer: 70,    // when devices shift, none lands within this distance of you
  deviceShufflePause: 10,   // seconds after a shift during which further gem insertions don't shift the devices again
  stormMin: 45,             // storm radius range
  stormMax: 80,
  stormCooldown: 4,         // seconds after a storm ends before any device can trigger again
  stormFogNear: 1,          // fog inside a storm (outside: the world's normal fog)
  stormFogFar: 34,
  caveMinDist: 180,         // the ice hole (with the explorers' map) never opens closer than this to the portal or the spawn point
};

