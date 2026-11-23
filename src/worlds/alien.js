// World 3 — Xenoterra: an alien planet at dusk — terraced violet plains with glowing veins, giant mushrooms,
// crystals, pools, a crashed saucer, a colossal skeleton, a ringed monolith, basalt hex columns, erupting
// geysers, swaying coral and tentacle plants, sky mantas and floating islands. Monster: the Void Jelly.
import * as THREE from 'three';
import { mulberry32, createNoise2D, fbm } from '../engine/noise.js';
import { createTerrain, gridHeight, withFlats, edgeFactor, slopeAt } from '../engine/terrain.js';
import { createSky, createLighting, createHorizonRing, createParticles, skyFollower } from '../engine/environment.js';
import { archPath, archTube } from '../engine/shapes.js';
import { smoothstep, clamp, mergeParts, m4, instanced, flatMat, scatterPoints, fogColor, instanceGlowMaterial } from '../engine/utils.js';
import { extendMaterial, canvasTexture, glowPoints, createPlume, createLayout, tickShared } from '../engine/props.js';

const TERRAIN_SIZE = 1100; // metres across the ground mesh (also used by gridHeight)

const R = 270;
const PORTAL_SPOTS = [{ x: 195, z: 120 }, { x: -150, z: 205 }, { x: -120, z: -200 }];
const POOLS = [{ x: -40, z: -30, r: 17 }, { x: 90, z: 150, r: 13 }, { x: -185, z: 40, r: 19 }, { x: 120, z: -110, r: 15 }];
const CRATERS = [{ x: 40, z: -185, r: 42 }, { x: -80, z: 110, r: 30 }];
const HORIZON = 0x5a2f7f;

const theme = {
  glow: 0xd54bff, colA: 0x14002e, colB: 0x8a2be2, colC: 0x7dfff0, stone: 0x5b3a7a, css: '#e07bff', hum: 82.4,
};

const glowMat = (color, intensity = 1.2, opts = {}) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, flatShading: true, ...opts });

function createPortalFrame({ W, H }) {
  const g = new THREE.Group();
  const flesh = new THREE.MeshStandardMaterial({ color: 0x3a1554, emissive: 0x7a1fa8, emissiveIntensity: 0.6, roughness: 0.5, flatShading: true });
  const cyan = glowMat(0x5ff8ff, 1.6);
  g.add(archTube(W, H, 0.45, 0.42, flesh));
  // a second, twisting vine around the arch
  const { pts, normals } = archPath(W, H, 0.45, 140);
  const twist = pts.map((p, i) => {
    const a = i * 0.45;
    return p.clone().addScaledVector(normals[i], Math.cos(a) * 0.45).add(new THREE.Vector3(0, 0, Math.sin(a) * 0.45));
  });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(twist), 260, 0.12, 6), cyan));
  // bulbs
  const { pts: bp, normals: bn } = archPath(W, H, 0.85, 14);
  bp.forEach((p, i) => {
    if (i === 0 || i === bp.length - 1) return;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + (i % 3) * 0.08, 1), cyan);
    b.position.copy(p).addScaledVector(bn[i], 0.15);
    g.add(b);
  });
  // horns curling up from the top
  for (const s of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 1.4, H + 0.2, 0), new THREE.Vector3(s * 2.6, H + 1.6, 0.2),
      new THREE.Vector3(s * 3.0, H + 3.4, -0.2), new THREE.Vector3(s * 2.3, H + 4.4, 0),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 30, 0.22, 6), flesh));
    const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), cyan);
    tip.position.set(s * 2.3, H + 4.4, 0);
    g.add(tip);
  }
  return g;
}

function createJelly() {
  const root = new THREE.Group();
  const float = new THREE.Group(); root.add(float);
  const bellMat = new THREE.MeshStandardMaterial({ color: 0xff5fd2, emissive: 0xb0208f, emissiveIntensity: 1.0, transparent: true, opacity: 0.78, roughness: 0.2, side: THREE.DoubleSide, flatShading: true });
  const core = glowMat(0x7dfff0, 2.2);
  const tentMat = glowMat(0xd54bff, 1.1, { transparent: true, opacity: 0.85 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xeaff5a, toneMapped: false });

  const bell = new THREE.Mesh(new THREE.SphereGeometry(2.0, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), bellMat);
  bell.position.y = 0.6; bell.castShadow = true; float.add(bell);
  const coreM = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), core); coreM.position.y = 1.1; float.add(coreM);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.14, 6, 28), tentMat); rim.rotation.x = Math.PI / 2; rim.position.y = 0.35; float.add(rim);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const e = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), eyeMat);
    e.position.set(Math.cos(a) * 1.55, 0.95, Math.sin(a) * 1.55);
    float.add(e);
  }
  const light = new THREE.PointLight(0xff5fd2, 35, 20, 2); light.position.y = 0.4; float.add(light);
  const tentacles = [];
  const segGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.5, 5); segGeo.translate(0, -0.25, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    let parent = new THREE.Group();
    parent.position.set(Math.cos(a) * 1.3, 0.35, Math.sin(a) * 1.3);
    float.add(parent);
    const chain = [parent];
    for (let k = 0; k < 7; k++) {
      const seg = new THREE.Mesh(segGeo, tentMat);
      seg.scale.setScalar(1 - k * 0.1);
      parent.add(seg);
      const next = new THREE.Group(); next.position.y = -0.5 * (1 - k * 0.1);
      parent.add(next);
      chain.push(next);
      parent = next;
    }
    tentacles.push({ chain, a });
  }
  let ph = 0;
  return {
    object: root, radius: 1.9, hover: 2.4,
    animate(dt, speed, t) {
      ph += dt * (0.6 + speed * 0.15) * Math.PI * 2;
      const s = Math.sin(ph);
      bell.scale.set(1 + 0.09 * s, 1 - 0.13 * s, 1 + 0.09 * s);
      rim.scale.setScalar(1 + 0.1 * s);
      float.position.y = Math.sin(t * 1.4) * 0.35;
      coreM.rotation.y += dt * 1.5; coreM.rotation.x += dt * 0.7;
      light.intensity = 30 + s * 10;
      const trail = Math.min(1, speed / 8);
      for (const T of tentacles) {
        T.chain.forEach((g, k) => {
          g.rotation.x = Math.sin(ph - k * 0.6 + T.a) * 0.18 + trail * 0.18;
          g.rotation.z = Math.cos(ph * 0.7 - k * 0.5 + T.a) * 0.12;
        });
      }
    },
  };
}


// ── Landmarks ──────────────────────────────────────────────────────────────
const SAUCER = { x: 150, z: -30 };     // crashed flying saucer and its scorched trench
const BEAST = { x: -190, z: -70 };     // colossal alien skeleton
const MONOLITH = { x: 10, z: 60 };     // black monolith with orbiting rings
const HEX = { x: 172, z: 48 };         // basalt hex-column field
const GEYSERS = [{ x: -110, z: -95 }, { x: 60, z: -60 }, { x: -25, z: 170 }, { x: 205, z: -95 }];

function build({ quality }) {
  const density = quality.density;
  const rng = mulberry32(9001);
  const n1 = createNoise2D(rng), n2 = createNoise2D(rng), n3 = createNoise2D(rng), n4 = createNoise2D(rng), n5 = createNoise2D(rng);

  const terrace = (h, step) => {
    const k = h / step, f = k - Math.floor(k);
    return (Math.floor(k) + smoothstep(0.4, 0.6, f)) * step;
  };
  const raw = (x, z) => {
    let h = fbm(n1, x * 0.0045, z * 0.0045, 4) * 18;
    h = terrace(h, 5.5) * 0.8 + h * 0.2;
    h += fbm(n2, x * 0.03, z * 0.03, 2) * 0.8;
    for (const c of CRATERS) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r * 1.8) {
        const rim = Math.exp(-((d - c.r) ** 2) / (2 * (c.r * 0.16) ** 2)) * 6;
        const bowl = -(1 - smoothstep(0, c.r, d)) * 7;
        h += rim + bowl;
      }
    }
    return h;
  };
  const poolLevels = POOLS.map((p) => raw(p.x, p.z) - 1.5);
  // the saucer ploughed a trench on its way in (from the north-east)
  const TR = { ax: SAUCER.x + 60, az: SAUCER.z + 45, bx: SAUCER.x, bz: SAUCER.z };
  const trenchD = (x, z) => {
    const dx = TR.bx - TR.ax, dz = TR.bz - TR.az, l2 = dx * dx + dz * dz;
    const t = clamp(((x - TR.ax) * dx + (z - TR.az) * dz) / l2, 0, 1);
    return { d: Math.hypot(x - (TR.ax + dx * t), z - (TR.az + dz * t)), t };
  };
  const base = (x, z) => {
    let h = raw(x, z);
    POOLS.forEach((p, i) => {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r * 2) { const m = 1 - smoothstep(p.r * 0.85, p.r * 1.8, d); h = h * (1 - m) + poolLevels[i] * m; }
    });
    const tr = trenchD(x, z);
    h -= (1 - smoothstep(2, 7, tr.d)) * (0.6 + tr.t * 1.6);
    h += Math.exp(-((tr.d - 7.5) ** 2) / 4) * (0.8 + tr.t * 1.2);
    const e = edgeFactor(x, z, R, 140);
    h += terrace(e * 120 * (0.7 + 0.5 * (0.5 + 0.5 * n3(x * 0.008, z * 0.008))), 12);
    return h;
  };
  const smoothHeight = withFlats(base, [
    ...PORTAL_SPOTS,
    { x: MONOLITH.x, z: MONOLITH.z, inner: 14, outer: 30 },
    { x: BEAST.x, z: BEAST.z, inner: 18, outer: 34 },
    ...GEYSERS.map((g) => ({ x: g.x, z: g.z, inner: 5, outer: 12 })),
  ]);
  const heightAt = gridHeight(smoothHeight, TERRAIN_SIZE, quality.terrainSegments); // the ground exactly as drawn
  const inPool = (x, z) => POOLS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 2);
  const hy = (x, z) => heightAt(x, z);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(fogColor(HORIZON), 30, 380);
  scene.background = new THREE.Color(HORIZON);

  const ground = new THREE.Color(0x5d3788), moss = new THREE.Color(0x23a097), high = new THREE.Color(0x9d6ccc), cliff = new THREE.Color(0xd35a9c);
  const vein = new THREE.Color(0x52fff0), scorch = new THREE.Color(0x221430), hexDark = new THREE.Color(0x3a2c4e);
  const terrain = createTerrain({
    size: TERRAIN_SIZE, segments: quality.terrainSegments, heightAt,
    colorAt(c, x, z, h, slope) {
      c.copy(ground);
      c.lerp(moss, smoothstep(0.1, 0.6, n4(x * 0.012, z * 0.012)) * 0.75);
      c.lerp(high, smoothstep(8, 18, h) * 0.6);
      c.lerp(cliff, smoothstep(0.35, 0.8, slope));
      c.multiplyScalar(0.9 + 0.2 * (0.5 + 0.5 * n2(x * 0.08, z * 0.08)));
      const v = 1 - Math.abs(n5(x * 0.016, z * 0.016));
      c.lerp(vein, smoothstep(0.93, 0.99, v) * 0.7 * (1 - smoothstep(0.3, 0.6, slope)));
      const tr = trenchD(x, z);
      c.lerp(scorch, (1 - smoothstep(3, 10, tr.d)) * 0.8 + (1 - smoothstep(6, 22, Math.hypot(x - SAUCER.x, z - SAUCER.z))) * 0.5);
      c.lerp(hexDark, (1 - smoothstep(18, 34, Math.hypot(x - HEX.x, z - HEX.z))) * 0.6);
    },
  });
  scene.add(terrain);

  // glowing pools
  const poolMat = glowMat(0x18e0c8, 0.9, { roughness: 0.1, metalness: 0.1 });
  POOLS.forEach((p, i) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r + 2.5, 36), poolMat);
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, poolLevels[i] + 0.5, p.z);
    scene.add(m);
  });

  const L = createLayout({ heightAt, portalSpots: PORTAL_SPOTS, blocked: inPool });
  const colliders = L.colliders;
  POOLS.forEach((p) => L.add({ x: p.x, z: p.z, r: p.r }));
  L.reserve(SAUCER.x, SAUCER.z, 20); L.reserve(BEAST.x, BEAST.z, 26); L.reserve(MONOLITH.x, MONOLITH.z, 16); L.reserve(HEX.x, HEX.z, 30);
  GEYSERS.forEach((g) => L.reserve(g.x, g.z, 5));
  const propMat = flatMat({ vertexColors: true });
  const white = flatMat({ color: 0xffffff });
  const animated = [];
  const add = (o) => { scene.add(o); return o; };
  const solid = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; return add(m); };

  // ── crashed saucer ──
  {
    const g = new THREE.Group(); g.position.set(SAUCER.x, hy(SAUCER.x, SAUCER.z) + 2.2, SAUCER.z);
    g.rotation.set(0.42, Math.atan2(TR.ax - SAUCER.x, TR.az - SAUCER.z), 0.18); add(g);
    const hull = new THREE.MeshStandardMaterial({ color: 0xc8d0e0, metalness: 0.3, roughness: 0.3, flatShading: true });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x5a6078, metalness: 0.3, roughness: 0.5, flatShading: true });
    const disc = new THREE.Mesh(new THREE.SphereGeometry(9, 28, 10), hull); disc.scale.set(1, 0.22, 1); disc.castShadow = true; g.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(8.9, 0.45, 6, 36), darkM); rim.rotation.x = Math.PI / 2; g.add(rim);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7ff6ff, emissive: 0x23a7c4, emissiveIntensity: 0.7, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2 }));
    dome.position.y = 1.4; g.add(dome);
    const cracked = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 2.8), darkM); cracked.position.set(5.5, 1.3, 1.5); cracked.rotation.set(0.6, 0.3, 0.9); g.add(cracked);
    const lights = [];
    const lightGeo = new THREE.IcosahedronGeometry(0.32, 0);
    const lmats = [glowMat(0xff3d6e, 2.2), glowMat(0x7dfff0, 2.2), glowMat(0xffe45a, 2.2)];
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; const m = new THREE.Mesh(lightGeo, lmats[i % 3]); m.position.set(Math.cos(a) * 8.6, 0.4, Math.sin(a) * 8.6); g.add(m); lights.push(m); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.2, 10, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dfff0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.position.set(0, -4.6, 0); g.add(beam);
    const smoke = createPlume({ count: 22, height: 16, color: 0x2a2236, size: 3.2, opacity: 0.35, speed: 1.6, spread: 1.6 });
    smoke.points.position.set(SAUCER.x + 3, hy(SAUCER.x, SAUCER.z) + 2.5, SAUCER.z + 2); add(smoke.points);
    const sparks = createPlume({ count: 14, height: 4, color: 0xffb84a, size: 0.35, opacity: 1, speed: 3, spread: 0.8, additive: true });
    sparks.points.position.set(SAUCER.x + 4, hy(SAUCER.x, SAUCER.z) + 2.2, SAUCER.z + 1.5); add(sparks.points);
    animated.push(smoke, sparks, { update(dt, t) { lights.forEach((m, i) => { m.visible = ((Math.floor(t * 3) + i) % 6) < 4 || i % 3 === 0; }); dome.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 7.3)) * (Math.sin(t * 0.7) > 0.3 ? 0.8 : 0.1); } });
    L.add({ x: SAUCER.x, z: SAUCER.z, r: 8.6 });
    // debris along the trench
    const deb = [];
    for (let i = 0; i < 30; i++) { const t = rng(); const x = TR.ax + (TR.bx - TR.ax) * t + (rng() - 0.5) * 12, z = TR.az + (TR.bz - TR.az) * t + (rng() - 0.5) * 12; const s = 0.3 + rng() * 0.9; deb.push({ x, y: hy(x, z) + s * 0.2, z, sx: s * 2, sy: s * 0.3, sz: s, rx: rng() * 3, ry: rng() * 3, rz: rng() }); }
    add(instanced(new THREE.BoxGeometry(1, 1, 1), darkM, deb));
    const embers = [];
    for (let i = 0; i < 26; i++) { const t = rng(); const x = TR.ax + (TR.bx - TR.ax) * t + (rng() - 0.5) * 6, z = TR.az + (TR.bz - TR.az) * t + (rng() - 0.5) * 6; embers.push({ x, y: hy(x, z) + 0.3, z }); }
    add(glowPoints(embers, { color: 0xff7a3a, size: 1.2, opacity: 0.7 }));
  }

  // ── colossal skeleton: curved rib-spikes, glowing vertebrae, a horned skull ──
  {
    const boneM = flatMat({ color: 0x2c2238, roughness: 0.6 });
    const nodeM = glowMat(0x5ff8ff, 1.8);
    const by = hy(BEAST.x, BEAST.z);
    const dir = { x: 0.8, z: 0.6 }; // spine direction
    const px = -dir.z, pz = dir.x;
    const verts = [];
    for (let i = 0; i < 16; i++) {
      const t = i / 15, s = -24 + t * 46;
      const x = BEAST.x + dir.x * s, z = BEAST.z + dir.z * s;
      const y = by + 2 + Math.sin(t * Math.PI) * 9;
      verts.push(new THREE.Vector3(x, y, z));
    }
    const spine = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(verts), 60, 0.7, 7), boneM); spine.castShadow = true; add(spine);
    const nodes = verts.map((v, i) => ({ x: v.x, y: v.y + 0.4, z: v.z, s: 0.9 + Math.sin(i / 15 * Math.PI) * 0.6 }));
    const nodeMesh = add(instanced(new THREE.IcosahedronGeometry(1, 0), nodeM, nodes));
    for (let i = 2; i < 13; i++) {
      const v = verts[i];
      for (const s of [-1, 1]) {
        const span = 7 + Math.sin(i / 15 * Math.PI) * 6;
        const foot = new THREE.Vector3(v.x + px * s * span, by - 1, v.z + pz * s * span);
        const mid = new THREE.Vector3(v.x + px * s * span * 0.8, v.y + 1.5, v.z + pz * s * span * 0.8);
        const c = new THREE.CatmullRomCurve3([v.clone(), new THREE.Vector3(v.x + px * s * span * 0.35, v.y + 2.2, v.z + pz * s * span * 0.35), mid, foot]);
        const rib = new THREE.Mesh(new THREE.TubeGeometry(c, 20, 0.35, 5), boneM); rib.castShadow = true; add(rib);
        L.add({ x: foot.x, z: foot.z, r: 0.6, cr: 0.3 });
      }
    }
    const head = verts[15];
    const skull = new THREE.Group(); skull.position.set(head.x + dir.x * 4, by + 3, head.z + dir.z * 4); skull.rotation.y = Math.atan2(dir.x, dir.z); add(skull);
    const sk = new THREE.Mesh(new THREE.DodecahedronGeometry(3.4, 1), boneM); sk.scale.set(1, 0.8, 1.5); sk.castShadow = true; skull.add(sk);
    for (let i = 0; i < 5; i++) { const e = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), glowMat(0xd54bff, 2.4)); e.position.set((i - 2) * 0.9, 0.9 - Math.abs(i - 2) * 0.25, 4.6); skull.add(e); }
    for (const s of [-1, 1]) {
      const hc = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 2, 1.5, 1), new THREE.Vector3(s * 4.5, 4, -1), new THREE.Vector3(s * 5.5, 8, -4), new THREE.Vector3(s * 4, 11, -6)]);
      const horn = new THREE.Mesh(new THREE.TubeGeometry(hc, 20, 0.5, 6), boneM); horn.castShadow = true; skull.add(horn);
    }
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 5), boneM); jaw.rotation.x = Math.PI / 2; jaw.position.set(0, -1.6, 4.2); skull.add(jaw);
    L.add({ x: skull.position.x, z: skull.position.z, r: 4.5 });
    animated.push({ update(dt, t) { nodeM.emissiveIntensity = 1.4 + Math.sin(t * 1.6) * 0.6; } });
  }

  // ── monolith with rotating rings and orbiting stones ──
  {
    const my = hy(MONOLITH.x, MONOLITH.z);
    const black = new THREE.MeshStandardMaterial({ color: 0x0d0a16, roughness: 0.15, metalness: 0.6, flatShading: true });
    solid(new THREE.BoxGeometry(3, 16, 1.4), black, MONOLITH.x, my + 8, MONOLITH.z, 0.4);
    const runeTex = canvasTexture(128, 512, (g, w, h) => {
      const r = mulberry32(4); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.strokeStyle = '#7dfff0'; g.lineWidth = 5; g.shadowColor = '#7dfff0'; g.shadowBlur = 12;
      for (let y = 20; y < h - 20; y += 34) { g.beginPath(); const x0 = 24 + r() * 30; g.moveTo(x0, y); g.lineTo(x0 + r() * 50, y + r() * 20); g.lineTo(x0 + r() * 70, y + 26); if (r() < 0.5) { g.moveTo(w / 2, y); g.arc(w / 2, y + 12, 10, 0, 5); } g.stroke(); }
    });
    const runeMat = new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 15), runeMat); f.position.set(MONOLITH.x + Math.sin(0.4) * 0.72 * s, my + 8, MONOLITH.z + Math.cos(0.4) * 0.72 * s); f.rotation.y = 0.4 + (s < 0 ? Math.PI : 0); add(f); }
    L.add({ x: MONOLITH.x, z: MONOLITH.z, r: 2.0 });
    const rings = [];
    const ringMat = glowMat(0xd54bff, 1.3, { metalness: 0.4, roughness: 0.3 });
    [[7, 0.25, 10], [9.5, 0.2, 12], [12, 0.16, 9]].forEach(([r, tube, y], i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 64), i === 1 ? glowMat(0x7dfff0, 1.6) : ringMat);
      m.position.set(MONOLITH.x, my + y, MONOLITH.z); add(m); rings.push(m);
    });
    const stones = [];
    for (let i = 0; i < 9; i++) stones.push({ a: rng() * 6.28, r: 5 + rng() * 9, y: 1.5 + rng() * 9, s: 0.5 + rng() * 1.1, sp: (0.1 + rng() * 0.2) * (i % 2 ? 1 : -1) });
    const stoneMesh = add(instanced(new THREE.DodecahedronGeometry(1, 0), flatMat({ color: 0x4a3564 }), stones.map(() => ({ x: 0, y: 0, z: 0 }))));
    const halo = glowPoints([{ x: MONOLITH.x, y: my + 17, z: MONOLITH.z }], { color: 0x7dfff0, size: 14, opacity: 0.6 }); add(halo);
    const dmy = new THREE.Object3D();
    animated.push({ update(dt, t) {
      rings[0].rotation.set(t * 0.4, t * 0.3, 0); rings[1].rotation.set(-t * 0.25, 0, t * 0.35); rings[2].rotation.set(Math.PI / 2 + Math.sin(t * 0.2) * 0.4, t * 0.15, 0);
      stones.forEach((s, i) => { const a = s.a + t * s.sp; dmy.position.set(MONOLITH.x + Math.cos(a) * s.r, my + s.y + Math.sin(t + i) * 0.6, MONOLITH.z + Math.sin(a) * s.r); dmy.rotation.set(t * 0.3 + i, t * 0.2, 0); dmy.scale.setScalar(s.s); dmy.updateMatrix(); stoneMesh.setMatrixAt(i, dmy.matrix); });
      stoneMesh.instanceMatrix.needsUpdate = true;
      runeMat.opacity = 0.65 + Math.sin(t * 2.1) * 0.35;
    } });
  }

  // ── basalt hex columns with glowing caps ──
  {
    const cols = [], caps = [];
    const hexR = 1.6, dx = hexR * 1.73;
    for (let q = -9; q <= 9; q++) for (let r = -9; r <= 9; r++) {
      const x = HEX.x + (q + r * 0.5) * dx, z = HEX.z + r * hexR * 1.5;
      const d = Math.hypot(x - HEX.x, z - HEX.z);
      if (d > 24 + n3(x * 0.1, z * 0.1) * 5 || rng() < 0.12) continue;
      if (PORTAL_SPOTS.some((p) => Math.hypot(x - p.x, z - p.z) < 18)) continue;
      const h = (1 - d / 30) * 9 * (0.5 + rng()) + 0.4;
      const y = hy(x, z) - 1;
      cols.push({ x, y, z, sx: 1, sy: h + 1, sz: 1, color: rng() < 0.5 ? 0x54427a : 0x463768 });
      caps.push({ x, y: y + h + 1.02, z, s: 1, color: rng() < 0.6 ? 0x5ff8ff : 0xd54bff });
      if (h > 0.5) L.add({ x, z, r: hexR * 0.95 });
    }
    const cg = new THREE.CylinderGeometry(hexR, hexR, 1, 6); cg.translate(0, 0.5, 0);
    add(instanced(cg, white, cols));
    const capGeo = new THREE.CylinderGeometry(hexR * 0.8, hexR * 0.8, 0.06, 6);
    add(instanced(capGeo, extendMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.1, flatShading: true }), { instanceGlow: true }), caps, { castShadow: false }));
  }

  // ── geysers: vents that erupt glowing vapour every few seconds ──
  GEYSERS.forEach((g, i) => {
    const y = hy(g.x, g.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.8, 6, 14), flatMat({ color: 0x6b4a8e })); ring.rotation.x = Math.PI / 2; ring.position.set(g.x, y + 0.1, g.z); ring.castShadow = true; add(ring);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.6, 12), glowMat(0x7dfff0, 1.5)); hole.rotation.x = -Math.PI / 2; hole.position.set(g.x, y + 0.15, g.z); add(hole);
    const plume = createPlume({ count: 40, height: 18, spread: 0.9, color: 0x9ffff4, size: 1.6, opacity: 0.55, speed: 14, additive: true, drift: [0.2, 0.1] });
    plume.points.position.set(g.x, y + 0.3, g.z); add(plume.points);
    const steam = createPlume({ count: 10, height: 4, spread: 0.6, color: 0xc8b8ff, size: 2.2, opacity: 0.18, speed: 1.2 });
    steam.points.position.set(g.x, y + 0.3, g.z); add(steam.points);
    const period = 7 + i * 1.7, offs = i * 2.3;
    animated.push(steam, { update(dt, t) { const ph = (t + offs) % period; plume.strength = ph < 2.6 ? Math.min(1, ph * 3) * (1 - smoothstep(2.0, 2.6, ph)) : 0; plume.update(dt, t); hole.material.emissiveIntensity = 1 + plume.strength * 2; } });
    L.add({ x: g.x, z: g.z, r: 2.6 });
  });

  // ── giant mushrooms ──
  const stemGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.55, 0.95, 1, 8), color: 0xe3d2f0, matrix: m4(0, 0.5, 0) },
  ]);
  const capGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  capGeo.scale(1, 0.55, 1);
  const capMat = instanceGlowMaterial(0.55, { roughness: 0.5 });
  const gillGeo = new THREE.CylinderGeometry(1, 0.2, 0.25, 12, 1, true);
  const spotGeo = new THREE.IcosahedronGeometry(1, 0);
  const spotMat = glowMat(0xfff6a8, 1.8);
  const stems = [], caps = [], spots = [], gills = [];
  const capColors = [0x2ad1c9, 0xff4fb8, 0x9b5cff, 0x46e07a];
  for (const p of scatterPoints(rng, Math.floor(70 * density) + 12, R - 10, (x, z) => L.free(x, z, 8, 0.5))) {
    const h = 6 + rng() * 11, cr = h * (0.35 + rng() * 0.2);
    const y = hy(p.x, p.z) - 0.3;
    const lean = (rng() - 0.5) * 0.15;
    stems.push({ x: p.x, y, z: p.z, sx: h * 0.12, sy: h, sz: h * 0.12, rz: lean });
    const cx = p.x - Math.sin(lean) * h, cy = y + h * Math.cos(lean) - 0.3;
    const col = capColors[Math.floor(rng() * capColors.length)];
    caps.push({ x: cx, y: cy, z: p.z, s: cr, rz: lean, color: col });
    gills.push({ x: cx, y: cy - 0.05, z: p.z, sx: cr * 0.98, sy: 1, sz: cr * 0.98, rz: lean, color: col });
    for (let k = 0; k < 6; k++) {
      const a = rng() * Math.PI * 2, rr = cr * (0.3 + rng() * 0.55);
      spots.push({ x: cx + Math.cos(a) * rr, y: cy + cr * 0.55 * Math.sqrt(1 - (rr / cr) ** 2) - 0.05, z: p.z + Math.sin(a) * rr, s: cr * 0.07 });
    }
    L.add({ x: p.x, z: p.z, r: h * 0.12 + 0.6, cr: h * 0.12 + 1.0 });
  }
  add(instanced(stemGeo, propMat, stems));
  add(instanced(capGeo, capMat, caps));
  add(instanced(gillGeo, instanceGlowMaterial(1.2, { side: THREE.DoubleSide }), gills, { castShadow: false }));
  add(instanced(spotGeo, spotMat, spots, { castShadow: false }));

  // ── crystal clusters ──
  const crystalGeo = new THREE.OctahedronGeometry(1, 0); crystalGeo.scale(0.6, 2.4, 0.6);
  const crystalMat = instanceGlowMaterial(0.9, { roughness: 0.2 });
  const crystals = [];
  for (const c of scatterPoints(rng, Math.floor(50 * density) + 8, R - 10, (x, z) => L.free(x, z, 4))) {
    const col = rng() < 0.5 ? 0xff4fd8 : 0x5ff8ff;
    const k = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < k; i++) {
      const s = 0.5 + rng() * 1.3;
      const x = c.x + (rng() - 0.5) * 3, z = c.z + (rng() - 0.5) * 3;
      crystals.push({ x, y: hy(x, z) + s * 1.4, z, s, rx: (rng() - 0.5) * 0.8, rz: (rng() - 0.5) * 0.8, ry: rng() * 3, color: col });
    }
    L.add({ x: c.x, z: c.z, r: 2.6 });
  }
  add(instanced(crystalGeo, crystalMat, crystals));

  // ── egg pods that pulse ──
  const podMat = extendMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.35, flatShading: true, transparent: true, opacity: 0.9 }), { instanceGlow: true });
  const pods = [];
  for (const c of scatterPoints(rng, Math.floor(14 * density) + 4, R - 12, (x, z) => L.free(x, z, 3))) {
    const k = 4 + Math.floor(rng() * 5);
    for (let i = 0; i < k; i++) { const x = c.x + (rng() - 0.5) * 4, z = c.z + (rng() - 0.5) * 4, s = 0.5 + rng() * 0.6; pods.push({ x, y: hy(x, z) + s * 0.9, z, sx: s, sy: s * 1.5, sz: s, rx: (rng() - 0.5) * 0.4, rz: (rng() - 0.5) * 0.4, color: rng() < 0.5 ? 0xb6ff5a : 0xffa63d }); }
    L.add({ x: c.x, z: c.z, r: 2.4 });
  }
  add(instanced(new THREE.IcosahedronGeometry(1, 1), podMat, pods));

  // ── swaying flora: tube corals, tentacle plants, glowing bulb reeds ──
  {
    const tubeParts = [];
    for (let k = 0; k < 5; k++) {
      const h = 1.2 + (k * 0.37 % 1) * 1.6, a = k * 1.26, r = k ? 0.45 : 0;
      tubeParts.push({ geo: new THREE.CylinderGeometry(0.22, 0.14, h, 7, 1, true), color: 0xff6fb8, matrix: m4(Math.cos(a) * r, h / 2, Math.sin(a) * r) });
      tubeParts.push({ geo: new THREE.TorusGeometry(0.22, 0.06, 4, 8), color: 0xfff28a, matrix: m4(Math.cos(a) * r, h, Math.sin(a) * r, Math.PI / 2, 0, 0) });
    }
    const corals = [];
    for (const p of scatterPoints(rng, Math.floor(220 * density), R - 8, (x, z) => n4(x * 0.02 + 5, z * 0.02) > 0.1 && L.free(x, z, 0.6))) corals.push({ x: p.x, y: hy(p.x, p.z) - 0.05, z: p.z, s: 0.6 + rng() * 0.9, ry: rng() * 6 });
    add(instanced(mergeParts(tubeParts), extendMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, emissive: 0x6a1a48, emissiveIntensity: 0.6 }), { sway: { amp: 0.06, speed: 1.2, power: 2 } }), corals, { castShadow: false }));

    const tentParts = [];
    for (let k = 0; k < 4; k++) {
      const a = k * 1.57 + 0.4, pts = [];
      for (let j = 0; j <= 6; j++) { const t = j / 6; pts.push(new THREE.Vector3(Math.cos(a) * t * 0.8 + Math.sin(t * 5 + k) * 0.2, t * (3 + k * 0.4), Math.sin(a) * t * 0.8)); }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.12, 5);
      const tp = tg.attributes.position;
      for (let i = 0; i < tp.count; i++) { const y = tp.getY(i), f = 1 - y / 4.5; const cx = Math.cos(a) * (y / 3.4) * 0.8; tp.setX(i, cx + (tp.getX(i) - cx) * f); tp.setZ(i, Math.sin(a) * (y / 3.4) * 0.8 + (tp.getZ(i) - Math.sin(a) * (y / 3.4) * 0.8) * f); }
      tentParts.push({ geo: tg, color: k % 2 ? 0x8a2be2 : 0xc04bff });
    }
    tentParts.push({ geo: new THREE.IcosahedronGeometry(0.4, 0), color: 0x4a1a6a, matrix: m4(0, 0.2, 0) });
    const tents = [];
    for (const p of scatterPoints(rng, Math.floor(120 * density), R - 8, (x, z) => L.free(x, z, 1.2))) tents.push({ x: p.x, y: hy(p.x, p.z) - 0.1, z: p.z, s: 0.7 + rng() * 0.8, ry: rng() * 6 });
    add(instanced(mergeParts(tentParts), extendMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: 0x3a0a5a, emissiveIntensity: 0.8 }), { sway: { amp: 0.035, speed: 1.6, power: 2 } }), tents));

    const bulbGeo = mergeParts([
      { geo: new THREE.CylinderGeometry(0.03, 0.05, 0.7, 4), color: 0x2b7a6e, matrix: m4(0, 0.35, 0) },
      { geo: new THREE.CylinderGeometry(0.03, 0.05, 0.5, 4), color: 0x2b7a6e, matrix: m4(0.12, 0.25, 0.05, 0, 0, -0.5) },
    ]);
    const headGeo = new THREE.IcosahedronGeometry(0.13, 0);
    const headMat = glowMat(0x4ff0e0, 1.1);
    const plants = [], heads = [];
    for (const p of scatterPoints(rng, Math.floor(650 * density), R - 8, (x, z) => !inPool(x, z) && n4(x * 0.02, z * 0.02) > 0)) {
      const s = 0.8 + rng() * 1.6, y = hy(p.x, p.z);
      plants.push({ x: p.x, y, z: p.z, s, ry: rng() * 6 });
      heads.push({ x: p.x, y: y + 0.72 * s, z: p.z, s });
    }
    add(instanced(bulbGeo, propMat, plants, { castShadow: false }));
    add(instanced(headGeo, headMat, heads, { castShadow: false }));
    animated.push({ update(dt, t) { headMat.emissiveIntensity = 1.0 + Math.sin(t * 2.3) * 0.3; podMat.emissiveIntensity = 0.45 + Math.sin(t * 1.4) * 0.25; } });

    const pebbles = [];
    for (const p of scatterPoints(rng, Math.floor(500 * density), R - 6, (x, z) => L.free(x, z, 0.1, 0.7))) { const s = 0.1 + rng() * 0.3; pebbles.push({ x: p.x, y: hy(p.x, p.z) + s * 0.2, z: p.z, s, ry: rng() * 3, color: rng() < 0.6 ? 0x4a3564 : 0x7a4a9a }); }
    add(instanced(new THREE.DodecahedronGeometry(1, 0), white, pebbles, { castShadow: false }));
  }

  // ── floating islands ──
  const islandGeo = mergeParts([
    { geo: new THREE.DodecahedronGeometry(1, 0), color: 0x6b4a8e, matrix: m4(0, 0, 0, 0, 0, 0, 1, 0.35, 1) },
    { geo: new THREE.ConeGeometry(0.85, 1.8, 6), color: 0x4a2d66, matrix: m4(0, -1.1, 0, Math.PI, 0, 0) },
    { geo: new THREE.DodecahedronGeometry(0.9, 0), color: 0x1f8a83, matrix: m4(0, 0.22, 0, 0, 0, 0, 1, 0.12, 1) },
    { geo: new THREE.CylinderGeometry(0.03, 0.05, 0.5, 4), color: 0xe3d2f0, matrix: m4(0.3, 0.45, 0.2) },
    { geo: new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), color: 0xff4fb8, matrix: m4(0.3, 0.68, 0.2) },
  ]);
  const islandData = [];
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2, r = 60 + rng() * 220;
    islandData.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 45 + rng() * 55, s: 6 + rng() * 10, ph: rng() * 6 });
  }
  const islandMesh = add(instanced(islandGeo, propMat, islandData.map((d) => ({ x: d.x, y: d.y, z: d.z, s: d.s })), { castShadow: false }));

  // ── sky mantas gliding overhead ──
  const mantas = [];
  {
    const mm = new THREE.MeshStandardMaterial({ color: 0x2a1a4a, emissive: 0x7a2ac4, emissiveIntensity: 0.35, flatShading: true, side: THREE.DoubleSide });
    const spotM = glowMat(0x7dfff0, 2);
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 2.5, 0, 0, -2, 7, -0.3, -1.5,  0, 0, 2.5, 7, -0.3, -1.5, 3, 0, 1.2], 3));
    wing.computeVertexNormals();
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 6), mm); body.scale.set(1, 0.45, 2.2); g.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 7, 4), mm); tail.rotation.x = -Math.PI / 2; tail.position.z = -5.5; g.add(tail);
      const lw = new THREE.Mesh(wing, mm), rw = new THREE.Mesh(wing, mm); rw.scale.x = -1; g.add(lw, rw);
      for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), spotM); s.position.set((k - 2) * 0.5, 0.55, 1 - Math.abs(k - 2) * 0.4); g.add(s); }
      g.scale.setScalar(1.6 + rng() * 1.2);
      add(g);
      mantas.push({ g, lw, rw, cx: (rng() - 0.5) * 260, cz: (rng() - 0.5) * 260, r: 50 + rng() * 60, y: 55 + rng() * 45, sp: (0.04 + rng() * 0.04) * (i % 2 ? 1 : -1), ph: rng() * 6 });
    }
  }

  // ── sky: stars, ringed planet, moons ──
  const sunDir = [0.35, 0.22, 0.85];
  const sky = createSky({ top: 0x06081f, horizon: HORIZON, bottom: 0x2a1240, sunDir, sunColor: 0x9fe8ff, sunGlow: 0.35, sunSize: 0.9996, exponent: 0.4 });
  const starPos = [];
  const srng = mulberry32(5);
  for (let i = 0; i < 1200; i++) {
    const u = srng(), v = srng() * 0.8 + 0.2;
    const th = u * Math.PI * 2, y = v;
    const rr = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(th) * rr * 1300, y * 1300, Math.sin(th) * rr * 1300);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, toneMapped: false }));
  stars.frustumCulled = false;
  const bandCanvas = document.createElement('canvas'); bandCanvas.width = 8; bandCanvas.height = 256;
  const bc = bandCanvas.getContext('2d');
  for (let y = 0; y < 256; y++) {
    const t = Math.sin(y * 0.15) * 0.5 + Math.sin(y * 0.047) * 0.5;
    bc.fillStyle = `hsl(${30 + t * 20}, 70%, ${55 + t * 15}%)`;
    bc.fillRect(0, y, 8, 1);
  }
  const bandTex = new THREE.CanvasTexture(bandCanvas); bandTex.colorSpace = THREE.SRGBColorSpace;
  const planet = new THREE.Group();
  planet.add(new THREE.Mesh(new THREE.SphereGeometry(150, 40, 24), new THREE.MeshBasicMaterial({ map: bandTex, fog: false, toneMapped: false })));
  const ring = new THREE.Mesh(new THREE.RingGeometry(190, 300, 64), new THREE.MeshBasicMaterial({ color: 0xe8c9a0, transparent: true, opacity: 0.45, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  ring.rotation.x = Math.PI / 2 - 0.18;
  planet.add(ring);
  planet.position.set(-620, 560, -820);
  planet.rotation.z = 0.35;
  const moon1 = new THREE.Mesh(new THREE.SphereGeometry(28, 20, 14), new THREE.MeshBasicMaterial({ color: 0xbfe7ff, fog: false, toneMapped: false }));
  moon1.position.set(700, 380, -500);
  const moon2 = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff9ad8, fog: false, toneMapped: false }));
  moon2.position.set(450, 230, 800);
  // a slow comet
  const comet = new THREE.Group();
  const cHead = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xe8fbff, fog: false, toneMapped: false })); comet.add(cHead);
  const cTail = new THREE.Mesh(new THREE.ConeGeometry(9, 140, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dfff0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide }));
  cTail.rotation.z = Math.PI / 2; cTail.position.x = 70; comet.add(cTail);
  comet.position.set(300, 900, -700); comet.rotation.set(0.3, 0.6, -0.35);
  const rn = createNoise2D(mulberry32(31));
  const ringFar = createHorizonRing({ radius: 1100, color: 0x3d1d5e, minH: 30, maxH: 220, segments: 140, profile: (a) => { const v = 0.5 + 0.5 * rn(Math.cos(a) * 4, Math.sin(a) * 4); return Math.pow(v, 3) + (v > 0.75 ? 0.4 : 0); } });
  const ringNear = createHorizonRing({ radius: 950, color: 0x2e1448, minH: 10, maxH: 90, segments: 90, profile: (a) => Math.floor((0.5 + 0.5 * rn(Math.cos(a) * 6 + 3, Math.sin(a) * 6)) * 4) / 4 });
  const follower = skyFollower(sky, stars, planet, moon1, moon2, comet, ringFar, ringNear);
  add(follower.group);
  const lights = createLighting(scene, { sunColor: 0xb8ecff, sunIntensity: 2.3, sunDir, sky: 0xb79cf0, ground: 0x2a8f86, hemiIntensity: 2.4, shadowMap: quality.shadowMap });
  const spores = createParticles({ count: Math.floor(700 * density), area: [90, 30, 90], color: 0x8ffff2, size: 0.22, opacity: 0.9, velocity: [0.3, 0.55, 0.15], sway: 0.6, additive: true });
  const fireflies = createParticles({ count: Math.floor(160 * density), area: [60, 6, 60], color: 0xffe45a, size: 0.32, opacity: 1, velocity: [0, 0.05, 0], sway: 1.6, additive: true });
  add(spores.points); add(fireflies.points);

  const dummy = new THREE.Object3D();
  return {
    scene, radius: R, heightAt, colliders,
    portalSpots: PORTAL_SPOTS,
    isValidSpot: (x, z) => !inPool(x, z) && slopeAt(heightAt, x, z) < 0.6 && Math.hypot(x, z) < R - 12,
    createMonsterBody: createJelly,
    audio: {
      ambient: {
        layers: [
          { type: 'osc', wave: 'sawtooth', freq: 55, gain: 0.035, filterFreq: 240, vibrato: { rate: 0.13, depth: 1.5 } },
          { type: 'noise', filter: 'bandpass', freq: 1200, q: 6, gain: 0.04, lfoRate: 0.09, lfoDepth: 800 },
        ],
      },
      music: MUSIC,
      footstep: { filter: 'lowpass', freq: 900, q: 3, decay: 0.15, gain: 0.25, blip: 150 },
      growl: { type: 'sine', baseFreq: 340, filterFreq: 2600, decay: 1.8, gain: 0.32, glide: 0.45, vibrato: 7, noise: 0.15 },
    },
    update(dt, t, camera, playerPos) {
      tickShared(t);
      follower.update(camera);
      lights.update(playerPos);
      spores.update(dt, playerPos, t);
      fireflies.update(dt, { x: playerPos.x, y: playerPos.y + 4.2, z: playerPos.z }, t);
      poolMat.emissiveIntensity = 0.8 + Math.sin(t * 1.7) * 0.25;
      for (const a of animated) a.update(dt, t);
      for (let i = 0; i < islandData.length; i++) {
        const d = islandData[i];
        dummy.position.set(d.x, d.y + Math.sin(t * 0.3 + d.ph) * 2.5, d.z);
        dummy.rotation.set(0, t * 0.03 + d.ph, 0);
        dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        islandMesh.setMatrixAt(i, dummy.matrix);
      }
      islandMesh.instanceMatrix.needsUpdate = true;
      for (const M of mantas) {
        const a = t * M.sp + M.ph;
        M.g.position.set(M.cx + Math.cos(a) * M.r, M.y + Math.sin(t * 0.4 + M.ph) * 4, M.cz + Math.sin(a) * M.r);
        M.g.rotation.set(Math.sin(t * 0.8 + M.ph) * 0.08, -a + (M.sp > 0 ? Math.PI : 0), (M.sp > 0 ? -1 : 1) * 0.25);
        const f = Math.sin(t * 1.3 + M.ph) * 0.45;
        M.lw.rotation.z = f; M.rw.rotation.z = -f;
      }
    },
  };
}

// Soundtrack: dreamy A lydian — FM blips, a wobbling synth pad and sub pulses that thicken as the Jelly drifts closer.
const MUSIC = {
  bpm: 78,
  root: 45, // A2
  scale: [0, 2, 4, 6, 7, 9, 11],
  chords: [[0, 4, 7, 11], [2, 6, 9, 14], [-3, 0, 4, 7], [2, 6, 9, 13]],
  barsPerChord: 2,
  pad: { wave: 'sawtooth', gain: 0.022, filter: 760, attack: 2.0, wobble: 0.18 },
  drone: { notes: [0], wave: 'sine', gain: 0.045, octave: -1 },
  melody: { inst: 'bleep', gain: 0.045, octave: 2, density: [0.12, 0.3], range: 10 },
  bass: { inst: 'sub', gain: 0.16, octave: -1, pattern: 'x..x..x.x..x..x.', from: 0.3 },
  arp: { inst: 'bleep', gain: 0.025, octave: 3, pattern: 'xxxxxxxxxxxxxxxx', from: 0.65 },
  perc: [
    { inst: 'click', pattern: 'x...x.x...x...x.', gain: 0.06, from: 0.1 },
    { inst: 'kick', pattern: 'x.........x.....', gain: 0.32, from: 0.45 },
    { inst: 'hat', pattern: '..x...x...x...xx', gain: 0.03, from: 0.55 },
    { inst: 'snap', pattern: '....x.......x...', gain: 0.08, from: 0.75 },
  ],
};

export default {
  id: 'alien',
  name: 'Xenoterra',
  tagline: 'A ringed sky. Glowing, quiet ground.',
  monsterName: 'the Void Jelly',
  theme,
  // the gems here: geodes, dark rock outside with a pink crystal lining seen through small holes all around
  gem: { style: 'geode', dark: 0x2c2533, col: 0x453a50, glow: 0xff5ee0, innerDark: 0x3a2a44, inner: 0xe04fc8 },
  createPortalFrame,
  build,
};
