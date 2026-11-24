# Hunters — the brain contract

How hunter brains plug in and what they may assume. Each hunter's intended behaviour is in `docs/GAME.md` (Enemies).

- A hunter is a body (from its world) driven by a brain (here). The contract is at the top of `entities/monster.js`: `think(dt, monster, ctx)` returns `{ tx, tz, speed, turn? }`; `danger(dist)` (optional) defines "close" for the danger cues.
- **The safe zone is enforced for every hunter by `monster.js`**: it keeps the hunter out of the portal zone and the world's keep-out places, and switches the danger cues off. A brain only decides what to do while `ctx.safe` is true (in the zone, or sheltered, e.g. the ice hole). Don't re-implement the zone in a brain.
- **Speeds**: through `hunterSpeed(fraction of V)`, fixed per state; never a function of time spent in the world.
- **Aim**: chase with `aimAt` (leads where you're running), not at your position.
- **Giving up** always heads away from the player, never past or around them.
- A world without a brain gets the plain chase (`chase.js`).
- World mechanics reach a brain only through `ctx.signals` (e.g. storms for the Yeti), so a brain never imports a mechanic.
