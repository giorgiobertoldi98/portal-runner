import * as THREE from 'three';
import { CALL } from '../config.js';
import { softTexture } from '../engine/utils.js';

// The Resonance Call: stand still and a wall of light grows around you.
// Gems inside the ring light up; if none is reached by CALL.trailRadius, a particle trail
// points to the nearest one. Moving makes the ring collapse.
const RING_VERT = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FRAG = /* glsl */`
  varying vec2 vUv; uniform vec3 uColor; uniform float uTime; uniform float uOpacity;
  void main(){
    float a = pow(1.0 - vUv.y, 1.3);
    float bands = 0.75 + 0.25 * sin(vUv.x * 900.0 + uTime * 5.0);
    float base = smoothstep(0.0, 0.05, vUv.y);
    float rim = smoothstep(0.1, 0.0, abs(vUv.y - 0.18)) * 0.5;   // bright line just above the ground
    vec3 col = mix(uColor, vec3(1.0), rim);
    gl_FragColor = vec4(col, clamp(a * bands * base + rim, 0.0, 1.0) * uOpacity);
    #include <colorspace_fragment>
  }`;

const TRAIL_N = 90;

export class Resonance {
  constructor() {
    this.group = new THREE.Group();
    this.radius = 0;
    this.stillTime = 0;
    this.charging = false;
    this.trailTarget = null;
    this.trailAlpha = 0;
    this.trailTimer = 0;
    this.foundAny = false;

    this.ringMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x8fe8ff) }, uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: RING_VERT, fragmentShader: RING_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
    // a wall of light that hugs the terrain: SEG columns, bottom + top vertex each, rebuilt every frame
    const SEG = this.SEG = 160;
    this.ringPos = new Float32Array((SEG + 1) * 2 * 3);
    const uv = new Float32Array((SEG + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= SEG; i++) {
      uv.set([i / SEG, 0, i / SEG, 1], i * 4);
      if (i < SEG) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.ringPos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.ring = new THREE.Mesh(geo, this.ringMat);
    this.ring.frustumCulled = false;
    this.ring.visible = false;
    this.group.add(this.ring);

    // trail of particles flowing toward the nearest gem
    this.trailPos = new Float32Array(TRAIL_N * 3);
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trailMat = new THREE.PointsMaterial({ map: softTexture(), color: 0xffffff, size: 0.6, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });
    this.trail = new THREE.Points(tGeo, this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.group.add(this.trail);
    this.trailSeeds = Array.from({ length: TRAIL_N }, () => [Math.random(), Math.random() - 0.5, Math.random()]);
  }

  setColor(c) { this.ringMat.uniforms.uColor.value.set(c); this.trailMat.color.set(c); }

  reset() {
    this.radius = 0; this.stillTime = 0; this.charging = false;
    this.trailTarget = null; this.trailAlpha = 0; this.trailTimer = 0;
    this.ring.visible = false; this.trail.visible = false;
  }

  // still: is the player standing still this frame. gems: ground gems of the current world.
  // Returns the number of gems currently inside the ring.
  update(dt, t, still, player, world, gems) {
    const p = player.position;
    this.stillTime = still ? this.stillTime + dt : 0;
    this.charging = this.stillTime > CALL.stillDelay;
    if (this.charging) this.radius = Math.min(CALL.maxRadius, this.radius + (CALL.baseGrowth + this.radius * CALL.growthPerMetre) * dt);
    else this.radius = Math.max(0, this.radius - CALL.collapseSpeed * dt);
    if (this.radius === 0) this.foundAny = false;

    // light the gems inside the ring
    let inside = 0, nearest = null, nd = Infinity;
    for (const g of gems) {
      const gp = g.group.position;
      const d = Math.hypot(gp.x - p.x, gp.z - p.z);
      const isIn = this.radius > 0 && d <= this.radius;
      g.litTarget = isIn ? 1 : 0;
      if (isIn) inside++;
      if (d < nd) { nd = d; nearest = g; }
    }
    if (inside > 0) this.foundAny = true;

    // trail: the ring reached the threshold without touching a gem
    if (this.charging && !this.foundAny && this.radius >= CALL.trailRadius && nearest) {
      this.trailTarget = nearest; this.trailTimer = CALL.trailLinger;
    }
    if (!this.charging) this.trailTimer -= dt;
    if (this.trailTarget && (this.trailTarget.state !== 'ground' || this.trailTimer <= 0)) this.trailTarget = null;
    this.trailAlpha += ((this.trailTarget ? 1 : 0) - this.trailAlpha) * (1 - Math.exp(-4 * dt));

    // ring visuals
    const r = Math.max(0.01, this.radius);
    this.ring.visible = this.radius > 0.2;
    if (this.ring.visible) {
      const H = 3.5 + r * 0.04;
      for (let i = 0; i <= this.SEG; i++) {
        const a = (i / this.SEG) * Math.PI * 2;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const y = world.heightAt(x, z) - 0.4;
        this.ringPos.set([x, y, z, x, y + H, z], i * 6);
      }
      this.ring.geometry.attributes.position.needsUpdate = true;
      this.ringMat.uniforms.uTime.value = t;
      this.ringMat.uniforms.uOpacity.value = Math.min(1, this.radius / 4) * (this.charging ? 0.95 : 0.6);
    }

    // trail visuals
    this.trail.visible = this.trailAlpha > 0.02 && (this.trailTarget || this.lastTrail);
    if (this.trailTarget) this.lastTrail = this.trailTarget;
    if (this.trail.visible) {
      const tg = this.lastTrail.group.position;
      const dx = tg.x - p.x, dz = tg.z - p.z, len = Math.hypot(dx, dz) || 1;
      const L = Math.min(CALL.trailLength, len), ux = dx / len, uz = dz / len;
      for (let i = 0; i < TRAIL_N; i++) {
        const [s, side, w] = this.trailSeeds[i];
        const f = (s + t * 0.25) % 1;
        const d = 1.5 + f * L;
        const x = p.x + ux * d - uz * side * 1.2;
        const z = p.z + uz * d + ux * side * 1.2;
        this.trailPos[i * 3] = x;
        this.trailPos[i * 3 + 1] = world.heightAt(x, z) + 1.0 + Math.sin(t * 3 + w * 6) * 0.35;
        this.trailPos[i * 3 + 2] = z;
      }
      this.trail.geometry.attributes.position.needsUpdate = true;
      this.trailMat.opacity = this.trailAlpha;
    }
    return inside;
  }
}
