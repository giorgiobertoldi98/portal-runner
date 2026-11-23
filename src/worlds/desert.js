// World 2 — Sands of the Pharaohs: golden-hour dunes, three great pyramids and a sphinx, a temple with painted
// walls and seated colossi, an oasis village, a bedouin camp, sandstone mesas, a buried pharaoh head, vultures
// and dust devils. Monster: the Giant Scarab.
import * as THREE from 'three';
import { mulberry32, createNoise2D, fbm, ridged } from '../engine/noise.js';
import { createTerrain, gridHeight, withFlats, edgeFactor, slopeAt } from '../engine/terrain.js';
import { createSky, createLighting, createHorizonRing, createParticles, skyFollower } from '../engine/environment.js';
import { archShape } from '../engine/shapes.js';
import { smoothstep, clamp, mergeParts, m4, instanced, flatMat, scatterPoints, fogColor, softTexture } from '../engine/utils.js';
import { swayMat, canvasTexture, createFire, createLayout, tickShared } from '../engine/props.js';

const TERRAIN_SIZE = 1100; // metres across the ground mesh (also used by gridHeight)

const R = 270;
const PORTAL_SPOTS = [{ x: -205, z: -140 }, { x: 185, z: 165 }, { x: -60, z: 235 }];
const PYRAMIDS = [
  { x: 70, z: -75, s: 92, h: 64 },
  { x: 165, z: -5, s: 64, h: 44 },
  { x: 130, z: -160, s: 48, h: 33 },
];
const PLATEAU = { x: 115, z: -75, r: 120 };
const OASIS = { x: -110, z: 95, r: 22 };
const RUINS = { x: -70, z: -75 };
const HORIZON = 0xf4d3a2;

const theme = {
  glow: 0xffb340, colA: 0x7a2e05, colB: 0xf08a1c, colC: 0xfff0b8, stone: 0xd2b07a, css: '#ffc35c', hum: 110,
};

const gold = () => new THREE.MeshStandardMaterial({ color: 0xf0bd4f, emissive: 0x8a5200, emissiveIntensity: 0.55, metalness: 0.35, roughness: 0.35, flatShading: true });

function createPortalFrame({ W, H }) {
  const g = new THREE.Group();
  const stone = flatMat({ color: 0xdcbc82 });
  const stoneDark = flatMat({ color: 0xb8945e });
  const goldM = gold();
  // wall with an arch-shaped opening
  const outer = new THREE.Shape();
  const ow = W / 2 + 0.6, oh = H + 0.6;
  outer.moveTo(-ow, 0); outer.lineTo(ow, 0); outer.lineTo(ow, oh); outer.lineTo(-ow, oh); outer.lineTo(-ow, 0);
  outer.holes.push(archShape(W, H, 0.05));
  const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 1.2, bevelEnabled: false }), stone);
  wall.position.z = -0.6;
  g.add(wall);
  // tapered pylons
  for (const s of [-1, 1]) {
    const py = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.45, H + 1.6, 4), stoneDark);
    py.rotation.y = Math.PI / 4; py.position.set(s * (W / 2 + 1.25), (H + 1.6) / 2, 0);
    g.add(py);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 2.1), goldM);
    band.position.set(s * (W / 2 + 1.25), H * 0.72, 0);
    g.add(band);
  }
  // lintel + cornice
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(W + 5.2, 1.1, 2.0), stone);
  lintel.position.y = H + 1.15; g.add(lintel);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(W + 5.8, 0.4, 2.4), stoneDark);
  cornice.position.y = H + 1.9; g.add(cornice);
  const goldBand = new THREE.Mesh(new THREE.BoxGeometry(W + 5.25, 0.22, 2.05), goldM);
  goldBand.position.y = H + 0.75; g.add(goldBand);
  // winged sun disc
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.25, 16), goldM);
  disc.rotation.x = Math.PI / 2; disc.position.set(0, H + 1.2, 1.1); g.add(disc);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4 - k * 0.5, 0.18, 0.1), goldM);
      wing.position.set(s * (1.9 - k * 0.15), H + 1.35 - k * 0.22, 1.05);
      wing.rotation.z = s * (0.12 + k * 0.05);
      g.add(wing);
    }
  }
  return g;
}

function createScarab() {
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 1.05; root.add(body);
  const shell = new THREE.MeshStandardMaterial({ color: 0x1e4a45, emissive: 0x06201c, metalness: 0.3, roughness: 0.3, flatShading: true });
  const dark = flatMat({ color: 0x1b1510 });
  const goldM = gold();
  const eye = new THREE.MeshBasicMaterial({ color: 0xffa31a, toneMapped: false });
  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };

  for (const s of [-1, 1]) { // two wing cases
    const half = mesh(new THREE.SphereGeometry(1.5, 10, 6, s > 0 ? 0 : Math.PI, Math.PI, 0, Math.PI / 2), shell, 0, 0.1, -0.1);
    half.scale.set(1.05, 0.85, 1.5); body.add(half);
  }
  const seam = mesh(new THREE.BoxGeometry(0.12, 0.12, 4.2), goldM, 0, 1.35, -0.1); seam.rotation.x = 0.05; body.add(seam);
  for (const s of [-1, 1]) {
    const stripe = mesh(new THREE.BoxGeometry(0.1, 0.06, 3.4), goldM, s * 0.75, 1.15, -0.1);
    stripe.rotation.z = s * 0.55; body.add(stripe);
  }
  const belly = mesh(new THREE.SphereGeometry(1.4, 10, 6), dark, 0, 0.05, -0.1); belly.scale.set(1, 0.3, 1.45); body.add(belly);
  const thorax = mesh(new THREE.SphereGeometry(0.95, 10, 6), shell, 0, 0.25, 1.7); thorax.scale.set(1.15, 0.6, 0.7); body.add(thorax);
  const head = new THREE.Group(); head.position.set(0, 0.2, 2.45); body.add(head);
  const hm = mesh(new THREE.SphereGeometry(0.62, 10, 6), dark, 0, 0, 0); hm.scale.set(1.1, 0.65, 0.8); head.add(hm);
  const fan = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.1, 7, 1, false, -Math.PI / 2, Math.PI), goldM, 0, 0.18, 0.25);
  head.add(fan);
  head.add(mesh(new THREE.IcosahedronGeometry(0.12, 0), eye, -0.42, 0.12, 0.3));
  head.add(mesh(new THREE.IcosahedronGeometry(0.12, 0), eye, 0.42, 0.12, 0.3));
  const mand = [];
  for (const s of [-1, 1]) {
    const mg = new THREE.Group(); mg.position.set(s * 0.3, -0.1, 0.45); head.add(mg);
    const m = mesh(new THREE.ConeGeometry(0.12, 0.8, 4), goldM, 0, 0, 0.35); m.rotation.set(Math.PI / 2, 0, 0); mg.add(m);
    mand.push(mg);
  }
  const legs = [];
  [1.3, 0.1, -1.2].forEach((z, i) => {
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 1.1, -0.05, z); body.add(hip);
      const femur = new THREE.Group(); femur.rotation.z = s * 0.7; hip.add(femur);
      const fm = mesh(new THREE.CylinderGeometry(0.17, 0.22, 1.25, 5), dark, s * 0.62, 0, 0);
      fm.rotation.z = Math.PI / 2; femur.add(fm);
      const knee = new THREE.Group(); knee.position.x = s * 1.25; femur.add(knee);
      const tib = mesh(new THREE.CylinderGeometry(0.09, 0.17, 2.0, 5), dark, 0, -1.0, 0);
      knee.rotation.z = -s * 0.25;
      knee.add(tib);
      legs.push({ hip, group: (i + (s > 0 ? 0 : 1)) % 2, s });
    }
  });
  let ph = 0;
  return {
    object: root, radius: 1.9, hover: 0,
    animate(dt, speed, t) {
      ph += dt * (2.2 + speed * 0.75) * Math.PI * 2 * 0.5;
      for (const L of legs) { // tripod gait
        const off = L.group ? Math.PI : 0;
        L.hip.rotation.y = Math.sin(ph + off) * 0.45;
        L.hip.rotation.z = L.s * Math.max(0, Math.cos(ph + off)) * 0.35;
      }
      body.position.y = 1.05 + Math.abs(Math.sin(ph)) * 0.08;
      body.rotation.z = Math.sin(ph) * 0.04;
      mand[0].rotation.y = 0.3 + Math.sin(t * 9) * 0.25;
      mand[1].rotation.y = -0.3 - Math.sin(t * 9) * 0.25;
    },
  };
}


// ── Landmarks ──────────────────────────────────────────────────────────────
const SPHINX = { x: -6, z: -40 };        // great sphinx, facing west toward the ruins
const CAMP = { x: 100, z: 112 };        // bedouin camp with camels
const MESAS = { x: -170, z: -20 };      // sandstone mesas and a natural arch
const HEAD = { x: 40, z: 150 };         // giant half-buried pharaoh head
const PYLON = { x: RUINS.x + 24, z: RUINS.z }; // temple gateway

function glyphTexture(seed = 1) {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = '#d9bd86'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,80,30,${r() * 0.08})`; g.fillRect(r() * w, r() * h, 2 + r() * 14, 2 + r() * 6); }
    const ink = '#4a3018', paint = ['#2f6f8f', '#a8402a', '#3f7d4a', '#c9922a'];
    g.strokeStyle = ink; g.lineWidth = 3;
    const cols = 6, cw = w / cols;
    for (let c = 0; c <= cols; c++) { g.beginPath(); g.moveTo(c * cw, 0); g.lineTo(c * cw, h); g.stroke(); }
    for (let c = 0; c < cols; c++) {
      let y = 14;
      while (y < h - 40) {
        const cx = c * cw + cw / 2, k = Math.floor(r() * 9), sz = 24 + r() * 10;
        g.fillStyle = r() < 0.35 ? paint[Math.floor(r() * 4)] : ink;
        g.strokeStyle = ink; g.lineWidth = 3;
        g.beginPath();
        if (k === 0) { g.ellipse(cx, y + sz / 2, sz / 2, sz / 4, 0, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, y + sz / 2, sz / 7, 0, 7); g.fill(); }
        else if (k === 1) { g.arc(cx, y + sz / 4, sz / 4, 0, 7); g.stroke(); g.fillRect(cx - 2, y + sz / 2, 4, sz / 2); g.fillRect(cx - sz / 3, y + sz / 2, sz / 1.5, 4); }
        else if (k === 2) { for (let i = 0; i < 3; i++) { g.moveTo(cx - sz / 2, y + 6 + i * 8); for (let j = 0; j < 4; j++) g.lineTo(cx - sz / 2 + (j + 0.5) * sz / 4, y + (j % 2 ? 6 : 1) + i * 8 + 3); } g.stroke(); }
        else if (k === 3) { g.moveTo(cx - sz / 2, y + sz); g.quadraticCurveTo(cx - sz / 3, y, cx + sz / 4, y + sz / 4); g.lineTo(cx + sz / 2, y + sz / 3); g.lineTo(cx + sz / 6, y + sz / 2); g.lineTo(cx + sz / 4, y + sz); g.closePath(); g.fill(); }
        else if (k === 4) { g.arc(cx, y + sz / 5, sz / 5, 0, 7); g.fill(); g.fillRect(cx - sz / 5, y + sz / 2.5, sz / 2.5, sz / 2); }
        else if (k === 5) { g.roundRect(cx - sz / 2.6, y, sz / 1.3, sz * 1.6, 10); g.stroke(); for (let i = 0; i < 3; i++) { g.fillRect(cx - 6, y + 8 + i * 12, 12, 5); } y += sz * 0.7; }
        else if (k === 6) { g.moveTo(cx - sz / 2, y + sz / 2); g.lineTo(cx + sz / 2, y + sz / 2); g.moveTo(cx, y); g.lineTo(cx, y + sz); g.stroke(); }
        else if (k === 7) { g.arc(cx, y + sz / 2, sz / 2.4, Math.PI, 0); g.closePath(); g.fill(); }
        else { g.moveTo(cx, y); g.lineTo(cx + sz / 2, y + sz); g.lineTo(cx - sz / 2, y + sz); g.closePath(); g.stroke(); }
        y += sz + 12;
      }
    }
  });
}

function rugTexture(seed) {
  return canvasTexture(128, 256, (g, w, h) => {
    const r = mulberry32(seed);
    const pal = ['#8e2a1e', '#c9922a', '#2a3f6b', '#e8d3a8', '#3c2418', '#a64a2a'];
    let y = 0;
    while (y < h) { const s = 6 + Math.floor(r() * 26); g.fillStyle = pal[Math.floor(r() * pal.length)]; g.fillRect(0, y, w, s); if (r() < 0.4) { g.fillStyle = pal[Math.floor(r() * pal.length)]; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, y + s / 2); g.lineTo(x + 8, y); g.lineTo(x + 16, y + s / 2); g.lineTo(x + 8, y + s); g.fill(); } } y += s; }
  });
}

function createCamel(kneeling = false) {
  const tan = 0xc79a5e, dark = 0x9a6e3e;
  const parts = [];
  const legY = kneeling ? 0 : 1.6;
  parts.push({ geo: new THREE.IcosahedronGeometry(1, 1), color: tan, matrix: m4(0, legY + 0.9, 0, 0, 0, 0, 0.8, 0.75, 1.5) });
  parts.push({ geo: new THREE.IcosahedronGeometry(0.75, 1), color: tan, matrix: m4(0, legY + 1.55, -0.1, 0, 0, 0, 0.9, 0.95, 1) });
  parts.push({ geo: new THREE.BoxGeometry(1.2, 0.18, 1.0), color: 0x8e2a1e, matrix: m4(0, legY + 1.62, 0.75) });
  parts.push({ geo: new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6), color: tan, matrix: m4(0, legY + 1.7, 1.75, 0.7, 0, 0) });
  parts.push({ geo: new THREE.BoxGeometry(0.4, 0.42, 0.95), color: tan, matrix: m4(0, legY + 2.45, 2.35, 0.15, 0, 0) });
  parts.push({ geo: new THREE.BoxGeometry(0.3, 0.3, 0.3), color: dark, matrix: m4(0, legY + 2.35, 2.8) });
  for (const s of [-1, 1]) parts.push({ geo: new THREE.ConeGeometry(0.07, 0.22, 4), color: dark, matrix: m4(s * 0.15, legY + 2.75, 2.1) });
  parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.08, 0.9, 4), color: dark, matrix: m4(0, legY + 0.7, -1.45, -0.4, 0, 0) });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (kneeling) parts.push({ geo: new THREE.BoxGeometry(0.3, 0.3, 1.2), color: dark, matrix: m4(sx * 0.6, 0.15, sz * 0.9) });
    else parts.push({ geo: new THREE.CylinderGeometry(0.12, 0.16, 2.0, 5), color: sz > 0 ? tan : dark, matrix: m4(sx * 0.45, 1.0, sz * 0.95) });
  }
  return mergeParts(parts);
}

function createSphinxGeo() {
  const st = 0xd9b77a, sh = 0xc4a066, stripe = 0x2f5f8f;
  const p = [];
  // facing -x: body along x, head at -x
  p.push({ geo: new THREE.BoxGeometry(16, 5.5, 7), color: st, matrix: m4(3, 2.75, 0) });
  p.push({ geo: new THREE.BoxGeometry(6, 6.8, 7.2), color: sh, matrix: m4(9.5, 3.4, 0) });
  for (const s of [-1, 1]) {
    p.push({ geo: new THREE.BoxGeometry(9, 1.8, 2.0), color: st, matrix: m4(-8, 0.9, s * 2.4) });
    p.push({ geo: new THREE.BoxGeometry(5, 3.4, 2.4), color: sh, matrix: m4(-3, 1.7, s * 2.7) });
    p.push({ geo: new THREE.BoxGeometry(5, 1.4, 2.2), color: st, matrix: m4(10, 0.7, s * 3.8) });
  }
  p.push({ geo: new THREE.BoxGeometry(4.5, 4, 5), color: st, matrix: m4(-4, 6.2, 0) });           // chest/neck
  const nemes = new THREE.CylinderGeometry(2.4, 3.8, 6.2, 4); nemes.rotateY(Math.PI / 4);
  p.push({ geo: nemes, color: 0xe0c48a, matrix: m4(-4.4, 9.4, 0, 0, 0, 0, 0.8, 1, 1) });
  for (let i = 0; i < 4; i++) p.push({ geo: new THREE.BoxGeometry(3.4 - i * 0.25, 0.35, 0.1), color: stripe, matrix: m4(-3.9, 7.4 + i * 1.3, 2.5 + i * 0.03) }),
    p.push({ geo: new THREE.BoxGeometry(3.4 - i * 0.25, 0.35, 0.1), color: stripe, matrix: m4(-3.9, 7.4 + i * 1.3, -2.5 - i * 0.03) });
  p.push({ geo: new THREE.BoxGeometry(2.0, 3.6, 3.0), color: 0xe3c58d, matrix: m4(-6.2, 9.6, 0) });          // face
  p.push({ geo: new THREE.BoxGeometry(0.8, 1.2, 0.8), color: 0xcfae74, matrix: m4(-7.4, 9.5, 0) });          // nose
  for (const s of [-1, 1]) p.push({ geo: new THREE.BoxGeometry(0.2, 0.35, 0.8), color: 0x3a2814, matrix: m4(-7.25, 10.4, s * 0.75) });
  p.push({ geo: new THREE.BoxGeometry(0.6, 1.6, 0.8), color: 0xc9a670, matrix: m4(-6.6, 7.2, 0) });          // beard
  p.push({ geo: new THREE.CylinderGeometry(0.4, 0.25, 1.2, 6), color: 0xf2c252, matrix: m4(-6.6, 12.3, 0) }); // uraeus
  p.push({ geo: new THREE.CylinderGeometry(0.5, 0.8, 5, 6), color: sh, matrix: m4(13.5, 1.5, 0, 0, 0, -1.2) }); // tail
  return mergeParts(p);
}

function createColossus() {
  const st = 0xd2b07a, sh = 0xb8945e, gold = 0xf2c252, blue = 0x2f5f8f;
  const p = [
    { geo: new THREE.BoxGeometry(5, 4.5, 5), color: sh, matrix: m4(-0.5, 2.25, 0) },                 // throne
    { geo: new THREE.BoxGeometry(1.4, 7.5, 5.2), color: sh, matrix: m4(-2.6, 3.75, 0) },              // backrest
    { geo: new THREE.BoxGeometry(3.6, 1.4, 1.3), color: st, matrix: m4(1.1, 5.0, 0.8) },              // thighs
    { geo: new THREE.BoxGeometry(3.6, 1.4, 1.3), color: st, matrix: m4(1.1, 5.0, -0.8) },
    { geo: new THREE.BoxGeometry(1.2, 4.6, 1.2), color: st, matrix: m4(2.6, 2.3, 0.8) },              // shins
    { geo: new THREE.BoxGeometry(1.2, 4.6, 1.2), color: st, matrix: m4(2.6, 2.3, -0.8) },
    { geo: new THREE.BoxGeometry(2.0, 0.6, 1.3), color: st, matrix: m4(3.1, 0.3, 0.8) },
    { geo: new THREE.BoxGeometry(2.0, 0.6, 1.3), color: st, matrix: m4(3.1, 0.3, -0.8) },
    { geo: new THREE.BoxGeometry(2.2, 4.8, 3.4), color: st, matrix: m4(-0.8, 8.1, 0) },               // torso
    { geo: new THREE.BoxGeometry(0.25, 1.6, 3.2), color: blue, matrix: m4(0.35, 9.4, 0) },            // collar
    { geo: new THREE.BoxGeometry(3.0, 0.9, 0.9), color: st, matrix: m4(0.6, 6.0, 1.3) },              // forearms on knees
    { geo: new THREE.BoxGeometry(3.0, 0.9, 0.9), color: st, matrix: m4(0.6, 6.0, -1.3) },
    { geo: (() => { const g = new THREE.CylinderGeometry(1.0, 1.7, 2.6, 4); g.rotateY(Math.PI / 4); return g; })(), color: 0xe0c48a, matrix: m4(-0.8, 11.5, 0, 0, 0, 0, 0.9, 1, 1.25) },
    { geo: new THREE.BoxGeometry(1.0, 1.7, 1.5), color: 0xe3c58d, matrix: m4(0.2, 11.6, 0) },         // face
    { geo: new THREE.CylinderGeometry(0.5, 0.9, 2.2, 8), color: 0xf0e6d0, matrix: m4(-0.8, 13.6, 0) }, // white crown
    { geo: new THREE.IcosahedronGeometry(0.45, 0), color: 0xf0e6d0, matrix: m4(-0.8, 14.8, 0) },
    { geo: new THREE.BoxGeometry(0.35, 0.9, 0.5), color: gold, matrix: m4(0.6, 10.3, 0) },            // beard
  ];
  return mergeParts(p);
}

function build({ quality }) {
  const density = quality.density;
  const rng = mulberry32(4242);
  const n1 = createNoise2D(rng), n2 = createNoise2D(rng), n3 = createNoise2D(rng), n4 = createNoise2D(rng), n5 = createNoise2D(rng);

  const dune = (x, z) => {
    const u = x * 0.007 + n2(x * 0.002, z * 0.002) * 0.9;
    const v = z * 0.0032;
    const d = 1 - Math.abs(n1(u, v));
    return d * d * 15 + fbm(n3, x * 0.02, z * 0.02, 2) * 1.2;
  };
  const oasisLevel = dune(OASIS.x, OASIS.z) - 2.5;
  const base = (x, z) => {
    let h = dune(x, z);
    const dp = Math.hypot(x - PLATEAU.x, z - PLATEAU.z);
    const pm = 1 - smoothstep(PLATEAU.r * 0.55, PLATEAU.r, dp);
    h = h * (1 - pm) + (2 + fbm(n3, x * 0.03, z * 0.03, 2) * 0.4) * pm;
    const dr = Math.hypot(x - RUINS.x, z - RUINS.z);
    const rm = 1 - smoothstep(32, 62, dr);
    h = h * (1 - rm) + 3 * rm;
    const doa = Math.hypot(x - OASIS.x, z - OASIS.z);
    const om = 1 - smoothstep(OASIS.r * 0.9, OASIS.r * 2.2, doa);
    h = h * (1 - om) + oasisLevel * om;
    const dm = Math.hypot(x - MESAS.x, z - MESAS.z);
    h += (1 - smoothstep(10, 55, dm)) * 3 + ridged(n5, x * 0.03, z * 0.03, 2) * (1 - smoothstep(20, 60, dm)) * 2;
    h += edgeFactor(x, z, R, 160) * 75 * (0.7 + 0.5 * (1 - Math.abs(n4(x * 0.006, z * 0.006))));
    return h;
  };
  const smoothHeight = withFlats(base, [
    ...PORTAL_SPOTS,
    { x: SPHINX.x, z: SPHINX.z, inner: 26, outer: 42 },
    { x: CAMP.x, z: CAMP.z, inner: 16, outer: 32 },
    { x: HEAD.x, z: HEAD.z, inner: 16, outer: 34 },
    { x: (RUINS.x + SPHINX.x) / 2, z: (RUINS.z + SPHINX.z) / 2, inner: 16, outer: 30 },
  ]);
  const heightAt = gridHeight(smoothHeight, TERRAIN_SIZE, quality.terrainSegments); // the ground exactly as drawn
  const inOasis = (x, z) => Math.hypot(x - OASIS.x, z - OASIS.z) < OASIS.r + 2;
  const hy = (x, z) => heightAt(x, z);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(fogColor(HORIZON), 40, 440);
  scene.background = new THREE.Color(HORIZON);

  const sand = new THREE.Color(0xe6bb72), sandDark = new THREE.Color(0xc48a45), sandLight = new THREE.Color(0xf5d9a0), grass = new THREE.Color(0x6f9a3a), paving = new THREE.Color(0xd6bd8c);
  const redRock = new THREE.Color(0xb86a3c), mud = new THREE.Color(0x9a7a4a);
  const terrain = createTerrain({
    size: TERRAIN_SIZE, segments: quality.terrainSegments, heightAt,
    colorAt(c, x, z, h, slope) {
      c.copy(sand);
      c.lerp(sandLight, smoothstep(6, 14, h) * 0.7);
      c.lerp(sandDark, smoothstep(0.15, 0.45, slope) * 0.55 + (0.5 + 0.5 * n4(x * 0.05, z * 0.05)) * 0.12);
      const dm = Math.hypot(x - MESAS.x, z - MESAS.z);
      c.lerp(redRock, (1 - smoothstep(25, 70, dm)) * 0.55);
      const doa = Math.hypot(x - OASIS.x, z - OASIS.z);
      c.lerp(mud, 1 - smoothstep(OASIS.r * 1.6, OASIS.r * 2.6, doa));
      c.lerp(grass, (1 - smoothstep(OASIS.r + 2, OASIS.r * 2, doa)) * (0.75 + 0.25 * n5(x * 0.2, z * 0.2)));
      const dr = Math.hypot(x - RUINS.x, z - RUINS.z);
      c.lerp(paving, (1 - smoothstep(18, 30, dr)) * 0.8);
      // processional way between the ruins and the sphinx
      const ax = RUINS.x + 24, az = RUINS.z, bx = SPHINX.x - 18, bz = SPHINX.z;
      const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2), 0, 1);
      const pd = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
      c.lerp(paving, (1 - smoothstep(3, 5, pd)) * 0.7);
    },
  });
  scene.add(terrain);

  const inPyramid = (x, z, pad) => PYRAMIDS.some((p) => Math.abs(x - p.x) < p.s / 2 + pad && Math.abs(z - p.z) < p.s / 2 + pad);
  const L = createLayout({ heightAt, portalSpots: PORTAL_SPOTS, blocked: (x, z) => inOasis(x, z) || inPyramid(x, z, 3) });
  const colliders = L.colliders;
  L.reserve(SPHINX.x, SPHINX.z, 26); L.reserve(CAMP.x, CAMP.z, 20); L.reserve(MESAS.x, MESAS.z, 40); L.reserve(HEAD.x, HEAD.z, 18);
  L.reserve(RUINS.x, RUINS.z, 30); L.reserve(OASIS.x, OASIS.z, OASIS.r + 18);
  const propMat = flatMat({ vertexColors: true });
  const white = flatMat({ color: 0xffffff });
  const animated = [];
  const add = (o) => { scene.add(o); return o; };
  const solid = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; return add(m); };

  // ── pyramids ──
  const pyrMat = flatMat({ color: 0xdcb878 });
  const goldM = gold();
  for (const p of PYRAMIDS) {
    const geo = new THREE.ConeGeometry(p.s / Math.SQRT2, p.h, 4, 6);
    geo.rotateY(Math.PI / 4);
    const y = hy(p.x, p.z) - 1.5;
    solid(geo, pyrMat, p.x, y + p.h / 2, p.z);
    const capH = p.h * 0.1;
    const capGeo = new THREE.ConeGeometry((p.s / Math.SQRT2) * 0.1, capH, 4); capGeo.rotateY(Math.PI / 4);
    solid(capGeo, goldM, p.x, y + p.h - capH / 2 + 0.05, p.z);
    // a dark entrance and a little rubble at the foot of each face
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), new THREE.MeshBasicMaterial({ color: 0x2a1c10 }));
    const yd = 2.2, half = p.s / 2;
    door.position.set(p.x - half * (1 - (yd + 1.5) / p.h) - 0.08, y + 1.5 + yd, p.z);
    const nrm = new THREE.Vector3(-p.h, half, 0).normalize();
    door.lookAt(door.position.clone().add(nrm));
    add(door);
    L.add({ type: 'box', x: p.x, z: p.z, hx: p.s / 2 * 0.98, hz: p.s / 2 * 0.98 });
  }
  // small queens' pyramids
  const small = [{ x: 30, z: -145, s: 16 }, { x: 48, z: -150, s: 13 }, { x: 196, z: -60, s: 14 }];
  for (const p of small) {
    const geo = new THREE.ConeGeometry(p.s / Math.SQRT2, p.s * 0.7, 4, 2); geo.rotateY(Math.PI / 4);
    solid(geo, pyrMat, p.x, hy(p.x, p.z) - 0.5 + p.s * 0.35, p.z);
    L.add({ type: 'box', x: p.x, z: p.z, hx: p.s / 2, hz: p.s / 2 });
  }

  // ── the great sphinx ──
  solid(createSphinxGeo(), propMat, SPHINX.x, hy(SPHINX.x, SPHINX.z) - 0.3, SPHINX.z).scale.setScalar(1.35);
  L.add({ type: 'box', x: SPHINX.x + 4, z: SPHINX.z, hx: 15.1, hz: 6.2 });
  L.add({ type: 'box', x: SPHINX.x - 10.8, z: SPHINX.z, hx: 6.2, hz: 4.9 });

  // ── avenue of small sphinxes from the temple gate to the great sphinx ──
  {
    const mini = createSphinxGeo();
    const ax = PYLON.x + 7, az = PYLON.z, bx = SPHINX.x - 26, bz = SPHINX.z;
    const len = Math.hypot(bx - ax, bz - az), dirx = (bx - ax) / len, dirz = (bz - az) / len;
    const yaw = Math.atan2(-dirz, dirx);
    const items = [], peds = [];
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
      const t = (i + 0.5) / 7;
      const x = ax + dirx * len * t - dirz * s * 5.5, z = az + dirz * len * t + dirx * s * 5.5;
      const y = hy(x, z);
      peds.push({ x, y: y + 0.5, z, sx: 2.2, sy: 1, sz: 4.8, ry: yaw });
      items.push({ x, y: y + 1, z, s: 0.17, ry: yaw + (s > 0 ? -Math.PI / 2 : Math.PI / 2) });
      L.add({ x, z, r: 1.9 });
    }
    add(instanced(new THREE.BoxGeometry(1, 1, 1), flatMat({ color: 0xc4a066 }), peds));
    add(instanced(mini, propMat, items));
  }

  // ── obelisks ──
  const obGeo = mergeParts([
    { geo: new THREE.BoxGeometry(2.2, 0.8, 2.2), color: 0xb8945e, matrix: m4(0, 0.4, 0) },
    { geo: (() => { const g = new THREE.CylinderGeometry(0.55, 0.85, 11, 4); g.rotateY(Math.PI / 4); return g; })(), color: 0xd8b77c, matrix: m4(0, 6.3, 0) },
    { geo: (() => { const g = new THREE.ConeGeometry(0.78, 1.3, 4); g.rotateY(Math.PI / 4); return g; })(), color: 0xf2c252, matrix: m4(0, 12.45, 0) },
  ]);
  const obelisks = [];
  for (const p of [{ x: PYLON.x + 6, z: PYLON.z - 9 }, { x: PYLON.x + 6, z: PYLON.z + 9 }, { x: -100, z: -70 }, { x: 205, z: -80 }, { x: 60, z: 40 }, { x: -150, z: 60 }, { x: -75, z: 130 }, { x: -20, z: 60 }]) {
    obelisks.push({ x: p.x, y: hy(p.x, p.z) - 0.2, z: p.z, ry: 0.1, s: 1 });
    L.add({ x: p.x, z: p.z, r: 1.4 });
  }
  add(instanced(obGeo, propMat, obelisks));

  // ── temple: columns, glyph walls, pylon gateway, seated colossi ──
  {
    const colGeo = mergeParts([
      { geo: new THREE.CylinderGeometry(0.9, 1.0, 1, 10), color: 0xd9c08e, matrix: m4(0, 0.5, 0) },
      { geo: new THREE.CylinderGeometry(1.02, 1.02, 0.06, 10), color: 0x2f5f8f, matrix: m4(0, 0.82, 0) },
      { geo: new THREE.CylinderGeometry(1.02, 1.02, 0.04, 10), color: 0xa8402a, matrix: m4(0, 0.86, 0) },
    ]);
    const capGeo = mergeParts([{ geo: new THREE.BoxGeometry(2.4, 0.6, 2.4), color: 0xc9a670 }, { geo: new THREE.CylinderGeometry(1.25, 0.9, 0.7, 10), color: 0x6f9a5a, matrix: m4(0, -0.6, 0) }]);
    const cols = [], caps = [], fallen = [];
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 6; k++) {
        const x = RUINS.x - 15 + k * 6, z = RUINS.z - 7 + i * 14;
        const broken = rng() < 0.35;
        const h = broken ? 2 + rng() * 4 : 9;
        const y = hy(x, z) - 0.2;
        cols.push({ x, y, z, sx: 1, sy: h, sz: 1, ry: rng() });
        if (!broken) caps.push({ x, y: y + h + 0.3, z, s: 1, ry: 0 });
        L.add({ x, z, r: 1.2 });
        if (broken && rng() < 0.6) {
          const fx = x + (rng() - 0.5) * 8, fz = z + (i ? 4 : -4) + (rng() - 0.5) * 3;
          fallen.push({ x: fx, y: hy(fx, fz) + 0.7, z: fz, sx: 0.85, sy: 3 + rng() * 3, sz: 0.85, rz: Math.PI / 2, ry: rng() * 3 });
          L.add({ x: fx, z: fz, r: 1.6 });
        }
      }
    }
    // architraves over pairs of standing columns
    const beams = [];
    for (let k = 0; k < 5; k++) for (let i = 0; i < 2; i++) {
      const z = RUINS.z - 7 + i * 14; const x = RUINS.x - 12 + k * 6;
      const a = caps.find((c) => Math.abs(c.x - (x - 3)) < 0.1 && Math.abs(c.z - z) < 0.1), b = caps.find((c) => Math.abs(c.x - (x + 3)) < 0.1 && Math.abs(c.z - z) < 0.1);
      if (a && b) beams.push({ x, y: a.y + 0.9, z, sx: 6.6, sy: 1.1, sz: 2.2 });
    }
    add(instanced(colGeo, propMat, [...cols, ...fallen]));
    add(instanced(capGeo, propMat, caps));
    add(instanced(new THREE.BoxGeometry(1, 1, 1), flatMat({ color: 0xcfb07a }), beams));
    // enclosure walls with painted hieroglyphs (broken into segments)
    const gl = new THREE.MeshStandardMaterial({ map: glyphTexture(7), roughness: 0.95, flatShading: true });
    const wallMat = flatMat({ color: 0xcdb07c });
    for (const side of [-1, 1]) {
      const z = RUINS.z + side * 13;
      [[-24, 9, 4.2], [-11, 7, 3.0], [0, 10, 4.6], [13, 5, 2.2]].forEach(([dx, len, h], i) => {
        const x = RUINS.x + dx + len / 2;
        solid(new THREE.BoxGeometry(len, h, 1.4), wallMat, x, hy(x, z) + h / 2 - 0.2, z);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.2, h - 0.4), gl);
        face.position.set(x, hy(x, z) + h / 2 - 0.2, z - side * 0.72);
        face.rotation.y = side > 0 ? Math.PI : 0;
        add(face);
        L.add({ type: 'box', x, z, hx: len / 2, hz: 0.7 });
      });
    }
    // pylon gateway with glyph faces
    const gl2 = new THREE.MeshStandardMaterial({ map: glyphTexture(19), roughness: 0.95 });
    for (const s of [-1, 1]) {
      const z = PYLON.z + s * 6.3;
      const tower = new THREE.CylinderGeometry(3.6, 5.4, 14, 4); tower.rotateY(Math.PI / 4);
      const m = solid(tower, flatMat({ color: 0xd2b07a }), PYLON.x, hy(PYLON.x, z) + 6.8, z); m.scale.set(0.55, 1, 1);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 10), gl2);
      face.position.set(PYLON.x + 2.45, hy(PYLON.x, z) + 6, z); face.rotation.y = Math.PI / 2; face.rotation.x = 0; face.rotateX(-0.08);
      add(face);
      L.add({ type: 'box', x: PYLON.x, z, hx: 2.8, hz: 3.8 });
    }
    solid(new THREE.BoxGeometry(3.4, 1.4, 5.2), flatMat({ color: 0xc9a670 }), PYLON.x, hy(PYLON.x, PYLON.z) + 9.6, PYLON.z - 1.2).rotation.x = 0.12;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.25, 16), goldM); disc.rotation.z = Math.PI / 2; disc.position.set(PYLON.x + 1.8, hy(PYLON.x, PYLON.z) + 9.6, PYLON.z - 1.2); add(disc);
    // seated colossi flanking the gate
    const col = createColossus();
    for (const s of [-1, 1]) {
      const x = PYLON.x + 9, z = PYLON.z + s * 12.5;
      solid(col, propMat, x, hy(x, z) - 0.1, z);
      L.add({ type: 'box', x: x - 0.3, z, hx: 3, hz: 2.7 });
    }
    // pottery, braziers and scattered blocks around the temple
    const braziers = [[PYLON.x + 4, PYLON.z - 3.2], [PYLON.x + 4, PYLON.z + 3.2], [RUINS.x - 18, RUINS.z]];
    const bGeo = mergeParts([
      { geo: new THREE.CylinderGeometry(0.15, 0.25, 1.4, 6), color: 0x3a2a1a, matrix: m4(0, 0.7, 0) },
      { geo: new THREE.CylinderGeometry(0.65, 0.35, 0.5, 8), color: 0xb08a3a, matrix: m4(0, 1.6, 0) },
    ]);
    braziers.forEach(([x, z], i) => {
      const y = hy(x, z);
      solid(bGeo, propMat, x, y, z);
      const f = createFire({ scale: 0.6, logs: false, smoke: i === 2, light: i === 2, lightIntensity: 25, lightRange: 18 });
      f.group.position.set(x, y + 1.75, z); add(f.group); animated.push(f);
      L.add({ x, z, r: 0.6 });
    });
  }

  // ── clay jars (lathe) used around the temple, camp and village ──
  const jarGeo = (() => {
    const pts = [[0, 0], [0.32, 0.02], [0.5, 0.35], [0.55, 0.7], [0.42, 1.05], [0.2, 1.2], [0.18, 1.4], [0.28, 1.48], [0.24, 1.52]].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 9); return g;
  })();
  const jars = [];
  const jarAt = (x, z, s = 1) => { jars.push({ x, y: hy(x, z) - 0.05, z, s: s * (0.8 + rng() * 0.5), ry: rng() * 6, color: [0xb0603a, 0xc27a48, 0x9a5432, 0xd8b07a][Math.floor(rng() * 4)], rz: rng() < 0.15 ? 1.4 : 0 }); };
  for (let i = 0; i < 14; i++) { const a = rng() * 6.28, r = 8 + rng() * 16; jarAt(RUINS.x + Math.cos(a) * r, RUINS.z + Math.sin(a) * r); }

  // ── bedouin camp: tents, rugs, camels, fire ──
  {
    const cy = hy(CAMP.x, CAMP.z);
    const fire = createFire({ light: true, lightIntensity: 55, lightRange: 28 });
    fire.group.position.set(CAMP.x, cy, CAMP.z); add(fire.group); animated.push(fire);
    L.add({ x: CAMP.x, z: CAMP.z, r: 1.2 });
    const clothCols = [0x3a2a22, 0x5a3a28, 0x2a2420];
    const poles = new THREE.CylinderGeometry(0.07, 0.08, 2.6, 4);
    [[-9, -4, 0.3], [6, -10, -0.5], [9, 6, 1.9]].forEach(([dx, dz, ry], i) => {
      const x = CAMP.x + dx, z = CAMP.z + dz, y = hy(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; add(g);
      const roof = new THREE.PlaneGeometry(7, 4.6, 8, 4); roof.rotateX(-Math.PI / 2);
      const rp = roof.attributes.position;
      for (let k = 0; k < rp.count; k++) { const px = rp.getX(k), pz = rp.getZ(k); const sag = Math.abs(Math.sin((px / 7 + 0.5) * Math.PI * 3)) * 0.35; rp.setY(k, 2.5 - sag - Math.abs(pz) * 0.28); }
      roof.computeVertexNormals();
      const rm = new THREE.Mesh(roof, flatMat({ color: clothCols[i], side: THREE.DoubleSide })); rm.castShadow = true; g.add(rm);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.0), flatMat({ color: clothCols[i], side: THREE.DoubleSide })); back.position.set(0, 1.0, -2.3); back.rotation.x = 0.25; g.add(back);
      for (const px of [-3.4, 0, 3.4]) for (const pz of [-2.2, 2.2]) { const pm = new THREE.Mesh(poles, flatMat({ color: 0x5a3d2b })); pm.position.set(px, 1.2, pz); g.add(pm); }
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.4), new THREE.MeshStandardMaterial({ map: rugTexture(i + 3), roughness: 1 }));
      rug.rotation.x = -Math.PI / 2; rug.rotation.z = Math.PI / 2; rug.position.y = 0.05; g.add(rug);
      for (const px of [-3.4, 0, 3.4]) for (const pz of [-2.2, 2.2]) L.add({ x: x + Math.cos(ry) * px + Math.sin(ry) * pz, z: z - Math.sin(ry) * px + Math.cos(ry) * pz, r: 0.3 });
    });
    const rug2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshStandardMaterial({ map: rugTexture(11), roughness: 1 }));
    rug2.rotation.x = -Math.PI / 2; rug2.position.set(CAMP.x - 4, cy + 0.04, CAMP.z + 5); add(rug2);
    const camel = createCamel(false), kneel = createCamel(true);
    [[16, 4, 2.6, camel], [18, -3, 3.4, camel], [-6, 12, 0.8, kneel], [-10, 9, 1.6, kneel]].forEach(([dx, dz, ry, geo]) => {
      const x = CAMP.x + dx, z = CAMP.z + dz;
      solid(geo, propMat, x, hy(x, z), z, ry);
      L.add({ x, z, r: 1.4 }); L.add({ x: x + Math.sin(ry) * 1.6, z: z + Math.cos(ry) * 1.6, r: 0.8 });
    });
    const hitch = new THREE.CylinderGeometry(0.08, 0.1, 1.8, 5);
    solid(hitch, flatMat({ color: 0x5a3d2b }), CAMP.x + 14, cy + 0.9, CAMP.z + 0.5);
    for (let i = 0; i < 8; i++) jarAt(CAMP.x - 3 + rng() * 6, CAMP.z - 7 - rng() * 3);
    const bags = [];
    for (let i = 0; i < 6; i++) { const x = CAMP.x + 3 + rng() * 4, z = CAMP.z + 3 + rng() * 3; bags.push({ x, y: hy(x, z) + 0.3, z, sx: 0.9, sy: 0.6, sz: 0.7, ry: rng() * 3, color: [0x8e2a1e, 0xc9922a, 0x5a4a38][i % 3] }); }
    add(instanced(new THREE.IcosahedronGeometry(1, 0), white, bags));
  }

  // ── oasis: water, reeds, papyrus, palms, mud-brick village, felucca ──
  const water = new THREE.Mesh(new THREE.CircleGeometry(OASIS.r + 3, 40), new THREE.MeshStandardMaterial({ color: 0x2ab0bf, emissive: 0x0b4c5a, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2; water.position.set(OASIS.x, oasisLevel + 0.6, OASIS.z);
  add(water);
  L.add({ x: OASIS.x, z: OASIS.z, r: OASIS.r });
  {
    const pads = [];
    for (let i = 0; i < 40; i++) { const a = rng() * 6.28, r = OASIS.r * (0.5 + rng() * 0.45); pads.push({ x: OASIS.x + Math.cos(a) * r, y: oasisLevel + 0.63, z: OASIS.z + Math.sin(a) * r, s: 0.3 + rng() * 0.4, ry: rng() * 6, color: rng() < 0.15 ? 0xf2a7c8 : 0x3f8a3a }); }
    add(instanced(new THREE.CylinderGeometry(1, 1, 0.04, 7), white, pads, { castShadow: false }));
    const reedGeo = mergeParts([0, 1, 2, 3, 4].map((k) => ({ geo: new THREE.ConeGeometry(0.05, 2.4 + (k % 3) * 0.5, 3), color: k % 2 ? 0x5f8a32 : 0x4c7a2a, matrix: m4(Math.cos(k * 1.3) * 0.25, 1.2, Math.sin(k * 1.3) * 0.25, Math.sin(k) * 0.12, 0, Math.cos(k) * 0.12) })).concat([{ geo: new THREE.CylinderGeometry(0.07, 0.07, 0.5, 4), color: 0x6b4a2a, matrix: m4(0.25, 2.6, 0.1) }]));
    const papyGeo = mergeParts([
      { geo: new THREE.CylinderGeometry(0.03, 0.05, 2.8, 3), color: 0x4c7a2a, matrix: m4(0, 1.4, 0) },
      { geo: new THREE.ConeGeometry(0.55, 0.6, 8, 1, true), color: 0x7aa84a, matrix: m4(0, 3.0, 0, Math.PI, 0, 0) },
    ]);
    const reeds = [], papy = [];
    for (let i = 0; i < Math.floor(170 * Math.max(0.7, density)); i++) {
      const a = rng() * 6.28, r = OASIS.r * (0.92 + rng() * 0.35);
      const x = OASIS.x + Math.cos(a) * r, z = OASIS.z + Math.sin(a) * r;
      (rng() < 0.6 ? reeds : papy).push({ x, y: Math.max(hy(x, z), oasisLevel + 0.4) - 0.1, z, s: 0.7 + rng() * 0.6, ry: rng() * 6 });
    }
    const sway = swayMat({ vertexColors: true }, { amp: 0.05, speed: 1.8, power: 2 });
    add(instanced(reedGeo, sway, reeds, { castShadow: false }));
    add(instanced(papyGeo, sway, papy, { castShadow: false }));
    // palms
    const frond = new THREE.ConeGeometry(0.55, 4, 4); frond.scale(1, 1, 0.25); frond.translate(0, 2, 0);
    const palmParts = [];
    for (let k = 0; k < 5; k++) palmParts.push({ geo: new THREE.CylinderGeometry(0.28 - k * 0.03, 0.34 - k * 0.03, 1.6, 6), color: k % 2 ? 0x8a6640 : 0x7a5836, matrix: m4(k * 0.18, 0.8 + k * 1.5, 0, 0, 0, -0.08 - k * 0.02) });
    for (let k = 0; k < 8; k++) {
      const mat4 = new THREE.Matrix4().makeRotationY((k / 8) * Math.PI * 2).multiply(new THREE.Matrix4().makeRotationX(1.05 + (k % 2) * 0.35));
      mat4.setPosition(0.9, 7.6, 0);
      palmParts.push({ geo: frond, color: k % 2 ? 0x4f8a2e : 0x3f7a26, matrix: mat4 });
    }
    for (let k = 0; k < 4; k++) palmParts.push({ geo: new THREE.IcosahedronGeometry(0.22, 0), color: 0x6a3a1a, matrix: m4(0.9 + Math.cos(k * 1.6) * 0.35, 7.25, Math.sin(k * 1.6) * 0.35) });
    const palms = [];
    for (let i = 0; i < Math.floor(30 * Math.max(0.7, density)); i++) {
      const a = rng() * Math.PI * 2, r = OASIS.r + 4 + rng() * 16;
      const x = OASIS.x + Math.cos(a) * r, z = OASIS.z + Math.sin(a) * r;
      if (L.hits(x, z, 1)) continue;
      palms.push({ x, y: hy(x, z) - 0.2, z, ry: rng() * 6.28, s: 0.8 + rng() * 0.5 });
      L.add({ x, z, r: 0.5, cr: 0.8 });
    }
    add(instanced(mergeParts(palmParts), swayMat({ vertexColors: true, side: THREE.FrontSide }, { amp: 0.0025, speed: 0.9, power: 2 }), palms));
    // mud-brick houses
    const house = (w, d, h) => mergeParts([
      { geo: new THREE.BoxGeometry(w, h, d), color: 0xb8875a, matrix: m4(0, h / 2, 0) },
      { geo: new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), color: 0xa8784c, matrix: m4(0, h + 0.17, 0) },
      { geo: new THREE.BoxGeometry(w + 0.3, 0.5, 0.2), color: 0xb8875a, matrix: m4(0, h + 0.6, d / 2 + 0.05) },
      { geo: new THREE.BoxGeometry(0.9, 1.8, 0.1), color: 0x3a2414, matrix: m4(-w / 4, 0.9, d / 2 + 0.02) },
      { geo: new THREE.BoxGeometry(0.6, 0.6, 0.1), color: 0x2a1a0e, matrix: m4(w / 4, h * 0.65, d / 2 + 0.02) },
      { geo: new THREE.BoxGeometry(1.6, 0.08, 1.0), color: 0x2f6f8f, matrix: m4(-w / 4, 2.1, d / 2 + 0.5, -0.4, 0, 0) },
    ]);
    [[-34, -8, 0.2, 5, 4, 3.2], [-30, 4, -0.3, 4, 4, 2.8], [-26, -16, 0.6, 6, 4.5, 3.6], [-38, 6, 1.2, 4, 3.5, 2.6]].forEach(([dx, dz, ry, w, d, h]) => {
      const x = OASIS.x + dx, z = OASIS.z + dz;
      solid(house(w, d, h), propMat, x, hy(x, z) - 0.1, z, ry + Math.PI / 2);
      L.add({ x, z, r: Math.max(w, d) * 0.62 });
      jarAt(x + 2.5, z + 2.5); jarAt(x + 2.8, z + 1.8, 0.7);
    });
    // felucca on the water
    const boat = new THREE.Group(); boat.position.set(OASIS.x + 6, oasisLevel + 0.6, OASIS.z - 5); add(boat);
    const hull = new THREE.CylinderGeometry(0.9, 0.6, 5, 8, 1, false, 0, Math.PI); hull.rotateZ(-Math.PI / 2);
    const hm = new THREE.Mesh(hull, flatMat({ color: 0x6b4428, side: THREE.DoubleSide })); hm.position.y = 0.35; boat.add(hm);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.5, 5), flatMat({ color: 0x4a3020 })); mast.position.set(0, 2.6, 0.5); boat.add(mast);
    const sailShape = new THREE.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, 5.2); sailShape.lineTo(2.8, 0.3); sailShape.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), flatMat({ color: 0xf3ead8, side: THREE.DoubleSide })); sail.position.set(0.05, 0.6, 0.5); sail.rotation.y = -Math.PI / 2 + 0.3; boat.add(sail);
    boat.rotation.y = 0.8;
    animated.push({ update(dt, t) { boat.position.y = oasisLevel + 0.55 + Math.sin(t * 1.1) * 0.06; boat.rotation.z = Math.sin(t * 0.9) * 0.04; boat.rotation.y = 0.8 + Math.sin(t * 0.07) * 0.6; } });
  }

  // ── sandstone mesas and a natural arch ──
  {
    const strata = [0xb86a3c, 0xc98a52, 0xa85c34, 0xd9a066, 0x9a5230];
    const mesaGeo = (r, h, seed) => {
      const parts = []; const mr = mulberry32(seed); let y = 0; let k = 0;
      while (y < h) { const lh = 1.2 + mr() * 2.2; const rr = r * (1 - y / h * 0.25) * (0.92 + mr() * 0.12); parts.push({ geo: new THREE.CylinderGeometry(rr * 0.97, rr, lh, 7), color: strata[k++ % strata.length], matrix: m4((mr() - 0.5) * 0.6, y + lh / 2, (mr() - 0.5) * 0.6, 0, mr() * 3, 0) }); y += lh; }
      parts.push({ geo: new THREE.CylinderGeometry(r * 0.72, r * 0.75, 0.6, 7), color: 0xd9a066, matrix: m4(0, y + 0.3, 0) });
      return mergeParts(parts);
    };
    [[0, 0, 11, 24], [-24, 18, 7, 16], [20, -22, 8, 19], [-14, -28, 5, 12], [26, 14, 4, 9]].forEach(([dx, dz, r, h], i) => {
      const x = MESAS.x + dx, z = MESAS.z + dz;
      solid(mesaGeo(r, h, i + 5), propMat, x, hy(x, z) - 1, z, i);
      L.add({ x, z, r: r + 0.3 });
    });
    const ax = MESAS.x + 20, az = MESAS.z + 34;
    const arch = new THREE.TorusGeometry(9, 2.2, 6, 18, Math.PI);
    const ap = arch.attributes.position; const an = createNoise2D(mulberry32(8));
    for (let i = 0; i < ap.count; i++) { const k = 1 + an(ap.getX(i) * 0.25, ap.getY(i) * 0.25) * 0.25; ap.setZ(i, ap.getZ(i) * k * 1.6); }
    arch.computeVertexNormals();
    const archCols = [];
    for (let i = 0; i < ap.count; i++) { const c = new THREE.Color(strata[Math.floor(Math.abs(ap.getY(i)) / 1.6) % strata.length]); archCols.push(c.r, c.g, c.b); }
    arch.setAttribute('color', new THREE.Float32BufferAttribute(archCols, 3));
    solid(arch, propMat, ax, hy(ax, az) - 1, az, 0.3);
    for (const s of [-1, 1]) L.add({ x: ax + Math.cos(0.3) * 9 * s, z: az - Math.sin(0.3) * 9 * s, r: 2.6 });
    const boulders = [];
    for (let i = 0; i < 40; i++) { const a = rng() * 6.28, r = 12 + rng() * 40; const x = MESAS.x + Math.cos(a) * r, z = MESAS.z + Math.sin(a) * r; if (L.hits(x, z, 1)) continue; const s = 0.6 + rng() * 2.2; boulders.push({ x, y: hy(x, z) + s * 0.2, z, s, sy: s * 0.7, ry: rng() * 3, color: strata[i % strata.length] }); L.add({ x, z, r: s * 0.8 }); }
    add(instanced(new THREE.DodecahedronGeometry(1, 0), white, boulders));
  }

  // ── giant pharaoh head, half buried and tilted ──
  {
    const g = new THREE.Group(); g.position.set(HEAD.x, hy(HEAD.x, HEAD.z) - 4.5, HEAD.z); g.rotation.set(-0.55, -0.9, 0.18); g.scale.setScalar(1.5); add(g);
    const st = 0xd9b77a, blue = 0x2f5f8f;
    const nem = new THREE.CylinderGeometry(4, 6.5, 10, 4); nem.rotateY(Math.PI / 4);
    const parts = [
      { geo: nem, color: 0xe0c48a, matrix: m4(0, 6, -0.6, 0, 0, 0, 1.25, 1, 0.9) },
      { geo: new THREE.BoxGeometry(6, 7.5, 3), color: 0xe3c58d, matrix: m4(0, 5.8, 3.4) },
      { geo: new THREE.BoxGeometry(1.2, 2.2, 1.4), color: 0xcfae74, matrix: m4(0, 5.2, 5.4) },
      { geo: new THREE.BoxGeometry(1.6, 0.5, 0.4), color: 0x3a2814, matrix: m4(-1.5, 7.2, 4.95) },
      { geo: new THREE.BoxGeometry(1.6, 0.5, 0.4), color: 0x3a2814, matrix: m4(1.5, 7.2, 4.95) },
      { geo: new THREE.BoxGeometry(2.4, 0.35, 0.4), color: 0x9a6a3a, matrix: m4(0, 3.2, 4.95) },
      { geo: new THREE.BoxGeometry(1.2, 3, 1.4), color: 0xc9a670, matrix: m4(0, 0.8, 4.6) },
      { geo: new THREE.CylinderGeometry(0.7, 0.4, 2.2, 6), color: 0xf2c252, matrix: m4(0, 11.3, 2.6) },
    ];
    for (let i = 0; i < 5; i++) { parts.push({ geo: new THREE.BoxGeometry(0.4, 7.5 - i * 0.6, 0.6), color: blue, matrix: m4(-4.2 - i * 0.05, 4.5, 1.2 - i * 1.1) }); parts.push({ geo: new THREE.BoxGeometry(0.4, 7.5 - i * 0.6, 0.6), color: blue, matrix: m4(4.2 + i * 0.05, 4.5, 1.2 - i * 1.1) }); }
    const mesh = new THREE.Mesh(mergeParts(parts), propMat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
    L.add({ x: HEAD.x, z: HEAD.z, r: 10 });
    const drift = [];
    for (let i = 0; i < 10; i++) { const a = rng() * 6.28, r = 9 + rng() * 6; const x = HEAD.x + Math.cos(a) * r, z = HEAD.z + Math.sin(a) * r; const s = 2 + rng() * 3; drift.push({ x, y: hy(x, z) - s * 0.3, z, sx: s * 1.6, sy: s * 0.5, sz: s, ry: rng() * 3, color: 0xe6bb72 }); }
    add(instanced(new THREE.IcosahedronGeometry(1, 1), white, drift, { castShadow: false }));
  }

  // ── scattered: blocks, broken statues, acacias, dry shrubs, bones, pebbles ──
  const blocks = [];
  for (const p of scatterPoints(rng, Math.floor(110 * density), R - 8, (x, z) => L.free(x, z, 2, 0.4))) {
    const s = 1 + rng() * 2.2;
    blocks.push({ x: p.x, y: hy(p.x, p.z) + s * 0.25, z: p.z, sx: s * (1 + rng()), sy: s, sz: s, ry: rng() * 3, rz: (rng() - 0.5) * 0.3, color: rng() < 0.5 ? 0xcfa96d : 0xbf9a60 });
    L.add({ x: p.x, z: p.z, r: s * 0.95 });
  }
  add(instanced(new THREE.BoxGeometry(1, 1, 1), white, blocks));
  const acaciaGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.18, 0.3, 3.2, 5), color: 0x5a4030, matrix: m4(0, 1.6, 0, 0, 0, 0.12) },
    { geo: new THREE.CylinderGeometry(0.1, 0.16, 2.4, 4), color: 0x5a4030, matrix: m4(-0.7, 3.6, 0, 0, 0, 0.7) },
    { geo: new THREE.CylinderGeometry(0.1, 0.16, 2.4, 4), color: 0x5a4030, matrix: m4(0.8, 3.7, 0.2, 0.2, 0, -0.6) },
    { geo: new THREE.CylinderGeometry(3.4, 2.4, 0.9, 8), color: 0x6f8a3a, matrix: m4(0, 4.9, 0) },
    { geo: new THREE.CylinderGeometry(2.0, 1.6, 0.6, 7), color: 0x7f9a46, matrix: m4(1.2, 5.3, 0.6) },
  ]);
  const acacias = [];
  for (const p of scatterPoints(rng, Math.floor(34 * density) + 8, R - 10, (x, z) => L.free(x, z, 3, 0.4))) { const s = 0.8 + rng() * 0.6; acacias.push({ x: p.x, y: hy(p.x, p.z) - 0.2, z: p.z, s, ry: rng() * 6 }); L.add({ x: p.x, z: p.z, r: 0.4 * s, cr: 0.6 }); }
  add(instanced(acaciaGeo, propMat, acacias));
  const shrubGeo = mergeParts([0, 1, 2, 3, 4, 5, 6].map((k) => ({ geo: new THREE.CylinderGeometry(0.015, 0.04, 0.9, 3), color: k % 2 ? 0x8a7040 : 0x6f6a38, matrix: m4(0, 0.4, 0, Math.cos(k * 2.4) * 0.7, 0, Math.sin(k * 2.4) * 0.7) })).concat([{ geo: new THREE.IcosahedronGeometry(0.35, 0), color: 0x7a7a3a, matrix: m4(0, 0.35, 0, 0, 0, 0, 1, 0.6, 1) }]));
  const shrubs = [];
  for (const p of scatterPoints(rng, Math.floor(520 * density), R - 6, (x, z) => L.free(x, z, 0.3, 0.6))) shrubs.push({ x: p.x, y: hy(p.x, p.z) - 0.05, z: p.z, s: 0.5 + rng() * 0.9, ry: rng() * 6 });
  add(instanced(shrubGeo, swayMat({ vertexColors: true }, { amp: 0.12, speed: 2.4, power: 2 }), shrubs, { castShadow: false }));
  const boneGeo = mergeParts([
    { geo: new THREE.BoxGeometry(0.9, 0.6, 0.7), color: 0xf2e8d2, matrix: m4(0, 0.3, 0) },
    { geo: new THREE.ConeGeometry(0.12, 1.0, 4), color: 0xf2e8d2, matrix: m4(0.3, 0.75, 0.3, 0.3, 0, -0.6) },
    { geo: new THREE.ConeGeometry(0.12, 1.0, 4), color: 0xf2e8d2, matrix: m4(0.3, 0.75, -0.3, -0.3, 0, -0.6) },
    { geo: new THREE.BoxGeometry(0.15, 0.15, 0.2), color: 0x2a1c10, matrix: m4(0.46, 0.4, 0.18) },
    { geo: new THREE.BoxGeometry(0.15, 0.15, 0.2), color: 0x2a1c10, matrix: m4(0.46, 0.4, -0.18) },
  ]);
  const skulls = [];
  for (const p of scatterPoints(rng, Math.floor(22 * density) + 5, R - 10, (x, z) => L.free(x, z, 1))) skulls.push({ x: p.x, y: hy(p.x, p.z) - 0.1, z: p.z, s: 0.8 + rng() * 0.4, ry: rng() * 6 });
  add(instanced(boneGeo, propMat, skulls));
  for (const p of scatterPoints(rng, Math.floor(20 * density), R - 10, (x, z) => L.free(x, z, 1))) jarAt(p.x, p.z, 0.9);
  add(instanced(jarGeo, flatMat({ color: 0xffffff, side: THREE.DoubleSide }), jars));
  const pebbles = [];
  for (const p of scatterPoints(rng, Math.floor(500 * density), R - 6, (x, z) => L.free(x, z, 0.1, 0.7))) { const s = 0.1 + rng() * 0.25; pebbles.push({ x: p.x, y: hy(p.x, p.z) + s * 0.2, z: p.z, s, ry: rng() * 3, color: rng() < 0.5 ? 0xb07a48 : 0xd2a874 }); }
  add(instanced(new THREE.DodecahedronGeometry(1, 0), white, pebbles, { castShadow: false }));

  // ── vultures circling overhead ──
  const birds = [];
  {
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0, -0.6, 3.2, 0.2, -0.3,  0, 0, 0.5, 0, 0, -0.6, -3.2, 0.2, -0.3], 3));
    wingGeo.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ color: 0x2a221c, side: THREE.DoubleSide, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2, 5), bm); body.rotation.x = Math.PI / 2; b.add(body);
      const lw = new THREE.Mesh(wingGeo, bm); b.add(lw);
      add(b);
      birds.push({ b, lw, cx: (rng() - 0.5) * 200, cz: (rng() - 0.5) * 200, r: 30 + rng() * 40, y: 70 + rng() * 40, sp: (0.08 + rng() * 0.08) * (rng() < 0.5 ? 1 : -1), ph: rng() * 6 });
    }
  }

  // ── dust devils wandering the dunes ──
  const devils = [];
  for (let i = 0; i < 2; i++) {
    const count = 140;
    const pos = new Float32Array(count * 3); const seed = new Float32Array(count);
    for (let k = 0; k < count; k++) seed[k] = Math.random();
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe8c890, size: 0.9, map: softTexture(), transparent: true, opacity: 0.45, depthWrite: false }));
    pts.frustumCulled = false; add(pts);
    devils.push({ pts, pos, seed, count, cx: i ? 60 : -40, cz: i ? 170 : -170, ph: i * 3 });
  }

  // ── sky, horizon, lights, dust ──
  const sunDir = [-0.45, 0.3, -0.75];
  const sky = createSky({ top: 0x3f7fcc, horizon: HORIZON, bottom: 0xe7c38c, sunDir, sunColor: 0xffc77a, sunGlow: 0.7, sunSize: 0.9988, exponent: 0.6 });
  const rn = createNoise2D(mulberry32(21));
  const ringFar = createHorizonRing({ radius: 1100, color: 0xe7c293, minH: 15, maxH: 70, segments: 120, profile: (a) => { const v = 0.5 + 0.5 * rn(Math.cos(a) * 2.5, Math.sin(a) * 2.5); return v > 0.68 ? 1 : v * 0.5; } });
  const ringNear = createHorizonRing({ radius: 950, color: 0xdcae78, minH: 8, maxH: 45, segments: 80, profile: (a) => Math.pow(0.5 + 0.5 * rn(Math.cos(a) * 4 + 5, Math.sin(a) * 4), 2) });
  // far-off pyramids on the horizon
  const farPyr = new THREE.Group();
  [[-0.9, 0.8, 70], [-1.05, 0.6, 45], [2.3, 0.7, 55]].forEach(([a, s, h]) => {
    const g = new THREE.ConeGeometry(h * 0.9, h, 4); g.rotateY(Math.PI / 4);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe2b98a, fog: false, toneMapped: false }));
    m.position.set(Math.cos(a) * 1050, -40 + h / 2 + 10, Math.sin(a) * 1050); m.renderOrder = -6; farPyr.add(m);
  });
  const follower = skyFollower(sky, farPyr, ringFar, ringNear);
  add(follower.group);
  const lights = createLighting(scene, { sunColor: 0xffe1b3, sunIntensity: 2.7, sunDir, sky: 0xbcd5f2, ground: 0xd8a464, hemiIntensity: 1.0, shadowMap: quality.shadowMap });
  const dust = createParticles({ count: Math.floor(700 * density), area: [100, 25, 100], color: 0xf5d9a8, size: 0.2, opacity: 0.55, velocity: [3.5, 0.15, 1.2], sway: 0.6 });
  add(dust.points);
  const sandRun = createParticles({ count: Math.floor(450 * density), area: [70, 1.5, 70], color: 0xf0cf98, size: 0.12, opacity: 0.6, velocity: [6, 0.1, 2], sway: 0.6 });
  add(sandRun.points);

  return {
    scene, radius: R, heightAt, colliders,
    portalSpots: PORTAL_SPOTS,
    isValidSpot: (x, z) => !inOasis(x, z) && !inPyramid(x, z, 3) && slopeAt(heightAt, x, z) < 0.6 && Math.hypot(x, z) < R - 12,
    createMonsterBody: createScarab,
    audio: {
      ambient: {
        layers: [
          { type: 'noise', filter: 'lowpass', freq: 420, q: 0.6, gain: 0.26, lfoRate: 0.05, lfoDepth: 220 },
          { type: 'noise', filter: 'bandpass', freq: 2600, q: 2.5, gain: 0.022, lfoRate: 0.13, lfoDepth: 900 },
        ],
      },
      music: MUSIC,
      footstep: { filter: 'lowpass', freq: 650, q: 0.8, decay: 0.2, gain: 0.32 },
      growl: { type: 'square', baseFreq: 150, filterFreq: 1800, decay: 1.1, gain: 0.3, trem: 28, noise: 0.5 },
    },
    update(dt, t, camera, playerPos) {
      tickShared(t);
      follower.update(camera);
      lights.update(playerPos);
      dust.update(dt, playerPos, t);
      sandRun.update(dt, { x: playerPos.x, y: playerPos.y + 4.6, z: playerPos.z }, t);
      water.material.emissiveIntensity = 0.55 + Math.sin(t * 1.3) * 0.08;
      for (const a of animated) a.update(dt, t);
      for (const B of birds) {
        const a = t * B.sp + B.ph;
        B.b.position.set(B.cx + Math.cos(a) * B.r, B.y + Math.sin(t * 0.3 + B.ph) * 3, B.cz + Math.sin(a) * B.r);
        B.b.rotation.set(0, -a + (B.sp > 0 ? 0 : Math.PI), (B.sp > 0 ? 1 : -1) * 0.35);
        B.lw.scale.y = 1 + Math.sin(t * 2 + B.ph) * 2.2 * (Math.sin(t * 0.25 + B.ph) > 0.6 ? 1 : 0.15);
      }
      for (const D of devils) {
        const cx = D.cx + Math.sin(t * 0.05 + D.ph) * 60, cz = D.cz + Math.cos(t * 0.037 + D.ph) * 50;
        const gy = heightAt(cx, cz);
        for (let k = 0; k < D.count; k++) {
          const s = D.seed[k]; const h = ((s * 37 + t * 0.35) % 1);
          const r = 0.6 + h * h * 6;
          const a = s * 60 + t * (5 - h * 2);
          D.pos[k * 3] = cx + Math.cos(a) * r; D.pos[k * 3 + 1] = gy + h * 22; D.pos[k * 3 + 2] = cz + Math.sin(a) * r;
        }
        D.pts.geometry.attributes.position.needsUpdate = true;
      }
    },
  };
}

// Soundtrack: a hijaz mode over a D drone, oud-like plucks and a frame drum that quickens as the Scarab nears.
const MUSIC = {
  bpm: 92,
  root: 50, // D3
  scale: [0, 1, 4, 5, 7, 8, 10],
  chords: [[0, 4, 7], [1, 5, 8], [0, 4, 7], [-2, 1, 5]],
  barsPerChord: 2,
  pad: { wave: 'sawtooth', gain: 0.016, filter: 650, attack: 2.5 },
  drone: { notes: [0, 7], wave: 'sawtooth', gain: 0.022, octave: -1, filter: 500 },
  melody: { inst: 'pluck', gain: 0.11, octave: 1, density: [0.2, 0.42], range: 10 },
  bass: { inst: 'pluck', gain: 0.12, octave: -1, pattern: 'x..x..x...x.x...', from: 0.3 },
  arp: { inst: 'pluck', gain: 0.06, octave: 2, pattern: 'x.xx.x.xx.x.x.xx', from: 0.6 },
  perc: [
    { inst: 'dum', pattern: 'x.........x.....', gain: 0.32, from: 0.0 },
    { inst: 'tek', pattern: '...x..x.....x.x.', gain: 0.1, from: 0.2 },
    { inst: 'tek', pattern: '.x.x.xx..x.x.xxx', gain: 0.06, from: 0.65 },
    { inst: 'dum', pattern: 'x.....x...x...x.', gain: 0.28, from: 0.5 },
    { inst: 'snap', pattern: '....x.......x...', gain: 0.07, from: 0.4 },
  ],
};

export default {
  id: 'desert',
  name: 'Sands of the Pharaohs',
  tagline: 'Old stone, endless sand.',
  monsterName: 'the Giant Scarab',
  theme,
  // the gems here: crystal desert roses, amber once revealed (softer glow so the petals keep their shading)
  gem: { style: 'rose', dark: 0x6a4a30, col: 0xc9742a, glow: 0xffa030, glowK: 0.6 },
  createPortalFrame,
  build,
};
