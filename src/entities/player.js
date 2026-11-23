import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { clamp, damp, dampAngle, lerp, resolveCollisions, clampToRadius, flatMat, mergeParts, m4 } from '../engine/utils.js';
import { createMiniGem } from './gem.js';

// Low-poly futuristic explorer with procedural idle / walk / run animation. Feet at y = 0, ~1.85 m tall.
export class Player {
  constructor() {
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
    this.build();
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

  // Futuristic explorer: graphite undersuit, warm-white armour plates, a dark glass visor,
  // orange crest and trims, cyan suit lights. Each rig bone carries one merged mesh per material
  // (vertex colours), so the whole figure is only a couple of dozen draw calls.
  build() {
    const C = {
      suit: 0x3a4259, suitDark: 0x20242f, plate: 0xe9e6e0, plateShade: 0xb8bcc6, orange: 0xff6b24,
    };
    this.mats = {
      suit: flatMat({ vertexColors: true, roughness: 0.85 }),
      plate: flatMat({ vertexColors: true, roughness: 0.45, metalness: 0.1 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x0a1220, emissive: 0x0d4656, emissiveIntensity: 0.7, metalness: 0.55, roughness: 0.16, flatShading: true }),
      glow: new THREE.MeshBasicMaterial({ color: 0x5cf4ff, toneMapped: false }),
    };
    this.glowBase = new THREE.Color(0x5cf4ff);
    this.glowLevel = 0.75;

    const G = {
      box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
      cap: (r, len, rs = 6) => new THREE.CapsuleGeometry(r, len, 2, rs),
      cyl: (rt, rb, h, rs = 8) => new THREE.CylinderGeometry(rt, rb, h, rs),
      // tapered box: square cross-section with flat front/back faces
      prism: (rt, rb, h) => new THREE.CylinderGeometry(rt, rb, h, 4).rotateY(Math.PI / 4),
      sph: (r, ws, hs, ps, pl, ts, tl) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl),
    };
    // kit(group) collects parts per material; done() merges them into one mesh each.
    const kit = (group) => {
      const parts = { suit: [], plate: [], glow: [], visor: [] };
      const api = {
        add(layer, geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
          parts[layer].push({ geo, color: color ?? 0xffffff, matrix: m4(x, y, z, rx, ry, rz, sx, sy, sz) });
          return api;
        },
        done() {
          for (const layer of Object.keys(parts)) {
            if (!parts[layer].length) continue;
            const mesh = new THREE.Mesh(mergeParts(parts[layer]), this_.mats[layer]);
            mesh.castShadow = layer !== 'glow';
            group.add(mesh);
          }
        },
      };
      return api;
    };
    const this_ = this;
    const root = this.object;

    // ---- hips & belt
    this.hips = new THREE.Group(); this.hips.position.y = 0.95; root.add(this.hips);
    kit(this.hips)
      .add('suit', G.box(0.38, 0.18, 0.24), C.suit, 0, 0.02, 0)
      .add('suit', G.box(0.42, 0.07, 0.27), C.suitDark, 0, 0.1, 0)
      .add('plate', G.box(0.1, 0.085, 0.03), C.plate, 0, 0.1, 0.14)
      .add('glow', G.box(0.05, 0.018, 0.01), null, 0, 0.1, 0.157)
      .add('suit', G.box(0.07, 0.11, 0.12), C.suitDark, 0.22, 0.04, -0.02)
      .add('suit', G.box(0.07, 0.11, 0.12), C.suitDark, -0.22, 0.04, -0.02)
      .add('glow', G.box(0.075, 0.012, 0.06), null, 0.22, 0.075, -0.02)
      .done();

    // ---- torso: tapered core, chest plate, collar, straps, backpack
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    kit(this.torso)
      .add('suit', G.prism(0.3, 0.235, 0.52), C.suit, 0, 0.36, 0, 0, 0, 0, 1, 1, 0.62)
      .add('plate', G.prism(0.318, 0.285, 0.27), C.plate, 0, 0.465, 0, 0, 0, 0, 1, 1, 0.68)
      .add('plate', G.box(0.13, 0.08, 0.035), C.plateShade, -0.072, 0.26, 0.112, -0.04)
      .add('plate', G.box(0.13, 0.08, 0.035), C.plateShade, 0.072, 0.26, 0.112, -0.04)
      .add('glow', G.cyl(0.03, 0.03, 0.014, 6), null, -0.085, 0.47, 0.153, Math.PI / 2 - 0.05)
      .add('plate', G.box(0.075, 0.03, 0.012), C.orange, 0.085, 0.49, 0.152, -0.05)
      .add('plate', G.box(0.075, 0.012, 0.012), C.orange, 0.085, 0.462, 0.152, -0.05)
      .add('suit', G.cyl(0.125, 0.15, 0.08, 8), C.suitDark, 0, 0.63, 0)
      .add('suit', G.box(0.055, 0.04, 0.34), C.suitDark, 0.14, 0.6, -0.04)
      .add('suit', G.box(0.055, 0.04, 0.34), C.suitDark, -0.14, 0.6, -0.04)
      // backpack shell + dark core panel + light column
      .add('plate', G.box(0.34, 0.42, 0.16), C.plate, 0, 0.37, -0.22)
      .add('plate', G.box(0.3, 0.06, 0.17), C.plateShade, 0, 0.13, -0.22)
      .add('suit', G.box(0.13, 0.32, 0.03), C.suitDark, 0, 0.38, -0.3)
      .add('glow', G.box(0.035, 0.25, 0.02), null, 0, 0.38, -0.312)
      // side canisters with orange caps and thrusters
      .add('suit', G.cyl(0.055, 0.055, 0.34, 8), C.suit, 0.205, 0.33, -0.22)
      .add('suit', G.cyl(0.055, 0.055, 0.34, 8), C.suit, -0.205, 0.33, -0.22)
      .add('plate', G.cyl(0.062, 0.062, 0.045, 8), C.orange, 0.205, 0.52, -0.22)
      .add('plate', G.cyl(0.062, 0.062, 0.045, 8), C.orange, -0.205, 0.52, -0.22)
      .add('suit', G.cyl(0.042, 0.058, 0.06, 8), C.suitDark, 0.205, 0.13, -0.22)
      .add('suit', G.cyl(0.042, 0.058, 0.06, 8), C.suitDark, -0.205, 0.13, -0.22)
      .add('glow', G.cyl(0.035, 0.035, 0.01, 8), null, 0.205, 0.098, -0.22)
      .add('glow', G.cyl(0.035, 0.035, 0.01, 8), null, -0.205, 0.098, -0.22)
      // gem emitter on top (carried gems orbit above it)
      .add('suit', G.cyl(0.07, 0.09, 0.045, 8), C.suitDark, 0, 0.6, -0.22)
      .add('glow', G.cyl(0.048, 0.048, 0.012, 8), null, 0, 0.626, -0.22)
      .done();

    // whip antenna on the pack (sways when moving)
    this.antenna = new THREE.Group(); this.antenna.position.set(0.12, 0.59, -0.27);
    kit(this.antenna)
      .add('suit', G.cyl(0.022, 0.028, 0.05, 6), C.suitDark, 0, 0.025, 0)
      .add('suit', G.cyl(0.007, 0.011, 0.3, 5), C.suitDark, 0, 0.2, 0)
      .add('glow', G.sph(0.02, 6, 4), null, 0, 0.36, 0)
      .done();
    this.torso.add(this.antenna);

    // ---- head: helmet, wraparound visor, glowing rim, ear pods, orange crest
    this.head = new THREE.Group(); this.head.position.y = 0.66; this.torso.add(this.head);
    const vPhi = Math.PI / 2 - 1.2, vLen = 2.4;
    const crest = new THREE.TorusGeometry(0.192, 0.017, 4, 14, 2.15); crest.rotateZ(-0.3); crest.rotateY(Math.PI / 2);
    kit(this.head)
      .add('plate', G.sph(0.19, 12, 9), C.plate, 0, 0.15, -0.005, 0, 0, 0, 1, 1.02, 1.05)
      .add('visor', G.sph(0.198, 14, 7, vPhi, vLen, 0.98, 0.92), null, 0, 0.15, 0, 0, 0, 0, 1, 1.02, 1.05)
      .add('glow', G.sph(0.201, 14, 1, vPhi, vLen, 1.9, 0.05), null, 0, 0.15, 0, 0, 0, 0, 1, 1.02, 1.05)
      .add('plate', crest, C.orange, 0, 0.15, -0.005, 0, 0, 0, 1, 1.02, 1.05)
      .add('suit', G.cyl(0.055, 0.055, 0.06, 8), C.suitDark, 0.19, 0.13, -0.01, 0, 0, Math.PI / 2)
      .add('suit', G.cyl(0.055, 0.055, 0.06, 8), C.suitDark, -0.19, 0.13, -0.01, 0, 0, Math.PI / 2)
      .add('glow', G.cyl(0.026, 0.026, 0.01, 8), null, 0.222, 0.13, -0.01, 0, 0, Math.PI / 2)
      .add('glow', G.cyl(0.026, 0.026, 0.01, 8), null, -0.222, 0.13, -0.01, 0, 0, Math.PI / 2)
      .done();

    // ---- arms
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * 0.29, 0.52, 0);
      kit(sh)
        .add('suit', G.cap(0.062, 0.2), C.suit, 0, -0.15, 0)
        .add('plate', G.sph(0.115, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), C.plate, side * 0.012, -0.005, 0, 0, 0, -side * 0.22, 1.05, 0.9, 1.1)
        .add('plate', G.cyl(0.118, 0.118, 0.028, 9, 1, true), C.orange, side * 0.016, -0.03, 0, 0, 0, -side * 0.22, 1.05, 1, 1.1)
        .done();
      const el = new THREE.Group(); el.position.y = -0.31; sh.add(el);
      const fk = kit(el)
        .add('suit', G.cap(0.055, 0.18), C.suit, 0, -0.13, 0)
        .add('plate', G.cyl(0.07, 0.062, 0.17, 6), C.plate, 0, -0.14, 0)
        .add('suit', new THREE.IcosahedronGeometry(0.062, 0), C.suitDark, 0, -0.3, 0, 0, 0, 0, 0.9, 1.15, 1);
      if (side === 1) {
        // wrist scanner on the left forearm
        fk.add('suit', G.box(0.05, 0.08, 0.1), C.suitDark, 0.07, -0.16, 0.01)
          .add('glow', G.box(0.008, 0.055, 0.075), null, 0.097, -0.16, 0.01);
      }
      fk.done();
      this.torso.add(sh);
      return { sh, el };
    };
    this.armL = arm(1); this.armR = arm(-1);

    // ---- legs
    const leg = (side) => {
      const hip = new THREE.Group(); hip.position.set(side * 0.11, 0, 0);
      kit(hip)
        .add('suit', G.cap(0.08, 0.3), C.suit, 0, -0.23, 0)
        .add('plate', G.box(0.13, 0.2, 0.04), C.plate, 0, -0.2, 0.072, -0.05)
        .add('plate', G.box(0.04, 0.16, 0.1), C.plateShade, side * 0.078, -0.22, 0)
        .done();
      const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
      kit(knee)
        .add('suit', G.cap(0.068, 0.27), C.suit, 0, -0.19, 0)
        .add('plate', new THREE.IcosahedronGeometry(0.068, 0), C.plateShade, 0, 0.0, 0.05, 0, 0, 0, 1, 1, 0.7)
        .add('plate', G.cyl(0.08, 0.09, 0.32, 7), C.plate, 0, -0.24, 0)
        .add('suit', G.cyl(0.092, 0.092, 0.03, 7), C.suitDark, 0, -0.13, 0)
        .add('plate', G.box(0.16, 0.09, 0.27), C.plate, 0, -0.43, 0.045)
        .add('plate', G.box(0.165, 0.03, 0.06), C.orange, 0, -0.405, 0.16)
        .add('suit', G.box(0.17, 0.035, 0.29), C.suitDark, 0, -0.475, 0.045)
        .add('glow', G.box(0.176, 0.012, 0.2), null, 0, -0.468, 0.03)
        .done();
      this.hips.add(hip);
      return { hip, knee };
    };
    this.legL = leg(1); this.legR = leg(-1);
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

    // Suit lights: steady while moving, brighter with a slow pulse while standing still (scanning).
    const still = 1 - walkK;
    const target = 0.72 + still * (0.2 + 0.08 * Math.sin(t * 3.2));
    this.glowLevel = damp(this.glowLevel, target, 4, dt);
    this.mats.glow.color.copy(this.glowBase).multiplyScalar(this.glowLevel);
    this.mats.visor.emissiveIntensity = 0.5 + this.glowLevel * 0.4;

    // footstep events at each half-cycle
    if (sp > 0.6 && Math.sign(s) !== Math.sign(this.lastS) && onStep) onStep(this.running ? 1 : 0.6);
    this.lastS = s;
  }
}
