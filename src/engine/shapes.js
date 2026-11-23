// Shared portal geometry so every world's portal frame fits the same opening.
import * as THREE from 'three';

// Points along the arch outline (left pillar up, semicircle, right pillar down), with outward normals.
export function archPath(W, H, offset = 0, samples = 48) {
  const r = W / 2 + offset;
  const top = H - W / 2;
  const L1 = top, L2 = Math.PI * r, total = 2 * L1 + L2;
  const pts = [], normals = [];
  for (let i = 0; i <= samples; i++) {
    const s = (i / samples) * total;
    if (s <= L1) {
      pts.push(new THREE.Vector3(-r, s, 0));
      normals.push(new THREE.Vector3(-1, 0, 0));
    } else if (s <= L1 + L2) {
      const a = Math.PI - (s - L1) / r;
      pts.push(new THREE.Vector3(Math.cos(a) * r, top + Math.sin(a) * r, 0));
      normals.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    } else {
      pts.push(new THREE.Vector3(r, top - (s - L1 - L2), 0));
      normals.push(new THREE.Vector3(1, 0, 0));
    }
  }
  return { pts, normals };
}

export function archShape(W, H, offset = 0) {
  const r = W / 2 + offset, top = H - W / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, top);
  s.absarc(0, top, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.lineTo(-r, 0);
  return s;
}

export function archTube(W, H, offset, radius, material, tubular = 96) {
  const { pts } = archPath(W, H, offset, 64);
  const curve = new THREE.CatmullRomCurve3(pts);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, tubular, radius, 8, false), material);
  mesh.castShadow = true;
  return mesh;
}
