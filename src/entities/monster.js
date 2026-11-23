import { lerp, dampAngle, resolveCollisions, clampToRadius, dist2D } from '../engine/utils.js';
import { ChaseBrain } from '../hunters/chase.js';
import { PORTAL } from '../config.js';

// A hunter = a body (look + animation, from the world module) driven by a brain (behaviour).
// body  = { object, animate(dt, speed, t), radius, hover }
// brain = { reset(monster, ctx), think(dt, monster, ctx) -> { tx, tz, speed, turn? }, state? }
// Portal safe zone (every world): while you're within PORTAL.safeRadius of the portal, the brain gets ctx.safe = true
// and should stop chasing; the hunter also can't enter the zone (with a margin, so it can't catch you from the edge)
// and its danger cues are off.
// Worlds can add places hunters can't enter (world.hunterKeepOut = [{ x, z, r }]) and places where you're hidden from
// them (world.isSheltered(pos)): while you're sheltered the brain also gets ctx.safe = true.
// Worlds that don't provide a brain get the plain chase brain.
export class Monster {
  constructor(body, brain = new ChaseBrain()) {
    this.body = body;
    this.brain = brain;
    this.object = body.object;
    this.pos = this.object.position;
    this.heading = 0;
    this.speed = 0;
    this.time = 0;
    this.active = false;
    this.safe = false;
  }

  get state() { return this.brain.state || 'chase'; }

  // 0..1 for the danger cues (red vignette, heartbeat). Brains can define their own range; default: within 55 m.
  danger(dist) {
    if (!this.active || this.safe) return 0;
    if (this.brain.danger) return this.brain.danger(dist);
    return Math.max(0, Math.min(1, 1 - dist / 55));
  }

  reset(x, z, world, facing, rng = Math.random) {
    this.pos.set(x, world.heightAt(x, z) + (this.body.hover || 0), z);
    this.heading = facing ?? 0;
    this.time = 0;
    this.speed = 0;
    this.active = true;
    this.object.visible = true;
    this.brain.reset(this, { world, rng });
  }

  // ctx = { player, world, rng, signals, portal } — signals carry world mechanics (e.g. storms); portal = { x, z }
  update(dt, ctx) {
    if (!this.active) return Infinity;
    const { player, world } = ctx;
    this.time += dt;

    const d = dist2D(this.pos, player.position);
    const portal = ctx.portal, R = PORTAL.safeRadius;
    const portalSafe = !!(portal && R > 0 && dist2D(player.position, portal) < R);
    this.safe = portalSafe || !!(world.isSheltered && world.isSheltered(player.position));
    const cmd = this.brain.think(dt, this, { ...ctx, dist: d, safe: this.safe });
    // ease between speeds so state changes don't snap
    this.speed = lerp(this.speed, cmd.speed, 1 - Math.exp(-3 * dt));
    const want = Math.atan2(cmd.tx - this.pos.x, cmd.tz - this.pos.z);
    this.heading = dampAngle(this.heading, want, cmd.turn ?? 5, dt);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    resolveCollisions(this.pos, this.body.radius, world.colliders);
    if (portalSafe) { // keep out of the safe zone
      const kr = R + this.body.radius + 1, dx = this.pos.x - portal.x, dz = this.pos.z - portal.z, r = Math.hypot(dx, dz);
      if (r < kr) {
        const s = r > 1e-3 ? kr / r : 0;
        this.pos.x = portal.x + (s ? dx * s : kr);
        this.pos.z = portal.z + (s ? dz * s : 0);
      }
    }
    if (world.hunterKeepOut) for (const k of world.hunterKeepOut) { // places too narrow for the hunter
      const dx = this.pos.x - k.x, dz = this.pos.z - k.z, r = Math.hypot(dx, dz), kr = k.r + this.body.radius;
      if (r < kr) { const s = r > 1e-3 ? kr / r : 0; this.pos.x = k.x + (s ? dx * s : kr); this.pos.z = k.z + (s ? dz * s : 0); }
    }
    clampToRadius(this.pos, world.radius - 2);
    const gy = world.heightAt(this.pos.x, this.pos.z) + (this.body.hover || 0);
    this.pos.y = lerp(this.pos.y, gy, 1 - Math.exp(-12 * dt));
    this.object.rotation.y = this.heading;
    this.body.animate(dt, this.speed, this.time);
    return d;
  }
}
