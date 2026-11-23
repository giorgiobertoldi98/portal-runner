import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Gem shapes, one per world style. Each is solid, rough and faceted (flat shading), built once and shared.
// A world picks its style and colours with `gem` in its module (see worlds/registry.js):
//   gem: { style: 'cluster' | 'geode' | 'rose', dark, col, glow, inner?, innerDark?, glowK?, mapCol? }
//     mapCol — the colour of this world's gems on the map / legend (default: the colour that glows: inner, else col)
//     dark  — colour while hidden (dark gems)        col   — colour once revealed (for the geode: its rock shell)
//     glow  — emissive / halo / plume colour         inner / innerDark — the geode's lining (revealed / hidden)
//     glowK — scales the emissive strength (the rose's petals wash out at full glow)
// build(style) -> { parts: [{ geo, role: 'crystal' | 'rock' | 'inner' }], mini: geometry, miniRole }
//   crystal / inner glow and turn colour; rock (the geode's shell) only shades from dark to a little lighter, no glow.
//   The mini (carried / socketed) version is the inner part when there is one (the geode's pink core).
//   Every part is centred on the gem's middle and sized to ~SIZE metres across its longest side.

const SIZE = 1.6;      // a ground gem's largest dimension, metres
const MINI = 0.5;      // a carried / socketed gem's largest dimension

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function clean(g) { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); g.deleteAttribute('normal'); return mergeVertices(g, 1e-4); }
// push every vertex in or out by a random amount: rough, chipped faces
function roughen(g, amp, seed, centre = new THREE.Vector3()) {
  const r = rng(seed), p = g.attributes.position, v = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); d.copy(v).sub(centre).normalize();
    v.addScaledVector(d, (r() - 0.45) * amp);
    v.x += (r() - 0.5) * amp * 0.5; v.y += (r() - 0.5) * amp * 0.5; v.z += (r() - 0.5) * amp * 0.5;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
// a pointed prism along +Y from the origin
function prism(r, h, seg = 6, capH = 0.35, taper = 0.8) {
  const body = new THREE.CylinderGeometry(r * taper, r, h, seg, 3, true); body.translate(0, h / 2, 0);
  const cap = new THREE.ConeGeometry(r * taper, h * capH, seg, 1, true); cap.translate(0, h + h * capH / 2, 0);
  return mergeGeometries([clean(body), clean(cap)]);
}

// Glacier: a fist of hexagonal ice prisms growing from a frozen lump
function cluster() {
  const parts = [clean(roughen(new THREE.IcosahedronGeometry(0.32, 0), 0.08, 5).translate(0, -0.05, 0))];
  const P = [[0, 0, 0, 0.02, 0.04, 1.0, 0.2], [0.13, 0, 0.06, 0.25, -0.5, 0.7, 0.15], [-0.14, 0, 0.05, 0.2, 0.55, 0.62, 0.14], [0.02, 0, -0.14, -0.6, 0.1, 0.55, 0.13], [-0.06, 0, 0.15, 0.7, 0.25, 0.42, 0.1]];
  P.forEach(([x, y, z, rx, rz, h, r], i) => {
    const g = clean(prism(r, h, 6, 0.35, 0.85));
    g.rotateY(i); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z);
    parts.push(g);
  });
  const crystal = roughen(mergeVertices(mergeGeometries(parts), 0.02), 0.04, 21, new THREE.Vector3(0, 0.6, 0));
  return [{ geo: crystal, role: 'crystal' }];
}

// Alien: a geode, dark rock outside, its hollow lined with pink crystal that shows through small holes all around it.
// 14 holes spread over the sphere (a Fibonacci spiral, each nudged and sized a little differently so the pattern
// isn't regular), so some always face you whichever way it turns.
const HOLES = (() => {
  const r = rng(93), n = 14, out = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, rad = Math.sqrt(1 - y * y), a = i * 2.39996;
    const v = new THREE.Vector3(Math.cos(a) * rad + (r() - 0.5) * 0.35, y + (r() - 0.5) * 0.35, Math.sin(a) * rad + (r() - 0.5) * 0.35).normalize();
    out.push([v, 0.955 + r() * 0.025]); // smaller number = bigger hole
  }
  return out;
})();
function cutSphere(radius, detail, slack) {
  const ico = new THREE.IcosahedronGeometry(radius, detail).toNonIndexed();
  const p = ico.attributes.position, keep = [], c = new THREE.Vector3(), t = new THREE.Vector3();
  for (let f = 0; f < p.count; f += 3) {
    c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(t.fromBufferAttribute(p, f + k)); c.normalize();
    const h = Math.abs(Math.sin(c.x * 41.3 + c.y * 17.9 + c.z * 29.7) * 43758.5) % 1; // stable per-face noise: jagged edges
    if (HOLES.some(([w, th]) => c.dot(w) > th - slack + (h - 0.5) * 0.02)) continue;
    for (let k = 0; k < 3; k++) keep.push(p.getX(f + k), p.getY(f + k), p.getZ(f + k));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  return mergeVertices(g, 1e-4);
}
function geode() {
  const shell = roughen(cutSphere(0.52, 4, 0), 0.05, 31); shell.scale(1.05, 0.92, 0.95);
  // the lining: smaller, with no holes of its own, finely bumped into small facets
  const lining = clean(new THREE.IcosahedronGeometry(0.44, 3));
  const p = lining.attributes.position, v = new THREE.Vector3(), r = rng(77);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(1 - r() * 0.1); p.setXYZ(i, v.x, v.y, v.z); }
  lining.scale(1.05, 0.92, 0.95);
  return [{ geo: shell, role: 'rock' }, { geo: lining, role: 'inner' }];
}

// Desert: a rose of curled, rounded petals, a tight bud opening into wider outer rings
function petal(rBase, rTop, h, arc, seg) {
  const g = new THREE.CylinderGeometry(rTop, rBase, h, seg, 3, true, -arc / 2, arc); g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rel = Math.atan2(x, z) / (arc / 2);
    p.setY(i, y * (1 - 0.45 * rel * rel * (y / h))); // round the tip
  }
  return clean(g);
}
function rose() {
  const r = rng(61), parts = [];
  const rings = [[3, 0.05, 0.05, 0.62, 3.0, -0.18], [4, 0.09, 0.12, 0.62, 2.5, -0.02], [5, 0.14, 0.2, 0.58, 2.1, 0.1], [6, 0.19, 0.28, 0.52, 1.8, 0.26], [7, 0.24, 0.36, 0.42, 1.55, 0.48]];
  rings.forEach(([n, rb, rt, h, arc, tilt], ri) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ri * 0.55 + r() * 0.2;
      const g = petal(rb, rt * (0.9 + r() * 0.2), h * (0.9 + r() * 0.2), arc, 7);
      g.translate(0, 0, -rb); g.rotateX(tilt * (0.85 + r() * 0.3)); g.translate(0, 0, rb);
      g.rotateY(a); g.translate(0, 0.14 - ri * 0.012, 0);
      parts.push(g);
    }
  });
  const base = clean(new THREE.ConeGeometry(0.16, 0.16, 6, 1, true)); base.rotateX(Math.PI); base.translate(0, 0.08, 0);
  parts.push(base);
  return [{ geo: roughen(mergeVertices(mergeGeometries(parts), 1e-3), 0.025, 62), role: 'crystal' }];
}

const BUILDERS = { cluster, geode, rose };
const cache = new Map();

export function gemDesign(style = 'cluster') {
  if (cache.has(style)) return cache.get(style);
  const parts = (BUILDERS[style] || cluster)();
  // centre on the outer part and size to SIZE
  const main = parts[0].geo;
  main.computeBoundingBox();
  const box = main.boundingBox, c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const k = SIZE / Math.max(s.x, s.y, s.z);
  for (const p of parts) { p.geo.translate(-c.x, -c.y, -c.z); p.geo.scale(k, k, k); p.geo.computeVertexNormals(); p.geo.computeBoundingSphere(); }
  const miniPart = parts.find((p) => p.role === 'inner') || parts[0];
  const mini = miniPart.geo.clone(); mini.scale(MINI / SIZE, MINI / SIZE, MINI / SIZE); mini.computeBoundingSphere();
  const d = { parts, mini, miniRole: miniPart.role };
  cache.set(style, d);
  return d;
}
