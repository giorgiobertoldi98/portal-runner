// Shared look: sky dome, light rig, distant horizon silhouettes, ambient particles.
// Every world uses these with its own palette — that is what keeps the worlds visually cohesive.
import * as THREE from 'three';
import { softTexture } from './utils.js';

export function createSky({ top, horizon, bottom, sunDir = [0.5, 0.3, -0.5], sunColor = 0xffffff, sunGlow = 0.4, sunSize = 0.9995, exponent = 0.55 }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHorizon: { value: new THREE.Color(horizon) },
      uBottom: { value: new THREE.Color(bottom) },
      uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
      uSunColor: { value: new THREE.Color(sunColor) },
      uGlow: { value: sunGlow },
      uSunSize: { value: sunSize },
      uExp: { value: exponent },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor; uniform float uGlow, uSunSize, uExp;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), uExp)) : mix(uHorizon, uBottom, pow(clamp(-y * 3.0, 0.0, 1.0), 0.5));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(s, 6.0) * uGlow + pow(s, 48.0) * 0.45);
        col = mix(col, uSunColor * 1.4, smoothstep(uSunSize, uSunSize + 0.0003, s));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

export function createLighting(scene, { sunColor = 0xffffff, sunIntensity = 2.2, sunDir = [0.5, 0.8, 0.3], sky = 0xbfd8ff, ground = 0x806040, hemiIntensity = 1, shadowMap = 2048 }) {
  const hemi = new THREE.HemisphereLight(sky, ground, hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  const cam = sun.shadow.camera;
  cam.left = -48; cam.right = 48; cam.top = 48; cam.bottom = -48; cam.near = 1; cam.far = 400;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);
  const dir = new THREE.Vector3(...sunDir).normalize();
  return {
    sun, hemi,
    update(center) {
      sun.target.position.set(center.x, center.y, center.z);
      sun.position.set(center.x + dir.x * 180, center.y + dir.y * 180, center.z + dir.z * 180);
    },
  };
}

// Jagged silhouette ring on the horizon (follows the camera). profile(angle) -> [0,1]
export function createHorizonRing({ radius = 900, segments = 96, color, minH = 30, maxH = 140, profile, yBase = -40 }) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const h = minH + (maxH - minH) * profile(a);
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    pos.push(x, yBase, z, x, yBase + h, z);
    if (i < segments) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide, toneMapped: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  return mesh;
}

// Ambient particles (snow, dust, spores) that wrap around a moving centre.
export function createParticles({ count = 800, area = [80, 40, 80], color = 0xffffff, size = 0.25, opacity = 0.9, velocity = [0, -2, 0], sway = 0.5, additive = false }) {
  const [w, h, d] = area;
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * w;
    pos[i * 3 + 1] = Math.random() * h;
    pos[i * 3 + 2] = (Math.random() - 0.5) * d;
    seeds[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, map: softTexture(), transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const wrap = (v, c, span) => c + ((((v - c + span / 2) % span) + span) % span) - span / 2;
  return {
    points,
    update(dt, center, t) {
      for (let i = 0; i < count; i++) {
        const k = i * 3, s = seeds[i];
        pos[k] = wrap(pos[k] + (velocity[0] + Math.sin(t * 0.7 + s) * sway) * dt, center.x, w);
        pos[k + 1] = pos[k + 1] + velocity[1] * dt;
        if (pos[k + 1] < center.y - 5) pos[k + 1] += h;
        if (pos[k + 1] > center.y - 5 + h) pos[k + 1] -= h;
        pos[k + 2] = wrap(pos[k + 2] + (velocity[2] + Math.cos(t * 0.6 + s) * sway) * dt, center.z, d);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// Group that keeps sky elements centred on the camera.
export function skyFollower(...objects) {
  const g = new THREE.Group();
  objects.forEach((o) => g.add(o));
  return {
    group: g,
    update(camera) { g.position.set(camera.position.x, 0, camera.position.z); },
  };
}
