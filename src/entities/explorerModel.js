import * as THREE from 'three';
import { flatMat, mergeParts, m4 } from '../engine/utils.js';

// The explorer's model: a slim green trench coat with orange trims, black sports goggles, a compact pack.
// Rig (what Player.animate drives; keep these names and pivots, or the walk / run animation breaks):
// hips (y 0.95) > torso > head (0.66) · antenna · arms {sh (±0.29, 0.52), el (-0.31)} · legs {hip (±0.11), knee (-0.46)}.
// +x is the explorer's left, +z its front. Feet sit at y = 0, the top of the hood at ~1.95 m.
// The gem emitter on top of the pack sits under Player.carryGroup, where the carried gems orbit.

const C = {
  coat: 0x49946b, coatDark: 0x3c7c58,   // mid green; the darker tone marks lapels, collar, hood peak, hem and cuffs
  orange: 0xff6b24, scarf: 0xe0622a,    // the trims that keep the figure readable on any ground
  trousers: 0x4a4d4f, boots: 0x2c2f33, soles: 0x17181a, gloves: 0x2a2d30, belt: 0x2a2d30, strap: 0x2a2d30,
  pack: 0x3a3f42, bedroll: 0xbfae8a, buckle: 0xb89548, buttons: 0x22201c, under: 0x1f2226,
  skin: 0xb98060, goggleStrap: 0x16171a, goggleFrame: 0x0c0d0f, glint: 0x8a96a6,
};
const GLOW = 0x5cf4ff;
const COAT_LENGTH = 0.52, COAT_FLARE = 0.25;   // the skirt ends a little below the knee, flaring slightly
const PACK_SCALE = 0.8;

const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cap: (r, len, rs = 6) => new THREE.CapsuleGeometry(r, len, 2, rs),
  cyl: (rt, rb, h, rs = 8, open = false, ts = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, h, rs, 1, open, ts, tl),
  // tapered box: square cross-section with flat front/back faces
  prism: (rt, rb, h) => new THREE.CylinderGeometry(rt, rb, h, 4).rotateY(Math.PI / 4),
  sph: (r, ws, hs, ps, pl, ts, tl) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl),
  ico: (r) => new THREE.IcosahedronGeometry(r, 0),
};

// Builds the model on Player p: its bones, materials (p.mats, p.glowBase, p.visorGlow) and coat panels (p.skirt).
export function buildExplorer(p) {
  p.mats = {
    cloth: flatMat({ vertexColors: true, roughness: 0.9 }),
    coat: flatMat({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),   // open shells: skirt, collar, hood
    hard: flatMat({ vertexColors: true, roughness: 0.4, metalness: 0.35 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x07080a, emissive: 0x0a2a33, emissiveIntensity: 0.35, metalness: 0.7, roughness: 0.12, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ color: GLOW, toneMapped: false }),
  };
  p.glowBase = new THREE.Color(GLOW);
  p.visorGlow = 0.45;   // black lenses: only a faint sheen pulses with the suit lights

  // kit(group) collects parts per material; done() merges them into one mesh each (vertex colours),
  // so the whole figure stays a couple of dozen draw calls.
  const kit = (group) => {
    const parts = {};
    const api = {
      add(layer, geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
        (parts[layer] ??= []).push({ geo, color: color ?? 0xffffff, matrix: m4(x, y, z, rx, ry, rz, sx, sy, sz) });
        return api;
      },
      done() {
        for (const layer of Object.keys(parts)) {
          const mesh = new THREE.Mesh(mergeParts(parts[layer]), p.mats[layer]);
          mesh.castShadow = layer !== 'glow';
          group.add(mesh);
        }
      },
    };
    return api;
  };

  // ---- bones
  p.hips = new THREE.Group(); p.hips.position.y = 0.95; p.object.add(p.hips);
  p.torso = new THREE.Group(); p.hips.add(p.torso);
  p.head = new THREE.Group(); p.head.position.y = 0.66; p.torso.add(p.head);
  const arm = (side) => {
    const sh = new THREE.Group(); sh.position.set(side * 0.29, 0.52, 0); p.torso.add(sh);
    const el = new THREE.Group(); el.position.y = -0.31; sh.add(el);
    return { sh, el };
  };
  const leg = (side) => {
    const hip = new THREE.Group(); hip.position.set(side * 0.11, 0, 0); p.hips.add(hip);
    const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
    return { hip, knee };
  };
  p.armL = arm(1); p.armR = arm(-1);
  p.legL = leg(1); p.legR = leg(-1);

  // ---- hips: trousers, belt and a glowing buckle
  kit(p.hips)
    .add('cloth', G.box(0.36, 0.18, 0.23), C.trousers, 0, 0.02, 0)
    .add('coat', G.cyl(0.215, 0.2, 0.1, 10), C.coat, 0, 0.06, 0, 0, 0, 0, 1, 1, 0.72)
    .add('cloth', G.cyl(0.222, 0.222, 0.06, 10), C.belt, 0, 0.1, 0, 0, 0, 0, 1, 1, 0.74)
    .add('hard', G.box(0.07, 0.06, 0.02), C.buckle, 0, 0.1, 0.165)
    .add('glow', G.box(0.03, 0.022, 0.01), null, 0, 0.1, 0.176)
    .add('cloth', G.box(0.04, 0.13, 0.012), C.belt, 0.05, 0.03, 0.168, 0, 0, 0.08)   // belt end
    .done();

  // ---- coat skirt: four curved panels (front/back, left/right) hanging from the belt, each with a hem band
  // and a light along its edge. They swing with the thighs (animateCoat), so the coat never swallows the legs.
  p.skirt = [];
  const gap = 0.07;   // the coat's front opening and back vent
  const panel = (side, front) => {
    const g = new THREE.Group(); g.position.y = 0.07; p.hips.add(g);
    // CylinderGeometry: theta 0 faces +z (front), +pi/2 is +x (the explorer's left)
    const t0 = front ? (side === 1 ? gap : -Math.PI / 2) : (side === 1 ? Math.PI / 2 : Math.PI + gap / 2);
    const tl = front ? Math.PI / 2 - gap : Math.PI / 2 - gap / 2;
    const L = COAT_LENGTH, F = COAT_FLARE;
    kit(g)
      .add('coat', G.cyl(0.215, F, L, 5, true, t0, tl), C.coat, 0, -L / 2, 0, 0, 0, 0, 1, 1, 0.78)
      .add('coat', G.cyl(F + 0.004, F + 0.006, 0.05, 5, true, t0, tl), C.coatDark, 0, -L + 0.025, 0, 0, 0, 0, 1, 1, 0.78)
      .add('glow', G.cyl(F + 0.008, F + 0.008, 0.012, 5, true, t0, tl), null, 0, -L + 0.004, 0, 0, 0, 0, 1, 1, 0.78)
      .done();
    p.skirt.push({ g, side, front });
  };
  panel(1, true); panel(-1, true); panel(1, false); panel(-1, false);

  // ---- torso: slim coat, lit lapels, double-breasted buttons, back yoke, epaulettes, raised collar, straps
  const T = kit(p.torso)
    .add('coat', G.prism(0.305, 0.245, 0.56), C.coat, 0, 0.36, 0, 0, 0, 0, 1, 1, 0.64)
    .add('coat', G.box(0.4, 0.17, 0.03), C.coatDark, 0, 0.53, -0.14, 0.12)
    .add('coat', G.box(0.09, 0.02, 0.12), C.coatDark, 0.2, 0.628, 0, 0, 0, -0.18)
    .add('coat', G.box(0.09, 0.02, 0.12), C.coatDark, -0.2, 0.628, 0, 0, 0, 0.18)
    .add('coat', G.box(0.11, 0.24, 0.02), C.coatDark, 0.07, 0.5, 0.142, -0.08, 0, -0.32)
    .add('coat', G.box(0.11, 0.24, 0.02), C.coatDark, -0.07, 0.5, 0.142, -0.08, 0, 0.32)
    .add('glow', G.box(0.012, 0.24, 0.012), null, 0.112, 0.5, 0.15, -0.08, 0, -0.32)
    .add('glow', G.box(0.012, 0.24, 0.012), null, -0.112, 0.5, 0.15, -0.08, 0, 0.32)
    .add('cloth', G.box(0.09, 0.14, 0.02), C.under, 0, 0.56, 0.128, -0.1)
    .add('coat', G.cyl(0.16, 0.135, 0.14, 10, true, 0.55, Math.PI * 2 - 1.1), C.coatDark, 0, 0.68, -0.01)
    .add('cloth', G.box(0.045, 0.045, 0.34), C.strap, 0.14, 0.6, -0.04)
    .add('cloth', G.box(0.045, 0.045, 0.34), C.strap, -0.14, 0.6, -0.04);
  for (const y of [0.22, 0.34]) for (const x of [0.065, -0.065]) T.add('hard', G.cyl(0.014, 0.014, 0.012, 6), C.buttons, x, y, 0.15, Math.PI / 2);
  T.done();

  // ---- pack: orange pocket and panel, light column, bedroll, and the gem emitter on top.
  // Built around its top-front edge and scaled from there, so the emitter stays under the carried gems.
  const top = new THREE.Vector3(0, 0.6, -0.155);
  const pack = new THREE.Group(); pack.position.copy(top); pack.scale.setScalar(PACK_SCALE); p.torso.add(pack);
  kit(pack)
    .add('cloth', G.box(0.3, 0.38, 0.13), C.pack, 0, -0.21, -0.065)
    .add('cloth', G.box(0.26, 0.12, 0.03), C.orange, 0, -0.31, -0.135)
    .add('hard', G.box(0.05, 0.02, 0.03), C.buckle, 0.07, -0.26, -0.145)
    .add('hard', G.box(0.05, 0.02, 0.03), C.buckle, -0.07, -0.26, -0.145)
    .add('cloth', G.box(0.1, 0.2, 0.025), C.orange, 0, -0.13, -0.138)
    .add('glow', G.box(0.03, 0.16, 0.012), null, 0, -0.13, -0.152)
    .add('cloth', G.cyl(0.07, 0.07, 0.36, 8), C.bedroll, 0, -0.45, -0.075, 0, 0, Math.PI / 2)
    .add('cloth', G.cyl(0.074, 0.074, 0.02, 8), C.strap, 0.1, -0.45, -0.075, 0, 0, Math.PI / 2)
    .add('cloth', G.cyl(0.074, 0.074, 0.02, 8), C.strap, -0.1, -0.45, -0.075, 0, 0, Math.PI / 2)
    .add('hard', G.cyl(0.07, 0.085, 0.045, 8), C.orange, 0, 0, -0.065)
    .add('glow', G.cyl(0.046, 0.046, 0.012, 8), null, 0, 0.026, -0.065)
    .done();

  // whip antenna on the pack's top corner (sways when moving)
  p.antenna = new THREE.Group();
  p.antenna.position.set(top.x + 0.12 * PACK_SCALE, top.y - 0.01 * PACK_SCALE, top.z - 0.115 * PACK_SCALE);
  p.torso.add(p.antenna);
  kit(p.antenna)
    .add('hard', G.cyl(0.02, 0.026, 0.05, 6), C.orange, 0, 0.025, 0)
    .add('hard', G.cyl(0.006, 0.01, 0.28, 5), C.goggleStrap, 0, 0.19, 0)
    .add('glow', G.sph(0.018, 6, 4), null, 0, 0.34, 0)
    .done();

  // ---- head: hood up, an orange scarf pulled up to the nose (the face is never shown), sports goggles
  const hs = [1, 1.04, 1.05];   // the head is slightly taller and deeper than wide
  const gPhi = Math.PI / 2 - 1.05, gLen = 2.1, bulge = [1, 1.04, 1.1];   // the goggles' wrap, bulging slightly forward
  kit(p.head)
    .add('cloth', G.sph(0.18, 12, 9), C.skin, 0, 0.15, 0, 0, 0, 0, ...hs)
    .add('cloth', G.cyl(0.115, 0.12, 0.12, 9), C.scarf, 0, -0.01, 0)
    .add('cloth', G.sph(0.186, 12, 6, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44), C.scarf, 0, 0.15, 0.004, 0, 0, 0, ...hs)
    // hood: a shell over the top and back, open at the face, with a peak
    .add('coat', G.sph(0.215, 12, 8, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.66), C.coat, 0, 0.15, -0.012, 0, 0, 0, ...hs)
    .add('coat', G.sph(0.218, 12, 3, Math.PI / 2 - 1.0, 2.0, 0.16, 0.42), C.coatDark, 0, 0.15, -0.012, 0, 0, 0, ...hs)
    // goggles: strap, frame, one dark wraparound lens with a pale glint, and a thin light along the brow
    .add('hard', G.cyl(0.192, 0.19, 0.04, 16, true), C.goggleStrap, 0, 0.175, -0.003, -0.05, 0, 0, 1, 1, 1.07)
    .add('hard', G.sph(0.197, 22, 4, gPhi - 0.07, gLen + 0.14, 1.1, 0.46), C.goggleFrame, 0, 0.15, 0, 0, 0, 0, ...bulge)
    .add('visor', G.sph(0.202, 22, 4, gPhi, gLen, 1.14, 0.38), null, 0, 0.15, 0, 0, 0, 0, ...bulge)
    .add('hard', G.sph(0.2035, 10, 1, Math.PI / 2 - 0.62, 0.42, 1.2, 0.035), C.glint, 0, 0.15, 0, 0, 0, 0, ...bulge)
    .add('glow', G.sph(0.205, 16, 1, gPhi + 0.1, gLen - 0.2, 1.125, 0.022), null, 0, 0.15, 0, 0, 0, 0, ...bulge)
    .done();

  // ---- arms: coat sleeves with cuff straps, gloves; the wrist scanner on the left
  for (const side of [1, -1]) {
    const { sh, el } = side === 1 ? p.armL : p.armR;
    kit(sh)
      .add('coat', G.cap(0.07, 0.2, 7), C.coat, 0, -0.15, 0)
      .add('coat', G.sph(0.082, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), C.coat, side * 0.005, -0.04, 0, 0, 0, -side * 0.2, 1, 0.7, 1)
      .done();
    const fk = kit(el)
      .add('coat', G.cap(0.064, 0.17, 7), C.coat, 0, -0.12, 0)
      .add('coat', G.cyl(0.072, 0.072, 0.035, 8), C.coatDark, 0, -0.2, 0)
      .add('cloth', G.ico(0.058), C.gloves, 0, -0.3, 0, 0, 0, 0, 0.9, 1.15, 1);
    if (side === 1) fk.add('hard', G.box(0.04, 0.07, 0.085), C.orange, 0.066, -0.15, 0.01).add('glow', G.box(0.008, 0.045, 0.06), null, 0.087, -0.15, 0.01);
    fk.done();
  }

  // ---- legs: slim trousers, boots with orange collars and toe caps, lit soles
  for (const side of [1, -1]) {
    const { hip, knee } = side === 1 ? p.legL : p.legR;
    kit(hip).add('cloth', G.cap(0.078, 0.3, 7), C.trousers, 0, -0.23, 0).done();
    kit(knee)
      .add('cloth', G.cap(0.066, 0.27, 7), C.trousers, 0, -0.19, 0)
      .add('cloth', G.cyl(0.078, 0.086, 0.2, 8), C.boots, 0, -0.32, 0)
      .add('cloth', G.cyl(0.082, 0.082, 0.025, 8), C.orange, 0, -0.22, 0)
      .add('cloth', G.box(0.15, 0.09, 0.26), C.boots, 0, -0.43, 0.045)
      .add('cloth', G.box(0.14, 0.05, 0.07), C.orange, 0, -0.4, 0.15, 0.35)
      .add('hard', G.box(0.16, 0.035, 0.28), C.soles, 0, -0.475, 0.045)
      .add('glow', G.box(0.166, 0.01, 0.2), null, 0, -0.47, 0.03)
      .done();
  }
}

// Swing the coat panels with the legs: a front panel follows its thigh forward, a back panel follows it back,
// and the back flares a little while running.
export function animateCoat(p, runK, walkK, t) {
  for (const s of p.skirt) {
    const legRot = (s.side === 1 ? p.legL : p.legR).hip.rotation.x;   // negative = leg forward
    const flutter = Math.sin(t * 9 + s.side) * 0.05 * runK;
    s.g.rotation.x = s.front ? Math.min(0, legRot) * 0.85 - runK * 0.05 : Math.max(0, legRot) * 0.85 + runK * 0.22 + flutter + walkK * 0.03;
  }
}
