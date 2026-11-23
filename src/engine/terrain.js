import * as THREE from 'three';
import { smoothstep, clamp } from './utils.js';

// Build a heightfield mesh from an analytic height function so physics can sample exactly.
export function createTerrain({ size = 1000, segments = 200, heightAt, colorAt }) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const e = 1.5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const sx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const sz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    colorAt(c, x, z, h, Math.hypot(sx, sz));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// The ground exactly as drawn. createTerrain turns a height function into flat triangles; this
// returns a height function that reads those same triangles, so everything that stands on the
// ground (player, hunters, gems, props, the safe-zone ring) sits on what you see instead of on
// the smooth formula underneath. Pass the same size and segments as createTerrain. Outside the
// grid it falls back to the smooth function.
export function gridHeight(fn, size, segments) {
  const N = segments + 1, cell = size / segments, half = size / 2;
  const H = new Float32Array(N * N);
  // same vertex positions as PlaneGeometry rotated -90° about X: column i ↔ x, row j ↔ z
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = fn(i * cell - half, j * cell - half);
  return (x, z) => {
    const fx = (x + half) / cell, fz = (z + half) / cell;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= segments || j >= segments) return fn(x, z);
    const u = fx - i, v = fz - j;
    const a = H[j * N + i], d = H[j * N + i + 1], b = H[(j + 1) * N + i], c = H[(j + 1) * N + i + 1];
    // each cell is split along its b–d diagonal, as PlaneGeometry does
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
  };
}

// Flatten the terrain smoothly around given spots (portals, landmarks).
export function withFlats(base, spots, inner = 10, outer = 26) {
  const hs = spots.map((s) => ({ x: s.x, z: s.z, h: base(s.x, s.z), inner: s.inner ?? inner, outer: s.outer ?? outer }));
  return (x, z) => {
    let h = base(x, z);
    for (let i = 0; i < hs.length; i++) {
      const s = hs[i];
      const dx = x - s.x, dz = z - s.z;
      if (Math.abs(dx) > s.outer || Math.abs(dz) > s.outer) continue;
      const d = Math.hypot(dx, dz);
      if (d < s.outer) h += (s.h - h) * (1 - smoothstep(s.inner, s.outer, d));
    }
    return h;
  };
}

// 0 inside the playable radius, rising to 1 over `width` metres outside it.
export function edgeFactor(x, z, R, width) {
  const d = Math.hypot(x, z);
  const t = clamp((d - (R - 15)) / width, 0, 1);
  return t * t;
}

// Terrain slope at a point (for spawn validation)
export function slopeAt(heightAt, x, z, e = 1.5) {
  const sx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const sz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(sx, sz);
}
