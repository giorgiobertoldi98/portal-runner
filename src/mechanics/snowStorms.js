// Snow-storm devices (The Frozen Peaks).
// Hidden devices are scattered at random at the start of each run. They stay put, except that every gem you put in the
// portal, or taking the explorers' map, makes them all shift to new spots (gem deliveries at most once every 10 s,
// so a batch of gems causes one shift).
// Step within reach of one and a storm breaks out in a circle
// centred where you stood. Inside it the fog closes in (you can still see a little) and the Yeti knows where you are.
// Leave the circle and the storm dies; walking back into a device's reach later starts a new one.
// Devices always stay farther from every gem than their trigger radius, so picking up a gem never forces a storm.
// Devices are invisible and silent: nothing warns you before a storm breaks out.
// They are spread evenly over the map (best-candidate sampling), clear of the portal, the spawn point and the gems.
import * as THREE from 'three';
import { GLACIER } from '../config.js';
import { findSpot, insideColliders, fogColor, damp } from '../engine/utils.js';
import { tr } from '../i18n/i18n.js';

const STORM_COLOR = 0xd3deea;

const WIND = { layers: [
  { type: 'noise', filter: 'bandpass', freq: 650, q: 0.7, gain: 0.55, lfoRate: 0.23, lfoDepth: 380 },
  { type: 'noise', filter: 'bandpass', freq: 2300, q: 3, gain: 0.12, lfoRate: 0.41, lfoDepth: 900 },
  { type: 'noise', filter: 'lowpass', freq: 240, q: 0.5, gain: 0.5 },
] };

export function createSnowStorms({ scene, heightAt, createParticles, density = 1 }) {
  const baseFog = { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far };
  const stormFog = fogColor(STORM_COLOR);
  const signals = { storm: false };
  let devices = [];
  let storm = null;     // { x, z, r, device }
  let intensity = 0;    // 0..1 visual/audio blend of the storm
  const cfg = GLACIER;
  let world = null, rng = Math.random, toldStorm = false, cooldown = 0, shiftWait = 0;
  let wind = null;

  // ── visuals ──
  // the storm's edge: a swirling curtain of snow plus a faint line on the ground
  const wallMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime, uOpacity;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float a = vUv.x * 90.0 + vUv.y * 14.0 - uTime * 2.4;
        float s = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(a)) * (0.6 + 0.4 * sin(vUv.x * 23.0 + uTime));
        float g = 0.5 + 0.5 * sin(vUv.x * 260.0 - vUv.y * 40.0 + uTime * 5.0 + h(floor(vUv.x * 60.0)) * 6.0);
        float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        gl_FragColor = vec4(vec3(0.62, 0.7, 0.8), (0.18 + 0.5 * s + 0.15 * g) * fade * uOpacity);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true), wallMat);
  wall.visible = false; wall.frustumCulled = false;
  scene.add(wall);

  const RING_SEG = 160;
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RING_SEG + 1) * 2 * 3), 3));
  const ringIdx = [];
  for (let i = 0; i < RING_SEG; i++) { const b = i * 2; ringIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  ringGeo.setIndex(ringIdx);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.visible = false; ring.frustumCulled = false;
  scene.add(ring);

  // whiteout dome around the camera: hides the (fog-free) sky, moon and far mountains while you're in a storm
  const dome = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 12), new THREE.MeshBasicMaterial({ color: STORM_COLOR, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
  dome.visible = false; dome.frustumCulled = false;
  scene.add(dome);

  const blizzard = createParticles({ count: Math.floor(2600 * density), area: [44, 16, 44], color: 0xffffff, size: 0.3, opacity: 0, velocity: [12, -4, 5], sway: 2.8 });
  blizzard.points.visible = false;
  scene.add(blizzard.points);

  function placeStormEdge(s) {
    const pos = ringGeo.attributes.position.array;
    for (let i = 0; i <= RING_SEG; i++) {
      const a = (i / RING_SEG) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      for (let k = 0; k < 2; k++) {
        const r = s.r + (k ? 0.35 : -0.35);
        const x = s.x + c * r, z = s.z + sn * r;
        const o = (i * 2 + k) * 3;
        pos[o] = x; pos[o + 1] = heightAt(x, z) + 0.12; pos[o + 2] = z;
      }
    }
    ringGeo.attributes.position.needsUpdate = true;
    ringGeo.computeBoundingSphere();
    const gy = heightAt(s.x, s.z);
    wall.scale.set(s.r, 72, s.r);
    wall.position.set(s.x, gy + 10, s.z);
  }

  // ── devices ──
  // places to keep clear of: portal, spawn, gems on the ground, and (when the devices shift) you and any storm in progress
  function keepClear(ctx) {
    const list = [];
    if (ctx.portal) list.push({ x: ctx.portal.x, z: ctx.portal.z, d: GLACIER.deviceAvoidPortal });
    if (ctx.base) list.push({ x: ctx.base.x, z: ctx.base.z, d: GLACIER.deviceAvoidBase });
    for (const g of ctx.gems || []) list.push({ x: g.x, z: g.z, d: cfg.reach + GLACIER.deviceGemClearance });
    if (ctx.player) list.push({ x: ctx.player.x, z: ctx.player.z, d: Math.max(GLACIER.deviceAvoidPlayer, cfg.reach + GLACIER.deviceGemClearance) });
    if (storm) list.push({ x: storm.x, z: storm.z, d: storm.r + cfg.reach + 6 });
    for (const av of ctx.avoid || []) list.push(av); // e.g. the ice hole
    return list;
  }

  // Best-candidate sampling: among many random valid spots, take the one farthest from every other device
  // (the map edge counts as a neighbour, so devices don't pile up along the border). This spreads them evenly.
  function pickSpot(ctx) {
    const clear = keepClear(ctx);
    const R = world.radius - 18;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 400; i++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * R;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (!world.isValidSpot(x, z) || insideColliders(x, z, 1.5, world.colliders)) continue;
      let slack = Infinity;
      for (const c of clear) slack = Math.min(slack, Math.hypot(x - c.x, z - c.z) - c.d);
      let spread = (R - rr) * 2 + 20;
      for (const d of devices) if (d.placed) spread = Math.min(spread, Math.hypot(x - d.x, z - d.z));
      const score = slack >= 0 ? spread : slack - 1e5; // keeping clear comes first, then spreading out
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    return best || findSpot(rng, world, { avoid: clear });
  }

  // (re)place every device, one after another so each spreads away from the ones already placed
  function placeAll(ctx) {
    for (const dev of devices) dev.placed = false;
    for (const dev of devices) {
      const s = pickSpot(ctx);
      dev.x = s.x; dev.z = s.z; dev.placed = true;
    }
  }

  function applyVisuals() {
    const k = intensity * intensity * (3 - 2 * intensity); // smoothstep
    scene.fog.color.copy(baseFog.color).lerp(stormFog, k);
    scene.fog.near = baseFog.near + (GLACIER.stormFogNear - baseFog.near) * k;
    scene.fog.far = baseFog.far + (GLACIER.stormFogFar - baseFog.far) * k;
    const on = intensity > 0.003;
    dome.visible = blizzard.points.visible = on;
    dome.material.opacity = k;
    blizzard.points.material.opacity = 0.95 * k;
    wall.visible = ring.visible = on && !!storm;
    wallMat.uniforms.uOpacity.value = k;
    ringMat.opacity = 0.45 * k;
  }

  function reset() {
    storm = null;
    signals.storm = false;
    intensity = 0;
    applyVisuals();
    if (wind) wind.set(0, 0.3);
  }

  return {
    signals,
    get storm() { return storm; },
    get devices() { return devices; },
    reset,

    // devices for a new run (they move again only when a gem goes into the portal). ctx = { world, rng, portal: {x,z}, base: {x,z}, gems: [{x,z}] }
    setup(ctx) {
      world = ctx.world; rng = ctx.rng || Math.random;
      toldStorm = false; cooldown = 0; shiftWait = 0;
      reset();
      devices = Array.from({ length: cfg.devices }, () => ({ x: 0, z: 0, placed: false }));
      placeAll(ctx);
    },

    // a gem went into the portal: every device shifts, unless they already shifted in the last few seconds.
    // ctx = { player, audio, hud, gems: [{x,z}], portal: {x,z}, base: {x,z} }
    onGemInserted(ctx) {
      if (shiftWait > 0 || !devices.length) return;
      this.shift(ctx);
    },

    // every device moves to a new spot (a gem delivered, or the explorers' map taken). A falling chime and a toast
    // mark it every time. `soundAt` / `toastAt` (seconds) let a caller keep them clear of its own cues.
    shift(ctx, { soundAt = 0.25, toastAt = 0.6 } = {}) {
      if (!devices.length) return;
      shiftWait = GLACIER.deviceShufflePause;
      placeAll(ctx);
      const audio = ctx.audio;
      if (audio) [1760, 1318.5, 987.8, 740].forEach((f, i) => audio.tone({ freq: f, type: 'sine', dur: 0.7, gain: 0.035, when: soundAt + i * 0.09 }));
      if (ctx.hud) setTimeout(() => ctx.hud.toast(tr('glacier.windsChanging'), 3000), toastAt * 1000);
    },

    // end the current storm right away (e.g. you went down into the ice hole); its device stays where it is
    calm(audio) {
      if (!storm) return;
      storm = null;
      signals.storm = false;
      cooldown = GLACIER.stormCooldown;
      if (audio) audio.noiseBurst({ type: 'lowpass', freq: 1800, q: 0.6, dur: 1.4, gain: 0.25, attack: 0.05, sweepTo: 200 });
    },

    // ctx = { player (Vector3), camera, audio, hud, growl, enabled, gems: [{x,z}], portal: {x,z}, base: {x,z} }
    update(dt, t, ctx) {
      const P = ctx.player;
      const audio = ctx.audio;
      if (audio && audio.ready && !wind) wind = audio.loop(WIND);
      if (shiftWait > 0) shiftWait -= dt;

      if (storm) {
        // out of the storm: it dies; its device stays where it is
        if (Math.hypot(P.x - storm.x, P.z - storm.z) > storm.r) this.calm(audio);
      } else if (ctx.enabled && (cooldown -= dt) <= 0) {
        for (const dev of devices) {
          if (Math.hypot(P.x - dev.x, P.z - dev.z) < cfg.reach) {
            const r = cfg.stormMin + rng() * (cfg.stormMax - cfg.stormMin);
            storm = { x: P.x, z: P.z, r, device: dev };
            signals.storm = true;
            placeStormEdge(storm);
            if (audio) {
              audio.noiseBurst({ type: 'bandpass', freq: 300, q: 0.8, dur: 1.8, gain: 0.45, attack: 0.15, sweepTo: 3200 });
              [1568, 2093, 2637].forEach((f, i) => audio.tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.05, when: 0.05 + i * 0.06 }));
              if (ctx.growl) setTimeout(() => audio.growl(ctx.growl, 1), 450);
            }
            if (!toldStorm && ctx.hud) { toldStorm = true; ctx.hud.toast(tr('glacier.firstStorm'), 3800); }
            break;
          }
        }
      }

      intensity = damp(intensity, storm ? 1 : 0, storm ? 2.2 : 1.6, dt);
      if (!storm && intensity < 0.003) intensity = 0;
      applyVisuals();
      wallMat.uniforms.uTime.value = t;
      if (wind) wind.set(0.5 * intensity, 0.15);
      if (blizzard.points.visible) blizzard.update(dt, { x: P.x, y: P.y, z: P.z }, t);
      if (ctx.camera) dome.position.copy(ctx.camera.position);
    },
  };
}
