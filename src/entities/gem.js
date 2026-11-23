import * as THREE from 'three';
import { softTexture } from '../engine/utils.js';
import { gemDesign } from './gemDesigns.js';

const PLUME_N = 90;
const PLUME_H = 70; // metres of rising particles above a lit gem

// Fallback look when a world doesn't set one (see worlds/registry.js, `gem`)
export const DEFAULT_GEM = { style: 'cluster', dark: 0x5d6168, col: 0x3d86e0, glow: 0x5aa8ff };
// the colour a world's gems are drawn in on the map: the part that glows
export const gemMapColor = (look = DEFAULT_GEM) => look.mapCol ?? look.inner ?? look.col ?? DEFAULT_GEM.col;

// A gem lying in a world: a solid, rough crystal shaped and coloured for its world (entities/gemDesigns.js).
// It is dark until something lights it (only its crystal glows; a geode's rock shell just catches the light):
//   lit    (0..1) — set every frame by the Resonance Call (inside the ring = 1), or by the map
//   near   (0..1) — proximity glimmer, so the last metres are findable (it also brings out the colour)
//   marked        — a gem you dropped (or lost when caught) keeps a faint glow and its colour so you can find it again
// Hidden it shows its dark tone; revealed (lit) it turns its world colour and glows.
export function createGem(look = DEFAULT_GEM) {
  const L = { ...DEFAULT_GEM, ...look };
  const design = gemDesign(L.style);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const glowK = L.glowK ?? 1;
  const mats = [];
  for (const part of design.parts) {
    const inner = part.role === 'inner';
    const dark = new THREE.Color(inner ? (L.innerDark ?? L.dark) : L.dark);
    const col = new THREE.Color(inner ? (L.inner ?? L.col) : L.col);
    const mat = new THREE.MeshStandardMaterial({ color: dark.clone(), emissive: L.glow, emissiveIntensity: 0, roughness: 0.5, metalness: 0.15, flatShading: true, side: THREE.DoubleSide });
    const m = new THREE.Mesh(part.geo, mat);
    m.castShadow = true;
    body.add(m);
    mats.push({ mat, dark, col, k: (part.role === 'rock' ? 0 : 1) * glowK });
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: L.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.set(3.4, 3.4, 1);
  group.add(halo);

  // rising coloured particles, sized in pixels so they stay visible from far away
  const pos = new Float32Array(PLUME_N * 3);
  const seeds = Array.from({ length: PLUME_N }, () => [Math.random(), Math.random() * Math.PI * 2, 0.4 + Math.random() * 0.8]);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pMat = new THREE.PointsMaterial({ map: softTexture(), color: L.glow, size: 11 * Math.min(devicePixelRatio, 2), sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });
  const plume = new THREE.Points(pGeo, pMat);
  plume.frustumCulled = false;
  plume.visible = false;
  group.add(plume);

  const offset = Math.random();
  body.rotation.y = offset * Math.PI * 2;
  const obj = {
    group,
    state: 'ground',   // 'ground' | 'carried' | 'socketed'
    lit: 0,            // smoothed light level
    litTarget: 0,
    near: 0,
    marked: false,
    blockPickup: false, // true right after a drop, until the player steps away
    hue: offset,
    update(dt, t) {
      body.rotation.y += dt * (0.5 + this.lit * 1.2);
      body.position.y = Math.sin(t * 2 + offset * 6) * 0.2;
      halo.position.y = body.position.y;
      // light in fast, fade out over ~0.8 s
      const k = this.litTarget > this.lit ? 10 : 1.3;
      this.lit += (this.litTarget - this.lit) * (1 - Math.exp(-k * dt));
      const glow = Math.max(this.lit, this.near * 0.35, this.marked ? 0.3 : 0);
      // how far it has turned from its dark tone to its colour: revealed, close by (the proximity glimmer), or dropped
      const colour = Math.max(this.lit, Math.min(1, this.near * 1.6), this.marked ? 0.7 : 0);
      const pulse = 0.88 + Math.sin(t * 3 + offset * 6) * 0.12;
      for (const m of mats) {
        m.mat.color.copy(m.dark).lerp(m.col, colour);
        m.mat.emissiveIntensity = glow * 0.7 * m.k * pulse;
      }
      halo.material.opacity = glow * 0.6 * glowK * pulse;
      pMat.opacity = this.lit;
      plume.visible = this.lit > 0.02;
      if (plume.visible) {
        for (let i = 0; i < PLUME_N; i++) {
          const [s, a, sp] = seeds[i];
          const h = ((s + t * 0.09 * sp) % 1);
          const spread = 0.3 + h * 2.2;
          pos[i * 3] = Math.cos(a + t * 0.6 * sp) * spread;
          pos[i * 3 + 1] = h * PLUME_H;
          pos[i * 3 + 2] = Math.sin(a + t * 0.6 * sp) * spread;
        }
        pGeo.attributes.position.needsUpdate = true;
      }
    },
  };
  return obj;
}

// Small glowing gem in the world's shape and colour: carried (orbiting the backpack) and in the portal sockets.
// One mesh with one material (the portal swaps the material to show an empty socket).
export function createMiniGem(look = DEFAULT_GEM) {
  const L = { ...DEFAULT_GEM, ...look };
  const d = gemDesign(L.style);
  const mat = new THREE.MeshStandardMaterial({ color: d.miniRole === 'inner' ? (L.inner ?? L.col) : L.col, emissive: L.glow, emissiveIntensity: 0.45 * (L.glowK ?? 1), metalness: 0.15, roughness: 0.45, flatShading: true, side: THREE.DoubleSide });
  return new THREE.Mesh(d.mini, mat);
}
