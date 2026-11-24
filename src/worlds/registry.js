// ─────────────────────────────────────────────────────────────────────────────
// WORLD REGISTRY — the order of this list IS the level order.
// To add a level: create a module in this folder and add it to the list.
//
// A world module default-exports:
// {
//   id, name, tagline, monsterName,
//   settings?: [{ id, label, hint?, unit?, min, max, step, get(), set(v) }]   // per-level settings shown in the menu
//   theme: { glow, colA, colB, colC, stone, css, hum },   // used by the portal LEADING here + HUD accent
//   gem?: { style: 'cluster' | 'geode' | 'rose', dark, col, glow, inner?, innerDark?, glowK?, mapCol? }   // this world's gems (entities/gemDesigns.js)
//   createPortalFrame({ W, H }) -> THREE.Object3D          // frame for the portal that leads to this world
//   build({ quality }) -> {
//     scene, radius, heightAt(x, z), isValidSpot(x, z), colliders: [...],
//     portalSpots: [{ x, z }, ...],   // the first spot holds this level's exit portal (your base)
//     createMonsterBody() -> { object, animate(dt, speed, t), radius, hover },
//     createMonsterBrain?() -> brain   // optional: the hunter's behaviour (default: plain chase, see hunters/chase.js)
//     mechanics?: {                    // optional: world-specific mechanics (e.g. the glacier's snow storms)
//       signals,                       //   read by the brain every frame
//       setup({ world, rng, diff, portal, base, gems }), update(dt, t, ctx), reset(),
//       onGemInserted?(ctx),           //   optional: called when a gem goes into the portal (not the last one)
//       // optional hooks read by main.js:
//       canCall?() -> bool,            //   false = the Resonance Call is silent (glacier: always)
//       introHint?(touch) -> string,   //   a toast: the first hint of the level
//       hasMap?() -> bool, mapMarks?() -> { hole },     //   a map among your items (true once found), drawn from world.mapInfo
//       action?() -> { id, label, icon } | null, doAction?(ctx),   // a contextual action (Space / the action button),
//                                      //   e.g. taking the glacier's map from its crate
//       briefing?(touch) -> { image (SVG markup), text } | null,
//                                      //   a note: one of your items while non-null (note button / Space);
//                                      //   it calls for attention when it first appears
//       grantAll?(),                   //   debug mode: every item the world lets you find is yours from the start
//       onRespawn?({ base, heading, player }) -> string | null,  // after being caught; the string is added to the catch toast
//     },
//     // optional physical hooks (glacier: the ice hole):
//     groundAt?(x, z),                 // the terrain alone (heightAt includes holes)
//     constrainMove?(pos, prevX, prevZ), constrainCamera?(camera, rig, playerPos, dt),
//     hunterKeepOut?: [{ x, z, r }], isSheltered?(pos),   // places hunters can't enter / where they lose you
//     fixedShot?(pos, active) -> { cam, look, exit } | null,   // a small room's fixed camera shot (engine/fixedShot.js)
//     mapInfo?: { title, kind(x, z), landmarks: [{ x, z, label }], trees: [{ x, z }] },
//     audio: { ambient, footstep, growl },
//     update(dt, t, camera, playerPos),
//   }
// }
// Each level gets one portal, leading to the next level. The last level's portal leads home (the win).
// ─────────────────────────────────────────────────────────────────────────────
import glacier from './glacier.js';
import alien from './alien.js';
import desert from './desert.js';

export const WORLDS = [glacier, alien, desert];
