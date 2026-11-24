import * as THREE from 'three';
import { flatMat, mergeParts, m4 } from '../engine/utils.js';

// The explorer's looks. Every look dresses the same rig (bone names and pivots below are what Player.animate drives),
// so a look changes only what the explorer wears, never its size, collisions or controls.
// Rig: hips (y 0.95) > torso > head (0.66) · antenna · arms {sh (±0.29, 0.52), el (-0.31)} · legs {hip (±0.11), knee (-0.46)}.
// Feet sit at y = 0; the top of the head at ~1.95 m. Carried gems orbit above the pack (Player.carryGroup).
// A look may add coat panels (p.skirt), which Player.animate swings with the legs.

const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cap: (r, len, rs = 6) => new THREE.CapsuleGeometry(r, len, 2, rs),
  cyl: (rt, rb, h, rs = 8, open = false, ts = 0, tl = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, h, rs, 1, open, ts, tl),
  // tapered box: square cross-section with flat front/back faces
  prism: (rt, rb, h) => new THREE.CylinderGeometry(rt, rb, h, 4).rotateY(Math.PI / 4),
  sph: (r, ws, hs, ps, pl, ts, tl) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl),
  ico: (r) => new THREE.IcosahedronGeometry(r, 0),
};

// kit(group) collects parts per material; done() merges them into one mesh each (vertex colours),
// so the whole figure stays a couple of dozen draw calls.
function kitFor(p) {
  return (group) => {
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
        return group;
      },
    };
    return api;
  };
}

// Bones at the pivots Player.animate expects.
function rig(p) {
  p.hips = new THREE.Group(); p.hips.position.y = 0.95; p.object.add(p.hips);
  p.torso = new THREE.Group(); p.hips.add(p.torso);
  p.head = new THREE.Group(); p.head.position.y = 0.66; p.torso.add(p.head);
  p.antenna = new THREE.Group(); p.antenna.position.set(0.12, 0.59, -0.27); p.torso.add(p.antenna);
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
  p.armL = arm(1); p.armR = arm(-1);   // +x is the explorer's left
  p.legL = leg(1); p.legR = leg(-1);
  p.skirt = [];
}

// ---------------------------------------------------------------------------------------------------------------
// The armoured explorer: graphite undersuit, warm-white plates, dark glass visor, orange trims, cyan suit lights.
function armoured(p, kit) {
  const C = { suit: 0x3a4259, suitDark: 0x20242f, plate: 0xe9e6e0, plateShade: 0xb8bcc6, orange: 0xff6b24 };
  p.mats = {
    suit: flatMat({ vertexColors: true, roughness: 0.85 }),
    plate: flatMat({ vertexColors: true, roughness: 0.45, metalness: 0.1 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x0a1220, emissive: 0x0d4656, emissiveIntensity: 0.7, metalness: 0.55, roughness: 0.16, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ color: 0x5cf4ff, toneMapped: false }),
  };
  p.glowBase = new THREE.Color(0x5cf4ff);
  p.visorGlow = 1;

  kit(p.hips)
    .add('suit', G.box(0.38, 0.18, 0.24), C.suit, 0, 0.02, 0)
    .add('suit', G.box(0.42, 0.07, 0.27), C.suitDark, 0, 0.1, 0)
    .add('plate', G.box(0.1, 0.085, 0.03), C.plate, 0, 0.1, 0.14)
    .add('glow', G.box(0.05, 0.018, 0.01), null, 0, 0.1, 0.157)
    .add('suit', G.box(0.07, 0.11, 0.12), C.suitDark, 0.22, 0.04, -0.02)
    .add('suit', G.box(0.07, 0.11, 0.12), C.suitDark, -0.22, 0.04, -0.02)
    .add('glow', G.box(0.075, 0.012, 0.06), null, 0.22, 0.075, -0.02)
    .done();

  kit(p.torso)
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

  kit(p.antenna)
    .add('suit', G.cyl(0.022, 0.028, 0.05, 6), C.suitDark, 0, 0.025, 0)
    .add('suit', G.cyl(0.007, 0.011, 0.3, 5), C.suitDark, 0, 0.2, 0)
    .add('glow', G.sph(0.02, 6, 4), null, 0, 0.36, 0)
    .done();

  const vPhi = Math.PI / 2 - 1.2, vLen = 2.4;
  const crest = new THREE.TorusGeometry(0.192, 0.017, 4, 14, 2.15); crest.rotateZ(-0.3); crest.rotateY(Math.PI / 2);
  kit(p.head)
    .add('plate', G.sph(0.19, 12, 9), C.plate, 0, 0.15, -0.005, 0, 0, 0, 1, 1.02, 1.05)
    .add('visor', G.sph(0.198, 14, 7, vPhi, vLen, 0.98, 0.92), null, 0, 0.15, 0, 0, 0, 0, 1, 1.02, 1.05)
    .add('glow', G.sph(0.201, 14, 1, vPhi, vLen, 1.9, 0.05), null, 0, 0.15, 0, 0, 0, 0, 1, 1.02, 1.05)
    .add('plate', crest, C.orange, 0, 0.15, -0.005, 0, 0, 0, 1, 1.02, 1.05)
    .add('suit', G.cyl(0.055, 0.055, 0.06, 8), C.suitDark, 0.19, 0.13, -0.01, 0, 0, Math.PI / 2)
    .add('suit', G.cyl(0.055, 0.055, 0.06, 8), C.suitDark, -0.19, 0.13, -0.01, 0, 0, Math.PI / 2)
    .add('glow', G.cyl(0.026, 0.026, 0.01, 8), null, 0.222, 0.13, -0.01, 0, 0, Math.PI / 2)
    .add('glow', G.cyl(0.026, 0.026, 0.01, 8), null, -0.222, 0.13, -0.01, 0, 0, Math.PI / 2)
    .done();

  for (const side of [1, -1]) {
    const { sh, el } = side === 1 ? p.armL : p.armR;
    kit(sh)
      .add('suit', G.cap(0.062, 0.2), C.suit, 0, -0.15, 0)
      .add('plate', G.sph(0.115, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), C.plate, side * 0.012, -0.005, 0, 0, 0, -side * 0.22, 1.05, 0.9, 1.1)
      .add('plate', G.cyl(0.118, 0.118, 0.028, 9, true), C.orange, side * 0.016, -0.03, 0, 0, 0, -side * 0.22, 1.05, 1, 1.1)
      .done();
    const fk = kit(el)
      .add('suit', G.cap(0.055, 0.18), C.suit, 0, -0.13, 0)
      .add('plate', G.cyl(0.07, 0.062, 0.17, 6), C.plate, 0, -0.14, 0)
      .add('suit', G.ico(0.062), C.suitDark, 0, -0.3, 0, 0, 0, 0, 0.9, 1.15, 1);
    if (side === 1) fk.add('suit', G.box(0.05, 0.08, 0.1), C.suitDark, 0.07, -0.16, 0.01).add('glow', G.box(0.008, 0.055, 0.075), null, 0.097, -0.16, 0.01);
    fk.done();
  }

  for (const side of [1, -1]) {
    const { hip, knee } = side === 1 ? p.legL : p.legR;
    kit(hip)
      .add('suit', G.cap(0.08, 0.3), C.suit, 0, -0.23, 0)
      .add('plate', G.box(0.13, 0.2, 0.04), C.plate, 0, -0.2, 0.072, -0.05)
      .add('plate', G.box(0.04, 0.16, 0.1), C.plateShade, side * 0.078, -0.22, 0)
      .done();
    kit(knee)
      .add('suit', G.cap(0.068, 0.27), C.suit, 0, -0.19, 0)
      .add('plate', G.ico(0.068), C.plateShade, 0, 0.0, 0.05, 0, 0, 0, 1, 1, 0.7)
      .add('plate', G.cyl(0.08, 0.09, 0.32, 7), C.plate, 0, -0.24, 0)
      .add('suit', G.cyl(0.092, 0.092, 0.03, 7), C.suitDark, 0, -0.13, 0)
      .add('plate', G.box(0.16, 0.09, 0.27), C.plate, 0, -0.43, 0.045)
      .add('plate', G.box(0.165, 0.03, 0.06), C.orange, 0, -0.405, 0.16)
      .add('suit', G.box(0.17, 0.035, 0.29), C.suitDark, 0, -0.475, 0.045)
      .add('glow', G.box(0.176, 0.012, 0.2), null, 0, -0.468, 0.03)
      .done();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The trench-coat explorer: a slim, belted coat with split skirt panels, black sports goggles, a face covering
// (so the face is never shown), a compact pack whose emitter the carried gems orbit, and a few suit lights.
// One builder, dressed by a palette and a few style switches (see LOOKS).
function trench(p, kit, S) {
  const C = S.colors;
  p.mats = {
    cloth: flatMat({ vertexColors: true, roughness: 0.9 }),
    coat: flatMat({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    hard: flatMat({ vertexColors: true, roughness: 0.4, metalness: 0.35 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x07080a, emissive: S.lensTint, emissiveIntensity: 0.35, metalness: 0.7, roughness: 0.12, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ color: S.glow, toneMapped: false }),
  };
  p.glowBase = new THREE.Color(S.glow);
  p.visorGlow = 0.45;   // black lenses: only a faint sheen pulses with the suit lights
  const piping = S.piping;   // thin suit lights along the coat's edges

  // ---- hips: trousers, belt and buckle
  kit(p.hips)
    .add('cloth', G.box(0.36, 0.18, 0.23), C.trousers, 0, 0.02, 0)
    .add('coat', G.cyl(0.215, 0.2, 0.1, 10), C.coat, 0, 0.06, 0, 0, 0, 0, 1, 1, 0.72)
    .add('cloth', G.cyl(0.222, 0.222, 0.06, 10), C.belt, 0, 0.1, 0, 0, 0, 0, 1, 1, 0.74)
    .add('hard', G.box(0.07, 0.06, 0.02), C.buckle, 0, 0.1, 0.165)
    .add(S.buckleGlow ? 'glow' : 'hard', G.box(0.03, 0.022, 0.01), C.buckleInner, 0, 0.1, 0.176)
    // belt ends hanging from the buckle
    .add('cloth', G.box(0.04, 0.13, 0.012), C.belt, 0.05, 0.03, 0.168, 0, 0, 0.08)
    .done();

  // ---- coat skirt: four curved panels (front/back, left/right) hanging from the belt.
  // They swing with the thighs so a slim coat never swallows the legs; side and back slits open as you run.
  const L = S.coatLength, gap = 0.07;
  const panel = (side, front) => {
    const g = new THREE.Group(); g.position.y = 0.07; p.hips.add(g);
    // CylinderGeometry: theta 0 faces +z (front), +pi/2 is +x (the explorer's left)
    const t0 = front ? (side === 1 ? gap : -Math.PI / 2) : (side === 1 ? Math.PI / 2 : Math.PI + gap / 2);
    const tl = front ? Math.PI / 2 - gap : Math.PI / 2 - gap / 2;
    const k = kit(g).add('coat', G.cyl(0.215, S.coatFlare, L, 5, true, t0, tl), C.coat, 0, -L / 2, 0, 0, 0, 0, 1, 1, 0.78);
    // hem band and, on the front, the coat's edge
    k.add('coat', G.cyl(S.coatFlare + 0.004, S.coatFlare + 0.006, 0.05, 5, true, t0, tl), C.coatDark, 0, -L + 0.025, 0, 0, 0, 0, 1, 1, 0.78);
    if (piping) k.add('glow', G.cyl(S.coatFlare + 0.008, S.coatFlare + 0.008, 0.012, 5, true, t0, tl), null, 0, -L + 0.004, 0, 0, 0, 0, 1, 1, 0.78);
    k.done();
    p.skirt.push({ g, side, front });
  };
  panel(1, true); panel(-1, true); panel(1, false); panel(-1, false);

  // ---- torso: slim coat, lapels, double-breasted buttons, back yoke, raised collar, the pack
  const T = kit(p.torso)
    .add('coat', G.prism(0.305, 0.245, 0.56), C.coat, 0, 0.36, 0, 0, 0, 0, 1, 1, 0.64)
    // back storm flap (yoke) and shoulder epaulettes
    .add('coat', G.box(0.4, 0.17, 0.03), C.coatDark, 0, 0.53, -0.14, 0.12)
    .add('coat', G.box(0.09, 0.02, 0.12), C.coatDark, 0.2, 0.628, 0, 0, 0, -0.18)
    .add('coat', G.box(0.09, 0.02, 0.12), C.coatDark, -0.2, 0.628, 0, 0, 0, 0.18)
    // lapels: two flaps opening into a V
    .add('coat', G.box(0.11, 0.24, 0.02), C.coatDark, 0.07, 0.5, 0.142, -0.08, 0, -0.32)
    .add('coat', G.box(0.11, 0.24, 0.02), C.coatDark, -0.07, 0.5, 0.142, -0.08, 0, 0.32)
    .add('cloth', G.box(0.09, 0.14, 0.02), C.under, 0, 0.56, 0.128, -0.1);
  for (const y of [0.22, 0.34]) for (const x of [0.065, -0.065]) T.add('hard', G.cyl(0.014, 0.014, 0.012, 6), C.buttons, x, y, 0.15, Math.PI / 2);
  if (piping) T.add('glow', G.box(0.012, 0.24, 0.012), null, 0.112, 0.5, 0.15, -0.08, 0, -0.32).add('glow', G.box(0.012, 0.24, 0.012), null, -0.112, 0.5, 0.15, -0.08, 0, 0.32);
  // raised stand collar, open at the front
  T.add('coat', G.cyl(0.16, 0.135, 0.14, 10, true, 0.55, Math.PI * 2 - 1.1), C.coatDark, 0, 0.68, -0.01);
  // compact pack with straps, a bedroll under it, the light column and the gem emitter on top
  T.add('cloth', G.box(0.045, 0.045, 0.34), C.strap, 0.14, 0.6, -0.04)
    .add('cloth', G.box(0.045, 0.045, 0.34), C.strap, -0.14, 0.6, -0.04)
    .add('cloth', G.box(0.3, 0.38, 0.13), C.pack, 0, 0.39, -0.22)
    .add('cloth', G.box(0.26, 0.12, 0.03), C.packDark, 0, 0.29, -0.29)
    .add('hard', G.box(0.05, 0.02, 0.03), C.buckle, 0.07, 0.34, -0.3)
    .add('hard', G.box(0.05, 0.02, 0.03), C.buckle, -0.07, 0.34, -0.3)
    .add('cloth', G.box(0.1, 0.2, 0.025), C.packDark, 0, 0.47, -0.293)
    .add('glow', G.box(0.03, 0.16, 0.012), null, 0, 0.47, -0.307)
    .add('cloth', G.cyl(0.07, 0.07, 0.36, 8), C.bedroll, 0, 0.15, -0.23, 0, 0, Math.PI / 2)
    .add('cloth', G.cyl(0.074, 0.074, 0.02, 8), C.strap, 0.1, 0.15, -0.23, 0, 0, Math.PI / 2)
    .add('cloth', G.cyl(0.074, 0.074, 0.02, 8), C.strap, -0.1, 0.15, -0.23, 0, 0, Math.PI / 2)
    .add('hard', G.cyl(0.07, 0.085, 0.045, 8), C.packDark, 0, 0.6, -0.22)
    .add('glow', G.cyl(0.046, 0.046, 0.012, 8), null, 0, 0.626, -0.22)
    .done();

  if (S.antenna) {
    kit(p.antenna)
      .add('hard', G.cyl(0.02, 0.026, 0.05, 6), C.packDark, 0, 0.025, 0)
      .add('hard', G.cyl(0.006, 0.01, 0.28, 5), C.packDark, 0, 0.19, 0)
      .add('glow', G.sph(0.018, 6, 4), null, 0, 0.34, 0)
      .done();
  }

  // ---- head: covered face, hair or hood, wraparound sports goggles
  const H = kit(p.head);
  const hs = [1, 1.04, 1.05];   // the head is slightly taller and deeper than wide
  H.add('cloth', G.sph(0.18, 12, 9), C.skin, 0, 0.15, 0, 0, 0, 0, ...hs)
    // neck and the face covering (gaiter / scarf) pulled up to the nose
    .add('cloth', G.cyl(0.115, 0.12, 0.12, 9), C.mask, 0, -0.01, 0)
    .add('cloth', G.sph(0.186, 12, 6, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44), C.mask, 0, 0.15, 0.004, 0, 0, 0, ...hs);
  if (S.scarfTail) H.add('cloth', G.box(0.09, 0.26, 0.03), C.mask, -0.07, -0.08, -0.17, 0.25, 0, 0.12);
  if (S.head === 'hood') {
    // hood: a shell over the top and back, open at the face, with a peak
    H.add('coat', G.sph(0.215, 12, 8, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.66), C.coat, 0, 0.15, -0.012, 0, 0, 0, ...hs)
      .add('coat', G.sph(0.218, 12, 3, Math.PI / 2 - 1.0, 2.0, 0.16, 0.42), C.coatDark, 0, 0.15, -0.012, 0, 0, 0, ...hs);
  } else {
    // short hair on the crown and the back of the head
    H.add('cloth', G.sph(0.19, 12, 6, Math.PI / 2 + 0.7, Math.PI * 2 - 1.4, 0, Math.PI * 0.55), C.hair, 0, 0.155, -0.005, 0, 0, 0, ...hs)
      .add('cloth', G.sph(0.192, 12, 5, Math.PI / 2 - 0.8, 1.6, 0, 0.9), C.hair, 0, 0.155, 0, 0, 0, 0, ...hs);
  }
  // goggles: a black strap round the head, a frame and one wraparound shield lens bulging slightly forward,
  // with a pale glint across it; a thin light along the brow on looks with piping
  const gPhi = Math.PI / 2 - 1.05, gLen = 2.1, bulge = [1, 1.04, 1.1];
  H.add('hard', G.cyl(0.192, 0.19, 0.04, 16, true), C.goggleStrap, 0, 0.175, -0.003, -0.05, 0, 0, 1, 1, 1.07)
    .add('hard', G.sph(0.197, 22, 4, gPhi - 0.07, gLen + 0.14, 1.1, 0.46), C.goggleFrame, 0, 0.15, 0, 0, 0, 0, ...bulge)
    .add('visor', G.sph(0.202, 22, 4, gPhi, gLen, 1.14, 0.38), null, 0, 0.15, 0, 0, 0, 0, ...bulge)
    .add('hard', G.sph(0.2035, 10, 1, Math.PI / 2 - 0.62, 0.42, 1.2, 0.035), 0x8a96a6, 0, 0.15, 0, 0, 0, 0, ...bulge);
  if (piping) H.add('glow', G.sph(0.205, 16, 1, gPhi + 0.1, gLen - 0.2, 1.125, 0.022), null, 0, 0.15, 0, 0, 0, 0, ...bulge);
  H.done();

  // ---- arms: coat sleeves with cuff straps, gloves; a wrist scanner on the left
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
    if (side === 1) fk.add('hard', G.box(0.04, 0.07, 0.085), C.packDark, 0.066, -0.15, 0.01).add('glow', G.box(0.008, 0.045, 0.06), null, 0.087, -0.15, 0.01);
    fk.done();
  }

  // ---- legs: slim trousers, laced boots
  for (const side of [1, -1]) {
    const { hip, knee } = side === 1 ? p.legL : p.legR;
    kit(hip).add('cloth', G.cap(0.078, 0.3, 7), C.trousers, 0, -0.23, 0).done();
    const K = kit(knee)
      .add('cloth', G.cap(0.066, 0.27, 7), C.trousers, 0, -0.19, 0)
      .add('cloth', G.cyl(0.078, 0.086, 0.2, 8), C.boots, 0, -0.32, 0)
      .add('cloth', G.cyl(0.082, 0.082, 0.025, 8), C.bootTrim, 0, -0.22, 0)
      .add('cloth', G.box(0.15, 0.09, 0.26), C.boots, 0, -0.43, 0.045)
      .add('cloth', G.box(0.14, 0.05, 0.07), C.bootTrim, 0, -0.4, 0.15, 0.35)
      .add('hard', G.box(0.16, 0.035, 0.28), C.soles, 0, -0.475, 0.045);
    if (S.soleGlow) K.add('glow', G.box(0.166, 0.01, 0.2), null, 0, -0.47, 0.03);
    K.done();
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

const BASE = {
  trousers: 0x2a2c30, belt: 0x3a2a1d, buckle: 0xb89548, buckleInner: 0x6b5328, buttons: 0x22201c,
  under: 0x1f2226, strap: 0x3b2c20, pack: 0x30332f, packDark: 0x1d1f22, bedroll: 0xb39a6c,
  goggleStrap: 0x16171a, goggleFrame: 0x0c0d0f, gloves: 0x1a1b1e, soles: 0x17181a,
};

// The selectable looks. 'armoured' is the original explorer; the trench looks share one builder.
export const LOOKS = {
  armoured: { name: 'Armoured (current)', build: armoured },
  ranger: {
    name: 'Ranger', build: trench,
    // classic olive field coat, leather belt and boots, dark gaiter, short hair; cyan lights kept small
    style: {
      coatLength: 0.5, coatFlare: 0.255, glow: 0x5cf4ff, lensTint: 0x10161c, buckleGlow: false, piping: false, antenna: false, soleGlow: false, head: 'hair',
      colors: { ...BASE, coat: 0x56703c, coatDark: 0x3f5530, skin: 0xc48a66, hair: 0x2a1d15, mask: 0x2b2e31, boots: 0x5a3b26, bootTrim: 0x3e2919 },
    },
  },
  scout: {
    name: 'Neon Scout', build: trench,
    // darker forest-green techwear: hood up, cyan piping on the coat's edges, glowing soles and the antenna
    style: {
      coatLength: 0.52, coatFlare: 0.25, glow: 0x5cf4ff, lensTint: 0x0a2a33, buckleGlow: true, piping: true, antenna: true, soleGlow: true, head: 'hood',
      colors: { ...BASE, coat: 0x2f5741, coatDark: 0x22402f, skin: 0xb98060, hair: 0x18120e, mask: 0x1c1e21, boots: 0x1c1d20, bootTrim: 0x2c2e33, pack: 0x23262a },
    },
  },
  wayfarer: {
    name: 'Wayfarer', build: trench,
    // lighter moss coat, burnt-orange scarf with a tail (keeps the figure readable on any ground), tan boots
    style: {
      coatLength: 0.48, coatFlare: 0.26, glow: 0x5cf4ff, lensTint: 0x24120a, buckleGlow: false, piping: false, antenna: false, soleGlow: false, head: 'hair', scarfTail: true,
      colors: { ...BASE, coat: 0x6b7b45, coatDark: 0x515f33, skin: 0xd09a74, hair: 0x4a2f1c, mask: 0xd2592a, boots: 0x8a6440, bootTrim: 0x5e4129, belt: 0x5a3b26, strap: 0x5a3b26 },
    },
  },
};
export const DEFAULT_LOOK = 'armoured';

export function buildExplorer(p, lookId = DEFAULT_LOOK) {
  const look = LOOKS[lookId] ?? LOOKS[DEFAULT_LOOK];
  rig(p);
  look.build(p, kitFor(p), look.style);
}
