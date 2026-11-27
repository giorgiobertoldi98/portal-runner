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
// the cave walls) block the explorer, so the only way in and out is the ledge. The walls are drawn apart from it, as
// rough carved rock that only ever recedes into the rock: the space you walk in, and the camera's own checks, keep the plain
// shape the code reasons about (pitLocal, ceilLocal), however rough the walls look.
import * as THREE from 'three';
import { GLACIER } from '../config.js';
import { mergeParts, m4, flatMat, instanced, softTexture, dist2D, damp } from '../engine/utils.js';
import { glowPoints } from '../engine/props.js';
import { mulberry32, createNoise2D, fbm } from '../engine/noise.js';

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
const ROOM_IN = LC - RC + 1.6, ROOM_OUT = LC - RC + 1.2; // how far into the chamber its fixed shot takes over, and lets go
const PULL_IN = 6;         // m/s: the fastest the camera comes in when rock cuts between it and you
const STEER = [0.2, 0.4, 0.6, 0.85, 1.1, 1.35, 1.6]; // camera turns tried each way when rock blocks it in the hole (radians)
const SLIDE = [0.2, -0.2, 0.4, -0.4, 0.6, -0.6, 0.8, -0.8, 1.05, -1.05, 1.3, -1.3]; // turns tried when a step hits a wall
const wrap = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const inFootprint = (u, v, pad = 0) => (u > RP - 1 && u < LC && Math.abs(v) < TW + pad) || Math.hypot(u - LC, v) < RC + pad;
const inRegion = (u, v) => Math.hypot(u, v) < RP || inFootprint(u, v);
// the ledge's height below the rim at phi: flat on the landing, then an even slope down to the floor that eases in
// and out at its ends (a crease across the grid would shade as a zig-zag)
const EASE = 0.08;   // the fraction of the slope at each end that rounds off
function ledgeDrop(phi) {
  if (phi <= LAND) return 0;
  const x = Math.min(1, (phi - LAND) / (SWEEP - LAND));
  const f = x < EASE ? x * x / (2 * EASE) : x > 1 - EASE ? 1 - EASE - (1 - x) ** 2 / (2 * EASE) : x - EASE / 2;
  return -D * f / (1 - EASE);
}
// height below the rim (0 at the rim, -D at the floor), or null outside the hole
function pitLocal(u, v) {
  const r = Math.hypot(u, v);
  if (r < RP) {
    if (r < RF) return -D;
    const phi = wrap(Math.atan2(v, u) - TH0);
    return phi >= SWEEP ? -D : ledgeDrop(phi);
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

// ── rough rock: the walls and the vault are carved back into the rock, never out of it ──
const rockNoise = createNoise2D(mulberry32(5150));
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth01 = (x) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
// how deep the rock is carved at a spot of a wall (s: metres along it, y: height), 0..1: broad hollows with crags in them
const carve = (s, y) => clamp01((0.5 + 0.6 * fbm(rockNoise, s * 0.42, y * 0.3, 3)) * 0.8 + Math.abs(rockNoise(s * 1.3 + 31, y * 1.1 - 7)) * 0.35);
// the shaft's trodden, lumpy snow (landing, ledge and floor): gentle enough to walk (well under the wall test's step),
// fading out towards the rim and the tunnel mouth, so it meets the snow outside and the tunnel's floor without a step
const pitBumps = (u, v) => 0.11 * fbm(rockNoise, u * 0.7 + 200, v * 0.7 - 40, 3) * smooth01((RP - Math.hypot(u, v)) / 1.2);
// the vault lifted into the rock: none at the tunnel mouth, where it meets the shaft's wall
const ceilLift = (u, v) => 0.4 * clamp01(0.45 + 0.7 * fbm(rockNoise, u * 0.6 + 90, v * 0.6, 3)) * smooth01((Math.hypot(u, v) - RP) / 1.2);

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
  let toldNoCall = false, dripTimer = 2, moanTimer = 1, camBlend = 0, boom = 1, steerSide = 0, lastCamT = 0,
    lastCam = null, hint = null, held = false, canTake = false;
  const keepOut = [];

  const toLocal = (x, z) => { const dx = x - site.x, dz = z - site.z; return { u: dx * site.c + dz * site.s, v: -dx * site.s + dz * site.c }; };
  const toWorld = (u, v) => ({ x: site.x + u * site.c - v * site.s, z: site.z + u * site.s + v * site.c });

  // ── meshes ──
  const pitMat = flatMat({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  const pit = new THREE.Mesh(new THREE.BufferGeometry(), pitMat);
  pit.receiveShadow = true; // nothing underground casts shadows: the terrain doesn't, so they'd land on the snow above pit.visible = false; pit.frustumCulled = false;
  scene.add(pit);
  const walls = new THREE.Mesh(new THREE.BufferGeometry(), flatMat({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide }));
  walls.receiveShadow = true; walls.visible = false; walls.frustumCulled = false;
  scene.add(walls);
  // loose ice and rock fallen along the foot of the shaft's wall, down the ledge (out of the way of your feet)
  const RUBBLE = 70;
  const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), flatMat({ color: 0xffffff, roughness: 0.5 }), RUBBLE);
  rubble.receiveShadow = true; rubble.visible = false; rubble.frustumCulled = false;
  scene.add(rubble);

  // everything that keeps its shape from site to site lives in one group, built once in the local frame
  // (y = 0 at the rim): cave ceiling, the rock mound above the cave, the rim shards, the explorers' camp
  const cave = new THREE.Group();
  cave.visible = false;
  scene.add(cave);
  const rng = mulberry32(911);
  const lp = []; // local colliders for the cave props: { u, v, r }
  const dm0 = new THREE.Object3D();
  {
    // ceiling: a heightfield facing down, over the tunnel and chamber
    const pos = [], col = [];
    const cA = new THREE.Color(0x4d6c8c), cB = new THREE.Color(0x6f93b5);
    const vtx = (u, v) => [u, -D + ceilLocal(u, v) + ceilLift(u, v), v];
    for (let i = 0; i < NU - 1; i++) for (let j = 0; j < NV - 1; j++) {
      const u = U0 + i * CS, v = V0 + j * CS, uc = u + CS / 2, vc = v + CS / 2, rc = Math.hypot(uc, vc);
      if (!inFootprint(uc, vc, 0.6)) continue;
      if (rc < RP - 0.2) continue;
      if (Math.abs(vc) > TW + 0.05 && rc < RP + 0.7) continue;   // beside the mouth it would poke out of the carved wall
      const a = vtx(u, v), d = vtx(u + CS, v), b = vtx(u, v + CS), c = vtx(u + CS, v + CS);
      for (const tri of [[a, d, b], [d, c, b]]) {
        // the vault stops exactly at the shaft's wall: no lip over the tunnel mouth, and no gap under the wall above it
        const poly = [];
        for (let k = 0; k < 3; k++) {
          const p = tri[k], q = tri[(k + 1) % 3], fp = RP - Math.hypot(p[0], p[2]), fq = RP - Math.hypot(q[0], q[2]);
          if (fp <= 0) poly.push(p);
          if ((fp <= 0) !== (fq <= 0)) { const t = fp / (fp - fq); poly.push(vtx(p[0] + (q[0] - p[0]) * t, p[2] + (q[2] - p[2]) * t)); }
        }
        const k = 0.5 + 0.5 * Math.sin(uc * 1.7 + vc * 2.3);
        const cc = cA.clone().lerp(cB, k);
        for (let n = 1; n < poly.length - 1; n++) for (const p of [poly[0], poly[n], poly[n + 1]]) { pos.push(...p); col.push(cc.r, cc.g, cc.b); }
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
      ics.push({ x: u, y: -D + ceilLocal(u, v) + ceilLift(u, v) + 0.05, z: v, s: 0.8 + rng() * 0.6, sy: len });
    }
    const icGeo = new THREE.ConeGeometry(0.09, 1, 5); icGeo.rotateX(Math.PI); icGeo.translate(0, -0.5, 0);
    const iceGlow = new THREE.MeshStandardMaterial({ color: 0xbdefff, emissive: 0x3aa8e0, emissiveIntensity: 0.7, roughness: 0.1, flatShading: true });
    cave.add(instanced(icGeo, iceGlow, ics, { castShadow: false }));
    // glowing ice crystals growing out of the room's walls: a few clusters of uneven size, spaced unevenly (clear of
    // the camp), some low, some higher up, each shard leaning out at its own angle and a few loose ones on their own
    const crystals = [], up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion();
    const shard = (a, h, len, w, lean, twist) => {
      const r = RC - 0.15 - h * 0.08, cx = Math.cos(a), cz = Math.sin(a);
      dir.set(-cx * Math.sin(lean), Math.cos(lean), -cz * Math.sin(lean)).applyAxisAngle(up, twist).normalize();
      q.setFromUnitVectors(up, dir);
      crystals.push({ x: LC + cx * r, y: -D + h, z: cz * r, q: q.clone(), sx: w * (0.7 + rng() * 0.5), sy: len, sz: w * (0.7 + rng() * 0.5) });
    };
    for (const [a0, n, h0] of [[-2.0, 5, 0], [-1.2, 3, 0.9], [-0.3, 6, 0], [0.25, 2, 1.5], [1.5, 2, 1.4], [2.0, 4, 0]]) {
      for (let k = 0; k < n; k++) {
        const big = k === 0 ? 1.6 : 1;
        shard(a0 + (rng() - 0.5) * 0.35, h0 + rng() * 0.25, (0.35 + rng() * 0.7) * big, (0.08 + rng() * 0.07) * big, 0.35 + rng() * 0.75, (rng() - 0.5) * 1.2);
      }
    }
    for (const a of [-1.6, 0.55, 1.15]) shard(a, rng() * 1.2, 0.3 + rng() * 0.3, 0.07, 0.6 + rng() * 0.6, (rng() - 0.5) * 1.5);   // loose ones
    // a five-sided prism, narrowing to a point
    const shardGeo = new THREE.CylinderGeometry(0.55, 1, 1, 5, 1).translate(0, 0.5, 0);
    const tipGeo = new THREE.ConeGeometry(0.55, 0.45, 5).translate(0, 1.22, 0);
    const shardMesh = new THREE.InstancedMesh(mergeParts([{ geo: shardGeo, color: 0xffffff }, { geo: tipGeo, color: 0xffffff }]),
      new THREE.MeshStandardMaterial({ color: 0xc9f6ff, emissive: 0x29c0ff, emissiveIntensity: 1.05, roughness: 0.1, flatShading: true }), crystals.length);
    crystals.forEach((sh, i) => { dm0.position.set(sh.x, sh.y, sh.z); dm0.quaternion.copy(sh.q); dm0.scale.set(sh.sx, sh.sy, sh.sz); dm0.updateMatrix(); shardMesh.setMatrixAt(i, dm0.matrix); });
    shardMesh.instanceMatrix.needsUpdate = true; shardMesh.computeBoundingSphere();
    cave.add(shardMesh);
    cave.add(glowPoints(crystals.filter((sh) => sh.sy > 0.6).map((sh) => ({ x: sh.x, y: sh.y + 0.35, z: sh.z })), { color: 0x6fdcff, size: 2.4, opacity: 0.4 }));

    // what's left of an explorer's camp, long cold: a weathered crate (the map lies on it) and a smaller one with the
    // lantern still lit, a collapsed lean-to against the wall with a frosted sleeping bag under it, a ring of stones
    // around a dead fire, an ice axe left standing in the floor and a frozen coil of rope. Frost has settled on all of it.
    const fy = -D, FROST = 0xe8eef5;
    const camp = mergeParts([
      { geo: new THREE.BoxGeometry(0.85, 0.78, 0.85), color: 0x7a5534, matrix: m4(0, 0.39, 0, 0, 0.2, 0) },
      { geo: new THREE.BoxGeometry(0.87, 0.05, 0.87), color: FROST, matrix: m4(0, 0.8, 0, 0, 0.2, 0) },
      { geo: new THREE.BoxGeometry(0.6, 0.06, 0.06), color: 0x5e4128, matrix: m4(0, 0.55, 0.43, 0, 0.2, 0) },   // a slat
      { geo: new THREE.BoxGeometry(0.55, 0.5, 0.55), color: 0x6e4c2f, matrix: m4(0.85, 0.25, 0.35, 0, -0.35, 0.03) },
      { geo: new THREE.BoxGeometry(0.57, 0.04, 0.57), color: FROST, matrix: m4(0.85, 0.52, 0.35, 0, -0.35, 0.03) },
      // the lantern on the small crate
      { geo: new THREE.CylinderGeometry(0.11, 0.13, 0.05, 8), color: 0x2b2b2b, matrix: m4(0.85, 0.57, 0.35) },
      { geo: new THREE.CylinderGeometry(0.11, 0.11, 0.04, 8), color: 0x2b2b2b, matrix: m4(0.85, 0.85, 0.35) },
      { geo: new THREE.TorusGeometry(0.07, 0.014, 4, 10), color: 0x2b2b2b, matrix: m4(0.85, 0.93, 0.35) },
    ]);
    const campG = new THREE.Group();
    campG.position.set(LC + 1.4, fy, -0.6);
    campG.rotation.y = 0.4;
    const campMat = flatMat({ vertexColors: true });
    const campMesh = new THREE.Mesh(camp, campMat);
    campMesh.receiveShadow = true;
    campG.add(campMesh);
    const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 8), new THREE.MeshBasicMaterial({ color: 0xffcf7a, toneMapped: false }));
    flame.position.set(0.85, 0.71, 0.35); campG.add(flame);
    campG.add(glowPoints([{ x: 0.85, y: 0.71, z: 0.35 }], { color: 0xffa94a, size: 4.5, opacity: 0.6 }));
    cave.add(campG);
    // the rest of the camp, placed in the room's own frame (du, dv from its middle)
    const at = (du, dv) => [LC + du, dv];
    const [fu, fv] = at(0.1, 1.45), [au, av] = at(-1.0, -2.6), [ru, rv] = at(2.7, -1.9);
    // the tent: pitched against the wall, its far end collapsed onto the floor (built along its ridge, then placed)
    const tA = 0.7, tu = LC + Math.cos(tA) * 4.0, tv = Math.sin(tA) * 4.0;
    const T = m4(tu, 0, tv, 0, Math.PI - tA, 0), slump = m4(1.45, 0.42, 0, 0, 0, -0.55);
    const inTent = (...ms) => ms.reduce((acc, m) => acc.multiply(m), T.clone());
    const fire = [];
    for (let k = 0; k < 8; k++) { const a = k * 0.785 + rng() * 0.3; fire.push({ geo: new THREE.DodecahedronGeometry(0.11 + rng() * 0.05, 0), color: k % 3 ? 0x6b717c : 0x585e69, matrix: m4(fu + Math.cos(a) * 0.36, 0.06, fv + Math.sin(a) * 0.36, rng(), rng(), rng(), 1, 0.7, 1) }); }
    const CANVAS = 0xa98a5e, CANVAS2 = 0x957750, POLE = 0x5c3a22;
    const rest = mergeParts([
      // the half still standing: a pole at the wall, the ridge, the two sides down to the floor
      { geo: new THREE.CylinderGeometry(0.03, 0.035, 0.95, 5), color: POLE, matrix: inTent(m4(0.03, 0.47, 0)) },
      { geo: new THREE.CylinderGeometry(0.025, 0.025, 1.05, 5), color: POLE, matrix: inTent(m4(0.5, 0.95, 0, 0, 0, Math.PI / 2)) },
      { geo: new THREE.BoxGeometry(1.05, 0.025, 1.18), color: CANVAS, matrix: inTent(m4(0.5, 0.475, 0.35, 0.94, 0, 0)) },
      { geo: new THREE.BoxGeometry(1.05, 0.025, 1.18), color: CANVAS2, matrix: inTent(m4(0.5, 0.475, -0.35, -0.94, 0, 0)) },
      { geo: new THREE.BoxGeometry(1.0, 0.04, 0.22), color: FROST, matrix: inTent(m4(0.5, 0.97, 0)) },
      // the half that gave way: its canvas slumped towards the floor, its pole fallen beside it
      { geo: new THREE.BoxGeometry(1.0, 0.025, 1.1), color: CANVAS, matrix: inTent(slump, m4(0, -0.12, 0.3, 0.45, 0, 0)) },
      { geo: new THREE.BoxGeometry(1.0, 0.025, 1.1), color: CANVAS2, matrix: inTent(slump, m4(0, -0.12, -0.3, -0.45, 0, 0)) },
      { geo: new THREE.BoxGeometry(0.9, 0.04, 0.3), color: FROST, matrix: inTent(slump, m4(0, 0.02, 0)) },
      { geo: new THREE.CylinderGeometry(0.03, 0.035, 0.95, 5), color: POLE, matrix: inTent(m4(1.7, 0.04, -0.85, Math.PI / 2, 0.5, 0)) },
      // the sleeping bag beside it, frosted
      { geo: (() => { const c = new THREE.CapsuleGeometry(0.2, 1.1, 2, 6); c.rotateZ(Math.PI / 2); return c; })(), color: 0x3f5f78, matrix: inTent(m4(1.1, 0.16, 0.78, 0, -0.15, 0, 1, 0.7, 1)) },
      { geo: new THREE.BoxGeometry(0.85, 0.04, 0.22), color: FROST, matrix: inTent(m4(1.1, 0.3, 0.78, 0, -0.15, 0)) },
      // a dead fire: stones round charred sticks and a little ash
      ...fire,
      { geo: new THREE.CylinderGeometry(0.26, 0.3, 0.03, 8), color: 0x4a4c52, matrix: m4(fu, 0.015, fv) },
      { geo: new THREE.CylinderGeometry(0.03, 0.035, 0.55, 5), color: 0x2a2320, matrix: m4(fu, 0.07, fv, Math.PI / 2, 0.4, 0) },
      { geo: new THREE.CylinderGeometry(0.03, 0.035, 0.5, 5), color: 0x332a24, matrix: m4(fu + 0.05, 0.1, fv - 0.04, Math.PI / 2, 1.9, 0) },
      // an ice axe left standing in the floor
      { geo: new THREE.CylinderGeometry(0.025, 0.03, 0.85, 5), color: 0x5c3a22, matrix: m4(au, 0.4, av, 0.12, 0, 0.08) },
      { geo: new THREE.BoxGeometry(0.42, 0.06, 0.06), color: 0x7b848f, matrix: m4(au + 0.035, 0.83, av + 0.05, 0.12, 0.6, 0.08) },
      // a coil of rope, stiff with frost
      { geo: new THREE.TorusGeometry(0.28, 0.055, 5, 14), color: 0xa89470, matrix: m4(ru, 0.06, rv, Math.PI / 2, 0, 0) },
      { geo: new THREE.TorusGeometry(0.2, 0.05, 5, 14), color: 0xb7a786, matrix: m4(ru + 0.04, 0.15, rv, Math.PI / 2 - 0.1, 0, 0) },
    ]);
    const restMesh = new THREE.Mesh(rest, campMat);
    restMesh.position.y = fy; restMesh.receiveShadow = true;
    cave.add(restMesh);
    // where things stand, in the local frame (for colliders and the map's crate)
    const local = (x, z) => { const c = Math.cos(0.4), s = Math.sin(0.4); return { u: LC + 1.4 + x * c + z * s, v: -0.6 - x * s + z * c }; };
    const crate = local(0, 0), crate2 = local(0.85, 0.35);
    const tentMid = { u: tu - Math.cos(tA) * 0.95, v: tv - Math.sin(tA) * 0.95 };
    lp.push({ ...crate, r: 0.55 }, { ...crate2, r: 0.4 }, { ...tentMid, r: 0.85 }, { u: fu, v: fv, r: 0.4 });
    cave.userData.crate = { u: crate.u, v: crate.v, y: 0.82 };
    cave.userData.lantern = { ...crate2, y: 0.95 };

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
    // the shape's own height at a local spot: the pit inside, the terrain outside. The landing eases into the snow
    // over its last metre and a half, so it meets the slope round the hole without a step.
    const hAt = (u, v) => {
      const h = pitLocal(u, v), w = toWorld(u, v);
      if (h === null) return groundAt(w.x, w.z);
      const r = Math.hypot(u, v);
      const lumps = r < RP ? pitBumps(u, v) : 0;
      if (h === 0 && r > RP - 1.5) return site.y0 + (groundAt(w.x, w.z) - site.y0) * smooth01((r - RP + 1.5) / 1.5) + lumps;
      return site.y0 + h + lumps;
    };
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const u = U0 + i * CS, v = V0 + j * CS;
      H[node(i, j)] = hAt(u, v);
    }
    const pos = [], col = [];
    // The palette goes from the snow outside to old glacier ice the deeper you go, and to bedrock in the map's room:
    // the shaft's floor from snow (at the rim, like the snow around the hole) through packed snow to bare ice; its
    // walls from a snow crust through pale ice to deep blue ice; the tunnel turning from that ice to the room's slate
    // and frosted stone, under the same icy vault.
    const C = (hex) => new THREE.Color(hex);
    const snow = C(0xe3ebf4), packed = C(0xc2d2e3), floorIce = C(0x93b4d0), icePatch = C(0x7fa9cc), drift = C(0xeef3f9);
    const crust = C(0xdde8f2), paleIce = C(0xa6d0ea), wallA = C(0x7fb6db), wallB = C(0x3f6f99), vein = C(0xb4def5);
    const stone = C(0x868c98), stoneDark = C(0x666d7a), frost = C(0xc3d0dd), slate = C(0x485366), slateLight = C(0x626e82);
    const cc = new THREE.Color(), c2 = new THREE.Color();
    const between = (out, stops, t) => {   // stops = colours evenly along t = 0..1
      const x = clamp01(t) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
      return out.copy(stops[i]).lerp(stops[i + 1], smooth01(x - i));
    };
    // how far a spot is along the tunnel into the room's rock (0 in the shaft, 1 in the room)
    const ua = Math.sqrt(RP * RP - TW * TW), ub = LC - Math.sqrt(RC * RC - TW * TW);
    const toRock = (u) => smooth01((u - ua - 0.3) / (ub - ua + 0.6));
    // up at the rim the terrain takes over exactly at the opening's edge (it is cut away inside it), so the pit's own
    // surface stops there too instead of overlapping it in grid steps
    const clipRim = (poly) => {
      const out = [], f = (p) => Math.hypot(p.u, p.v) - (RP + 0.01);
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], q = poly[(k + 1) % poly.length], fp = f(p), fq = f(q);
        if (fp <= 0) out.push(p);
        if ((fp <= 0) !== (fq <= 0)) { const t = fp / (fp - fq); out.push({ u: p.u + (q.u - p.u) * t, v: p.v + (q.v - p.v) * t, h: p.h + (q.h - p.h) * t }); }
      }
      return out;
    };
    // one flat piece of floor, ledge or snow, coloured by how deep it lies
    const face = (piece, out, colors) => {
      const poly = Math.max(...piece.map((p) => p.h)) > site.y0 - 1 ? clipRim(piece) : piece;
      if (poly.length < 3) return;
      let lo = Infinity, uc = 0, vc = 0;
      for (const p of poly) { lo = Math.min(lo, p.h); uc += p.u / poly.length; vc += p.v / poly.length; }
      const depth = clamp01((site.y0 - lo) / D);
      const rc = Math.hypot(uc, vc);
      const n = fbm(rockNoise, uc * 0.9 - 70, vc * 0.9 + 15, 3), m = rockNoise(uc * 3.1, vc * 3.1);
      // snow → packed snow → bare ice; patches of ice show through more the deeper it is, pale drifts less
      between(cc, [snow, packed, floorIce], depth);
      const ice = smooth01((depth - 0.08) / 0.6);
      cc.lerp(icePatch, ice * 0.5 * smooth01((n - 0.05) / 0.35)).lerp(drift, (1 - ice) * 0.35 * smooth01(-n / 0.4));
      cc.multiplyScalar(1 + 0.03 * m);
      if (rc > RP && depth > 0.9) {   // the tunnel's floor turns to the room's frosted stone
        between(c2, [stoneDark, stone, frost], 0.45 + 0.35 * n).multiplyScalar(1 + 0.03 * m);
        cc.lerp(c2, toRock(uc));
      }
      for (let k = 1; k < poly.length - 1; k++) for (const p of [poly[0], poly[k], poly[k + 1]]) {
        const w = toWorld(p.u, p.v);
        out.push(w.x, p.h, w.z); colors.push(cc.r, cc.g, cc.b);
      }
    };
    // where the wall really stands between a low and a high corner of a grid triangle (the shape's own edge, found by
    // halving), with the height on each side of it
    const edgeCross = (lo, hi) => {
      let a = 0, b = 1;
      for (let k = 0; k < 12; k++) {
        const t = (a + b) / 2, h = hAt(lo.u + (hi.u - lo.u) * t, lo.v + (hi.v - lo.v) * t);
        if (Math.abs(h - lo.h) < Math.abs(h - hi.h)) a = t; else b = t;
      }
      const at = (t) => ({ u: lo.u + (hi.u - lo.u) * t, v: lo.v + (hi.v - lo.v) * t });
      const m = at((a + b) / 2), pa = at(a), pb = at(b);
      return { lo: { ...m, h: hAt(pa.u, pa.v) }, hi: { ...m, h: hAt(pb.u, pb.v) } };
    };
    // a grid triangle: drawn as it is where it's walkable; across a wall it's cut at the wall's true edge into its low
    // and high parts (the walls themselves are drawn below), so floors and ledges end in clean curves, not grid steps
    const tri = (A, B, C) => {
      const s = [A, B, C].sort((p, q) => p.h - q.h);
      if (s[2].h - s[0].h <= STEEP) return face([A, B, C], pos, col);
      const cut = s[1].h - s[0].h > s[2].h - s[1].h ? s[0].h : s[1].h;   // the biggest step splits low from high
      const low = [], high = [];
      for (const [p, q] of [[A, B], [B, C], [C, A]]) {
        const pl = p.h <= cut, ql = q.h <= cut;
        (pl ? low : high).push(p);
        if (pl !== ql) { const x = pl ? edgeCross(p, q) : edgeCross(q, p); low.push(x.lo); high.push(x.hi); }
      }
      face(low, pos, col); face(high, pos, col);
    };
    const N = (i, j) => ({ u: U0 + i * CS, v: V0 + j * CS, h: H[node(i, j)] });
    for (let i = 0; i < NU - 1; i++) for (let j = 0; j < NV - 1; j++) {
      const ia = node(i, j), id = node(i + 1, j), ib = node(i, j + 1), ic = node(i + 1, j + 1);
      const hs = [H[ia], H[id], H[ib], H[ic]];
      walk[j * (NU - 1) + i] = Math.max(...hs) - Math.min(...hs) <= STEEP ? 1 : 0;
      const u = U0 + i * CS, v = V0 + j * CS;
      if (!(inRegion(u, v) || inRegion(u + CS, v) || inRegion(u, v + CS) || inRegion(u + CS, v + CS))) continue;
      const a = N(i, j), d = N(i + 1, j), b = N(i, j + 1), c = N(i + 1, j + 1);
      tri(a, b, d); tri(d, b, c);
    }
    pit.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    pit.geometry = g;

    // ── the walls: rough, faceted ice, carved back into the rock ──
    const wpos = [], wcol = [];
    // one wall along a curve: at(t) (t = 0..1 along it) gives the local spot {u, v}, the way into the rock {nu, nv} and
    // the wall's foot and top heights {y0, y1}. The carving fades out at its foot (it meets the floor), at its ends (it
    // meets the next wall) and, where the top edge shows (topTaper), at its top; walls whose top hides behind the vault
    // reach above it instead.
    const wall = (len, at, { amp = 0.5, topTaper = 0.6, seed = 0, rock = () => 0 } = {}) => {
      const cols = Math.max(2, Math.ceil(len / 0.42)), spots = [];
      let rows = 2;
      for (let c = 0; c <= cols; c++) { const f = at(c / cols); spots.push(f); rows = Math.max(rows, Math.ceil((f.y1 - f.y0) / 0.5)); }
      const grid = spots.map((f, c) => {
        const sAlong = (c / cols) * len, end = Math.min(sAlong, len - sAlong) / 0.5, out = [];
        for (let r = 0; r <= rows; r++) {
          let y = f.y0 + (f.y1 - f.y0) * (r / rows);
          if (r > 0 && r < rows) y += rockNoise(sAlong * 2.1 + seed, r * 1.7) * 0.25 * (f.y1 - f.y0) / rows;   // uneven courses
          const taper = clamp01(Math.min(end, (y - f.y0) / 0.35, topTaper ? (f.y1 - y) / topTaper : 1));
          // smoother up in the snow, rougher down in the ice
          const k = carve(sAlong + seed, y - site.y0) * taper * (0.3 + 0.7 * smooth01((site.y0 - y) / (D * 0.6)));
          out.push({ u: f.u + f.nu * amp * k, v: f.v + f.nv * amp * k, h: y, k, s: sAlong, bu: f.u });
        }
        return out;
      });
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
        const a = grid[c][r], b = grid[c + 1][r], d = grid[c][r + 1], e = grid[c + 1][r + 1];
        if (Math.max(d.h - a.h, e.h - b.h) < 0.02) continue;   // no wall here (the landing)
        for (const t of [[a, b, e], [a, e, d]]) {
          const ym = (t[0].h + t[1].h + t[2].h) / 3, km = (t[0].k + t[1].k + t[2].k) / 3;
          const depth = clamp01((site.y0 - ym) / D), sm = t[0].s, band = Math.sin(ym * 3.3 + rockNoise(sm * 0.25 + seed, ym * 0.2) * 2.5);
          // ice: a snow crust at the top, pale then deep blue below, with paler veins along its courses
          between(cc, [crust, paleIce, wallA, wallB], depth * 1.05 + 0.04 * Math.sin(ym * 2.1 + sm));
          cc.lerp(vein, smooth01((depth - 0.15) / 0.3) * 0.22 * clamp01(band * 2 - 1));
          // the room's bedrock: slate in courses, frosted at the seams, giving way to ice under the vault
          const rk = rock((t[0].bu + t[1].bu + t[2].bu) / 3) * (1 - smooth01((ym - (site.y0 - D) - 1.8) / 1.4));
          if (rk > 0) {
            c2.copy(slate).lerp(slateLight, 0.5 + 0.5 * Math.sin(ym * 4.1 + rockNoise(sm * 0.4 + seed, ym * 0.5) * 1.5));
            c2.lerp(frost, 0.45 * clamp01(band * 3 - 2.2));
            cc.lerp(c2, rk);
          }
          cc.multiplyScalar(1 - (0.12 + 0.2 * depth) * km);   // the hollows sit in shadow
          for (const p of t) { const w = toWorld(p.u, p.v); wpos.push(w.x, p.h, w.z); wcol.push(cc.r, cc.g, cc.b); }
        }
      }
    };
    const y0 = site.y0, fl = y0 - D, thT = Math.asin(TW / RP), secEnd = TH0 + TWO_PI;   // the floor-level sector ends at secEnd
    const rim = (th, foot) => {   // the shaft's wall at angle th, from foot(u, v) up to the snow
      const u = Math.cos(th) * RP, v = Math.sin(th) * RP, w = toWorld(Math.cos(th) * (RP + 0.02), Math.sin(th) * (RP + 0.02));
      return { u, v, nu: Math.cos(th), nv: Math.sin(th), y0: foot(u, v), y1: groundAt(w.x, w.z) };
    };
    const onLedge = (u, v) => hAt(u * 0.998, v * 0.998);
    const underVault = (u, v) => fl + ceilLocal(u, v);
    // the shaft's wall: from the top of the ledge round to the tunnel mouth, over the mouth (from the vault up), and on
    // to where the ledge starts again
    wall(RP * (-thT - TH0), (t) => rim(TH0 + t * (-thT - TH0), onLedge), { amp: 0.55, seed: 0 });
    wall(RP * 2 * thT, (t) => rim(-thT + t * 2 * thT, underVault), { amp: 0.2, seed: 60 });
    wall(RP * (secEnd - thT), (t) => rim(thT + t * (secEnd - 1e-4 - thT), onLedge), { amp: 0.55, seed: 120 });
    // the ledge's drop to the floor, and the face under the landing where the ledge starts
    wall(RF * SWEEP, (t) => { const th = TH0 + t * SWEEP; return { u: Math.cos(th) * RF, v: Math.sin(th) * RF, nu: Math.cos(th), nv: Math.sin(th), y0: hAt(Math.cos(th) * (RF - 0.002), Math.sin(th) * (RF - 0.002)), y1: hAt(Math.cos(th) * (RF + 0.002), Math.sin(th) * (RF + 0.002)) }; }, { amp: 0.45, topTaper: 0.5, seed: 200 });
    wall(RP - RF, (t) => { const r = RF + t * (RP - RF), ri = Math.min(r, RP - 0.01); return { u: Math.cos(TH0) * r, v: Math.sin(TH0) * r, nu: -Math.sin(TH0), nv: Math.cos(TH0), y0: hAt(Math.cos(TH0 - 0.001) * ri, Math.sin(TH0 - 0.001) * ri), y1: hAt(Math.cos(TH0 + 0.001) * ri, Math.sin(TH0 + 0.001) * ri) }; }, { amp: 0.45, topTaper: 0.5, seed: 260 });
    // the tunnel's sides and the chamber's wall, up behind the vault
    const at = Math.asin(TW / RC);
    for (const side of [1, -1]) {
      wall(ub - ua, (t) => { const u = ua + t * (ub - ua); return { u, v: side * TW, nu: 0, nv: side, y0: fl, y1: fl + ceilLocal(u, side * TW) + 0.5 }; }, { amp: 0.35, topTaper: 0, seed: side > 0 ? 300 : 340, rock: toRock });
    }
    wall(RC * 2 * (Math.PI - at), (t) => {
      const a = -(Math.PI - at) + t * 2 * (Math.PI - at);
      return { u: LC + Math.cos(a) * RC, v: Math.sin(a) * RC, nu: Math.cos(a), nv: Math.sin(a), y0: fl, y1: fl + ceilLocal(LC + RC, 0) + 0.5 };
    }, { amp: 0.3, topTaper: 0, seed: 400, rock: () => 1 });
    walls.geometry.dispose();
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
    wg.computeVertexNormals(); wg.computeBoundingSphere();
    walls.geometry = wg;

    // the rubble: clumps along the wall's foot, the same for every site (only the heights differ)
    const rr = mulberry32(77), dm = new THREE.Object3D(), tint = new THREE.Color();
    for (let k = 0; k < RUBBLE; k++) {
      const phi = LAND + 0.25 + rr() * (SWEEP - LAND - 0.4), th = TH0 + phi, r = RP - 0.12 - rr() * 0.22;
      const u = Math.cos(th) * r, v = Math.sin(th) * r, w = toWorld(u, v), sz = 0.1 + rr() ** 2 * 0.22;
      dm.position.set(w.x, hAt(u, v) + sz * 0.3, w.z);
      dm.rotation.set(rr() * 3, rr() * 3, rr() * 3);
      dm.scale.set(sz * (0.8 + rr() * 0.6), sz * (0.5 + rr() * 0.4), sz * (0.8 + rr() * 0.6));
      dm.updateMatrix(); rubble.setMatrixAt(k, dm.matrix);
      const dp = (phi - LAND) / (SWEEP - LAND), pick = rr();   // snow clods up top, ice lower down, a few stones at the bottom
      between(tint, [snow, paleIce, wallA], dp);
      if (pick < 0.3 * dp) tint.copy(stoneDark);
      rubble.setColorAt(k, tint.multiplyScalar(0.88 + rr() * 0.2));
    }
    rubble.instanceMatrix.needsUpdate = true; rubble.instanceColor.needsUpdate = true;  }

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
    camBlend = 0; steerSide = 0; lastCam = null;
  }

  // the chamber's fixed camera shot (engine/fixedShot.js): from the end of the tunnel, high under the vault, looking
  // just past the middle of the room. Measured: from here you stay fully in frame over ~95% of its floor.
  const ROOM_CAM = { u: LC - RC - 0.7, v: 0, h: 3.8 }, ROOM_LOOK = { u: LC + 1, v: -0.3, h: 0 };
  function fixedShot(P, active) {
    if (!site || !near(P.x, P.z, 24)) return null;
    const L = toLocal(P.x, P.z), floor = site.y0 - D;
    if (Math.hypot(L.u - LC, L.v) > RC + 0.3 || L.u < (active ? ROOM_OUT : ROOM_IN) || P.y > floor + 2) return null;
    const a = toWorld(ROOM_CAM.u, ROOM_CAM.v), b = toWorld(ROOM_LOOK.u, ROOM_LOOK.v);
    return { cam: { x: a.x, y: floor + ROOM_CAM.h, z: a.z }, look: { x: b.x, y: floor + ROOM_LOOK.h, z: b.z }, exit: { x: -site.c, z: -site.s } };
  }

  const api = {
    sites,
    sheltered,
    fixedShot,
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
      if (!site || !near(P.x, P.z, 40)) { camBlend = 0; boom = 1; steerSide = 0; lastCam = null; return; }
      const look = { x: rig.target.x, y: rig.target.y + 1.5, z: rig.target.z };
      let lift = rig.lookLift || 0;   // looking up: the gaze tilts above the explorer's head
      // the cave framing holds while either you or the camera is in the tunnel, so walking out into the shaft
      // doesn't lift a camera that is still under the vault into its ceiling
      const camIn = lastCam ? caveWeight({ x: lastCam.x, y: P.y, z: lastCam.z }) : 0;
      camBlend = damp(camBlend, Math.max(caveWeight(P), camIn), 5, dt);
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
      const here = sheltered(P) && yieldTo > 0 && !rig.fixedView ? clearance(look, ideal) : full;
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
      let gaze = { x: look.x, y: look.y + lift, z: look.z };
      const dx = cam.x - look.x, dy = cam.y - look.y, dz = cam.z - look.z, len = Math.hypot(dx, dy, dz);
      if (air(look.x, look.y, look.z) && len > 0.01) {
        const free = clearance(look, cam);
        // the boom eases in (no faster than PULL_IN) and out more slowly, so rock coming between you and the camera
        // never makes it lurch: a corner may hide you for a moment while it comes in. Only if the eased spot would
        // sit inside rock does it come in at once, and only as far as it must: to the nearest open point towards you
        const want = free / len;
        const inRock = (k) => !air(look.x + dx * k, look.y + dy * k, look.z + dz * k);
        boom = want < boom ? Math.max(damp(boom, want, 9, dt), boom - PULL_IN * dt / len) : damp(boom, want, 4, dt);
        if (boom > 0.999) boom = 1;
        let f = boom;
        let side = 0;
        if (f < 1 && inRock(f)) {
          // slide along the wall first (sideways, to the nearest open spot); come in towards you only if that fails
          const sx = -dz / Math.hypot(dx, dz), sz = dx / Math.hypot(dx, dz);
          const at = (o) => air(look.x + dx * f + sx * o, look.y + dy * f, look.z + dz * f + sz * o);
          for (let o = 0.05; o <= 1.5 && !side; o += 0.05) side = at(o) ? o : at(-o) ? -o : 0;
          if (!side) { while (f > 0.07 && inRock(f)) f -= 0.01; boom = f; }
        }
        if (f < 1) {
          const sx = side ? -dz / Math.hypot(dx, dz) * side : 0, sz = side ? dx / Math.hypot(dx, dz) * side : 0;
          cam.set(look.x + dx * f + sx, look.y + dy * f, look.z + dz * f + sz);
          gaze.y = look.y + lift * f;
        }
      }
      camera.lookAt(gaze.x, gaze.y, gaze.z);
      lastCam = { x: cam.x, z: cam.z };
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
      pit.visible = walls.visible = rubble.visible = cave.visible = true;
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

    // the map in your hands without the trip down (debug: Start with all items), the crate left empty
    grant() {
      held = true; mapState = 'held'; canTake = false;
      item.group.visible = false;
      light.intensity = 0;
    },

    hide() {
      canTake = false;
      site = null;
      holeUniform.value.set(0, 0, 0);
      pit.visible = walls.visible = rubble.visible = cave.visible = false;
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
