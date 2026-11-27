// Fixed camera shots for small rooms (design doc: Design principles, "small rooms get a fixed camera").
//
// A world declares its rooms with fixedShot(pos, active) -> { cam, look, exit } | null: the shot for the room you
// are in, or null. `active` says whether a shot is on, so the world can use a smaller area to let go than to take
// over (the two edges apart, so it never flickers). cam and look are world points; exit is the unit direction
// (x, z) that leads out of the room.
//
// While a shot is on:
// - the camera holds it: no orbit, no drag (the rig's yaw is pinned to the view, so the controls follow the screen);
// - rig.fixedView is set, so the rig holds your walking direction through the switches (see CameraRig.moveYaw);
// - `active` is true, which the game uses to make you walk only (a small room has no space to run).
// Switching eases between the following camera, as it moves, and the shot, so the camera keeps its speed and never
// stops dead: the following camera around a room must therefore move smoothly near its doorway (in the ice cave it
// is the pit's camera rail). Easing out, the aim returns to you quickly, so you never leave the frame. Leaving the room
// through its exit swings the camera behind you, facing the way out.
//
// Choose each shot by measuring, not by eye: from the spot, you should stay fully in frame over most of the room's
// floor. The ice cave's chamber (mechanics/iceCave.js) is the reference.
import * as THREE from 'three';

const IN_TIME = 0.8, OUT_TIME = 0.7; // seconds to ease into and out of a shot
const dir = new THREE.Vector3();
const mix = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });

export class FixedShot {
  constructor() { this.reset(); }

  get active() { return !!this.shot; }

  reset() {
    this.shot = null;     // the shot that's on
    this.leaving = null;  // the shot being eased out of
    this.ramp = 0;        // 0..1, linear in time; eased with a smoothstep
    this.lastP = null;
  }

  // after the world's own camera work: takes over the camera while you're in a room with a shot
  update(camera, rig, P, dt, find) {
    const moved = this.lastP ? { x: P.x - this.lastP.x, z: P.z - this.lastP.z } : { x: 0, z: 0 };
    this.lastP = { x: P.x, z: P.z };
    if (Math.hypot(moved.x, moved.z) > 5) { this.end(rig, null); this.ramp = 0; }   // a respawn or a new world: no easing

    const cam = camera.position;
    const t = rig.target, r = Math.hypot(cam.x - t.x, cam.y - t.y - 1.5, cam.z - t.z);
    camera.getWorldDirection(dir);
    const gaze = { x: cam.x + dir.x * r, y: cam.y + dir.y * r, z: cam.z + dir.z * r };

    const next = find ? find(P, !!this.shot) : null;
    if (next && !this.shot) this.shot = { ...next, pitch: rig.pitch };
    else if (next) Object.assign(this.shot, next);
    else if (this.shot) this.end(rig, moved);

    this.ramp = Math.max(0, Math.min(1, this.ramp + (this.shot ? dt / IN_TIME : -dt / OUT_TIME)));
    const k = this.ramp * this.ramp * (3 - 2 * this.ramp);
    rig.fixedView = !!this.shot;
    const s = this.shot ?? this.leaving;
    if (!s || k < 0.001) { this.leaving = null; return; }

    let p, look;
    if (this.shot) {
      rig.yaw = Math.atan2(s.cam.x - s.look.x, s.cam.z - s.look.z);   // the drag can't turn it: the view stays put
      rig.pitch = s.pitch;
      p = mix(cam, s.cam, k);
      look = mix(gaze, s.look, k);
    } else {
      p = mix(cam, s.cam, k);
      look = mix(gaze, s.look, this.ramp ** 8);   // the aim comes back to you well before the camera does
    }
    cam.set(p.x, p.y, p.z);
    camera.lookAt(look.x, look.y, look.z);
  }

  // leaving: if you're walking out through the exit, the camera swings round behind you, facing the way out
  end(rig, moved) {
    if (!this.shot) return;
    rig.pitch = this.shot.pitch;
    const m = moved ? Math.hypot(moved.x, moved.z) : 0, e = this.shot.exit;
    if (e && m > 0.005 && moved.x * e.x + moved.z * e.z > 0.5 * m) rig.yaw = Math.atan2(-e.x, -e.z);
    this.leaving = this.shot;
    this.shot = null;
    rig.fixedView = false;
  }
}
