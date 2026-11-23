// The landing view: a void between worlds.
// A winding chain of floating portals climbs into the distance, one per world in the registry, each swirling with
// the colours of the world it opens onto. The nearest is clear; the farther ones sink into haze, so you only
// glimpse what's coming. Dark gems drift through the void and glint now and then.
// Everything is driven by WORLDS, so a new world appears here automatically.
import * as THREE from 'three';
import { createPortal } from '../entities/portal.js';
import { createGem } from '../entities/gem.js';
import { flatMat, softTexture } from '../engine/utils.js';
import { mulberry32 } from '../engine/noise.js';
import { PORTAL } from '../config.js';

const VOID_TOP = 0x07061a, VOID_MID = 0x1a0f33, VOID_LOW = 0x05040f;
const HAZE = 0x140c28;

// where the i-th portal floats: zig-zagging left/right, climbing and receding
export function portalSpot(i) {
  const side = i % 2 === 0 ? -1 : 1;
  return { x: side * (4.5 + i * 3.2), y: i * 9.5, z: -24 - i * 40 };
}

function nebulaSky(tints) {
  const t = tints.map((c) => new THREE.Color(c));
  while (t.length < 3) t.push(t[t.length - 1] || new THREE.Color(0x8fe8ff));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(VOID_TOP) }, uMid: { value: new THREE.Color(VOID_MID) }, uLow: { value: new THREE.Color(VOID_LOW) },
      uA: { value: t[0] }, uB: { value: t[1] }, uC: { value: t[2] }, uTime: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTop, uMid, uLow, uA, uB, uC; uniform float uTime; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*n(p); p *= 2.07; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = y > 0.0 ? mix(uMid, uTop, pow(clamp(y, 0.0, 1.0), 0.6)) : mix(uMid, uLow, pow(clamp(-y * 2.5, 0.0, 1.0), 0.5));
        vec2 p = vec2(atan(d.x, -d.z) * 1.6, y * 3.0);
        float cloud = fbm(p * 1.4 + vec2(uTime * 0.004, 0.0));
        float wisp = smoothstep(0.45, 0.85, fbm(p * 2.6 - vec2(0.0, uTime * 0.003) + cloud * 1.5));
        // each world tints its own stretch of the sky
        float s = atan(d.x, -d.z);
        vec3 tint = mix(uA, uB, smoothstep(-0.9, 0.2, s + cloud * 0.6));
        tint = mix(tint, uC, smoothstep(0.1, 1.1, s + cloud * 0.6));
        float band = exp(-pow((y - 0.18 - (cloud - 0.5) * 0.5) * 2.4, 2.0));
        col += tint * wisp * band * 0.42;
        col += tint * band * cloud * 0.06;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 40, 20), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

function stars(count, rng) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = 600 + rng() * 200;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(a) * s * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = Math.sin(a) * s * r;
    c.setHSL(0.62 + rng() * 0.2, 0.5, 0.6 + rng() * 0.4);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, fog: false, toneMapped: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// a chunk of rock torn out of a world: flat top, jagged underside
function island(rng, color, radius) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const j = 0.82 + rng() * 0.36;
    x *= j; z *= j;
    y = y > 0 ? radius * 0.12 : y * (1.5 + rng() * 0.9);
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, flatMat({ color }));
  return m;
}

export function createMenuScene({ worlds, quality }) {
  const rng = mulberry32(2207);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HAZE, 0.0072);
  scene.add(nebulaSky(worlds.map((w) => w.theme.glow)));
  const starField = stars(Math.floor(1400 * (quality.density || 1)), rng);
  scene.add(starField);

  scene.add(new THREE.HemisphereLight(0x8a7cff, 0x1a0c22, 0.9));
  const key = new THREE.DirectionalLight(0xcfc4ff, 0.8);
  key.position.set(-30, 60, 40);
  scene.add(key);

  const portals = [];
  const islands = [];
  const sparks = [];
  worlds.forEach((def, i) => {
    const s = portalSpot(i);
    const p = createPortal({ dest: def, destIndex: i, x: s.x, y: s.y, z: s.z, showLabel: false, beacon: false });
    p.setQuota(0);
    p.activate();
    scene.add(p.group);
    portals.push(p);

    const rock = island(rng, def.theme.stone, 5.4 + rng() * 1.2);
    rock.position.set(s.x, s.y - 1.25, s.z);
    scene.add(rock);
    islands.push({ obj: rock, base: rock.position.y, phase: rng() * 6, portal: p, py: s.y });
    // a few fragments orbiting each island
    for (let k = 0; k < 4; k++) {
      const frag = island(rng, def.theme.stone, 0.7 + rng() * 1.2);
      const a = rng() * Math.PI * 2, r = 9 + rng() * 5;
      frag.userData = { cx: s.x, cz: s.z, y: s.y - 2 - rng() * 5, a, r, sp: (0.05 + rng() * 0.08) * (rng() < 0.5 ? -1 : 1) };
      scene.add(frag);
      islands.push({ frag });
    }
    // motes rising off the island in the world's own colour: a hint of its weather
    const n = 70;
    const pos = new Float32Array(n * 3), seed = [];
    for (let k = 0; k < n; k++) seed.push([rng() * Math.PI * 2, 1 + rng() * 7, rng(), 0.4 + rng()]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: softTexture(), color: def.theme.colC, size: 0.45, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    sparks.push({ pos, seed, geo, s });
  });

  // dark gems drifting through the void
  const gems = [];
  for (let i = 0; i < 9; i++) {
    const k = rng() * Math.max(1, worlds.length - 0.5);
    const g = createGem(worlds[Math.min(worlds.length - 1, Math.floor(k))].gem);
    const a = portalSpot(Math.floor(k));
    g.home = { x: a.x * 0.6 + (rng() - 0.5) * 30, y: a.y + 1 + rng() * 10, z: Math.min(-16, a.z - 6 + rng() * 16) };
    g.phase = rng() * 20;
    g.group.scale.setScalar(0.9);
    scene.add(g.group);
    gems.push(g);
  }

  const look = new THREE.Vector3();

  // Framing around the copy. How much room the copy takes depends on the device (font scaling, title wrapping),
  // so the bright part of the scene (portals and their frames) is fitted into whatever space it leaves to its
  // right. The view is shrunk a little if needed (zoom) and slid away from the copy (view offset), never towards it. The swaying camera pose is left alone: the fit is worked
  // out once from the resting pose and cached until the screen or the copy changes.
  const fitPoints = worlds.map((_, i) => portalSpot(i)).flatMap((s) => [
    new THREE.Vector3(s.x - PORTAL.width, s.y + PORTAL.height * 1.45, s.z), // top corners of the frame and its decorations
    new THREE.Vector3(s.x + PORTAL.width, s.y + PORTAL.height * 1.45, s.z),
    new THREE.Vector3(s.x - PORTAL.width, s.y - 0.6, s.z),                  // the platform the portal stands on
    new THREE.Vector3(s.x + PORTAL.width, s.y - 0.6, s.z),
  ]);
  const probe = new THREE.PerspectiveCamera();
  const v = new THREE.Vector3();
  const copy = { right: 0 }; // the copy's right edge, as a fraction of the screen width (0 = left)
  let fitKey = '', fit = null;

  function bounds(camera) {
    probe.copy(camera);
    probe.clearViewOffset(); probe.zoom = 1; probe.updateProjectionMatrix();
    probe.position.set(0, 9, 16); probe.lookAt(-13, 5, -70);
    probe.updateMatrixWorld();
    const b = { top: 1, bot: 0, left: 1, right: 0 };
    for (const p of fitPoints) {
      v.copy(p).project(probe);
      const x = 0.5 + v.x * 0.5, y = 0.5 - v.y * 0.5;  // 0 = left / top of the screen
      b.left = Math.min(b.left, x); b.right = Math.max(b.right, x);
      b.top = Math.min(b.top, y); b.bot = Math.max(b.bot, y);
    }
    return b;
  }

  function computeFit(camera) {
    const b = bounds(camera);
    const margin = 0.04, gap = 0.04;                      // breathing room at the right edge and beside the copy
    const avail = Math.max(0.15, 1 - copy.right - gap - margin);
    const zoom = THREE.MathUtils.clamp(avail / (b.right - b.left), 0.55, 1);
    const left = 0.5 + (b.left - 0.5) * zoom;             // group's left edge after zooming
    return { zoom, x: -Math.max(0, copy.right + gap - left), y: 0 }; // slide right only, clear of the copy
  }

  function applyFraming(camera) {
    const W = innerWidth, H = innerHeight;
    const key = `${W}x${H}:${copy.right.toFixed(3)}:${camera.fov}`;
    if (key === fitKey) return;
    fitKey = key;
    fit = computeFit(camera);
    camera.zoom = fit.zoom;
    if (fit.x === 0 && fit.y === 0) camera.clearViewOffset();
    else camera.setViewOffset(W, H, fit.x * W, fit.y * H, W, H);
    camera.updateProjectionMatrix();
  }

  return {
    scene,
    // where the menu copy ends (fraction of the screen width): the portals are framed to its right
    setCopyRect(right) {
      copy.right = THREE.MathUtils.clamp(right || 0, 0, 0.8);
    },
    // the game shares this camera: undo the menu framing before a world is rendered
    release(camera) { fit = null; fitKey = ''; camera.zoom = 1; camera.clearViewOffset(); camera.updateProjectionMatrix(); },
    update(dt, t, camera) {
      // slow drift toward the chain of portals, swaying gently; the copy sits on the left, so the portals are framed to the right
      applyFraming(camera);
      camera.position.set(Math.sin(t * 0.06) * 3, 9 + Math.sin(t * 0.09) * 1.2, 16 + Math.sin(t * 0.045) * 2.5);
      look.set(-13 + Math.sin(t * 0.05 + 1) * 2, 5, -70);
      camera.lookAt(look);

      for (const p of portals) p.update(dt, t);
      for (const it of islands) {
        if (it.frag) {
          const u = it.frag.userData;
          u.a += u.sp * dt;
          it.frag.position.set(u.cx + Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.4 + u.a) * 0.6, u.cz + Math.sin(u.a) * u.r);
          it.frag.rotation.y += u.sp * dt * 2;
          continue;
        }
        const bob = Math.sin(t * 0.35 + it.phase) * 0.6;
        it.obj.position.y = it.base + bob;
        it.portal.group.position.y = it.py + bob;
      }
      for (const sp of sparks) {
        for (let k = 0; k < sp.seed.length; k++) {
          const [a, r, s, v] = sp.seed[k];
          const h = (s + t * 0.05 * v) % 1;
          sp.pos[k * 3] = sp.s.x + Math.cos(a + t * 0.1 * v) * r;
          sp.pos[k * 3 + 1] = sp.s.y - 1 + h * 16;
          sp.pos[k * 3 + 2] = sp.s.z + Math.sin(a + t * 0.1 * v) * r;
        }
        sp.geo.attributes.position.needsUpdate = true;
      }
      for (const g of gems) {
        const q = t * 0.12 + g.phase;
        g.group.position.set(g.home.x + Math.sin(q) * 3, g.home.y + Math.sin(q * 1.3) * 1.5, g.home.z + Math.cos(q * 0.8) * 3);
        // now and then a gem answers, as if someone stood still nearby
        g.near = Math.pow(Math.max(0, Math.sin(t * 0.5 + g.phase * 1.7)), 12);
        g.update(dt, t);
      }
      starField.rotation.y = t * 0.002;
    },
  };
}
