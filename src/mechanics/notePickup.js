// The handwritten note lying in the snow near where you start the Frozen Peaks. It glows softly; within reach a
// "Take the note" action appears, and taking it makes the note one of your items (see main.js ITEMS).
// Same shape as the map in iceCave.js: `canTake` (read by the world's `action` hook), `take(ctx)`, `grant()`, `held`.
import * as THREE from 'three';
import { softTexture, flatMat } from '../engine/utils.js';

const REACH = 2.2;        // how close you must be for the action to appear (m)
const FLOAT = 1.0;        // how high it hovers above the snow (m)
const DISTANCE = 4.5;    // how far from the spawn point the note lies (m)

export function createNotePickup({ scene, heightAt }) {
  // a sheet of paper floating above the snow, turning slowly and bobbing, in a warm amber that stands out against
  // white, with a glow around it
  const group = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.014, 0.82), flatMat({ color: 0xf2a33a, emissive: 0xc2661a, emissiveIntensity: 0.7 }));
  // no shadow: it floats, and a dark patch moving over the snow beneath it is distracting
  const bob = new THREE.Group();   // the paper and its glow float together
  bob.add(paper);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: 0xffa844, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.set(2.6, 2.6, 1);
  bob.add(halo);
  group.add(bob);
  group.visible = false;
  scene.add(group);

  let held = false, canTake = false;

  return {
    get held() { return held; },
    get canTake() { return canTake; },

    // lay the note on walkable ground a few steps ahead of the spawn point, a little to one side so it isn't dead centre
    setup({ base, isValidSpot }) {
      held = false; canTake = false;
      const ahead = Math.atan2(-base.z, -base.x);   // towards the middle of the world, where the explorer starts out facing
      let spot = base;
      search: for (const d of [DISTANCE, DISTANCE - 1.5, DISTANCE + 2]) {
        for (const da of [0.5, -0.5, 0.9, -0.9, 0, 1.4, -1.4]) {
          const x = base.x + Math.cos(ahead + da) * d, z = base.z + Math.sin(ahead + da) * d;
          if (isValidSpot(x, z)) { spot = { x, z }; break search; }
        }
      }
      group.position.set(spot.x, heightAt(spot.x, spot.z) + 0.05, spot.z);
      group.visible = true;
    },

    update(t, player) {
      if (!group.visible) { canTake = false; return; }
      halo.material.opacity = 0.5 + 0.2 * Math.sin(t * 2.4);
      bob.position.y = FLOAT + 0.12 * Math.sin(t * 1.6);
      paper.rotation.set(0.18 * Math.sin(t * 1.1), t * 0.7, 0.12 * Math.sin(t * 0.9));
      canTake = Math.hypot(group.position.x - player.x, group.position.z - player.z) < REACH;
    },

    take(ctx = {}) {
      if (!canTake || held) return false;
      this.grant();
      const a = ctx.audio;
      if (a) a.noiseBurst({ type: 'bandpass', freq: 3000, q: 1, dur: 0.22, gain: 0.08, attack: 0.01, sweepTo: 1600 });
      return true;
    },

    // the note in your hands without picking it up (debug mode)
    grant() { held = true; canTake = false; group.visible = false; },

    hide() { group.visible = false; canTake = false; },
  };
}
