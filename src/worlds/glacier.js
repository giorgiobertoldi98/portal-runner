// World 1 — The Frozen Peaks: twilight glacier with pine and spruce forests, a frozen lake with an ice-fishing hut,
// an abandoned camp, a ruined watchtower, a mammoth skeleton, blue-ice arches, a frozen waterfall and an aurora.
// Monster: the Yeti — it wanders until you come close, and hunts you down inside the snow storms its hidden devices raise.
// The Resonance Call is silent here: the explorers' map, lying in a cave at the bottom of an ice hole that opens
// somewhere new every run, shows the gems instead (see mechanics/iceCave.js).
import * as THREE from 'three';
import { mulberry32, createNoise2D, fbm, ridged } from '../engine/noise.js';
import { createTerrain, gridHeight, withFlats, edgeFactor, slopeAt } from '../engine/terrain.js';
import { createSky, createLighting, createHorizonRing, createParticles, skyFollower } from '../engine/environment.js';
import { archPath, archTube } from '../engine/shapes.js';
import { smoothstep, mergeParts, m4, instanced, flatMat, scatterPoints, fogColor } from '../engine/utils.js';
import { YetiBrain } from '../hunters/yeti.js';
import { GLACIER, carryText } from '../config.js';
import { tr } from '../i18n/i18n.js';
import { createSnowStorms } from '../mechanics/snowStorms.js';
import { createIceCave, pickCaveSites, terrainHole, SITE_CLEAR } from '../mechanics/iceCave.js';
import { holeSketch } from '../mechanics/iceCaveSketch.js';
import { createNotePickup } from '../mechanics/notePickup.js';
import { extendMaterial, swayMat, canvasTexture, glowPoints, createPlume, createFire, createLayout, flagLine, tickShared } from '../engine/props.js';

const TERRAIN_SIZE = 1100; // metres across the ground mesh (also used by gridHeight)

const R = 270;
const PORTAL_SPOTS = [{ x: 175, z: -165 }, { x: -195, z: -95 }, { x: -45, z: 215 }];
const LAKE = { x: 40, z: 55, r: 46 };
// The ground is levelled to the ice out past the ice disc by more than one terrain cell, so the flat disc always
// lies on the ground the player walks on; beyond that a wide blend climbs or drops back to the hills.
const LAKE_ICE = LAKE.r * 1.1, LAKE_FLAT = LAKE.r * 1.27, LAKE_SHORE = LAKE.r * 1.9;
const HORIZON = 0xb9cbe4;

const theme = {
  glow: 0x7fe3ff, colA: 0x0b3d91, colB: 0x3fa9f5, colC: 0xd8fbff, stone: 0xaec4d8, css: '#8fe8ff', hum: 146.8,
};

function createPortalFrame({ W, H }) {
  const g = new THREE.Group();
  const rng = mulberry32(77);
  const ice = new THREE.MeshStandardMaterial({ color: 0xbff2ff, emissive: 0x2b9fd6, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.92 });
  const deep = new THREE.MeshStandardMaterial({ color: 0x7fc8ec, emissive: 0x13507a, emissiveIntensity: 0.4, roughness: 0.3, flatShading: true });
  g.add(archTube(W, H, 0.35, 0.34, deep));
  const { pts, normals } = archPath(W, H, 0.4, 30);
  const up = new THREE.Vector3(0, 1, 0);
  pts.forEach((p, i) => {
    const big = i % 4 === 0;
    const len = (big ? 2.4 : 1.0) + rng() * 1.4;
    const geo = new THREE.OctahedronGeometry(1, 0);
    geo.scale(0.32 + rng() * 0.2, len, 0.32 + rng() * 0.2);
    const m = new THREE.Mesh(geo, ice);
    const n = normals[i].clone();
    n.x += (rng() - 0.5) * 0.6; n.z += (rng() - 0.5) * 0.9; n.normalize();
    m.quaternion.setFromUnitVectors(up, n);
    m.position.copy(p).addScaledVector(n, len * 0.55);
    g.add(m);
  });
  // big crystals at the feet
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const geo = new THREE.OctahedronGeometry(1, 0);
      const h = 2 + rng() * 2.5;
      geo.scale(0.6, h, 0.6);
      const m = new THREE.Mesh(geo, ice);
      m.position.set(side * (W / 2 + 1.1 + k * 0.5), h * 0.6, (rng() - 0.5) * 1.6);
      m.rotation.set((rng() - 0.5) * 0.4, rng() * 3, side * (0.2 + k * 0.15));
      g.add(m);
    }
  }
  return g;
}

function createYeti() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const fur = flatMat({ color: 0xe9eff6, roughness: 1 });
  const furShade = flatMat({ color: 0xc6d3e2, roughness: 1 });
  const skin = flatMat({ color: 0x4c6079 });
  const horn = flatMat({ color: 0x2f3946 });
  const eye = new THREE.MeshBasicMaterial({ color: 0x8ff8ff, toneMapped: false });
  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };

  const torso = mesh(new THREE.IcosahedronGeometry(1.3, 1), fur, 0, 2.5, 0);
  torso.scale.set(1.3, 1.1, 1.05); torso.rotation.x = 0.35;
  body.add(torso);
  body.add(mesh(new THREE.IcosahedronGeometry(0.9, 1), furShade, 0, 2.2, 0.75));

  const head = new THREE.Group(); head.position.set(0, 3.45, 1.05); body.add(head);
  head.add(mesh(new THREE.IcosahedronGeometry(0.72, 1), fur, 0, 0, 0));
  const face = mesh(new THREE.IcosahedronGeometry(0.5, 1), skin, 0, -0.1, 0.42); face.scale.set(1, 0.9, 0.55); head.add(face);
  head.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), eye, -0.2, 0.05, 0.7));
  head.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), eye, 0.2, 0.05, 0.7));
  head.add(mesh(new THREE.BoxGeometry(0.4, 0.08, 0.05), horn, 0, -0.3, 0.68));
  for (const s of [-1, 1]) {
    const h = mesh(new THREE.ConeGeometry(0.16, 0.9, 5), horn, s * 0.55, 0.45, -0.05);
    h.rotation.set(-0.4, 0, -s * 0.9); head.add(h);
  }
  const arm = (s) => {
    const sh = new THREE.Group(); sh.position.set(s * 1.35, 3.0, 0.45); body.add(sh);
    sh.add(mesh(new THREE.CylinderGeometry(0.42, 0.34, 1.5, 7), fur, 0, -0.75, 0));
    const el = new THREE.Group(); el.position.y = -1.5; sh.add(el);
    el.add(mesh(new THREE.CylinderGeometry(0.34, 0.44, 1.35, 7), fur, 0, -0.65, 0));
    el.add(mesh(new THREE.IcosahedronGeometry(0.48, 0), skin, 0, -1.4, 0.05));
    return { sh, el };
  };
  const leg = (s) => {
    const hip = new THREE.Group(); hip.position.set(s * 0.65, 1.55, -0.35); body.add(hip);
    hip.add(mesh(new THREE.CylinderGeometry(0.48, 0.4, 0.95, 7), fur, 0, -0.45, 0));
    const kn = new THREE.Group(); kn.position.y = -0.9; hip.add(kn);
    kn.add(mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.65, 7), furShade, 0, -0.32, 0));
    kn.add(mesh(new THREE.BoxGeometry(0.65, 0.25, 0.95), skin, 0, -0.68, 0.18));
    return { hip, kn };
  };
  const aL = arm(1), aR = arm(-1), lL = leg(1), lR = leg(-1);
  let ph = 0;
  return {
    object: root, radius: 1.6, hover: 0,
    animate(dt, speed, t) {
      ph += dt * (0.8 + speed * 0.2) * Math.PI * 2;
      const s = Math.sin(ph), c = Math.cos(ph);
      // knuckle gallop: both arms together, legs opposite
      aL.sh.rotation.x = -0.35 - s * 0.75; aR.sh.rotation.x = -0.35 - Math.sin(ph + 0.35) * 0.75;
      aL.el.rotation.x = -0.25 - Math.max(0, c) * 0.6; aR.el.rotation.x = -0.25 - Math.max(0, c) * 0.6;
      aL.sh.rotation.z = 0.15; aR.sh.rotation.z = -0.15;
      lL.hip.rotation.x = s * 0.55; lR.hip.rotation.x = Math.sin(ph + 0.4) * 0.55;
      lL.kn.rotation.x = Math.max(0, -c) * 0.7; lR.kn.rotation.x = Math.max(0, -Math.cos(ph + 0.4)) * 0.7;
      body.position.y = Math.abs(s) * 0.35;
      body.rotation.x = 0.12 + s * 0.1;
      head.rotation.x = -s * 0.12;
      head.rotation.z = Math.sin(t * 1.3) * 0.08;
    },
  };
}

// ── Landmarks ──────────────────────────────────────────────────────────────
const CAMP = { x: -120, z: 45 };      // abandoned mountaineers' camp
const TOWER = { x: -40, z: -140 };    // ruined watchtower
const MAMMOTH = { x: 150, z: 40 };    // half-buried mammoth skeleton
const CREVASSE = { x: 95, z: -70 };   // blue-ice ridges and arches
const HUT = { x: 52, z: 38 };         // ice-fishing hut on the frozen lake
const FALLS = { dx: 0.887, dz: 0.462 }; // frozen waterfall direction (on the rim cliffs)

function lakeTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    const r = mulberry32(55);
    const grd = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w / 2);
    grd.addColorStop(0, '#9fd3ef'); grd.addColorStop(0.7, '#c4e7f7'); grd.addColorStop(1, '#eaf7ff');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // frost blotches
    for (let i = 0; i < 140; i++) {
      const x = r() * w, y = r() * h, s = 10 + r() * 70;
      const fg = g.createRadialGradient(x, y, 0, x, y, s);
      fg.addColorStop(0, 'rgba(240,250,255,0.35)'); fg.addColorStop(1, 'rgba(240,250,255,0)');
      g.fillStyle = fg; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    }
    // branching cracks
    const crack = (x, y, a, len, wdt, depth) => {
      g.lineWidth = wdt;
      g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < len; i++) { a += (r() - 0.5) * 0.6; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y);
        if (depth < 3 && r() < 0.06) { g.stroke(); crack(x, y, a + (r() < 0.5 ? 1 : -1) * (0.5 + r()), len * 0.5, wdt * 0.6, depth + 1); g.lineWidth = wdt; g.beginPath(); g.moveTo(x, y); } }
      g.stroke();
    };
    g.strokeStyle = 'rgba(20,70,120,0.55)';
    for (let i = 0; i < 9; i++) crack(w / 2 + (r() - 0.5) * 300, h / 2 + (r() - 0.5) * 300, r() * 6.28, 30 + r() * 30, 2.6, 0);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 7; i++) crack(r() * w, r() * h, r() * 6.28, 15 + r() * 20, 1.4, 1);
  });
}

function build({ quality }) {
  const density = quality.density;
  const rng = mulberry32(1337);
  const n1 = createNoise2D(rng), n2 = createNoise2D(rng), n3 = createNoise2D(rng), n4 = createNoise2D(rng), n5 = createNoise2D(rng);

  const raw = (x, z) => fbm(n1, x * 0.0045, z * 0.0045, 5) * 22 + ridged(n2, x * 0.011, z * 0.011, 3) * 9;
  const iceLevel = raw(LAKE.x, LAKE.z) - 3;
  const base = (x, z) => {
    let h = raw(x, z);
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
    const lk = 1 - smoothstep(LAKE_FLAT, LAKE_SHORE, dl);
    h = h * (1 - lk) + iceLevel * lk;
    h += edgeFactor(x, z, R, 170) * 170 * (0.65 + 0.5 * ridged(n3, x * 0.01, z * 0.01, 3));
    return h;
  };
  // prepared clearings for the ice hole (one of them opens each run): gentle ground away from landmarks and portals
  const caveSites = pickCaveSites({
    base, radius: R,
    avoid: [
      ...PORTAL_SPOTS.map((p) => ({ ...p, d: 45 })), { x: LAKE.x, z: LAKE.z, d: LAKE_SHORE + 12 },
      ...[CAMP, TOWER, MAMMOTH].map((p) => ({ ...p, d: 50 })), { ...CREVASSE, d: 62 },
      { x: FALLS.dx * 248, z: FALLS.dz * 248, d: 50 },
      ...[{ x: -90, z: -30 }, { x: 120, z: 120 }, { x: 30, z: -200 }].map((p) => ({ ...p, d: 30 })),
    ],
  });
  const smoothHeight = withFlats(base, [
    ...caveSites.map((c) => ({ x: c.x, z: c.z, inner: 14, outer: 28 })),
    ...PORTAL_SPOTS,
    { x: CAMP.x, z: CAMP.z, inner: 15, outer: 32 },
    { x: TOWER.x, z: TOWER.z, inner: 12, outer: 26 },
    { x: MAMMOTH.x, z: MAMMOTH.z, inner: 13, outer: 28 },
    { x: FALLS.dx * 248, z: FALLS.dz * 248, inner: 14, outer: 26 },
  ]);
  const heightAt = gridHeight(smoothHeight, TERRAIN_SIZE, quality.terrainSegments); // the ground exactly as drawn
  const inLake = (x, z) => Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE_ICE; // the whole ice disc: no props or gems on it
  const hy = (x, z) => heightAt(x, z);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(fogColor(HORIZON), 30, 430);
  scene.background = new THREE.Color(HORIZON);

  // ── terrain ──
  const snow = new THREE.Color(0xf3f7fc), snowShade = new THREE.Color(0xc5d6ea), rock = new THREE.Color(0x56667c), rockDark = new THREE.Color(0x3a4556);
  const blue = new THREE.Color(0x9cc9ea), blueIce = new THREE.Color(0x8cc8ec), trampled = new THREE.Color(0xd4d6dc);
  const terrain = createTerrain({
    size: TERRAIN_SIZE, segments: quality.terrainSegments, heightAt,
    colorAt(c, x, z, h, slope) {
      c.copy(snow);
      c.lerp(snowShade, (0.5 + 0.5 * n4(x * 0.04, z * 0.04)) * 0.45);
      c.lerp(blueIce, smoothstep(0.45, 0.75, n5(x * 0.018, z * 0.018)) * (1 - smoothstep(0.1, 0.3, slope)) * 0.65);
      const rk = smoothstep(0.5, 0.9, slope);
      c.lerp(rock.clone().lerp(rockDark, 0.5 + 0.5 * Math.sin(h * 0.45 + n2(x * 0.02, z * 0.02) * 3)), rk);
      const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
      c.lerp(blue, (1 - smoothstep(LAKE.r, LAKE.r * 1.5, dl)) * 0.35);
      c.lerp(trampled, (1 - smoothstep(8, 20, Math.hypot(x - CAMP.x, z - CAMP.z))) * 0.5);
    },
  });
  scene.add(terrain);
  const holeUniform = terrainHole(terrain.material); // the ice hole's opening is cut out of the terrain

  const L = createLayout({ heightAt, portalSpots: PORTAL_SPOTS, blocked: inLake });
  const colliders = L.colliders;
  for (const c of caveSites) L.reserve(c.x, c.z, SITE_CLEAR);
  L.reserve(CAMP.x, CAMP.z, 22); L.reserve(TOWER.x, TOWER.z, 16); L.reserve(MAMMOTH.x, MAMMOTH.z, 18); L.reserve(CREVASSE.x, CREVASSE.z, 30);
  const fallsBase = { x: FALLS.dx * 246, z: FALLS.dz * 246 };
  L.reserve(fallsBase.x, fallsBase.z, 16); L.reserve(FALLS.dx * 258, FALLS.dz * 258, 24);
  const propMat = flatMat({ vertexColors: true });
  const animated = [];
  const add = (o) => { scene.add(o); return o; };
  const solid = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; return add(m); };

  // ── frozen lake with cracks + fishing hut ──
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE_ICE, 64), new THREE.MeshStandardMaterial({ map: lakeTexture(), emissive: 0x0d3a5a, emissiveIntensity: 0.15, roughness: 0.22, metalness: 0.05 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE.x, iceLevel + 0.04, LAKE.z); lake.receiveShadow = true;
  add(lake);
  {
    const hx = HUT.x, hz = HUT.z, y = iceLevel;
    const hutGeo = mergeParts([
      { geo: new THREE.BoxGeometry(4.2, 2.6, 3.2), color: 0x7a4e2d, matrix: m4(0, 1.3, 0) },
      { geo: new THREE.BoxGeometry(4.3, 0.25, 3.3), color: 0x5b3920, matrix: m4(0, 0.12, 0) },
      { geo: (() => { const g = new THREE.CylinderGeometry(2.0, 2.0, 4.8, 3); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); return g; })(), color: 0x4e3424, matrix: m4(0, 3.35, 0, 0, 0, 0, 1, 0.55, 1) },
      { geo: (() => { const g = new THREE.CylinderGeometry(2.05, 2.05, 4.9, 3); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); return g; })(), color: 0xf4f8fc, matrix: m4(0, 3.55, 0, 0, 0, 0, 0.85, 0.42, 1) },
      { geo: new THREE.BoxGeometry(0.9, 1.8, 0.1), color: 0x3b2516, matrix: m4(-0.9, 0.95, 1.62) },
      { geo: new THREE.BoxGeometry(0.55, 1.6, 0.55), color: 0x6f6f74, matrix: m4(1.3, 4.0, -0.6) },
    ]);
    solid(hutGeo, propMat, hx, y, hz);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({ color: 0xffc66b, toneMapped: false }));
    win.position.set(hx + 0.9, y + 1.5, hz + 1.62); add(win);
    add(glowPoints([{ x: hx + 0.9, y: y + 1.5, z: hz + 1.9 }], { color: 0xffb04a, size: 4, opacity: 0.6 }));
    const chim = createPlume({ count: 16, height: 9, color: 0xb8bcc4, size: 1.5, opacity: 0.3, speed: 1.2 });
    chim.points.position.set(hx + 1.3, y + 4.8, hz - 0.6); add(chim.points); animated.push(chim);
    // icicles along the roof eaves
    const icGeo = new THREE.ConeGeometry(0.08, 1, 4); icGeo.rotateX(Math.PI); icGeo.translate(0, -0.5, 0);
    const ics = [];
    for (const zs of [-1, 1]) for (let i = 0; i < 12; i++) ics.push({ x: hx - 2.2 + i * 0.4, y: y + 2.75, z: hz + zs * 1.75, sx: 1, sy: 0.3 + rng() * 0.7, sz: 1 });
    add(instanced(icGeo, new THREE.MeshStandardMaterial({ color: 0xd6f4ff, emissive: 0x3aa0d0, emissiveIntensity: 0.4, roughness: 0.1 }), ics, { castShadow: false }));
    L.add({ type: 'box', x: hx, z: hz, hx: 2.25, hz: 1.75 });
    // fishing holes with rods
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x0b2c45 });
    const rodGeo = mergeParts([
      { geo: new THREE.CylinderGeometry(0.03, 0.04, 2.2, 4), color: 0x3b2a1a, matrix: m4(0, 0.9, 0, 0.7, 0, 0) },
      { geo: new THREE.CylinderGeometry(0.006, 0.006, 1.6, 3), color: 0xdddddd, matrix: m4(0, 1.0, 1.55) },
    ]);
    [[5, 4], [-4, 6], [7, -5]].forEach(([dx, dz]) => {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 10), holeMat);
      hole.rotation.x = -Math.PI / 2; hole.position.set(hx + dx, y + 0.06, hz + dz); add(hole);
      const rod = new THREE.Mesh(rodGeo, propMat); rod.position.set(hx + dx, y, hz + dz - 1.4); add(rod);
    });
    // ice floes near the shore
    const floes = [];
    for (let i = 0; i < 26; i++) {
      const a = rng() * 6.28, r = LAKE.r * (0.75 + rng() * 0.25);
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      floes.push({ x, y: iceLevel + 0.1, z, sx: 1.5 + rng() * 3, sy: 0.35, sz: 1 + rng() * 2, ry: rng() * 3, rx: (rng() - 0.5) * 0.15 });
    }
    add(instanced(new THREE.BoxGeometry(1, 1, 1), flatMat({ color: 0xe8f6ff, roughness: 0.3 }), floes, { castShadow: false }));
  }

  // ── abandoned camp ──
  {
    const cy = hy(CAMP.x, CAMP.z);
    const tent = (color) => {
      const prism = (r, len) => { const g = new THREE.CylinderGeometry(r, r, len, 3); g.rotateX(-Math.PI / 2); return g; };
      return mergeParts([
        { geo: prism(1.7, 3.6), color, matrix: m4(0, 0.85, 0) },
        { geo: prism(0.9, 0.05), color: 0x2a1e18, matrix: m4(0, 0.45, 1.82) },
        { geo: new THREE.BoxGeometry(0.5, 0.18, 3.7), color: 0xf6f9fc, matrix: m4(0, 2.55, 0, 0, 0, 0) },
        { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.6, 3), color: 0x333333, matrix: m4(0, 2.8, 1.8) },
      ]);
    };
    const fire = createFire({ light: true, lightIntensity: 70, lightRange: 32, scale: 1.2 });
    fire.group.position.set(CAMP.x, cy, CAMP.z); add(fire.group); animated.push(fire);
    L.add({ x: CAMP.x, z: CAMP.z, r: 1.3 });
    [0xd9542b, 0xe8a23a, 0x3d7fc9].forEach((col, i) => {
      const a = i * 2.1 + 0.4, x = CAMP.x + Math.cos(a) * 7.5, z = CAMP.z + Math.sin(a) * 7.5;
      solid(tent(col), propMat, x, hy(x, z), z, Math.atan2(CAMP.x - x, CAMP.z - z));
      L.add({ x, z, r: 2.1, cr: 2.4 });
    });
    // log benches
    const logGeo = new THREE.CylinderGeometry(0.3, 0.32, 2.4, 7); logGeo.rotateZ(Math.PI / 2);
    const logs = [];
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 1.45, x = CAMP.x + Math.cos(a) * 3.2, z = CAMP.z + Math.sin(a) * 3.2; logs.push({ x, y: cy + 0.3, z, ry: -a, s: 1 }); }
    add(instanced(logGeo, flatMat({ color: 0x6b4428 }), logs));
    // crates, sled, skis, snowman
    const crates = [];
    for (let i = 0; i < 6; i++) { const x = CAMP.x + 10 + (i % 3) * 1.05, z = CAMP.z - 3 + Math.floor(i / 3) * 1.1; crates.push({ x, y: cy + 0.5 + (i === 4 ? 1 : 0), z, s: 1, ry: rng() * 0.3, color: i % 2 ? 0x8a5a33 : 0x9c6a3c }); }
    crates.push({ x: CAMP.x + 11.05, y: cy + 1.5, z: CAMP.z - 2.4, s: 1, color: 0x8a5a33 });
    add(instanced(new THREE.BoxGeometry(1, 1, 1), flatMat({ color: 0xffffff }), crates));
    L.add({ type: 'box', x: CAMP.x + 11.05, z: CAMP.z - 2.45, hx: 1.7, hz: 1.2 });
    const sledGeo = mergeParts([
      { geo: new THREE.BoxGeometry(1.2, 0.12, 2.8), color: 0x8a5a33, matrix: m4(0, 0.5, 0) },
      { geo: new THREE.BoxGeometry(0.08, 0.08, 3.2), color: 0x2b2b2b, matrix: m4(-0.55, 0.12, 0.1) },
      { geo: new THREE.BoxGeometry(0.08, 0.08, 3.2), color: 0x2b2b2b, matrix: m4(0.55, 0.12, 0.1) },
      { geo: new THREE.BoxGeometry(1.0, 0.7, 1.6), color: 0x4f6b3a, matrix: m4(0, 0.9, -0.3) },
      { geo: new THREE.BoxGeometry(1.05, 0.15, 1.65), color: 0xf4f8fc, matrix: m4(0, 1.3, -0.3) },
    ]);
    solid(sledGeo, propMat, CAMP.x - 9, cy, CAMP.z + 6, 0.6); L.add({ x: CAMP.x - 9, z: CAMP.z + 6, r: 1.6 });
    const snowman = mergeParts([
      { geo: new THREE.IcosahedronGeometry(0.85, 1), color: 0xf6f9fc, matrix: m4(0, 0.75, 0) },
      { geo: new THREE.IcosahedronGeometry(0.6, 1), color: 0xf6f9fc, matrix: m4(0, 1.9, 0) },
      { geo: new THREE.IcosahedronGeometry(0.42, 1), color: 0xf6f9fc, matrix: m4(0, 2.75, 0) },
      { geo: new THREE.ConeGeometry(0.08, 0.45, 5), color: 0xf07a1a, matrix: m4(0, 2.72, 0.55, Math.PI / 2, 0, 0) },
      { geo: new THREE.BoxGeometry(0.08, 0.08, 0.05), color: 0x111111, matrix: m4(-0.14, 2.86, 0.38) },
      { geo: new THREE.BoxGeometry(0.08, 0.08, 0.05), color: 0x111111, matrix: m4(0.14, 2.86, 0.38) },
      { geo: new THREE.CylinderGeometry(0.03, 0.04, 1.3, 3), color: 0x4a3020, matrix: m4(0.85, 2.1, 0, 0, 0, -1.0) },
      { geo: new THREE.CylinderGeometry(0.03, 0.04, 1.3, 3), color: 0x4a3020, matrix: m4(-0.85, 2.2, 0, 0, 0, 1.2) },
      { geo: new THREE.CylinderGeometry(0.3, 0.32, 0.4, 8), color: 0x1d1d22, matrix: m4(0, 3.25, 0) },
      { geo: new THREE.TorusGeometry(0.5, 0.08, 4, 12), color: 0xc0392b, matrix: m4(0, 2.35, 0, Math.PI / 2, 0, 0) },
    ]);
    solid(snowman, propMat, CAMP.x + 4, cy, CAMP.z + 11, -0.5); L.add({ x: CAMP.x + 4, z: CAMP.z + 11, r: 0.9 });
    const skiGeo = mergeParts([
      { geo: new THREE.BoxGeometry(0.1, 2, 0.03), color: 0xc0392b, matrix: m4(-0.12, 1, 0, 0, 0, 0.08) },
      { geo: new THREE.BoxGeometry(0.1, 2, 0.03), color: 0xc0392b, matrix: m4(0.12, 1, 0, 0, 0, -0.08) },
      { geo: new THREE.CylinderGeometry(0.02, 0.02, 1.4, 3), color: 0x222222, matrix: m4(0.5, 0.7, 0.1, 0, 0, -0.15) },
    ]);
    solid(skiGeo, propMat, CAMP.x - 5, cy, CAMP.z - 9, 0.4);
    // prayer flags between two poles
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 6, 5);
    const pA = { x: CAMP.x - 12, z: CAMP.z - 5 }, pB = { x: CAMP.x + 6, z: CAMP.z - 14 };
    for (const p of [pA, pB]) { solid(poleGeo, flatMat({ color: 0x5a3d2b }), p.x, hy(p.x, p.z) + 3, p.z); L.add({ x: p.x, z: p.z, r: 0.3 }); }
    add(flagLine({ x: pA.x, y: hy(pA.x, pA.z) + 5.8, z: pA.z }, { x: pB.x, y: hy(pB.x, pB.z) + 5.8, z: pB.z }, { count: 16, sag: 1.4 }));
    add(flagLine({ x: pA.x, y: hy(pA.x, pA.z) + 5.8, z: pA.z }, { x: CAMP.x - 7, y: cy + 2.6, z: CAMP.z + 7 }, { count: 9, sag: 0.8 }));
  }

  // ── trail posts from the camp to the tower ──
  {
    const posts = [], tips = [];
    const ax = CAMP.x, az = CAMP.z, bx = TOWER.x, bz = TOWER.z;
    const n = Math.floor(Math.hypot(bx - ax, bz - az) / 14);
    for (let i = 2; i < n - 1; i++) {
      const t = i / n, wob = Math.sin(t * 7) * 10;
      const x = ax + (bx - ax) * t + wob * 0.6, z = az + (bz - az) * t + wob * 0.4;
      if (!L.free(x, z, 0.5, 0.8)) continue;
      const y = hy(x, z);
      posts.push({ x, y: y + 1, z, s: 1 }); tips.push({ x, y: y + 1.95, z });
      L.add({ x, z, r: 0.2 });
    }
    add(instanced(mergeParts([{ geo: new THREE.CylinderGeometry(0.07, 0.09, 2, 5), color: 0x5a3d2b }, { geo: new THREE.BoxGeometry(0.22, 0.3, 0.22), color: 0xd03a2a, matrix: m4(0, 0.75, 0) }]), propMat, posts));
    add(glowPoints(tips, { color: 0xff6a3a, size: 1.2, opacity: 0.5 }));
  }

  // ── ruined watchtower ──
  {
    const ty = hy(TOWER.x, TOWER.z);
    const towerGeo = new THREE.CylinderGeometry(4.3, 5.1, 14, 14, 6, true);
    const tp = towerGeo.attributes.position;
    const tn = createNoise2D(mulberry32(3));
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
      const a = Math.atan2(z, x);
      if (y > 6.9) tp.setY(i, y - Math.abs(tn(Math.cos(a) * 1.6, Math.sin(a) * 1.6)) * 7.5);
      tp.setX(i, x * (1 + tn(a * 2, y * 0.4) * 0.03)); tp.setZ(i, z * (1 + tn(a * 2 + 9, y * 0.4) * 0.03));
    }
    towerGeo.computeVertexNormals();
    const ng = towerGeo.toNonIndexed();
    const cols = []; const cA = new THREE.Color(0x7d8794), cB = new THREE.Color(0x667080), cS = new THREE.Color(0xeef4fa);
    const pp = ng.attributes.position;
    for (let i = 0; i < pp.count; i += 3) {
      const yy = (pp.getY(i) + pp.getY(i + 1) + pp.getY(i + 2)) / 3;
      const band = Math.floor((yy + 7) / 1.1);
      const c = (band % 2 ? cA : cB).clone().lerp(cS, yy < -6 ? 0.8 : 0);
      for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
    }
    ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    solid(ng, flatMat({ vertexColors: true, side: THREE.DoubleSide }), TOWER.x, ty + 6.6, TOWER.z);
    L.add({ x: TOWER.x, z: TOWER.z, r: 5.2, cr: 5.6 });
    const det = mergeParts([
      { geo: new THREE.BoxGeometry(1.6, 2.6, 0.6), color: 0x1d2029, matrix: m4(0, 1.3, 4.95) },
      { geo: new THREE.BoxGeometry(2.2, 0.4, 0.8), color: 0x5a6270, matrix: m4(0, 2.75, 4.95) },
      ...[0.8, 2.3, 3.9].map((a) => ({ geo: new THREE.BoxGeometry(0.35, 1.1, 0.4), color: 0x1d2029, matrix: m4(Math.sin(a) * 4.55, 7 + (a % 1) * 2, Math.cos(a) * 4.55, 0, a, 0) })),
    ]);
    solid(det, propMat, TOWER.x, ty, TOWER.z);
    // broken walls running out from the tower (axis-aligned so they collide as boxes)
    const wallMat = flatMat({ vertexColors: true });
    const wall = (len, h) => mergeParts([
      { geo: new THREE.BoxGeometry(len, h, 1.2), color: 0x707a88, matrix: m4(0, h / 2, 0) },
      { geo: new THREE.BoxGeometry(len * 0.98, 0.25, 1.3), color: 0xf3f7fc, matrix: m4(0, h + 0.1, 0) },
    ]);
    solid(wall(9, 2.6), wallMat, TOWER.x + 9.5, ty, TOWER.z); L.add({ type: 'box', x: TOWER.x + 9.5, z: TOWER.z, hx: 4.5, hz: 0.6 });
    solid(wall(4, 1.4), wallMat, TOWER.x + 17, ty, TOWER.z); L.add({ type: 'box', x: TOWER.x + 17, z: TOWER.z, hx: 2, hz: 0.6 });
    const wz = wall(7, 2.0); wz.rotateY(Math.PI / 2);
    solid(wz, wallMat, TOWER.x, ty, TOWER.z - 9); L.add({ type: 'box', x: TOWER.x, z: TOWER.z - 9, hx: 0.6, hz: 3.5 });
    const rub = [];
    for (let i = 0; i < 26; i++) { const a = rng() * 6.28, r = 5.5 + rng() * 8; const x = TOWER.x + Math.cos(a) * r, z = TOWER.z + Math.sin(a) * r; const s = 0.4 + rng() * 0.9; rub.push({ x, y: hy(x, z) + s * 0.3, z, s, ry: rng() * 3, rx: rng(), color: rng() < 0.5 ? 0x7d8794 : 0x667080 }); }
    add(instanced(new THREE.BoxGeometry(1, 0.7, 0.9), flatMat({ color: 0xffffff }), rub));
    // a banner of prayer flags from the tower lip down to a post
    const post = { x: TOWER.x - 10, z: TOWER.z + 9 };
    solid(new THREE.CylinderGeometry(0.08, 0.1, 4, 5), flatMat({ color: 0x5a3d2b }), post.x, hy(post.x, post.z) + 2, post.z);
    add(flagLine({ x: TOWER.x - 3.4, y: ty + 10, z: TOWER.z + 2.6 }, { x: post.x, y: hy(post.x, post.z) + 3.9, z: post.z }, { count: 14, sag: 1.6 }));
  }

  // ── mammoth skeleton (walk through the ribcage) ──
  {
    const bone = flatMat({ color: 0xe9dfc9 });
    const my = hy(MAMMOTH.x, MAMMOTH.z) - 0.4;
    const ribs = [];
    for (let i = 0; i < 8; i++) {
      const r = 3.4 - Math.abs(i - 3.5) * 0.28;
      const geo = new THREE.TorusGeometry(r, 0.2, 5, 14, Math.PI); geo.rotateY(Math.PI / 2);
      const x = MAMMOTH.x - 7 + i * 1.9;
      const m = solid(geo, bone, x, my, MAMMOTH.z); m.rotation.x = 0; ribs.push(m);
      L.add({ x, z: MAMMOTH.z + r, r: 0.4, cr: 0.2 }); L.add({ x, z: MAMMOTH.z - r, r: 0.4, cr: 0.2 });
    }
    const spine = new THREE.CylinderGeometry(0.32, 0.38, 16, 7); spine.rotateZ(Math.PI / 2);
    solid(spine, bone, MAMMOTH.x - 0.5, my + 3.4, MAMMOTH.z);
    const verts = [];
    for (let i = 0; i < 14; i++) verts.push({ x: MAMMOTH.x - 7.5 + i * 1.1, y: my + 3.8, z: MAMMOTH.z, s: 0.5 + Math.sin(i / 13 * Math.PI) * 0.4, sy: 0.8 + Math.sin(i / 13 * Math.PI) * 0.6 });
    add(instanced(new THREE.BoxGeometry(0.4, 1, 0.3), bone, verts));
    const skull = new THREE.Group(); skull.position.set(MAMMOTH.x + 9.5, my + 1.7, MAMMOTH.z); skull.rotation.z = -0.25; add(skull);
    const sk = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 1), bone); sk.scale.set(1.25, 1.1, 1.05); sk.castShadow = true; skull.add(sk);
    const sock = new THREE.MeshBasicMaterial({ color: 0x2a241c });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), sock); e.position.set(1.6, 0.5, s * 0.9); skull.add(e);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(1.6, -0.6, s * 0.7), new THREE.Vector3(3.8, -1.6, s * 1.3), new THREE.Vector3(6.2, -0.6, s * 1.9), new THREE.Vector3(7.4, 1.8, s * 1.1), new THREE.Vector3(6.8, 3.2, s * 0.3)]);
      const tusk = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.3, 6), flatMat({ color: 0xf2ead8 })); tusk.castShadow = true; skull.add(tusk);
    }
    L.add({ x: MAMMOTH.x + 9.8, z: MAMMOTH.z, r: 2.3 });
    L.add({ x: MAMMOTH.x + 15.2, z: MAMMOTH.z + 1.8, r: 0.7 }); L.add({ x: MAMMOTH.x + 15.2, z: MAMMOTH.z - 1.8, r: 0.7 });
    const loose = [];
    for (let i = 0; i < 9; i++) { const a = rng() * 6.28, r = 6 + rng() * 9; loose.push({ x: MAMMOTH.x + Math.cos(a) * r, y: my + 0.6, z: MAMMOTH.z + Math.sin(a) * r, s: 0.7 + rng() * 0.6, rz: Math.PI / 2, ry: rng() * 3 }); }
    add(instanced(mergeParts([{ geo: new THREE.CylinderGeometry(0.2, 0.2, 3, 6), color: 0xe9dfc9 }, { geo: new THREE.IcosahedronGeometry(0.4, 0), color: 0xe9dfc9, matrix: m4(0, 1.5, 0) }, { geo: new THREE.IcosahedronGeometry(0.4, 0), color: 0xe9dfc9, matrix: m4(0, -1.5, 0) }]), propMat, loose));
  }

  // ── crevasse field: blue-ice ridges and arches ──
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xa8e8ff, emissive: 0x2a8fbf, emissiveIntensity: 0.5, roughness: 0.1, flatShading: true, transparent: true, opacity: 0.9 });
  {
    const ridges = [];
    for (let i = 0; i < 16; i++) {
      const a = rng() * 6.28, r = rng() * 26;
      const x = CREVASSE.x + Math.cos(a) * r, z = CREVASSE.z + Math.sin(a) * r;
      if (PORTAL_SPOTS.some((p) => Math.hypot(x - p.x, z - p.z) < 20)) continue;
      const len = 4 + rng() * 6, ry = rng() * 3.14, h = 1.4 + rng() * 2.4;
      ridges.push({ x, y: hy(x, z) + h * 0.25, z, sx: len, sy: h, sz: 1 + rng() * 0.8, ry });
      for (const k of [-0.6, 0, 0.6]) L.add({ x: x + Math.cos(ry) * len * k, z: z - Math.sin(ry) * len * k, r: 1.1 });
    }
    add(instanced(new THREE.OctahedronGeometry(1, 0), iceMat, ridges));
    [[-14, 8, 0.4, 6.5], [12, -6, 1.6, 5.2], [2, 18, 2.6, 7.5]].forEach(([dx, dz, ry, r]) => {
      const x = CREVASSE.x + dx, z = CREVASSE.z + dz;
      const geo = new THREE.TorusGeometry(r, 1.0, 5, 16, Math.PI);
      const p = geo.attributes.position; const an = createNoise2D(mulberry32(dx * 7 + 3));
      for (let i = 0; i < p.count; i++) { const k = 1 + an(p.getX(i) * 0.4, p.getY(i) * 0.4) * 0.25; p.setZ(i, p.getZ(i) * k); }
      geo.computeVertexNormals();
      const m = solid(geo, iceMat, x, hy(x, z) - 0.6, z, ry);
      m.scale.set(1, 1.15, 1);
      for (const s of [-1, 1]) L.add({ x: x + Math.cos(ry) * r * s, z: z - Math.sin(ry) * r * s, r: 1.4 });
    });
    const shards = [];
    for (let i = 0; i < Math.floor(160 * density); i++) {
      const a = rng() * 6.28, r = rng() * 34; const x = CREVASSE.x + Math.cos(a) * r, z = CREVASSE.z + Math.sin(a) * r;
      const s = 0.15 + rng() * 0.4;
      shards.push({ x, y: hy(x, z) + s, z, s, sy: s * (2 + rng() * 2), rx: (rng() - 0.5), rz: (rng() - 0.5), ry: rng() * 3 });
    }
    add(instanced(new THREE.OctahedronGeometry(1, 0), iceMat, shards, { castShadow: false }));
  }

  // ── frozen waterfall: a rock cliff with a cascade of ice frozen mid-fall ──
  {
    const fallMat = extendMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.08, flatShading: true, transparent: true, opacity: 0.92 }), { instanceGlow: true });
    const pal = [0xbff0ff, 0x9fdcf7, 0xd8f8ff, 0x7cc4ea];
    const px = -FALLS.dz, pz = FALLS.dx; // across the falls
    const at = (r, k) => ({ x: FALLS.dx * r + px * k, z: FALLS.dz * r + pz * k });
    const by = hy(fallsBase.x, fallsBase.z);
    // cliff: stacked, stretched boulders forming a wall behind the pool
    const cliff = [];
    for (let k = -22; k <= 22; k += 3.2) {
      for (let lvl = 0; lvl < 4; lvl++) {
        const top = 26 - Math.abs(k) * 0.35;
        const yb = lvl * top / 4;
        if (yb > top) continue;
        const p = at(258 + lvl * 1.6 + rng() * 2, k + (rng() - 0.5) * 2);
        const s = 4 + rng() * 2.5;
        cliff.push({ x: p.x, y: by + yb + s * 0.5, z: p.z, sx: s, sy: top / 4 + 2.5, sz: s, ry: rng() * 3, color: lvl % 2 ? 0x5e6a7a : 0x4c5768 });
      }
      const p = at(262, k);
      cliff.push({ x: p.x, y: by + 26 - Math.abs(k) * 0.35 + 1, z: p.z, sx: 4.5, sy: 1.2, sz: 4.5, ry: rng() * 3, color: 0xf3f7fc });
    }
    add(instanced(new THREE.DodecahedronGeometry(1, 0), flatMat({ color: 0xffffff }), cliff));
    // the frozen cascade: long hanging columns from the lip, bulging at the foot
    const cols = [];
    for (let k = -7; k <= 7; k += 0.9) {
      const edge = 1 - Math.abs(k) / 8;
      const lip = 25 - Math.abs(k) * 0.35;
      const len = lip * (0.55 + 0.45 * edge) * (0.85 + rng() * 0.15);
      const p = at(255.5 + rng() * 1.2 + (1 - edge) * 1.5, k + (rng() - 0.5) * 0.4);
      const s = 0.6 + rng() * 0.5 + edge * 0.5;
      cols.push({ x: p.x, y: by + lip - len, z: p.z, sx: s, sy: len, sz: s, ry: rng() * 3, color: pal[Math.floor(rng() * pal.length)] });
    }
    const colGeo = new THREE.CylinderGeometry(0.45, 0.8, 1, 6); colGeo.translate(0, 0.5, 0);
    add(instanced(colGeo, fallMat, cols, { castShadow: false }));
    const foot = [];
    for (let i = 0; i < 26; i++) { const p = at(252 + rng() * 4, (rng() - 0.5) * 16); const s = 1 + rng() * 1.8; foot.push({ x: p.x, y: by + s * 0.4, z: p.z, s, sy: s * 0.7, ry: rng() * 3, color: pal[Math.floor(rng() * pal.length)] }); }
    add(instanced(new THREE.IcosahedronGeometry(1, 0), fallMat, foot, { castShadow: false }));
    const pool = new THREE.Mesh(new THREE.CircleGeometry(12, 24), new THREE.MeshStandardMaterial({ color: 0xd6f4ff, emissive: 0x2aa7d8, emissiveIntensity: 0.45, roughness: 0.05 }));
    const pp = at(246, 0);
    pool.rotation.x = -Math.PI / 2; pool.position.set(pp.x, by + 0.12, pp.z); add(pool);
    const glints = [];
    for (let i = 0; i < 40; i++) { const p = at(254 + rng() * 3, (rng() - 0.5) * 14); glints.push({ x: p.x, y: by + rng() * 22, z: p.z }); }
    add(glowPoints(glints, { color: 0x9fe8ff, size: 2.2, opacity: 0.5 }));
    for (let k = -20; k <= 20; k += 4) { const p = at(256, k); L.add({ x: p.x, z: p.z, r: 3 }); }
  }

  // ── forests: snowy pines, tall spruces, dead trees ──
  const pineGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.22, 0.32, 1.6, 6), color: 0x5a3d2b, matrix: m4(0, 0.8, 0) },
    { geo: new THREE.ConeGeometry(1.9, 2.6, 7), color: 0x2d5a4c, matrix: m4(0, 2.4, 0) },
    { geo: new THREE.ConeGeometry(1.05, 0.9, 7), color: 0xf0f5fb, matrix: m4(0, 3.15, 0) },
    { geo: new THREE.ConeGeometry(1.5, 2.2, 7), color: 0x2a5446, matrix: m4(0, 3.8, 0) },
    { geo: new THREE.ConeGeometry(0.85, 0.8, 7), color: 0xf0f5fb, matrix: m4(0, 4.45, 0) },
    { geo: new THREE.ConeGeometry(1.0, 1.8, 7), color: 0x27503f, matrix: m4(0, 5.1, 0) },
    { geo: new THREE.ConeGeometry(0.55, 0.8, 7), color: 0xf5f9fd, matrix: m4(0, 5.75, 0) },
  ]);
  const spruceGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.16, 0.24, 2.4, 5), color: 0x4a3222, matrix: m4(0, 1.2, 0) },
    ...[0, 1, 2, 3, 4].map((k) => ({ geo: new THREE.ConeGeometry(1.25 - k * 0.2, 2.1, 6), color: k % 2 ? 0x1f4a3c : 0x23503f, matrix: m4(0, 2.4 + k * 1.45, 0, 0, k * 0.5, 0) })),
    { geo: new THREE.ConeGeometry(0.5, 0.5, 6), color: 0xf0f5fb, matrix: m4(0, 8.6, 0) },
    { geo: new THREE.ConeGeometry(0.95, 0.35, 6), color: 0xf0f5fb, matrix: m4(0, 3.25, 0) },
  ]);
  const deadGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.12, 0.3, 5, 5), color: 0x4b3d33, matrix: m4(0, 2.5, 0) },
    { geo: new THREE.CylinderGeometry(0.05, 0.1, 2.2, 4), color: 0x4b3d33, matrix: m4(0.7, 3.2, 0, 0, 0, -0.9) },
    { geo: new THREE.CylinderGeometry(0.05, 0.09, 1.8, 4), color: 0x4b3d33, matrix: m4(-0.6, 3.9, 0.2, 0.2, 0, 0.8) },
    { geo: new THREE.CylinderGeometry(0.04, 0.08, 1.5, 4), color: 0x4b3d33, matrix: m4(0.1, 4.3, -0.6, -0.9, 0, 0) },
    { geo: new THREE.CylinderGeometry(0.03, 0.06, 1.2, 4), color: 0x4b3d33, matrix: m4(0.4, 4.8, 0.4, 0.6, 0, -0.5) },
    { geo: new THREE.BoxGeometry(0.9, 0.08, 0.2), color: 0xf0f5fb, matrix: m4(0.7, 3.65, 0, 0, 0, -0.9) },
  ]);
  const pines = [], spruces = [], deads = [];
  for (const p of scatterPoints(rng, Math.floor(620 * density), R - 6, (x, z) => n4(x * 0.012, z * 0.012) > -0.1 && L.free(x, z, 1.5))) {
    const s = 0.85 + rng() * 1.15;
    const elev = hy(p.x, p.z);
    const kind = rng() < 0.07 ? 'dead' : (elev > 14 || n5(p.x * 0.03, p.z * 0.03) > 0.25) ? 'spruce' : 'pine';
    const item = { x: p.x, y: elev - 0.2, z: p.z, ry: rng() * 6.28, s };
    (kind === 'dead' ? deads : kind === 'spruce' ? spruces : pines).push(item);
    L.add({ x: p.x, z: p.z, r: 0.45 * s, cr: (kind === 'dead' ? 0.6 : 1.6) * s });
  }
  for (const p of scatterPoints(rng, Math.floor(40 * density), R - 6, (x, z) => L.free(x, z, 2))) {
    deads.push({ x: p.x, y: hy(p.x, p.z) - 0.2, z: p.z, ry: rng() * 6.28, s: 0.8 + rng() * 0.6 }); L.add({ x: p.x, z: p.z, r: 0.35 });
  }
  add(instanced(pineGeo, propMat, pines));
  add(instanced(spruceGeo, propMat, spruces));
  add(instanced(deadGeo, propMat, deads));

  // ── rocks, snow-capped boulders, cairns ──
  const rockGeo = mergeParts([
    { geo: new THREE.DodecahedronGeometry(1, 0), color: 0x6b7b90 },
    { geo: new THREE.DodecahedronGeometry(0.7, 0), color: 0xeef4fa, matrix: m4(0.1, 0.55, 0, 0, 0, 0, 1, 0.4, 1) },
  ]);
  const rocks = [];
  for (const p of scatterPoints(rng, Math.floor(180 * density), R - 6, (x, z) => L.free(x, z, 2))) {
    const s = 0.8 + rng() * (rng() < 0.12 ? 5 : 2.6);
    rocks.push({ x: p.x, y: hy(p.x, p.z) + s * 0.2, z: p.z, ry: rng() * 6, s, sy: s * (0.6 + rng() * 0.4) });
    L.add({ x: p.x, z: p.z, r: s * 0.85 });
  }
  add(instanced(rockGeo, propMat, rocks));
  const cairnGeo = mergeParts([0, 1, 2, 3, 4].map((k) => ({ geo: new THREE.DodecahedronGeometry(0.55 - k * 0.08, 0), color: k % 2 ? 0x7a8696 : 0x5e6a7a, matrix: m4((k % 2 - 0.5) * 0.08, 0.3 + k * 0.62, 0, 0, k, 0, 1, 0.65, 1) })));
  const cairns = [];
  for (const p of scatterPoints(rng, Math.floor(26 * density) + 6, R - 10, (x, z) => L.free(x, z, 2))) { cairns.push({ x: p.x, y: hy(p.x, p.z), z: p.z, s: 1 + rng() * 0.6, ry: rng() * 3 }); L.add({ x: p.x, z: p.z, r: 0.6 }); }
  add(instanced(cairnGeo, propMat, cairns));

  // ── ice spire clusters + 3 giant monoliths ──
  const spireGeo = new THREE.OctahedronGeometry(1, 0); spireGeo.scale(1, 4, 1);
  const spires = [];
  for (const c of scatterPoints(rng, Math.floor(24 * density) + 4, R - 15, (x, z) => L.free(x, z, 6))) {
    const k = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < k; i++) {
      const x = c.x + (rng() - 0.5) * 6, z = c.z + (rng() - 0.5) * 6, s = 0.6 + rng() * 1.2;
      spires.push({ x, y: hy(x, z) + s * 2, z, rx: (rng() - 0.5) * 0.5, rz: (rng() - 0.5) * 0.5, ry: rng() * 3, s });
    }
    L.add({ x: c.x, z: c.z, r: 3.5 });
  }
  for (const c of [{ x: -90, z: -30 }, { x: 120, z: 120 }, { x: 30, z: -200 }]) {
    spires.push({ x: c.x, y: hy(c.x, c.z) + 14, z: c.z, ry: rng() * 3, s: 4.2, sy: 4.2 });
    L.add({ x: c.x, z: c.z, r: 4.6 });
  }
  add(instanced(spireGeo, iceMat, spires));

  // ── ground detail: drifts, snowy shrubs, dry grass, pebbles ──
  const drifts = [];
  for (const p of scatterPoints(rng, Math.floor(160 * density), R - 6, (x, z) => L.free(x, z, 1, 0.4))) {
    const s = 1.5 + rng() * 3.5; drifts.push({ x: p.x, y: hy(p.x, p.z) - s * 0.12, z: p.z, sx: s * (1.4 + rng()), sy: s * 0.28, sz: s, ry: rng() * 3 });
  }
  add(instanced(new THREE.IcosahedronGeometry(1, 1), flatMat({ color: 0xf6f9fd, roughness: 1 }), drifts, { castShadow: false }));
  const shrubGeo = mergeParts([
    { geo: new THREE.DodecahedronGeometry(0.6, 0), color: 0x2f5a46, matrix: m4(0, 0.4, 0) },
    { geo: new THREE.DodecahedronGeometry(0.45, 0), color: 0x2a5040, matrix: m4(0.45, 0.3, 0.2) },
    { geo: new THREE.DodecahedronGeometry(0.5, 0), color: 0xf0f5fb, matrix: m4(0.1, 0.72, 0, 0, 0, 0, 1, 0.45, 1) },
  ]);
  const shrubs = [];
  for (const p of scatterPoints(rng, Math.floor(260 * density), R - 6, (x, z) => L.free(x, z, 0.8))) shrubs.push({ x: p.x, y: hy(p.x, p.z) - 0.1, z: p.z, s: 0.7 + rng() * 0.9, ry: rng() * 6 });
  add(instanced(shrubGeo, propMat, shrubs));
  const bladeParts = [];
  for (let k = 0; k < 6; k++) bladeParts.push({ geo: new THREE.ConeGeometry(0.05, 0.75, 3), color: k % 2 ? 0xa39270 : 0x8a7a58, matrix: m4(Math.cos(k) * 0.12, 0.37, Math.sin(k) * 0.12, Math.sin(k * 2) * 0.35, 0, Math.cos(k * 3) * 0.35) });
  const grass = [];
  for (const p of scatterPoints(rng, Math.floor(1300 * density), R - 6, (x, z) => n5(x * 0.03, z * 0.03) < -0.1 && L.free(x, z, 0.2, 0.5))) grass.push({ x: p.x, y: hy(p.x, p.z) - 0.05, z: p.z, s: 0.45 + rng() * 0.5, ry: rng() * 6 });
  add(instanced(mergeParts(bladeParts), swayMat({ vertexColors: true }, { amp: 0.18, speed: 2.2, power: 2 }), grass, { castShadow: false }));
  const pebbles = [];
  for (const p of scatterPoints(rng, Math.floor(700 * density), R - 6, (x, z) => L.free(x, z, 0.1, 0.7))) { const s = 0.08 + rng() * 0.22; pebbles.push({ x: p.x, y: hy(p.x, p.z) + s * 0.2, z: p.z, s, ry: rng() * 3, color: rng() < 0.5 ? 0x5e6a7a : 0x8794a6 }); }
  add(instanced(new THREE.DodecahedronGeometry(1, 0), flatMat({ color: 0xffffff }), pebbles, { castShadow: false }));

  // ── sky: dusk stars, moon, aurora, horizon, light, snow ──
  const sunDir = [0.62, 0.2, -0.55];
  const sky = createSky({ top: 0x13295a, horizon: HORIZON, bottom: 0xdfe8f3, sunDir, sunColor: 0xffb894, sunGlow: 0.55, exponent: 0.45 });
  const auroraMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; uniform float uTime; void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x*0.012 + uTime*0.25)*40.0 + sin(p.x*0.031 - uTime*0.4)*14.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime;
      void main(){ float curtain = 0.5+0.5*sin(vUv.x*140.0 + sin(vUv.x*13.0+uTime*0.6)*3.0 + uTime*0.8);
        float fade = smoothstep(0.0,0.25,vUv.y)*(1.0-smoothstep(0.45,1.0,vUv.y))*smoothstep(0.0,0.15,vUv.x)*(1.0-smoothstep(0.85,1.0,vUv.x));
        vec3 col = mix(vec3(0.15,1.0,0.6), vec3(0.6,0.35,1.0), vUv.y);
        gl_FragColor = vec4(col, fade*(0.2+0.6*curtain)*0.32);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
  const aurora = new THREE.Group();
  [[-300, 520, -620, 0.15], [250, 560, -650, -0.25], [-650, 500, 50, 1.4]].forEach(([x, y, z, r]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(900, 160, 80, 1), auroraMat);
    m.position.set(x, y, z); m.rotation.y = r; m.rotation.x = 0.55;
    aurora.add(m);
  });
  const starPos = []; const sr = mulberry32(17);
  for (let i = 0; i < 700; i++) { const th = sr() * 6.28, y = 0.35 + sr() * 0.65, rr = Math.sqrt(1 - y * y); starPos.push(Math.cos(th) * rr * 1300, y * 1300, Math.sin(th) * rr * 1300); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe9ff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.55, toneMapped: false }));
  stars.frustumCulled = false;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(34, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf4f1ff, fog: false, toneMapped: false }));
  moon.position.set(-520, 640, 700);
  const moonHalo = glowPoints([{ x: -520, y: 640, z: 700 }], { color: 0xbfd2ff, size: 260, opacity: 0.35 }); moonHalo.material.sizeAttenuation = true; moonHalo.material.fog = false;
  const rn = createNoise2D(mulberry32(9));
  const ringFar = createHorizonRing({ radius: 1100, color: 0x9fb4d4, minH: 60, maxH: 260, segments: 90, profile: (a) => Math.pow(1 - Math.abs(rn(Math.cos(a) * 3, Math.sin(a) * 3)), 2) });
  const ringNear = createHorizonRing({ radius: 950, color: 0x8aa2c4, minH: 20, maxH: 140, segments: 70, profile: (a) => Math.pow(1 - Math.abs(rn(Math.cos(a) * 5 + 9, Math.sin(a) * 5)), 2.4) });
  const follower = skyFollower(sky, stars, moon, moonHalo, aurora, ringFar, ringNear);
  add(follower.group);
  const lights = createLighting(scene, { sunColor: 0xffd2bc, sunIntensity: 2.0, sunDir, sky: 0xa9c3ea, ground: 0xe4ecf7, hemiIntensity: 1.25, shadowMap: quality.shadowMap });
  const snowFx = createParticles({ count: Math.floor(1500 * density), area: [90, 45, 90], color: 0xffffff, size: 0.2, opacity: 0.95, velocity: [1.4, -2.4, 0.5], sway: 0.8 });
  const driftFx = createParticles({ count: Math.floor(500 * density), area: [70, 2.5, 70], color: 0xffffff, size: 0.14, opacity: 0.6, velocity: [7, 0.2, 2.5], sway: 1.5 });
  add(snowFx.points); add(driftFx.points);
  driftFx.points.position.y = 0;
  const cave = createIceCave({ scene, groundAt: heightAt, sites: caveSites, holeUniform, colliders, density });
  // the ground everything stands on: the ice hole where it is open, the terrain everywhere else
  const worldHeight = (x, z) => cave.heightAt(x, z) ?? heightAt(x, z);
  const note = createNotePickup({ scene, heightAt: worldHeight });
  const storms = createSnowStorms({ scene, heightAt: worldHeight, createParticles, density });
  const inSite = (x, z) => caveSites.some((c) => Math.abs(x - c.x) < SITE_CLEAR && Math.abs(z - c.z) < SITE_CLEAR && Math.hypot(x - c.x, z - c.z) < SITE_CLEAR);
  let sketch = null;
  // both glacier mechanics in one: the cave picks its spot first, then the storm devices keep clear of it
  const mechanics = {
    signals: storms.signals,
    get storm() { return storms.storm; },
    get devices() { return storms.devices; },
    setup(ctx) {
      cave.setup(ctx);
      note.setup({ base: ctx.base, isValidSpot: ctx.world.isValidSpot });
      storms.setup({ ...ctx, avoid: cave.avoid() });
    },
    update(dt, t, ctx) {
      // down in the ice hole (the pit or the cave) you're hidden: any storm dies at once and none can start, so the
      // Yeti, which already loses you there, has no storm to find you again by when you climb out
      const hidden = cave.sheltered(ctx.player);
      if (hidden) storms.calm(ctx.audio);
      storms.update(dt, t, hidden ? { ...ctx, enabled: false } : ctx);
      cave.update(dt, t, ctx);
      note.update(t, ctx.player);
    },
    reset() { storms.reset(); cave.reset(); note.hide(); },
    grantAll() { note.grant(); cave.grant(); },
    onGemInserted(ctx) { storms.onGemInserted({ ...ctx, avoid: cave.avoid() }); },
    // read by main.js
    canCall: () => false,          // the gems here never answer the call: the explorers' map shows them instead
    hasMap: () => cave.hasMap,
    action: () => (note.canTake ? { id: 'take-note', label: tr('actions.takeNote'), icon: 'note' }
      : cave.canTake ? { id: 'take-map', label: tr('actions.takeMap'), icon: 'map' } : null),
    // taking the map also reshuffles the storm devices (cues placed after the map's own chime)
    doAction: (ctx) => {
      if (note.canTake) return note.take(ctx);
      const took = cave.take(ctx);
      if (took) storms.shift({ ...ctx, avoid: cave.avoid() }, { soundAt: 1.4, toastAt: 1.6 });
      return took;
    },
    mapMarks: () => ({ hole: cave.marker() }),
    // the note found near the start, one of your items for the whole world once taken
    briefing: () => (note.held ? {
      image: sketch || (sketch = holeSketch()),
      text: tr('glacier.note'),
    } : null),
  };
  const trees = [...pines, ...spruces].filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, z: p.z }));

  return {
    scene, radius: R, heightAt: worldHeight, groundAt: heightAt, colliders,
    portalSpots: PORTAL_SPOTS,
    isValidSpot: (x, z) => !inLake(x, z) && !inSite(x, z) && slopeAt(heightAt, x, z) < 0.6 && Math.hypot(x, z) < R - 12,
    // the ice hole: its walls stop you, the camera stays inside it, the Yeti can't come in and loses you while you're in
    constrainMove: cave.constrainMove,
    constrainCamera: cave.constrainCamera,
    fixedShot: cave.fixedShot,
    hunterKeepOut: cave.keepOut,
    isSheltered: cave.sheltered,
    mapInfo: {
      title: tr('glacier.name'),
      kind: (x, z) => (inLake(x, z) ? 'lake' : Math.hypot(x, z) > R - 10 || slopeAt(heightAt, x, z, 5) > 0.75 ? 'rock' : 'ground'),
      trees,
      landmarks: [
        { ...CAMP, label: tr('glacier.places.camp') }, { ...TOWER, label: tr('glacier.places.tower') }, { ...MAMMOTH, label: tr('glacier.places.mammoth') },
        { ...CREVASSE, label: tr('glacier.places.arches') }, { x: LAKE.x - 10, z: LAKE.z - 30, label: tr('glacier.places.lake') },
        { x: FALLS.dx * 236, z: FALLS.dz * 236, label: tr('glacier.places.falls') },
      ],
    },
    createMonsterBody: createYeti,
    createMonsterBrain: () => new YetiBrain(),
    mechanics,
    iceCave: cave, // handy for debugging from the console (window.__game.world.iceCave)
    audio: {
      ambient: {
        layers: [
          { type: 'noise', filter: 'bandpass', freq: 700, q: 0.8, gain: 0.2, lfoRate: 0.07, lfoDepth: 450 },
          { type: 'noise', filter: 'highpass', freq: 3500, q: 0.5, gain: 0.025, lfoRate: 0.11, lfoDepth: 1500 },
        ],
      },
      music: MUSIC,
      footstep: { filter: 'highpass', freq: 2200, q: 0.7, decay: 0.13, gain: 0.3 },
      growl: { type: 'sawtooth', baseFreq: 70, filterFreq: 520, decay: 1.6, gain: 0.5, glide: 0.75, noise: 0.6 },
    },
    update(dt, t, camera, playerPos) {
      tickShared(t);
      follower.update(camera);
      auroraMat.uniforms.uTime.value = t;
      lights.update(playerPos);
      snowFx.update(dt, playerPos, t);
      driftFx.update(dt, { x: playerPos.x, y: playerPos.y + 4.5, z: playerPos.z }, t);
      for (const a of animated) a.update(dt, t);
    },
  };
}

// Soundtrack: slow, glassy D minor — bells over a cold pad. Layers wake up as the Yeti closes in.
const MUSIC = {
  bpm: 66,
  root: 50, // D3
  scale: [0, 2, 3, 5, 7, 8, 10],
  chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 12]],
  barsPerChord: 2,
  pad: { wave: 'triangle', gain: 0.045, filter: 1000, attack: 2.2 },
  drone: { notes: [0, 7], wave: 'sine', gain: 0.03, octave: -1 },
  melody: { inst: 'bell', gain: 0.05, octave: 2, density: [0.14, 0.32], range: 9 },
  bass: { inst: 'soft', gain: 0.11, octave: -1, pattern: 'x.......x.....x.', from: 0.3 },
  arp: { inst: 'glass', gain: 0.032, octave: 1, pattern: 'x.x.x.x.x.x.x.x.', from: 0.55 },
  perc: [
    { inst: 'shaker', pattern: '..x...x...x...x.', gain: 0.05, from: 0.25 },
    { inst: 'tom', pattern: 'x.........x.....', gain: 0.22, from: 0.45 },
    { inst: 'kick', pattern: 'x.......x.......', gain: 0.3, from: 0.7 },
    { inst: 'hat', pattern: 'x.xxx.xxx.xxx.xx', gain: 0.025, from: 0.8 },
  ],
};


// This world's text, per language (see i18n/CLAUDE.md). Reached as tr('glacier.<key>'), also by its mechanics.
const STRINGS = {
  en: {
    name: 'The Frozen Peaks',
    tab: 'Glacier',
    tagline: 'Wind, ice, white silence.',
    hunter: 'The Yeti',
    note: 'Thought I saw ice spikes in a circle somewhere...',
    sketch: 'Sketch of a ring of tall blue ice spikes standing on a snowy rise, with mountains behind',
    windsChanging: 'Winds are changing…',
    firstStorm: 'Snow storms... make the Yeti so hungry!',
    places: { camp: 'Camp', tower: 'Watchtower', mammoth: 'Mammoth', arches: 'Ice arches', lake: 'Frozen lake', falls: 'Frozen falls' },
    settings: {
      detectIn: { label: 'Yeti approach distance', hint: 'It approaches when you come this close, and gives up once you are farther than this.' },
      yetiSpeed: { label: 'Yeti approach speed', hint: 'Share of your running speed V. With 1 / 2 / 3 gems you run at {carry}%.' },
      stormSprint: { label: 'Yeti storm sprint', hint: 'Its speed in a storm while farther than its approach distance, as a share of V.' },
      stormClose: { label: 'Yeti storm close chase', hint: 'Its speed in a storm once within its approach distance, as a share of V. You run at 100% with no gems, {carry}% with 1 / 2 / 3. Above 100% you can\'t outrun it.' },
      forget: { label: 'Yeti forget time', hint: 'After giving up, it won\'t approach you again for this long (storms still bring it).' },
      devices: { label: 'Storm devices', hint: 'Hidden devices, spread evenly over the map.' },
      reach: { label: 'Device trigger radius', hint: 'Come this close to a device and a storm breaks out.' },
      stormMin: { label: 'Storm radius · min' },
      stormMax: { label: 'Storm radius · max', hint: 'Each storm picks a random radius in this range.' },
      caveMinDist: { label: 'Ice hole distance', hint: 'The hole with the explorers\' map never opens closer than this to the portal or to where you start.' },
    },
  },
};

export default {
  id: 'glacier',
  strings: STRINGS,
  theme,
  // the gems here: a cluster of ice prisms, dark grey while hidden, clear blue once revealed (entities/gemDesigns.js)
  gem: { style: 'cluster', dark: 0x5d6168, col: 0x3d86e0, glow: 0x5aa8ff },
  createPortalFrame,
  build,
  // per-level settings shown in the menu (Settings → Levels)
  settings: [
    {
      id: 'detectIn', text: 'glacier.settings.detectIn', unit: 'm', min: 20, max: 250, step: 5,
      get: () => GLACIER.detectIn, set: (v) => { GLACIER.detectIn = v; },
    },
    {
      id: 'yetiSpeed', text: 'glacier.settings.yetiSpeed', unit: 'pct', min: 40, max: 100, step: 1, vars: () => ({ carry: carryText() }),
      get: () => Math.round(GLACIER.speed.approach * 100), set: (v) => { GLACIER.speed.approach = v / 100; },
    },
    {
      id: 'stormSprint', text: 'glacier.settings.stormSprint', unit: 'pct', min: 100, max: 400, step: 10,
      get: () => Math.round(GLACIER.speed.stormFar * 100), set: (v) => { GLACIER.speed.stormFar = v / 100; },
    },
    {
      id: 'stormClose', text: 'glacier.settings.stormClose', unit: 'pct', min: 40, max: 200, step: 5, vars: () => ({ carry: carryText() }),
      get: () => Math.round(GLACIER.speed.stormNear * 100), set: (v) => { GLACIER.speed.stormNear = v / 100; },
    },
    {
      id: 'forget', text: 'glacier.settings.forget', unit: 's', min: 0, max: 30, step: 1,
      get: () => GLACIER.forget, set: (v) => { GLACIER.forget = v; },
    },
    {
      id: 'devices', text: 'glacier.settings.devices', min: 0, max: 60, step: 1,
      get: () => GLACIER.devices, set: (v) => { GLACIER.devices = v; },
    },
    {
      id: 'reach', text: 'glacier.settings.reach', unit: 'm', min: 4, max: 60, step: 1,
      get: () => GLACIER.reach, set: (v) => { GLACIER.reach = v; },
    },
    {
      id: 'stormMin', text: 'glacier.settings.stormMin', unit: 'm', min: 10, max: 150, step: 5,
      get: () => GLACIER.stormMin, set: (v) => { GLACIER.stormMin = v; if (GLACIER.stormMax < v) GLACIER.stormMax = v; },
    },
    {
      id: 'stormMax', text: 'glacier.settings.stormMax', unit: 'm', min: 10, max: 150, step: 5,
      get: () => GLACIER.stormMax, set: (v) => { GLACIER.stormMax = v; if (GLACIER.stormMin > v) GLACIER.stormMin = v; },
    },
    {
      id: 'caveMinDist', text: 'glacier.settings.caveMinDist', unit: 'm', min: 30, max: 220, step: 10,
      get: () => GLACIER.caveMinDist, set: (v) => { GLACIER.caveMinDist = v; },
    },
  ],
};
