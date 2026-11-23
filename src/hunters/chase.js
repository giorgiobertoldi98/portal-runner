// Plain chase: always knows where you are and heads for you (aiming a little ahead of where you're running).
// In the portal safe zone it can't follow you, so it ambles away from the portal instead.
import { GAME, SPEED, hunterSpeed } from '../config.js';

// Shared helper: aim point, leading the player by GAME.monsterPrediction.
export function aimAt(monster, player, dist) {
  const p = player.position;
  const lead = GAME.monsterPrediction * Math.min(dist / Math.max(monster.speed, 1), 2.5);
  return { tx: p.x + player.velocity.x * lead, tz: p.z + player.velocity.z * lead };
}

export class ChaseBrain {
  constructor() { this.state = 'chase'; }
  reset() {}
  think(dt, monster, { player, dist, safe, portal }) {
    if (safe) { // you're in the portal safe zone: amble away from the portal until you step out
      const dx = monster.pos.x - portal.x, dz = monster.pos.z - portal.z, l = Math.hypot(dx, dz) || 1;
      return { tx: monster.pos.x + (dx / l) * 20, tz: monster.pos.z + (dz / l) * 20, speed: hunterSpeed(SPEED.retreat), turn: 2.5 };
    }
    return { ...aimAt(monster, player, dist), speed: hunterSpeed(SPEED.chase) };
  }
}
