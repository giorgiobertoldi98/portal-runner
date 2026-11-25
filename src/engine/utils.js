import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential smoothing
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}
export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------- Collisions (circles and axis-aligned boxes on the XZ plane) ----------

export function resolveCollisions(pos, radius, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.type === 'box') {
      const cx = clamp(pos.x, c.x - c.hx, c.x + c.hx);
      const cz = clamp(pos.z, c.z - c.hz, c.z + c.hz);
      let dx = pos.x - cx, dz = pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        if (d > 1e-4) {
          const push = (radius - d) / d;
          pos.x += dx * push; pos.z += dz * push;
        } else {
          // centre inside the box: push out along the shallowest axis
          const ox = c.hx - Math.abs(pos.x - c.x), oz = c.hz - Math.abs(pos.z - c.z);
          if (ox < oz) pos.x = c.x + Math.sign(pos.x - c.x || 1) * (c.hx + radius);
          else pos.z = c.z + Math.sign(pos.z - c.z || 1) * (c.hz + radius);
        }
      }
    } else {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1e-4;
        const push = (min - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      }
    }
  }
}

export function insideColliders(x, z, pad, colliders) {
  for (const c of colliders) {
    if (c.type === 'box') {
      if (Math.abs(x - c.x) < c.hx + pad && Math.abs(z - c.z) < c.hz + pad) return true;
    } else if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
  }
  return false;
}

export function clampToRadius(pos, R) {
  const d = Math.hypot(pos.x, pos.z);
  if (d > R) { pos.x *= R / d; pos.z *= R / d; }
}

// Random valid spot in a world. `avoid` = [{x, z, d}] minimum distances.
export function findSpot(rng, world, { avoid = [], margin = 18, tries = 600 } = {}) {
  const R = world.radius - margin;
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * R;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!world.isValidSpot(x, z)) continue;
    if (insideColliders(x, z, 1.5, world.colliders)) continue;
    let score = Infinity;
    for (const av of avoid) score = Math.min(score, Math.hypot(x - av.x, z - av.z) - av.d);
    if (score >= 0) return { x, z };
    if (score > bestScore) { bestScore = score; best = { x, z }; }
  }
  return best || { x: 0, z: 0 };
}

// ---------- Geometry helpers ----------

// Merge several geometries into one non-indexed geometry with per-part vertex colours.
// parts: [{ geo, color (hex), matrix? (Matrix4) }]
export function mergeParts(parts) {
  const positions = [], normals = [], colors = [];
  const c = new THREE.Color();
  for (const part of parts) {
    let g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    if (part.matrix) g.applyMatrix4(part.matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    c.set(part.color);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { positions.push(p[i]); normals.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) colors.push(c.r, c.g, c.b);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return out;
}

export const m4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );

// Build an InstancedMesh from a list of transforms [{x, y, z, ry, s, sy?, rx?, rz?, color?}]
export function instanced(geometry, material, items, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  mesh.count = items.length;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    dummy.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (it.color !== undefined) mesh.setColorAt(i, col.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.computeBoundingSphere();
  return mesh;
}

// Emissive material whose glow colour follows each instance's colour.
export function instanceGlowMaterial(intensity = 0.8, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: intensity, roughness: 0.4, flatShading: true, ...opts });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n totalEmissiveRadiance *= vColor.rgb;\n#endif'
    );
  };
  return mat;
}

export function flatMat(opts = {}) {
  return new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, metalness: 0, ...opts });
}

// Soft round sprite texture (cached)
let _soft = null;
export function softTexture() {
  if (_soft) return _soft;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _soft = new THREE.CanvasTexture(c);
  _soft.colorSpace = THREE.SRGBColorSpace;
  return _soft;
}

// Scatter helper: tries `count` random points within radius R that pass `accept(x, z)`
export function scatterPoints(rng, count, R, accept, maxTries = count * 8) {
  const out = [];
  for (let i = 0; i < maxTries && out.length < count; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * R;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (accept(x, z)) out.push({ x, z });
  }
  return out;
}

// Fog colour that matches a sky colour exactly (fog is mixed in output space in three r160).
export function fogColor(hex) {
  return new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
}
