import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { clamp, damp, dampAngle, lerp, resolveCollisions, clampToRadius } from '../engine/utils.js';
import { buildExplorer, animateCoat } from './explorerLooks.js';
import { createMiniGem } from './gem.js';

// The explorer, with procedural idle / walk / run animation. Feet at y = 0, ~1.85 m tall. What it wears is its look
// (explorerLooks.js); every look dresses the same rig, so movement and collisions never depend on it.
export class Player {
  constructor(look) {
    this.object = new THREE.Group();
    this.position = this.object.position;
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.phase = 0;
    this.lastS = 0;
    this.moveDir = new THREE.Vector3(0, 0, 1);
    this.speedMul = 1;   // < 1 while carrying gems
    this.carried = [];   // mini gems orbiting the backpack, one per carried gem
    buildExplorer(this, look);
    this.glowLevel = 0.75;
    this.carryGroup = new THREE.Group();
    this.carryGroup.position.set(0, 1.55, -0.25);
    this.object.add(this.carryGroup);
  }

  // the shape and colours of the gems you carry in the current world
  setGemLook(look) {
    this.gemLook = look;
    while (this.carried.length) this.carryGroup.remove(this.carried.pop());
  }

  setCarried(n) {
    while (this.carried.length < n) { const m = createMiniGem(this.gemLook); this.carryGroup.add(m); this.carried.push(m); }
    while (this.carried.length > n) this.carryGroup.remove(this.carried.pop());
  }

  animateCarried(t) {
    const n = this.carried.length;
    this.carried.forEach((m, i) => {
      const a = t * 1.6 + (i / n) * Math.PI * 2;
      const r = 0.45 + n * 0.04;
      m.position.set(Math.cos(a) * r, 0.35 + Math.sin(t * 2.4 + i) * 0.08 + i * 0.04, Math.sin(a) * r);
      m.rotation.y = t * 2 + i;
    });
  }

  place(x, z, y, heading = 0) {
    this.position.set(x, y, z);
    this.heading = heading;
    this.object.rotation.y = heading;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
  }

  // move = { x, y (forward), run }
  update(dt, move, camYaw, world, diff, onStep) {
    const mag = Math.min(1, Math.hypot(move.x, move.y));
    if (mag > 0.05) {
      // camera-relative direction
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      this.moveDir.set(fx * move.y + rx * move.x, 0, fz * move.y + rz * move.x).normalize();
      this.heading = dampAngle(this.heading, Math.atan2(this.moveDir.x, this.moveDir.z), 12, dt);
    }
    const running = move.run && mag > 0.3;
    const target = mag * (running ? PLAYER.runSpeed : PLAYER.walkSpeed) * this.speedMul;
    this.speed = damp(this.speed, target, running ? 5 : 9, dt);
    this.running = running && this.speed > PLAYER.walkSpeed * this.speedMul + 0.5;

    this.velocity.copy(this.moveDir).multiplyScalar(this.speed);
    const px = this.position.x, pz = this.position.z;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    resolveCollisions(this.position, PLAYER.radius, world.colliders);
    clampToRadius(this.position, world.radius - 2);
    if (world.constrainMove) world.constrainMove(this.position, px, pz); // e.g. walls too steep to walk (the ice hole)
    const gy = world.heightAt(this.position.x, this.position.z);
    this.position.y = damp(this.position.y, gy, 25, dt);
    this.object.rotation.y = this.heading;

    this.animate(dt, onStep);
    this.animateCarried(performance.now() / 1000);
  }

  animate(dt, onStep) {
    const sp = this.speed;
    const walkK = clamp(sp / PLAYER.walkSpeed, 0, 1);
    const runK = clamp((sp - PLAYER.walkSpeed) / (PLAYER.runSpeed - PLAYER.walkSpeed), 0, 1);
    const freq = lerp(1.7, 2.7, runK);
    if (sp > 0.15) this.phase += dt * freq * Math.PI * 2;
    else this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 6, dt);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = walkK * lerp(0.55, 1.05, runK);
    const t = performance.now() / 1000;

    this.legL.hip.rotation.x = -s * amp;
    this.legR.hip.rotation.x = s * amp;
    const kneeAmp = walkK * lerp(0.7, 1.5, runK);
    this.legL.knee.rotation.x = Math.max(0, c) * kneeAmp + 0.05;
    this.legR.knee.rotation.x = Math.max(0, -c) * kneeAmp + 0.05;

    const breathe = Math.sin(t * 2.2) * 0.02 * (1 - walkK);
    this.armL.sh.rotation.x = s * amp * 0.8 + breathe;
    this.armR.sh.rotation.x = -s * amp * 0.8 + breathe;
    this.armL.sh.rotation.z = 0.1 + (1 - walkK) * 0.05;
    this.armR.sh.rotation.z = -0.1 - (1 - walkK) * 0.05;
    this.armL.el.rotation.x = -(0.15 + runK * 1.2);
    this.armR.el.rotation.x = -(0.15 + runK * 1.2);

    this.torso.rotation.x = runK * 0.24 + walkK * 0.05;
    this.torso.rotation.y = s * 0.08 * walkK;
    this.torso.scale.y = 1 + Math.sin(t * 2.2) * 0.012 * (1 - walkK);
    this.hips.position.y = 0.95 + Math.abs(c) * lerp(0.03, 0.09, runK) * walkK - 0.03 * runK;
    this.head.rotation.x = -runK * 0.18;
    this.head.rotation.y = Math.sin(t * 0.5) * 0.25 * (1 - walkK);
    this.antenna.rotation.x = -0.1 - walkK * 0.18 - runK * 0.45 + Math.sin(this.phase * 2) * 0.07 * walkK + Math.sin(t * 1.3) * 0.03;
    this.antenna.rotation.z = Math.sin(this.phase) * 0.06 * walkK;
    animateCoat(this, runK, walkK, t);

    // Suit lights: steady while moving, brighter with a slow pulse while standing still (scanning).
    const still = 1 - walkK;
    const target = 0.72 + still * (0.2 + 0.08 * Math.sin(t * 3.2));
    this.glowLevel = damp(this.glowLevel, target, 4, dt);
    this.mats.glow.color.copy(this.glowBase).multiplyScalar(this.glowLevel);
    this.mats.visor.emissiveIntensity = (0.5 + this.glowLevel * 0.4) * this.visorGlow;

    // footstep events at each half-cycle
    if (sp > 0.6 && Math.sign(s) !== Math.sign(this.lastS) && onStep) onStep(this.running ? 1 : 0.6);
    this.lastS = s;
  }
}
