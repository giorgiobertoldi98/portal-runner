import * as THREE from 'three';
import { PORTAL } from '../config.js';
import { archPath } from '../engine/shapes.js';
import { labelTexture, flatMat } from '../engine/utils.js';
import { createMiniGem } from './gem.js';

const SURFACE_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform float uTime; uniform vec2 uSize; uniform vec3 uColA, uColB, uColC;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main(){
    vec2 p = vec2((vUv.x - 0.5) * uSize.x, vUv.y * uSize.y);
    float hw = uSize.x * 0.5; float top = uSize.y - hw;
    float d = (p.y < top) ? (hw - abs(p.x)) : (hw - length(p - vec2(0.0, top)));
    d = min(d, p.y);
    if (d < 0.0) discard;
    vec2 c = p - vec2(0.0, uSize.y * 0.45);
    float r = length(c) / (uSize.y * 0.55);
    float a = atan(c.y, c.x);
    float sw = fbm(vec2(a * 1.6 + r * 3.0 - uTime * 0.6, r * 5.0 - uTime * 1.3));
    float bands = 0.5 + 0.5 * sin(a * 4.0 + r * 11.0 - uTime * 3.0 + sw * 5.0);
    vec3 col = mix(uColA, uColB, clamp(bands * sw * 1.5, 0.0, 1.0));
    col = mix(col, uColC, smoothstep(0.55, 0.95, sw));
    col += uColC * pow(1.0 - clamp(r, 0.0, 1.0), 3.0) * 0.9;
    float edge = 1.0 - smoothstep(0.0, 0.7, d);
    col += uColC * edge * 1.4;
    gl_FragColor = vec4(col, 0.9 + edge * 0.1);
    #include <colorspace_fragment>
  }`;

const BEAM_VERT = /* glsl */`
  varying vec2 vUv; varying float vDist;
  void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vDist = distance(wp.xz, cameraPosition.xz);
    gl_Position = projectionMatrix * viewMatrix * wp; }`;
const BEAM_FRAG = /* glsl */`
  varying vec2 vUv; varying float vDist; uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uNear;
  void main(){
    float a = pow(1.0 - vUv.y, 1.6) * (0.65 + 0.35 * sin(vUv.y * 60.0 - uTime * 3.0));
    a *= smoothstep(uNear, uNear * 3.0, vDist); // fade out when close, it's a far-away beacon
    gl_FragColor = vec4(uColor, a * uOpacity);
    #include <colorspace_fragment>
  }`;
const UV_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function beamMaterial(color, opacity = 0.5, near = 15) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOpacity: { value: opacity }, uNear: { value: near } },
    vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
  });
}

// A portal leading to `dest` (a world definition). Its frame is built by the destination world.
// It starts DORMANT: an empty arch with gem sockets. Feed it `quota` gems and it opens.
// Soft-edged alpha strip for the safe-zone ring (bright along the middle of the band, fading at both edges).
let safeAlpha = null;
function safeAlphaMap() {
  if (safeAlpha) return safeAlpha;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#000'); grad.addColorStop(0.5, '#fff'); grad.addColorStop(1, '#000');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 64);
  safeAlpha = new THREE.CanvasTexture(c);
  return safeAlpha;
}

// heightAt (optional) = the world's ground height; when given, the portal draws its safe-zone ring on the ground.
export function createPortal({ dest, gem = undefined, destIndex, x, y, z, label: labelText, showLabel = true, beacon = true, heightAt = null }) {
  const W = PORTAL.width, H = PORTAL.height;
  const th = dest.theme;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = Math.atan2(-x, -z); // faces the world centre
  group.updateMatrixWorld();

  // platform
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.95, W * 1.15, 1.2, 10), flatMat({ color: th.stone }));
  plat.position.y = -0.55; plat.receiveShadow = true; plat.castShadow = true;
  group.add(plat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(W * 0.8, 0.09, 6, 40), new THREE.MeshBasicMaterial({ color: th.glow, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07;
  group.add(ring);

  // swirling surface
  const surfMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSize: { value: new THREE.Vector2(W, H) },
      uColA: { value: new THREE.Color(th.colA) }, uColB: { value: new THREE.Color(th.colB) }, uColC: { value: new THREE.Color(th.colC) },
    },
    vertexShader: UV_VERT, fragmentShader: SURFACE_FRAG,
    transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  });
  const surfGeo = new THREE.PlaneGeometry(W, H);
  surfGeo.translate(0, H / 2, 0);
  const surface = new THREE.Mesh(surfGeo, surfMat);
  surface.visible = false;
  group.add(surface);

  // destination-styled frame
  const frame = dest.createPortalFrame({ W, H });
  frame.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(frame);

  // glow light
  const light = new THREE.PointLight(th.glow, 45, 26, 2);
  light.position.set(0, H * 0.45, 1.2);
  group.add(light);

  // beam visible from far away
  const beamMat = beamMaterial(th.glow, 0.3, 18);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 260, 20, 1, true), beamMat);
  beam.position.y = H + 132;
  if (beacon) group.add(beam);

  // destination label
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(labelText || dest.name, th.css), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  label.scale.set(11, 2.06, 1);
  label.position.y = H + 4.2;
  if (showLabel) group.add(label);

  // orbiting motes along the arch
  const MOTES = 70;
  const { pts } = archPath(W, H, 0.15, 200);
  const motePos = new Float32Array(MOTES * 3);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({ color: th.colC, size: 0.22, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  group.add(motes);
  const moteSeeds = Array.from({ length: MOTES }, () => Math.random());

  // safe-zone ring: a faint band on the ground, in the portal's colour, marking PORTAL.safeRadius
  // (inside it hunters can't follow you). It follows the terrain and fades out once the portal opens.
  const safeMat = new THREE.MeshBasicMaterial({
    color: th.glow, alphaMap: safeAlphaMap(), transparent: true, opacity: 0.32,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  let safeRing = null, safeR = -1;
  function buildSafeRing() {
    const R = PORTAL.safeRadius;
    if (!heightAt || R === safeR) return;
    safeR = R;
    if (safeRing) { group.remove(safeRing); safeRing.geometry.dispose(); safeRing = null; }
    if (R <= 0) return;
    const N = Math.max(48, Math.round(R * 10)), half = 0.35;
    const pos = [], uv = [], idx = [], v = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      for (const [k, r] of [[0, R - half], [1, R + half]]) {
        const wx = x + Math.cos(a) * r, wz = z + Math.sin(a) * r;
        v.set(wx, heightAt(wx, wz) + 0.15, wz);
        group.worldToLocal(v);
        pos.push(v.x, v.y, v.z); uv.push(i / N, k);
      }
      if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    safeRing = new THREE.Mesh(geo, safeMat);
    safeRing.renderOrder = 2;
    group.add(safeRing);
  }
  buildSafeRing();

  // colliders for the pillars (world space), so you can only walk in through the opening
  const colliders = [];
  for (const side of [-1, 1]) {
    for (const lz of [-0.6, 0.6]) {
      const v = new THREE.Vector3(side * (W / 2 + 0.9), 0, lz).applyMatrix4(group.matrixWorld);
      colliders.push({ x: v.x, z: v.z, r: 1.0 });
    }
  }

  // gem sockets along the inside of the arch
  const sockets = new THREE.Group();
  sockets.position.z = 0.55;
  group.add(sockets);
  const emptyMat = new THREE.MeshStandardMaterial({ color: 0x1b1a22, emissive: th.glow, emissiveIntensity: 0.15, transparent: true, opacity: 0.55, roughness: 0.4, flatShading: true });
  const { pts: socketPath } = archPath(W, H, -0.45, 200);
  let socketMeshes = [];
  let filled = 0, quota = 0;
  let open = 0; // 0 = dormant, animates to 1 when activated
  const hue = new THREE.Color();

  const tmp = new THREE.Vector3();
  return {
    group, dest, destIndex, colliders,
    position: group.position,
    get active() { return open > 0; },
    get filled() { return filled; },
    get quota() { return quota; },
    // reset for a new attempt at this level
    setQuota(q) {
      for (const m of socketMeshes) sockets.remove(m);
      socketMeshes = [];
      quota = q; filled = 0; open = 0;
      surface.visible = false;
      buildSafeRing(); // the radius may have changed in Settings
      for (let i = 0; i < q; i++) {
        const f = q === 1 ? 0.5 : 0.14 + (0.72 * i) / (q - 1);
        const p = socketPath[Math.round(f * (socketPath.length - 1))];
        const m = createMiniGem(gem); // this world's gem shape, in the socket
        m.userData.full = m.material;
        m.material = emptyMat;
        m.scale.setScalar(1.6);
        m.position.copy(p);
        sockets.add(m);
        socketMeshes.push(m);
      }
    },
    // put one gem in; returns true when this filled the last socket
    insert() {
      if (filled >= quota) return false;
      const m = socketMeshes[filled++];
      m.material = m.userData.full;
      m.userData.pop = 1;
      return filled >= quota;
    },
    activate() { if (open === 0) { open = 0.001; surface.visible = true; } },
    update(dt, t) {
      surfMat.uniforms.uTime.value = t;
      beamMat.uniforms.uTime.value = t;
      if (open > 0 && open < 1) open = Math.min(1, open + dt * 0.9);
      const e = open * open * (3 - 2 * open);
      surface.scale.set(Math.max(0.001, e), Math.max(0.001, e), 1);
      const fillK = quota ? filled / quota : 0;
      light.intensity = (10 + fillK * 15 + e * 25) + Math.sin(t * 3.1) * 4 * (0.3 + e);
      moteMat.opacity = 0.25 + fillK * 0.3 + e * 0.4;
      beamMat.uniforms.uOpacity.value = 0.3 + e * 0.35;
      if (safeRing) {
        safeMat.opacity = (0.28 + Math.sin(t * 1.6) * 0.06) * (1 - e); // gentle breathing; gone once the portal is open
        safeRing.visible = e < 0.999;
      }
      socketMeshes.forEach((m, i) => {
        m.rotation.y = t * 1.2 + i;
        if (m.userData.pop) { m.userData.pop = Math.max(0, m.userData.pop - dt * 2); m.scale.setScalar(1.6 + m.userData.pop * 1.4); }
      });
      for (let i = 0; i < MOTES; i++) {
        const s = (moteSeeds[i] + t * 0.05 * (0.5 + moteSeeds[i])) % 1;
        const p = pts[Math.floor(s * (pts.length - 1))];
        const wob = Math.sin(t * 2 + i) * 0.25;
        motePos[i * 3] = p.x * (1 + wob * 0.1);
        motePos[i * 3 + 1] = p.y + wob;
        motePos[i * 3 + 2] = Math.cos(t * 1.7 + i * 1.3) * 0.5;
      }
      moteGeo.attributes.position.needsUpdate = true;
    },
    // true if the player is stepping through the opening
    contains(pos) {
      if (open < 0.6) return false;
      tmp.copy(pos);
      group.worldToLocal(tmp);
      return Math.abs(tmp.z) < 0.9 && Math.abs(tmp.x) < W / 2 - 0.3 && tmp.y > -1.5 && tmp.y < H;
    },
  };
}
