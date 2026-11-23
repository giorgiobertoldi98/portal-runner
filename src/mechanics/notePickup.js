// The handwritten note lying in the snow near where you start the Frozen Peaks. It glows softly; within reach a
// "Take the note" action appears, and taking it makes the note one of your items (see main.js ITEMS).
// Same shape as the map in iceCave.js: `canTake` (read by the world's `action` hook), `take(ctx)`, `held`.
import * as THREE from 'three';
import { softTexture, flatMat } from '../engine/utils.js';

const REACH = 2.2;        // how close you must be for the action to appear (m)
const DISTANCE = 4.5;     // how far from the spawn point the note lies (m)

export function createNotePickup({ scene, heightAt }) {
  // a slightly curled sheet of paper, with a few ink lines, and a soft glow on the snow around it
  const group = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.012, 0.72), flatMat({ color: 0xf1e6cc, emissive: 0x7a5a28, emissiveIntensity: 0.5 }));
  paper.rotation.set(0.05, 0.4, -0.04);
  paper.castShadow = true;
  group.add(paper);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: 0xffc46b, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.set(2, 2, 1);
  halo.position.y = 0.25;
  group.add(halo);
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
      halo.material.opacity = 0.45 + 0.2 * Math.sin(t * 2.4);
      canTake = Math.hypot(group.position.x - player.x, group.position.z - player.z) < REACH;
    },

    take(ctx = {}) {
      if (!canTake || held) return false;
      held = true; canTake = false;
      group.visible = false;
      const a = ctx.audio;
      if (a) a.noiseBurst({ type: 'bandpass', freq: 3000, q: 1, dur: 0.22, gain: 0.08, attack: 0.01, sweepTo: 1600 });
      return true;
    },

    hide() { group.visible = false; canTake = false; },
  };
}
