// The ice hole and the explorers' map (The Frozen Peaks).
// Each run a sinkhole opens at one of a few prepared clearings (never close to the portal or the spawn point).
// A spiral ledge winds down its wall from a wide landing at the rim to the bottom, where a low tunnel leads into a small cave: an abandoned
// explorers' camp, with the map lying on a crate. The ledge and tunnel are too narrow for the Yeti, so it can't come in,
// and while you're inside the hole it loses track of you (like the portal safe zone).
// Four ice spires stand a little above its crown (all of it under ~4 m, so it doesn't show from far away), and within
// ~50 m a hollow wind moans out of it.
// The Resonance Call is silent in this world: once you hold the map, standing still opens it instead, showing
// yourself, the way you're looking and every gem on the ground. The map can't be dropped or lost: if the Yeti
// catches you, it's still in your hands when you come back.
//
// The pit is a fine heightfield of its own: world.heightAt reads it inside the hole and the cave, the terrain is cut away
// over the opening (a discard circle in the terrain shader), and cells too steep to walk (the walls, the ledge's drop,
// the cave walls) block the explorer, so the only way in and out is the ledge.
import * as THREE from 'three';
import { GLACIER } from '../config.js';
import { mergeParts, m4, flatMat, instanced, softTexture, dist2D, damp } from '../engine/utils.js';
import { glowPoints } from '../engine/props.js';
import { mulberry32 } from '../engine/noise.js';

// ── shape of the hole (local frame: u points from the shaft to the cave, v across) ──
const RP = 7;          // opening radius
const RF = 3.9;        // radius of the open shaft floor (the ledge runs between RF and RP, ~3 m wide)
const D = 7.5;         // depth of the floor below the rim
const SWEEP = 5.3;     // radians the spiral ledge sweeps while descending
const TH0 = -(SWEEP + Math.PI * 2) / 2; // ledge start angle, so the floor-level sector faces the tunnel (+u)
const LAND = 0.5;      // radians of flat landing at rim level at the top of the ledge (~3.5 m wide way in and out)
const TW = 1.5;        // tunnel half-width
const LC = 13.5;       // cave chamber centre (u)
const RC = 4.6;        // cave chamber radius
const CS = 0.2;        // heightfield cell size (fine, so the ledge's edges are smooth to walk along)
const U0 = -RP - 1, U1 = LC + RC + 1.2, V0 = -RP - 1, V1 = RP + 1;
const NU = Math.ceil((U1 - U0) / CS) + 1, NV = Math.ceil((V1 - V0) / CS) + 1;
const STEEP = CS * 1.1; // a cell whose corners differ by more than this is a wall
const PROBE = 0.32;     // how far around the explorer's centre the walls are felt
const MOAN_RANGE = 50;  // the hollow wind out of the hole can be heard within this distance
export const SITE_CLEAR = 24; // metres around each candidate site kept free of props, gems and hunter waypoints

const TWO_PI = Math.PI * 2;
const STEER = [0.2, 0.4, 0.6, 0.85, 1.1, 1.35, 1.6]; // camera turns tried each way when rock blocks it in the hole (radians)
const SLIDE = [0.2, -0.2, 0.4, -0.4, 0.6, -0.6, 0.8, -0.8, 1.05, -1.05, 1.3, -1.3]; // turns tried when a step hits a wall
const wrap = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const inFootprint = (u, v, pad = 0) => (u > RP - 1 && u < LC && Math.abs(v) < TW + pad) || Math.hypot(u - LC, v) < RC + pad;
const inRegion = (u, v) => Math.hypot(u, v) < RP || inFootprint(u, v);
// height below the rim (0 at the rim, -D at the floor), or null outside the hole
function pitLocal(u, v) {
  const r = Math.hypot(u, v);
  if (r < RP) {
    if (r < RF) return -D;
    const phi = wrap(Math.atan2(v, u) - TH0);
    if (phi >= SWEEP) return -D;
    return phi < LAND ? 0 : -D * ((phi - LAND) / (SWEEP - LAND));
  }
  return inFootprint(u, v) ? -D : null;
}
// cave ceiling above the cave floor: a low vaulted tunnel opening into a domed chamber
function ceilLocal(u, v) {
  const tb = u < LC ? Math.max(0, 1 - (v / TW) ** 2) * 1.0 : 0;
  const d = Math.min(RC, Math.hypot(u - LC, v));
  const cb = 2.4 * (1 - (d / RC) ** 2);
  return 3.3 + Math.max(tb, cb);
}

// Prepared clearings for the hole, chosen once per world build: spread out over gentle ground away from landmarks.
// base = the terrain's height function before flattening; avoid = [{x, z, d}]
export function pickCaveSites({ base, radius, avoid, count = 12, seed = 4242 }) {
  const rng = mulberry32(seed);
  const ok = [];
  for (let i = 0; i < 900; i++) {
    const a = rng() * TWO_PI, r = Math.sqrt(rng()) * (radius - 48);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (avoid.some((p) => Math.hypot(x - p.x, z - p.z) < p.d)) continue;
    let lo = Infinity, hi = -Infinity;
    for (const rr of [0, 9, 18]) for (let k = 0; k < 8; k++) {
      const h = base(x + Math.cos(k * 0.785) * rr, z + Math.sin(k * 0.785) * rr);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    ok.push({ x, z, rough: hi - lo });
  }
  // keep the gentlest third of the ground
  ok.sort((a, b) => a.rough - b.rough);
  ok.length = Math.max(Math.min(ok.length, count), Math.floor(ok.length / 3));
  // farthest-point sampling: an even spread of sites
  const sites = [];
  while (sites.length < count && ok.length) {
    let best = 0, bestD = -1;
    for (let i = 0; i < ok.length; i++) {
      let d = sites.length ? Infinity : Math.hypot(ok[i].x, ok[i].z) + rng();
      for (const s of sites) d = Math.min(d, Math.hypot(ok[i].x - s.x, ok[i].z - s.z));
      if (d > bestD) { bestD = d; best = i; }
    }
    if (sites.length >= 6 && bestD < 55) break;
    sites.push(ok.splice(best, 1)[0]);
  }
  return sites;
}

// Cut a circular hole in the terrain (the pit's opening). Returns the uniform: (x, z, radius), radius 0 = no hole.
export function terrainHole(material) {
  const uHole = { value: new THREE.Vector3(0, 0, 0) };
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uHole = uHole;
    sh.vertexShader = 'varying vec2 vHoleXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHoleXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform vec3 uHole;\nvarying vec2 vHoleXZ;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (uHole.z > 0.0 && distance(vHoleXZ, uHole.xy) < uHole.z) discard;');
  };
  material.customProgramCacheKey = () => 'terrain-hole';
  return uHole;
}

// The map as an object in the world: a rolled chart tied with a red ribbon, glowing warmly.
function createMapItem() {
  const g = new THREE.Group();
  const scroll = new THREE.Group(); g.add(scroll);
  const geo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.13, 0.13, 0.8, 10), color: 0xead9b0, matrix: m4(0, 0, 0, 0, 0, Math.PI / 2) },
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.98, 6), color: 0x5a3a22, matrix: m4(0, 0, 0, 0, 0, Math.PI / 2) },
    { geo: new THREE.TorusGeometry(0.14, 0.028, 4, 12), color: 0xc0392b, matrix: m4(0.05, 0, 0, 0, Math.PI / 2, 0) },
    { geo: new THREE.BoxGeometry(0.5, 0.01, 0.22), color: 0xdcc898, matrix: m4(0.1, -0.1, 0.17, 0.5, 0, 0) },
  ]);
  const mesh = new THREE.Mesh(geo, flatMat({ vertexColors: true, emissive: 0x7a5418, emissiveIntensity: 0.35 }));
  mesh.castShadow = true;
  scroll.add(mesh);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: 0xffc46b, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.set(2.2, 2.2, 1);
  g.add(halo);
  return { group: g, scroll, halo };
}

export function createIceCave({ scene, groundAt, sites, holeUniform, colliders, density = 1 }) {
  const cfg = GLACIER;
  let site = null;          // { x, z, y0, rot, c, s }
  let H = new Float32Array(NU * NV), walk = new Uint8Array((NU - 1) * (NV - 1));
  let mapState = 'none';    // 'cave' (on the crate) | 'held'
  let toldNoCall = false, dripTimer = 2, moanTimer = 1, camBlend = 0, boom = 1, steerSide = 0, lastCamT = 0, hint = null, held = false, canTake = false;
  const keepOut = [];

  const toLocal = (x, z) => { const dx = x - site.x, dz = z - site.z; return { u: dx * site.c + dz * site.s, v: -dx * site.s + dz * site.c }; };
  const toWorld = (u, v) => ({ x: site.x + u * site.c - v * site.s, z: site.z + u * site.s + v * site.c });

  // ── meshes ──
  const pitMat = flatMat({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  const pit = new THREE.Mesh(new THREE.BufferGeometry(), pitMat);
  pit.receiveShadow = true; // nothing underground casts shadows: the terrain doesn't, so they'd land on the snow above pit.visible = false; pit.frustumCulled = false;
  scene.add(pit);
  const lintel = new THREE.Mesh(new THREE.BufferGeometry(), flatMat({ color: 0x5f8db4, side: THREE.DoubleSide }));
  lintel.visible = false; lintel.frustumCulled = false;
  scene.add(lintel);

  // everything that keeps its shape from site to site lives in one group, built once in the local frame
  // (y = 0 at the rim): cave ceiling, the rock mound above the cave, the rim shards, the explorers' camp
  const cave = new THREE.Group();
  cave.visible = false;
  scene.add(cave);
  const rng = mulberry32(911);
  const lp = []; // local colliders for the cave props: { u, v, r }
  {
    // ceiling: a heightfield facing down, over the tunnel and chamber
    const pos = [], col = [];
    const cA = new THREE.Color(0x4d6c8c), cB = new THREE.Color(0x6f93b5);
    const vtx = (u, v) => [u, -D + ceilLocal(u, v), v];
    for (let i = 0; i < NU - 1; i++) for (let j = 0; j < NV - 1; j++) {
      const u = U0 + i * CS, v = V0 + j * CS, uc = u + CS / 2, vc = v + CS / 2, rc = Math.hypot(uc, vc);
      if (!inFootprint(uc, vc, 0.6)) continue;
      if (!((rc > RP - 0.4 && Math.abs(vc) < TW + 0.1) || rc > RP + 0.1)) continue;
      const a = vtx(u, v), d = vtx(u + CS, v), b = vtx(u, v + CS), c = vtx(u + CS, v + CS);
      for (const tri of [[a, d, b], [d, c, b]]) {
        const k = 0.5 + 0.5 * Math.sin(uc * 1.7 + vc * 2.3);
        const cc = cA.clone().lerp(cB, k);
        for (const p of tri) { pos.push(...p); col.push(cc.r, cc.g, cc.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const ceil = new THREE.Mesh(g, flatMat({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.4 }));
    ceil.receiveShadow = true;
    cave.add(ceil);

    // icicles hanging from the ceiling and glowing ice crystals on the cave walls
    const ics = [];
    for (let i = 0; i < 46; i++) {
      const a = rng() * TWO_PI, rr = Math.sqrt(rng()) * (RC - 0.6);
      let u = LC + Math.cos(a) * rr, v = Math.sin(a) * rr;
      if (i < 10) { u = RP + 0.4 + rng() * (LC - RC - RP); v = (rng() - 0.5) * 2 * (TW - 0.3); }
      const len = 0.3 + rng() * (i < 10 ? 0.5 : 1.1);
      ics.push({ x: u, y: -D + ceilLocal(u, v) + 0.05, z: v, s: 0.8 + rng() * 0.6, sy: len });
    }
    const icGeo = new THREE.ConeGeometry(0.09, 1, 5); icGeo.rotateX(Math.PI); icGeo.translate(0, -0.5, 0);
    const iceGlow = new THREE.MeshStandardMaterial({ color: 0xbdefff, emissive: 0x3aa8e0, emissiveIntensity: 0.7, roughness: 0.1, flatShading: true });
    cave.add(instanced(icGeo, iceGlow, ics, { castShadow: false }));
    const crys = [];
    for (let k = 0; k < 7; k++) {
      const a = -2.3 + k * 0.75 + (rng() - 0.5) * 0.3;
      const cu = LC + Math.cos(a) * (RC - 0.35), cv = Math.sin(a) * (RC - 0.35);
      for (let n = 0; n < 4; n++) {
        const s = 0.18 + rng() * 0.3;
        crys.push({ x: cu + (rng() - 0.5) * 0.6, y: -D + s * 1.2, z: cv + (rng() - 0.5) * 0.6, s, sy: s * (2 + rng() * 2), rx: (rng() - 0.5) * 0.8, rz: (rng() - 0.5) * 0.8, ry: rng() * 3 });
      }
    }
    cave.add(instanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xc9f6ff, emissive: 0x29c0ff, emissiveIntensity: 1.1, roughness: 0.1, flatShading: true }), crys, { castShadow: false }));
    cave.add(glowPoints(crys.filter((_, i) => i % 4 === 0).map((c) => ({ x: c.x, y: c.y + 0.3, z: c.z })), { color: 0x6fdcff, size: 2.4, opacity: 0.45 }));

    // the abandoned explorers' camp: crates (the map lies on the near one), bedroll, lantern, pickaxe, rope, pack
    const fy = -D;
    const camp = mergeParts([
      { geo: new THREE.BoxGeometry(0.9, 0.8, 0.9), color: 0x8a5a33, matrix: m4(0, 0.4, 0, 0, 0.2, 0) },
      { geo: new THREE.BoxGeometry(0.92, 0.08, 0.92), color: 0xf2f6fb, matrix: m4(0, 0.82, 0, 0, 0.2, 0) },
      { geo: new THREE.BoxGeometry(0.8, 0.7, 0.8), color: 0x9c6a3c, matrix: m4(0.95, 0.35, 0.3, 0, -0.3, 0) },
      { geo: new THREE.BoxGeometry(0.7, 0.6, 0.7), color: 0x8a5a33, matrix: m4(0.9, 1.0, 0.25, 0, 0.5, 0) },
      // bedroll
      { geo: (() => { const c = new THREE.CylinderGeometry(0.28, 0.28, 1.9, 8); c.rotateX(Math.PI / 2); return c; })(), color: 0x3d6b4f, matrix: m4(-1.9, 0.2, 1.7, 0, 0.35, 0) },
      { geo: new THREE.BoxGeometry(0.75, 0.1, 1.6), color: 0x2e4e3a, matrix: m4(-1.6, 0.05, 0.6, 0, 0.35, 0) },
      // backpack
      { geo: new THREE.BoxGeometry(0.55, 0.75, 0.35), color: 0xc8682b, matrix: m4(-2.6, 0.38, -1.0, 0.15, 0.8, 0) },
      { geo: new THREE.BoxGeometry(0.45, 0.25, 0.2), color: 0x9b4f20, matrix: m4(-2.5, 0.25, -0.8, 0.15, 0.8, 0) },
      // rope coil
      { geo: new THREE.TorusGeometry(0.32, 0.07, 5, 14), color: 0xb79a63, matrix: m4(1.0, 0.07, -1.3, Math.PI / 2, 0, 0) },
      { geo: new THREE.TorusGeometry(0.24, 0.07, 5, 14), color: 0xa58855, matrix: m4(1.0, 0.18, -1.3, Math.PI / 2, 0, 0) },
      // pickaxe leaning on the wall
      { geo: new THREE.CylinderGeometry(0.035, 0.04, 1.4, 5), color: 0x5c3a22, matrix: m4(2.9, 0.7, -2.6, 0.3, 0, 0.25) },
      { geo: new THREE.BoxGeometry(0.75, 0.08, 0.1), color: 0x6b7480, matrix: m4(3.07, 1.36, -2.43, 0.3, 0, 0.25) },
      // lantern on the upper crate
      { geo: new THREE.CylinderGeometry(0.13, 0.15, 0.06, 8), color: 0x2b2b2b, matrix: m4(0.9, 1.33, 0.25) },
      { geo: new THREE.CylinderGeometry(0.13, 0.13, 0.04, 8), color: 0x2b2b2b, matrix: m4(0.9, 1.62, 0.25) },
      { geo: new THREE.TorusGeometry(0.08, 0.015, 4, 10), color: 0x2b2b2b, matrix: m4(0.9, 1.7, 0.25) },
    ]);
    const campG = new THREE.Group();
    campG.position.set(LC + 1.4, fy, -0.6);
    campG.rotation.y = 0.4;
    const campMesh = new THREE.Mesh(camp, flatMat({ vertexColors: true }));
    campMesh.receiveShadow = true;
    campG.add(campMesh);
    const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 8), new THREE.MeshBasicMaterial({ color: 0xffcf7a, toneMapped: false }));
    flame.position.set(0.9, 1.48, 0.25); campG.add(flame);
    campG.add(glowPoints([{ x: 0.9, y: 1.48, z: 0.25 }], { color: 0xffa94a, size: 5, opacity: 0.6 }));
    cave.add(campG);
    // where things stand, in the local frame (for colliders and the map's crate)
    const local = (x, z) => { const c = Math.cos(0.4), s = Math.sin(0.4); return { u: LC + 1.4 + x * c + z * s, v: -0.6 - x * s + z * c }; };
    const crate = local(0, 0), crates2 = local(0.95, 0.3), bed = local(-1.8, 1.3), pack = local(-2.6, -1.0);
    lp.push({ ...crate, r: 0.55 }, { ...crates2, r: 0.5 }, { ...bed, r: 0.55 }, { ...pack, r: 0.35 });
    cave.userData.crate = { u: crate.u, v: crate.v, y: 0.86 };
    cave.userData.lantern = { ...local(0.9, 0.25), y: 1.6 };

    // a mound of snowy rock over the cave, so the ground above it looks like what it is: something you can't walk on
    const mound = [];
    mound.push({ geo: new THREE.IcosahedronGeometry(1, 1), color: 0xf1f5fa, matrix: m4(LC, 0.3, 0, 0, 0.3, 0, RC + 0.6, 2.2, RC + 0.4) });
    mound.push({ geo: new THREE.DodecahedronGeometry(1, 0), color: 0x7d8da2, matrix: m4(LC + 1.5, 1.6, -1.6, 0.3, 0.8, 0.2, 2.2, 1.9, 1.8) });
    mound.push({ geo: new THREE.DodecahedronGeometry(1, 0), color: 0xf1f5fa, matrix: m4(LC + 1.4, 3.1, -1.5, 0, 0.8, 0, 1.5, 0.5, 1.3) });
    mound.push({ geo: new THREE.DodecahedronGeometry(1, 0), color: 0x72839a, matrix: m4(LC - 1.8, 1.3, 2.0, 0.1, 1.9, 0.3, 1.9, 1.6, 1.6) });
    mound.push({ geo: new THREE.DodecahedronGeometry(1, 0), color: 0xf1f5fa, matrix: m4(LC - 1.8, 2.6, 2.0, 0, 1.9, 0, 1.3, 0.45, 1.1) });
    mound.push({ geo: new THREE.DodecahedronGeometry(1, 0), color: 0x7d8da2, matrix: m4(RP + 1.7, 0.8, 0, 0.2, 0.5, 0, 1.9, 1.5, TW + 0.9) });
    mound.push({ geo: new THREE.DodecahedronGeometry(1, 0), color: 0xf1f5fa, matrix: m4(RP + 1.7, 2.0, 0, 0, 0.5, 0, 1.4, 0.45, TW + 0.4) });
    const mm = new THREE.Mesh(mergeParts(mound), flatMat({ vertexColors: true }));
    mm.castShadow = true; mm.receiveShadow = true;
    cave.add(mm);

    // a crown of blue-ice shards around the rim, leaning out; the entrance is left open and marked by a pole
    const ice = new THREE.MeshStandardMaterial({ color: 0xa8e8ff, emissive: 0x2a8fbf, emissiveIntensity: 0.55, roughness: 0.1, flatShading: true, transparent: true, opacity: 0.92 });
    const shards = [];
    const entry = wrap(TH0), gap = entry + LAND / 2, open = LAND / 2 + 0.12; // the way in is the landing at the ledge's top
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TWO_PI + (rng() - 0.5) * 0.06;
      let da = Math.abs(wrap(a - gap)); da = Math.min(da, TWO_PI - da);
      if (da < open) continue;
      const big = da < open + 0.3 ? 1.6 : 1; // the shards flanking the gap are chunkier, not much taller
      const r = RP + 0.35 + rng() * 0.5, s = (0.35 + rng() * 0.35) * big, len = (1.2 + rng() * 1.8) * (big > 1 ? 1.15 : 1);
      const lean = 0.25 + rng() * 0.3;
      shards.push({ x: Math.cos(a) * r, y: len * 0.45, z: Math.sin(a) * r, sx: s, sy: len, sz: s, ry: -a, rz: 0, rx: 0, lean, a });
    }
    // four spires stand a little above the rest of the crown: a landmark from up close, low enough not to give the hole
    // away from across the map
    for (const [da, len] of [[1.35, 3.6], [2.75, 3.1], [3.95, 3.8], [5.15, 3.3]]) {
      const a = gap + da, r = RP + 0.55, s = 0.62 + rng() * 0.12;
      shards.push({ x: Math.cos(a) * r, y: len * 0.45, z: Math.sin(a) * r, sx: s, sy: len, sz: s, lean: 0.12 + rng() * 0.08, a });
    }
    // lean outwards: rotate about the tangent
    const sm = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), ice, shards.length);
    const dmy = new THREE.Object3D();
    shards.forEach((sh, i) => {
      dmy.position.set(sh.x, sh.y - 0.3, sh.z);
      dmy.rotation.set(0, 0, 0);
      dmy.quaternion.setFromAxisAngle(new THREE.Vector3(-Math.sin(sh.a), 0, Math.cos(sh.a)), -sh.lean);
      dmy.scale.set(sh.sx, sh.sy, sh.sz);
      dmy.updateMatrix(); sm.setMatrixAt(i, dmy.matrix);
    });
    sm.instanceMatrix.needsUpdate = true; sm.castShadow = true; sm.computeBoundingSphere();
    cave.add(sm);
    // the blue glow rising from the hole: only noticeable from up close (fog swallows it)
    const glow = [];
    for (let i = 0; i < 14; i++) { const a = rng() * TWO_PI, r = rng() * RF; glow.push({ x: Math.cos(a) * r, y: -D + 0.6 + rng() * 5, z: Math.sin(a) * r }); }
    cave.add(glowPoints(glow, { color: 0x6fdcff, size: 3.5, opacity: 0.35 }));
    // the explorers' marker pole at the top of the ledge
    const pa = gap + open + 0.06, pr = RP + 0.9;
    const pole = mergeParts([
      { geo: new THREE.CylinderGeometry(0.07, 0.09, 3.4, 5), color: 0x5a3d2b, matrix: m4(0, 1.7, 0) },
      { geo: new THREE.BoxGeometry(0.22, 0.3, 0.22), color: 0xd03a2a, matrix: m4(0, 3.1, 0) },
      { geo: new THREE.BoxGeometry(0.04, 0.5, 0.75), color: 0x3d85c6, matrix: m4(0, 2.95, 0.42, 0, 0, 0.08) },
    ]);
    const poleMesh = new THREE.Mesh(pole, flatMat({ vertexColors: true }));
    poleMesh.position.set(Math.cos(pa) * pr, -0.2, Math.sin(pa) * pr); poleMesh.castShadow = true;
    cave.add(poleMesh);
    cave.add(glowPoints([{ x: Math.cos(pa) * pr, y: 3.1, z: Math.sin(pa) * pr }], { color: 0xff6a3a, size: 1.4, opacity: 0.55 }));
  }

  // colliders for the cave props (only the explorer ever stands where they are); parked far away until a run starts
  const cols = lp.map((p) => colliders.push({ x: 1e5, z: 1e5, r: p.r, low: true }) && colliders[colliders.length - 1]);

  // the map: one object, on the crate at first; the light comes from the lantern beside it (and follows the map
  // when it waits for you by the portal). A single light, created once, so no shader has to recompile mid-run.
  const item = createMapItem();
  item.group.visible = false;
  scene.add(item.group);
  const light = new THREE.PointLight(0xffb45a, 0, 12, 1.6);
  scene.add(light);

  // ── per-site heightfield ──
  function buildPit() {
    const node = (i, j) => j * NU + i;
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const u = U0 + i * CS, v = V0 + j * CS;
      const h = pitLocal(u, v);
      const w = toWorld(u, v);
      H[node(i, j)] = h === null ? groundAt(w.x, w.z) : site.y0 + h;
    }
    const pos = [], col = [];
    const snow = new THREE.Color(0xe3ebf4), caveFloor = new THREE.Color(0x8496ad), wallA = new THREE.Color(0x7fb6db), wallB = new THREE.Color(0x3f6f99);
    const cc = new THREE.Color();
    for (let i = 0; i < NU - 1; i++) for (let j = 0; j < NV - 1; j++) {
      const ia = node(i, j), id = node(i + 1, j), ib = node(i, j + 1), ic = node(i + 1, j + 1);
      const hs = [H[ia], H[id], H[ib], H[ic]];
      const lo = Math.min(...hs), hi = Math.max(...hs);
      walk[j * (NU - 1) + i] = hi - lo <= STEEP ? 1 : 0;
      const u = U0 + i * CS, v = V0 + j * CS;
      const any = inRegion(u, v) || inRegion(u + CS, v) || inRegion(u, v + CS) || inRegion(u + CS, v + CS);
      if (!any) continue;
      const P = (ii, jj, h) => { const w = toWorld(U0 + ii * CS, V0 + jj * CS); return [w.x, h, w.z]; };
      const a = P(i, j, H[ia]), d = P(i + 1, j, H[id]), b = P(i, j + 1, H[ib]), c = P(i + 1, j + 1, H[ic]);
      for (const tri of [[a, b, d], [d, b, c]]) {
        const tl = Math.min(tri[0][1], tri[1][1], tri[2][1]), th = Math.max(tri[0][1], tri[1][1], tri[2][1]);
        const depth = Math.min(1, Math.max(0, (site.y0 - tl) / D));
        if (th - tl > STEEP) cc.copy(wallA).lerp(wallB, depth * 0.85 + 0.1 * Math.sin(tl * 2.1 + u));
        else if (Math.hypot(u, v) > RP && depth > 0.9) cc.copy(caveFloor);
        else cc.copy(snow).lerp(caveFloor, depth * 0.55);
        for (const p of tri) { pos.push(...p); col.push(cc.r, cc.g, cc.b); }
      }
    }
    pit.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    pit.geometry = g;

    // the lintel above the tunnel mouth: closes the gap between the tunnel's vault and the rim
    const lpos = [], idx = [];
    const steps = 14;
    for (let k = 0; k <= steps; k++) {
      const v = -(TW + 0.6) + (k / steps) * 2 * (TW + 0.6);
      const u = Math.sqrt(RP * RP - v * v) - 0.05;
      const w = toWorld(u, v);
      lpos.push(w.x, site.y0 - D + ceilLocal(u, v) - 0.15, w.z, w.x, groundAt(w.x, w.z) + 0.15, w.z);
      if (k < steps) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    lintel.geometry.dispose();
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
    lg.setIndex(idx); lg.computeVertexNormals(); lg.computeBoundingSphere();
    lintel.geometry = lg;
  }

  // height inside the hole, read from the same triangles that are drawn (null outside the hole)
  function pitHeight(x, z) {
    if (!site) return null;
    const dx = x - site.x, dz = z - site.z;
    if (dx * dx + dz * dz > 625) return null;
    const { u, v } = toLocal(x, z);
    if (!inRegion(u, v)) return null;
    const fx = (u - U0) / CS, fz = (v - V0) / CS;
    const i = Math.min(NU - 2, Math.max(0, Math.floor(fx))), j = Math.min(NV - 2, Math.max(0, Math.floor(fz)));
    const a = H[j * NU + i], d = H[j * NU + i + 1], b = H[(j + 1) * NU + i], c = H[(j + 1) * NU + i + 1];
    const s = fx - i, t = fz - j;
    return s + t <= 1 ? a + (d - a) * s + (b - a) * t : c + (b - c) * (1 - s) + (d - c) * (1 - t);
  }

  function cellOk(x, z) {
    const { u, v } = toLocal(x, z);
    const i = Math.floor((u - U0) / CS), j = Math.floor((v - V0) / CS);
    if (i < 0 || j < 0 || i >= NU - 1 || j >= NV - 1) return true;
    return walk[j * (NU - 1) + i] === 1;
  }
  function spotOk(x, z) {
    if (!cellOk(x, z)) return false;
    for (let k = 0; k < 8; k++) { const a = k * 0.785; if (!cellOk(x + Math.cos(a) * PROBE, z + Math.sin(a) * PROBE)) return false; }
    return true;
  }
  const near = (x, z, d) => site && (x - site.x) ** 2 + (z - site.z) ** 2 < d * d;

  // is a camera point in open air (not inside rock, under the ground or above the cave ceiling)?
  function air(x, y, z) {
    const { u, v } = toLocal(x, z);
    const r = Math.hypot(u, v);
    if (r < RP - 0.25) return y > (pitHeight(x, z) ?? site.y0) + 0.25;
    if (inFootprint(u, v, -0.3) && r > RP - 0.3) return (y > site.y0 - D + 0.25 && y < site.y0 - D + ceilLocal(u, v) - 0.25) || y > groundAt(x, z) + 0.6;
    return y > groundAt(x, z) + 0.4;
  }
  // how far the camera can sit from the look point towards c before rock gets in the way (the full length if none)
  function clearance(look, c) {
    const dx = c.x - look.x, dy = c.y - look.y, dz = c.z - look.z, len = Math.hypot(dx, dy, dz);
    for (let s = 0.1; s <= len; s += 0.1) {   // fine enough to catch the thin corner where the tunnel meets the chamber
      if (!air(look.x + dx * s / len, look.y + dy * s / len, look.z + dz * s / len)) return Math.max(0.35, s - 0.35);
    }
    return len;
  }
  const inCave = (p) => { if (!near(p.x, p.z, 24)) return false; const { u, v } = toLocal(p.x, p.z); return Math.hypot(u, v) > RP - 0.6 && inFootprint(u, v) && p.y < site.y0 - D + 2; };
  // how far into the tunnel you are (0 in the shaft or up on the ledge, 1 inside): the camera lowers and comes in
  // gradually as you walk towards the tunnel mouth, so it is already low when the vault closes over you
  const smooth01 = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
  const caveWeight = (p) => {
    if (!near(p.x, p.z, 24)) return 0;
    const { u, v } = toLocal(p.x, p.z);
    if (!inRegion(u, v)) return 0;
    return smooth01((site.y0 - D + 3 - p.y) / 1.5) * smooth01((u - (RP - 2.5)) / 3.5);
  };
  const sheltered = (p) => { if (!near(p.x, p.z, 24)) return false; const { u, v } = toLocal(p.x, p.z); return inRegion(u, v); };

  function placeItem(x, y, z) {
    item.group.position.set(x, y, z);
    item.group.visible = true;
    item.base = y;
  }

  function reset() {
    held = false; canTake = false;
    item.group.visible = false;
    light.intensity = 0;
    camBlend = 0; steerSide = 0;
  }

  const api = {
    sites,
    sheltered,
    keepOut,
    get site() { return site; },
    get hasMap() { return held; },
    get canTake() { return canTake; },
    get mapState() { return mapState; },
    heightAt: pitHeight,
    // the explorer feels the walls: a move onto cells too steep to walk is turned to glide along the wall (the
    // smallest turn that works, keeping the forward part of the step), so the curved ledge never snags you
    constrainMove(pos, px, pz) {
      if (!near(pos.x, pos.z, 26) && !near(px, pz, 26)) return;
      if (spotOk(pos.x, pos.z)) return;
      const dx = pos.x - px, dz = pos.z - pz;
      if (dx * dx + dz * dz > 1e-10) {
        for (const a of SLIDE) {
          const c = Math.cos(a), s = Math.sin(a);
          const nx = px + (dx * c - dz * s) * c, nz = pz + (dx * s + dz * c) * c;
          if (spotOk(nx, nz)) { pos.x = nx; pos.z = nz; return; }
        }
      }
      pos.x = px; pos.z = pz;
    },
    // keep the camera inside the hole and the cave: lower, closer and under the ceiling while you're in the cave,
    // never inside rock, and swung away from the walls so it keeps its distance instead of pulling in close to you
    constrainCamera(camera, rig, P, frameDt) {
      const now = performance.now() / 1000, dt = Math.min(0.1, frameDt ?? (lastCamT ? now - lastCamT : 1 / 60));
      lastCamT = now;
      if (!site || !near(P.x, P.z, 40)) { camBlend = 0; boom = 1; steerSide = 0; return; }
      const look = { x: rig.target.x, y: rig.target.y + 1.5, z: rig.target.z };
      let lift = rig.lookLift || 0;   // looking up: the gaze tilts above the explorer's head
      camBlend = damp(camBlend, caveWeight(P), 5, dt);
      const cam = camera.position;
      // in the cave the camera comes lower and closer than its usual orbit
      const p = Math.max(-0.08, Math.min(rig.pitch, 0.26)), d = Math.min(rig.curDist ?? rig.distance, 5.2);
      const caveSpot = (yaw) => ({ x: rig.target.x + Math.sin(yaw) * Math.cos(p) * d, y: rig.target.y + 1.7 + Math.sin(p) * d, z: rig.target.z + Math.cos(yaw) * Math.cos(p) * d });
      const spot = (yaw) => {
        const o = rig.spotAt(yaw), c = caveSpot(yaw);
        return { x: o.x + (c.x - o.x) * camBlend, y: o.y + (c.y - o.y) * camBlend, z: o.z + (c.z - o.z) * camBlend };
      };
      // anywhere down in the hole, a camera blocked by rock swings round you towards open space: across the shaft,
      // or along the tunnel. It takes the open direction nearest its own (each turn is worth what it frees up,
      // minus its size, and the side it already leans to wins ties, so it never flips between two equal gaps).
      // It gives way while you turn the camera yourself (then only the boom shortens) and eases in once you let go.
      const yieldTo = Math.min(1, Math.max(0, (rig.sinceLook - 0.25) / 0.35));
      const ideal = spot(rig.yaw), full = Math.hypot(ideal.x - look.x, ideal.y - look.y, ideal.z - look.z);
      const here = sheltered(P) && yieldTo > 0 ? clearance(look, ideal) : full;
      if (here < full * 0.92) {
        let best = 0, bestScore = here;
        for (const a of STEER) {
          let open = false;
          for (const off of [a * (steerSide || 1), -a * (steerSide || 1)]) {
            const room = clearance(look, spot(rig.yaw + off));
            const score = room - off * Math.sign(off) * 0.7 + (steerSide && Math.sign(off) === steerSide ? 0.3 : 0);
            if (score > bestScore + 0.05) { best = off; bestScore = score; }
            if (room > full * 0.98) open = true;
          }
          if (open) break;   // a wider turn can't free up more
        }
        if (best) steerSide = Math.sign(best);
        rig.yaw += Math.sign(best) * Math.min(Math.abs(best) * (1 - Math.exp(-3 * dt)), 2 * dt) * yieldTo;
      } else steerSide = 0;
      if (camBlend > 0.01) {
        const c = caveSpot(rig.yaw);
        cam.set(cam.x + (c.x - cam.x) * camBlend, cam.y + (c.y - cam.y) * camBlend, cam.z + (c.z - cam.z) * camBlend);
        lift = lift * (1 - camBlend) + Math.tan(Math.max(0, p - rig.pitch)) * Math.cos(p) * d * camBlend;
      }
      if (!air(look.x, look.y, look.z)) return;
      const dx = cam.x - look.x, dy = cam.y - look.y, dz = cam.z - look.z, len = Math.hypot(dx, dy, dz);
      if (len < 0.01) return;
      const free = clearance(look, cam);
      // the boom eases in over a fraction of a second and out more slowly, so rock coming between you and the
      // camera never makes it jump. If the eased spot would sit inside rock, it comes in only as far as it must:
      // to the nearest open point towards you
      const want = free / len;
      const inRock = (k) => !air(look.x + dx * k, look.y + dy * k, look.z + dz * k);
      boom = want < boom ? damp(boom, want, 9, dt) : damp(boom, want, 4, dt);
      if (boom > 0.999) boom = 1;
      let f = boom;
      if (f < 1 && inRock(f)) {
        while (f > 0.07 && inRock(f)) f -= 0.01;
        boom = f;
      }
      if (f < 1) {
        cam.set(look.x + dx * f, look.y + dy * f, look.z + dz * f);
        camera.lookAt(look.x, look.y + lift * f, look.z);
      } else if (camBlend > 0.01) camera.lookAt(look.x, look.y + lift, look.z);
    },
    // places to keep storm devices away from
    avoid() {
      if (!site) return [];
      const ch = toWorld(LC, 0);
      const d = cfg.reach + 8;
      return [{ x: site.x, z: site.z, d: d + RP }, { x: ch.x, z: ch.z, d: d + RC }];
    },

    // a new run: the hole opens at one of the prepared clearings, far from the portal and from where you start
    setup(ctx) {
      const rngR = ctx.rng || Math.random;
      const far = (s) => Math.min(dist2D(s, { x: ctx.portal.x, z: ctx.portal.z }), ctx.base ? dist2D(s, ctx.base) : Infinity);
      const okSites = sites.filter((s) => far(s) >= cfg.caveMinDist);
      const pick = okSites.length ? okSites[Math.floor(rngR() * okSites.length)] : sites.reduce((a, b) => (far(b) > far(a) ? b : a));
      const rot = rngR() * TWO_PI;
      site = { x: pick.x, z: pick.z, y0: groundAt(pick.x, pick.z), rot, c: Math.cos(rot), s: Math.sin(rot) };
      buildPit();
      holeUniform.value.set(site.x, site.z, RP);
      pit.visible = lintel.visible = cave.visible = true;
      cave.position.set(site.x, site.y0, site.z);
      cave.rotation.y = -rot;
      cave.updateMatrixWorld(true);
      lp.forEach((p, i) => { const w = toWorld(p.u, p.v); cols[i].x = w.x; cols[i].z = w.z; });
      const ch = toWorld(LC, 0);
      keepOut.length = 0;
      // (the hunter's own radius is added on top): it can't reach you anywhere inside, but can still catch you at the rim
      keepOut.push({ x: site.x, z: site.z, r: RP + 0.9 }, { x: ch.x, z: ch.z, r: RC + 0.6 }, { ...toWorld(RP + 1.5, 0), r: TW + 0.6 });
      // the map lies on the crate, the lantern beside it lights the cave
      reset();
      mapState = 'cave';
      const cr = cave.userData.crate, cw = toWorld(cr.u, cr.v);
      placeItem(cw.x, site.y0 - D + cr.y + 0.14, cw.z);
      item.scroll.rotation.set(0, rot * -1 + 0.4, 0);
      const ln = cave.userData.lantern, lw = toWorld(ln.u, ln.v);
      light.position.set(lw.x, site.y0 - D + ln.y + 0.2, lw.z);
      light.intensity = 26; light.distance = 12;
      toldNoCall = false; dripTimer = 2; moanTimer = 1;
    },

    // ctx = { player (Vector3), audio, hud, still (seconds standing still) }
    update(dt, t, ctx) {
      if (!site) return;
      const P = ctx.player;
      // the map item: a slow glow on the crate
      if (item.group.visible) {
        item.halo.material.opacity = 0.45 + 0.2 * Math.sin(t * 2.4);
        const gp = item.group.position;
        // close enough to reach it: the "Take the map" action appears (it's taken only when you use it)
        canTake = Math.hypot(gp.x - P.x, gp.z - P.z) < 2.2 && Math.abs(gp.y - P.y - 0.8) < 2.4;
      } else canTake = false;
      const d = Math.hypot(P.x - site.x, P.z - site.z);
      // a hollow wind moaning out of the hole, louder as you come closer (the cave has its own sounds)
      if (d < MOAN_RANGE && !inCave(P) && ctx.audio) {
        moanTimer -= dt;
        if (moanTimer <= 0) {
          moanTimer = 3 + Math.random() * 2.5;
          const k = Math.pow(1 - d / MOAN_RANGE, 1.3), f = 300 + Math.random() * 90;
          ctx.audio.noiseBurst({ type: 'bandpass', freq: f, q: 7, dur: 2.2, gain: 0.22 * k, attack: 0.7, sweepTo: f * 0.7 });
          ctx.audio.tone({ freq: f * 0.5, type: 'sine', dur: 2, gain: 0.035 * k, attack: 0.6, glideTo: f * 0.38 });
        }
      }
      // cave ambience: water dripping somewhere in the dark
      if (inCave(P) && ctx.audio) {
        dripTimer -= dt;
        if (dripTimer <= 0) {
          dripTimer = 1.2 + Math.random() * 3;
          const f = 1300 + Math.random() * 900;
          ctx.audio.tone({ freq: f, type: 'sine', dur: 0.18, gain: 0.03, glideTo: f * 0.55 });
          ctx.audio.tone({ freq: f * 0.98, type: 'sine', dur: 0.3, gain: 0.012, glideTo: f * 0.5, when: 0.22 });
        }
      }
    },

    // take the map from the crate (the "Take the map" action, while canTake)
    take(ctx = {}) {
      if (!canTake || held) return false;
      api.grant();
      const a = ctx.audio;
      if (a) {
        a.noiseBurst({ type: 'bandpass', freq: 2600, q: 1.1, dur: 0.35, gain: 0.12, attack: 0.01, sweepTo: 1100 });
        [784, 987.8, 1174.7, 1568].forEach((f, i) => a.tone({ freq: f, type: 'triangle', dur: 0.8, gain: 0.05, when: 0.08 + i * 0.08 }));
      }
      return true;
    },

    // the map in your hands without the trip down (debug mode), the crate left empty
    grant() {
      held = true; mapState = 'held'; canTake = false;
      item.group.visible = false;
      light.intensity = 0;
    },

    hide() {
      canTake = false;
      site = null;
      holeUniform.value.set(0, 0, 0);
      pit.visible = lintel.visible = cave.visible = false;
      item.group.visible = false; light.intensity = 0;
      keepOut.length = 0;
      for (const c of cols) { c.x = 1e5; c.z = 1e5; }
    },
    reset,
    // for the map: where the hole is
    marker() { return site ? { x: site.x, z: site.z } : null; },
    mapItemSpot() { return item.group.visible ? { x: item.group.position.x, z: item.group.position.z, state: mapState } : null; },
  };
  return api;
}
