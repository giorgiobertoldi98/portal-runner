// The Yeti (glacier hunter). Three states (speeds are fractions of your running speed, see GLACIER.speed):
//   search   — wanders between random waypoints; it doesn't know where you are
//   approach — you came within detectIn: it heads for you. It gives up once you're outside detectIn again,
//              then turns away and won't approach again for `forget` seconds.
//   storm    — you're inside a snow storm: it knows where you are; it sprints while far, then slows to a
//              close-chase speed once within detectIn
// When the storm ends it loses you: approach if you're within detectIn, otherwise back to searching from a random waypoint.
// Portal safe zone (ctx.safe, see entities/monster.js): while you're in it, it can't follow you whatever the distance or
// storm. It goes back to searching, heading away from you; once you step out, the normal rules apply. The same holds
// in the ice hole (world.isSheltered), where storms also die (see worlds/glacier.js).
import { GLACIER, hunterSpeed } from '../config.js';
import { findSpot, dist2D } from '../engine/utils.js';
import { aimAt } from './chase.js';

export class YetiBrain {
  constructor() {
    this.state = 'search';
    this.wp = null;
    this.cooldown = 0;
  }

  reset(monster, { world, rng }) {
    this.world = world;
    this.rng = rng || Math.random;
    this.state = 'search';
    this.cooldown = 0;
    this.wasSafe = false;
    this.pickWaypoint(monster);
  }

  // away = optional point to keep the waypoint clear of (where you are, when it gives up on you)
  pickWaypoint(monster, away = null) {
    const p = monster.pos;
    const avoid = [{ x: p.x, z: p.z, d: 45 }];
    if (away) avoid.push({ x: away.x, z: away.z, d: GLACIER.detectIn + 20 });
    this.wp = findSpot(this.rng, this.world, { avoid, margin: 22, tries: 200 });
    if (away) {
      // giving up on you: pick a waypoint that leads away from you, not past you or around you (it never drifts
      // closer first, so it reads as giving up). Keep the most "away" of a few candidates.
      const ax = p.x - away.x, az = p.z - away.z, al = Math.hypot(ax, az) || 1;
      const awayness = (w) => ((w.x - p.x) * ax + (w.z - p.z) * az) / (al * (Math.hypot(w.x - p.x, w.z - p.z) || 1));
      let best = this.wp, bestA = awayness(best);
      for (let i = 0; i < 12 && bestA < 0.7; i++) {
        const c = findSpot(this.rng, this.world, { avoid, margin: 22, tries: 200 });
        const a = awayness(c);
        if (a > bestA) { best = c; bestA = a; }
      }
      this.wp = best;
    }
    this.wpTimer = 40;               // give up on a waypoint after this long
    this.progressTimer = 3;          // every few seconds, check it's actually moving
    this.progressFrom = { x: p.x, z: p.z };
  }

  // Danger cues (red vignette + heartbeat): on exactly while it's hunting you (approaching, or near you in a storm),
  // stronger as it gets closer. They switch off the moment it gives up, so you know you got away.
  danger(dist) {
    const hunting = this.state === 'approach' || (this.state === 'storm' && dist < GLACIER.detectIn);
    if (!hunting) return 0;
    return 0.3 + 0.7 * Math.max(0, 1 - dist / GLACIER.detectIn);
  }

  think(dt, monster, { player, dist, signals, safe }) {
    const cfg = GLACIER, S = GLACIER.speed;
    const inStorm = !!(signals && signals.storm);
    const prev = this.state;
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (safe) this.state = 'search';
    else if (inStorm) this.state = 'storm';
    else if (prev === 'storm') this.state = dist < cfg.detectIn ? 'approach' : 'search';
    else if (prev === 'search' && dist < cfg.detectIn && this.cooldown <= 0) this.state = 'approach';
    else if (prev === 'approach' && dist > cfg.detectIn) { this.state = 'search'; this.cooldown = cfg.forget; }

    const enteredSafe = safe && !this.wasSafe;
    this.wasSafe = safe;
    // giving up on you (chase lost, or you reached the portal): head somewhere well away from you
    if (enteredSafe || (this.state === 'search' && prev !== 'search')) this.pickWaypoint(monster, prev === 'approach' || safe ? player.position : null);

    if (this.state === 'storm') return { ...aimAt(monster, player, dist), speed: hunterSpeed(dist > cfg.detectIn ? S.stormFar : S.stormNear), turn: 7 };
    if (this.state === 'approach') return { ...aimAt(monster, player, dist), speed: hunterSpeed(S.approach) };

    // search: amble from waypoint to waypoint
    this.wpTimer -= dt;
    this.progressTimer -= dt;
    if (this.progressTimer <= 0) {
      const stuck = dist2D(monster.pos, this.progressFrom) < 1.5;
      this.progressTimer = 3;
      this.progressFrom = { x: monster.pos.x, z: monster.pos.z };
      if (stuck) this.pickWaypoint(monster);
    }
    if (this.wpTimer <= 0 || dist2D(monster.pos, this.wp) < GLACIER.waypointReach) this.pickWaypoint(monster);
    return { tx: this.wp.x, tz: this.wp.z, speed: hunterSpeed(S.search), turn: 2.5 };
  }
}
