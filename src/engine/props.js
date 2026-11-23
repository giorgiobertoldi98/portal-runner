// Shared prop helpers used by every world: wind-swaying materials, fires, smoke, glow halos,
// canvas textures and a small layout helper that keeps props off portals, landmarks and each other.
import * as THREE from 'three';
import { softTexture, mergeParts, m4 } from './utils.js';
import { slopeAt } from './terrain.js';

// One clock for every animated shader. Worlds call tickShared(t) in their update().
export const shared = { time: { value: 0 } };
export function tickShared(t) { shared.time.value = t; }

// Adds vertex sway (plants, flags, tentacles) and/or per-instance emissive colour to a standard material.
// sway: { amp, speed, power }  — displacement grows with local height^power.
export function extendMaterial(mat, { sway = null, instanceGlow = false } = {}) {
  const key = `ext-${sway ? 1 : 0}-${instanceGlow ? 1 : 0}`;
  mat.onBeforeCompile = (shader) => {
    if (sway) {
      shader.uniforms.uTime = shared.time;
      shader.uniforms.uSway = { value: new THREE.Vector3(sway.amp ?? 0.12, sway.speed ?? 1.6, sway.power ?? 2) };
      shader.vertexShader = 'uniform float uTime;\nuniform vec3 uSway;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 swRoot = vec3(0.0);
        #ifdef USE_INSTANCING
          swRoot = instanceMatrix[3].xyz;
        #endif
        float swH = pow(max(transformed.y, 0.0), uSway.z);
        float swP = uTime * uSway.y + swRoot.x * 0.13 + swRoot.z * 0.11;
        transformed.x += sin(swP) * uSway.x * swH;
        transformed.z += cos(swP * 0.83 + 1.3) * uSway.x * 0.6 * swH;`
      );
    }
    if (instanceGlow) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n totalEmissiveRadiance *= vColor.rgb;\n#endif'
      );
    }
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function swayMat(opts = {}, sway = {}) {
  return extendMaterial(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, ...opts }), { sway });
}

// Canvas-drawn texture. draw(ctx, w, h)
export function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  tex.anisotropy = 4;
  return tex;
}

// Additive glow halos (points). items: [{x, y, z}]
export function glowPoints(items, { color = 0xffaa44, size = 3, opacity = 0.8 } = {}) {
  const pos = new Float32Array(items.length * 3);
  items.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, map: softTexture(), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: true });
  const pts = new THREE.Points(geo, mat);
  return pts;
}

// Rising smoke/steam/embers column, local to a group positioned at the source.
export function createPlume({ count = 26, height = 9, spread = 1.2, color = 0x9a9a9a, size = 1.6, opacity = 0.35, speed = 1.4, additive = false, drift = [0.4, 0.15] } = {}) {
  const pos = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) { life[i] = Math.random(); seeds[i] = Math.random() * 10; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, map: softTexture(), transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let strength = 1;
  return {
    points,
    set strength(v) { strength = v; },
    get strength() { return strength; },
    update(dt, t) {
      for (let i = 0; i < count; i++) {
        life[i] += dt * speed / height * (0.7 + 0.6 * ((seeds[i] * 7) % 1));
        if (life[i] > 1) life[i] -= 1;
        const L = life[i], s = seeds[i];
        const vis = strength > 0.01 ? 1 : 0;
        pos[i * 3] = (Math.sin(s * 3.1 + t * 0.7) * spread * (0.3 + L) + drift[0] * L * height * 0.3) * vis;
        pos[i * 3 + 1] = L * height * vis - (vis ? 0 : 999);
        pos[i * 3 + 2] = (Math.cos(s * 2.3 + t * 0.6) * spread * (0.3 + L) + drift[1] * L * height * 0.3) * vis;
      }
      mat.opacity = opacity * Math.min(1, strength);
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// Campfire / brazier flame: nested emissive cones that flicker, a halo, optional smoke and light.
export function createFire({ scale = 1, light = false, lightColor = 0xff9a3c, lightIntensity = 40, lightRange = 26, smoke = true, logs = true, color = 0xff7a1a, core = 0xffe27a } = {}) {
  const g = new THREE.Group();
  if (logs) {
    const logGeo = mergeParts([0, 1, 2, 3].map((k) => ({
      geo: new THREE.CylinderGeometry(0.12, 0.14, 1.3, 5), color: k % 2 ? 0x4a2f1c : 0x5c3a22,
      matrix: m4(0, 0.15, 0, Math.PI / 2 - 0.25, (k / 4) * Math.PI * 2, 0),
    })).concat([{ geo: new THREE.DodecahedronGeometry(0.5, 0), color: 0x2a2420, matrix: m4(0, 0.05, 0, 0, 0, 0, 1.3, 0.25, 1.3) }]));
    const lm = new THREE.Mesh(logGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    lm.castShadow = true; g.add(lm);
  }
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 6, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  outer.position.y = 0.85;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 6), new THREE.MeshBasicMaterial({ color: core, toneMapped: false }));
  inner.position.y = 0.6;
  g.add(outer, inner);
  const halo = glowPoints([{ x: 0, y: 1, z: 0 }], { color, size: 6, opacity: 0.55 });
  g.add(halo);
  let plume = null;
  if (smoke) { plume = createPlume({ count: 18, height: 10, color: 0x8a8580, size: 1.8, opacity: 0.22, speed: 1.8 }); plume.points.position.y = 1.4; g.add(plume.points); }
  let pl = null;
  if (light) { pl = new THREE.PointLight(lightColor, lightIntensity, lightRange, 1.6); pl.position.y = 1.6; g.add(pl); }
  g.scale.setScalar(scale);
  const seed = Math.random() * 10;
  return {
    group: g,
    update(dt, t) {
      const f = 1 + Math.sin(t * 13 + seed) * 0.1 + Math.sin(t * 23.7 + seed * 2) * 0.07;
      outer.scale.set(1 / f, f * 1.05, 1 / f);
      outer.rotation.y = t * 2;
      inner.scale.set(1, 0.9 + (f - 1) * 1.5, 1);
      if (pl) pl.intensity = lightIntensity * (0.85 + (f - 1) * 1.6);
      if (plume) plume.update(dt, t);
    },
  };
}

// Keeps props off portals, reserved landmark areas, steep slopes, and each other.
export function createLayout({ heightAt, portalSpots, portalClear = 18, blocked = () => false }) {
  const colliders = [];
  const reserved = [];
  const api = {
    colliders, reserved,
    reserve(x, z, r) { reserved.push({ x, z, r }); },
    add(c) { colliders.push(c); return c; },
    isReserved(x, z, pad = 0) { return reserved.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + pad); },
    hits(x, z, pad = 0) {
      for (const c of colliders) {
        if (c.type === 'box') { if (Math.abs(x - c.x) < c.hx + pad && Math.abs(z - c.z) < c.hz + pad) return true; }
        else if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
      }
      return false;
    },
    free(x, z, pad = 1, maxSlope = 0.55) {
      if (portalSpots.some((p) => Math.hypot(x - p.x, z - p.z) < portalClear)) return false;
      if (blocked(x, z)) return false;
      if (api.isReserved(x, z, pad)) return false;
      if (slopeAt(heightAt, x, z) > maxSlope) return false;
      return !api.hits(x, z, pad);
    },
  };
  return api;
}

// A line of fluttering flags/cloth strips between two points (prayer flags, bunting).
export function flagLine(a, b, { count = 10, sag = 1.2, colors = [0xd8433a, 0xf1c232, 0x3d85c6, 0x6aa84f, 0xffffff], size = 0.6 } = {}) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.025, 3), new THREE.MeshBasicMaterial({ color: 0x3a3028 })));
  const flagGeo = new THREE.PlaneGeometry(size, size * 1.2, 1, 3); flagGeo.translate(0, -size * 0.6, 0);
  // flip so "height" goes downward from the string: sway grows with distance from the string
  flagGeo.rotateZ(Math.PI);
  const mat = swayMat({ vertexColors: false, color: 0xffffff, roughness: 1 }, { amp: 0.35, speed: 4.5, power: 1 });
  const items = [];
  for (let i = 1; i < count; i++) {
    const p = curve.getPoint(i / count);
    items.push({ p, color: colors[i % colors.length] });
  }
  const mesh = new THREE.InstancedMesh(flagGeo, mat, items.length);
  const d = new THREE.Object3D(); const col = new THREE.Color();
  const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
  items.forEach((it, i) => {
    d.position.copy(it.p); d.rotation.set(0, yaw, Math.PI); d.scale.setScalar(1); d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix); mesh.setColorAt(i, col.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  g.add(mesh);
  return g;
}
