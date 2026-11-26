// Game settings, editable from the menu. Each setting reads and writes the live tuning objects in config.js,
// so the game picks up changes the next time a run starts. Values are remembered in this browser when possible.
//
// A setting: { id, text, unit?, min, max, step, get() -> number, set(number), vars?() }
//   text = the i18n key holding its { label, hint? } (see i18n/); vars() = live values its hint quotes
//   unit = 'm' | 's' | 'mps' | 'pct' (i18n units)
// General settings live here; per-level settings are "gems needed" plus whatever a world module exports
// as `settings` (see worlds/registry.js), so adding a world never touches this file.
import { PLAYER, GAME, PORTAL, GEMS, carryText } from './config.js';
import { WORLDS } from './worlds/registry.js';

const STORE_KEY = 'pr-settings-v1';

export const GENERAL = [
  {
    id: 'runSpeed', text: 'settings.runSpeed', unit: 'mps', min: 5, max: 16, step: 0.5,
    get: () => PLAYER.runSpeed,
    set: (v) => { PLAYER.runSpeed = v; PLAYER.walkSpeed = v / 2; },
  },
  {
    id: 'slowPerGem', text: 'settings.slowPerGem', unit: 'pct', min: 0, max: 30, step: 1,
    vars: () => ({ min: Math.round(GEMS.minSpeedFactor * 100), carry: carryText() }),
    get: () => Math.round(GEMS.slowPerGem * 100), set: (v) => { GEMS.slowPerGem = v / 100; },
  },
  {
    id: 'safeRadius', text: 'settings.safeRadius', unit: 'm', min: 0, max: 40, step: 1,
    get: () => PORTAL.safeRadius, set: (v) => { PORTAL.safeRadius = v; },
  },
  {
    id: 'lives', text: 'settings.lives', min: 1, max: 9, step: 1,
    get: () => GAME.lives, set: (v) => { GAME.lives = v; },
  },
];

export function levelSettings(index) {
  const def = WORLDS[index];
  const gems = {
    id: 'gems', text: 'settings.gems', min: 1, max: 12, step: 1,
    get: () => GAME.quotas[index], set: (v) => { GAME.quotas[index] = v; },
  };
  return [gems, ...(def.settings || [])];
}

// every setting with a unique storage key
function all() {
  const list = GENERAL.map((s) => ({ key: `general.${s.id}`, s }));
  WORLDS.forEach((def, i) => levelSettings(i).forEach((s) => list.push({ key: `level.${def.id}.${s.id}`, s })));
  return list;
}

const fix = (s, v) => {
  const n = Math.round(Math.min(s.max, Math.max(s.min, Number(v))) / s.step) * s.step;
  return +n.toFixed(4);
};

// defaults = the values in config.js, captured before anything saved is applied
const defaults = new Map(all().map(({ key, s }) => [key, s.get()]));

export function setValue(s, v) { s.set(fix(s, v)); save(); }

export function save() {
  const out = {};
  for (const { key, s } of all()) out[key] = s.get();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(out)); } catch (_) {}
}

export function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) {}
  if (!saved) return;
  for (const { key, s } of all()) if (typeof saved[key] === 'number' && isFinite(saved[key])) s.set(fix(s, saved[key]));
}

// Debug switches, for testing: each tab's Debug section (General: start with all items; every world: start with all
// its gems). Remembered under their own keys and left alone by Reset to defaults.
// A switch: { id, text (i18n key holding { label, hint? }), get() -> bool, set(bool) }
export const DEBUG = { items: false, gems: {} };
const flag = (key, read, write) => {
  try { const v = localStorage.getItem(key); if (v) write(v === 'on'); } catch (_) {}
  return { get: read, set: (on) => { write(on); try { localStorage.setItem(key, on ? 'on' : 'off'); } catch (_) {} } };
};
export const GENERAL_DEBUG = [
  { id: 'items', text: 'settings.debugItems', ...flag('pr-debug', () => DEBUG.items, (on) => { DEBUG.items = on; }) },
];
const levelDebug = WORLDS.map((def) => [
  { id: 'gems', text: 'settings.debugGems', ...flag(`pr-debug-gems.${def.id}`, () => !!DEBUG.gems[def.id], (on) => { DEBUG.gems[def.id] = on; }) },
]);
export const levelDebugSettings = (index) => levelDebug[index];

export function resetDefaults() {
  for (const { key, s } of all()) s.set(defaults.get(key));
  try { localStorage.removeItem(STORE_KEY); } catch (_) {}
}
