import { clamp, damp } from './utils.js';

// Third-person orbit camera. yaw = angle of the camera around the player.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.32;
    this.distance = 7.5;
    this.target = { x: 0, y: 0, z: 0 };
    this.pos = { x: 0, y: 5, z: 8 };
    this.lookLift = 0;
  }

  snap(player) {
    this.yaw = player.heading + Math.PI;
    this.target = { x: player.position.x, y: player.position.y, z: player.position.z };
    this.compute(true, null);
  }

  // Shorten the boom when a prop (tree, rock, pillar...) sits between the player and the camera.
  clearDistance(colliders) {
    if (!colliders) return this.distance;
    const t = this.target;
    const dx = Math.sin(this.yaw), dz = Math.cos(this.yaw);
    const flat = Math.cos(this.pitch) * this.distance;
    let best = this.distance;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.type === 'box') continue;
      const r = c.cr ?? c.r + 0.3;
      const ox = c.x - t.x, oz = c.z - t.z;
      const proj = ox * dx + oz * dz;
      if (proj < 0.5 || proj > flat + r) continue;
      const perp2 = ox * ox + oz * oz - proj * proj;
      if (perp2 > r * r) continue;
      const hit = proj - Math.sqrt(r * r - perp2);
      if (hit < flat) best = Math.min(best, Math.max(2.2, (hit - 0.4) / Math.max(0.2, Math.cos(this.pitch))));
    }
    return best;
  }

  // The camera turns only when the player asks it to (mouse, arrow keys, look pad); walking never moves it.
  update(dt, player, look, heightAt, colliders) {
    this.yaw -= look.dx * 0.0042;
    this.pitch = clamp(this.pitch + look.dy * 0.003, CameraRig.MIN_PITCH, 1.15);
    const p = player.position;
    this.target.x = damp(this.target.x, p.x, 14, dt);
    this.target.y = damp(this.target.y, p.y, 10, dt);
    this.target.z = damp(this.target.z, p.z, 14, dt);
    const want = this.clearDistance(colliders);
    this.curDist = want < (this.curDist ?? this.distance) ? want : damp(this.curDist ?? this.distance, want, 3, dt);
    this.compute(false, heightAt, dt);
  }

  // Looking up: below ORBIT_FLOOR the camera stops sinking (it would dig into the ground) and tilts its gaze
  // upward instead, by the remaining angle, keeping the explorer in the lower part of the view.
  compute(instant, heightAt, dt = 0) {
    const t = this.target;
    const orbit = Math.max(this.pitch, CameraRig.ORBIT_FLOOR);
    const cp = Math.cos(orbit);
    const dist = instant ? this.distance : (this.curDist ?? this.distance);
    const x = t.x + Math.sin(this.yaw) * cp * dist;
    const z = t.z + Math.cos(this.yaw) * cp * dist;
    let y = t.y + 1.7 + Math.sin(orbit) * dist;
    this.lookLift = Math.tan(orbit - this.pitch) * cp * dist;   // 0 unless looking up past the floor
    if (heightAt) y = Math.max(y, heightAt(x, z) + 0.8);
    if (instant) { this.pos = { x, y, z }; this.curDist = this.distance; }
    else {
      this.pos.x = damp(this.pos.x, x, 20, dt);
      this.pos.y = damp(this.pos.y, y, 12, dt);
      this.pos.z = damp(this.pos.z, z, 20, dt);
    }
    this.camera.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.camera.lookAt(t.x, t.y + 1.5 + this.lookLift, t.z);
  }
}
CameraRig.MIN_PITCH = -0.5;     // how far up you can look: the gaze tilts up to ~24° past the orbit floor, keeping the explorer in view
CameraRig.ORBIT_FLOOR = -0.08;  // the lowest the camera itself swings
