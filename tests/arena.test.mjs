import assert from "node:assert/strict";
import test from "node:test";

import { ARENA_H, ARENA_W, arena } from "../games/arena.ts";

const players = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Grace" },
];

const T0 = 6_000_000;
const setup = () => arena.createInitialState({ players, now: T0, seed: 9 });

/** Runs the countdown out so inputs are accepted. */
function toLive() {
  let s = setup();
  let now = T0;
  for (let i = 0; i < 400 && s.phase !== "live"; i += 1) {
    now += 50;
    s = arena.tick(s, now);
  }
  assert.equal(s.phase, "live");
  return { state: s, now };
}

/** Places two fighters at chosen spots so geometry tests are deterministic. */
function place(state, a, b) {
  return {
    ...state,
    fighters: {
      ...state.fighters,
      p1: { ...state.fighters.p1, ...a },
      p2: { ...state.fighters.p2, ...b },
    },
  };
}

test("it runs at a real-time tick, not the default", () => {
  assert.ok(arena.tickMs && arena.tickMs <= 60, "movement needs ~20Hz or better");
});

test("a stick vector moves you, scaled by real elapsed time", () => {
  const { state, now } = toLive();
  const start = state.fighters.p1.x;
  const moving = arena.applyInput(state, "p1", { type: "stick", dx: 1, dy: 0 }, now);
  const after = arena.tick(moving, now + 500); // half a second

  assert.ok(after.fighters.p1.x > start, "should have moved right");
  const travelled = after.fighters.p1.x - start;
  assert.ok(travelled > 60 && travelled < 200, `half a second of travel looked wrong: ${travelled}`);
});

test("an oversized stick vector is clamped, so nobody outruns the field", () => {
  const { state, now } = toLive();
  const cheat = arena.applyInput(state, "p1", { type: "stick", dx: 50, dy: 50 }, now);
  const len = Math.hypot(cheat.fighters.p1.dx, cheat.fighters.p1.dy);
  assert.ok(len <= 1.0001, `stick length ${len} exceeded the unit circle`);
});

test("malformed input is ignored", () => {
  const { state, now } = toLive();
  for (const bad of [null, {}, { type: "stick" }, { type: "stick", dx: "x", dy: 0 }, { type: "stick", dx: NaN, dy: 0 }]) {
    assert.equal(arena.applyInput(state, "p1", bad, now), state);
  }
});

test("you cannot leave the arena", () => {
  const { state, now } = toLive();
  let s = arena.applyInput(state, "p1", { type: "stick", dx: 1, dy: 1 }, now);
  for (let i = 0; i < 200; i += 1) s = arena.tick(s, now + i * 50);
  assert.ok(s.fighters.p1.x <= ARENA_W && s.fighters.p1.y <= ARENA_H);
  assert.ok(s.fighters.p1.x >= 0 && s.fighters.p1.y >= 0);
});

test("firing respects the cooldown", () => {
  const { state, now } = toLive();
  const one = arena.applyInput(state, "p1", { type: "fire" }, now);
  assert.equal(one.bullets.length, 1);
  const spam = arena.applyInput(one, "p1", { type: "fire" }, now + 10);
  assert.equal(spam.bullets.length, 1, "holding the button must not fire faster");
  const later = arena.applyInput(one, "p1", { type: "fire" }, now + 400);
  assert.equal(later.bullets.length, 2);
});

test("auto-aim points the shot at the nearest enemy", () => {
  const { state, now } = toLive();
  // Grace directly above Ada: the bullet should travel upward (negative y).
  const posed = place(state, { x: 500, y: 400 }, { x: 500, y: 200 });
  const fired = arena.applyInput(posed, "p1", { type: "fire" }, now);
  assert.equal(fired.bullets.length, 1);
  assert.ok(fired.bullets[0].vy < -100, "should be aimed up at Grace");
  assert.ok(Math.abs(fired.bullets[0].vx) < 50, "and not sideways");
});

test("a fast bullet cannot tunnel through a player between ticks", () => {
  // The regression: a bullet advances ~38 units per tick while the hit radius
  // is ~31, so testing only the endpoint let shots pass clean through.
  // Measured before the fix: about one hit per seventy shots.
  const { state, now } = toLive();
  const posed = place(state, { x: 100, y: 310 }, { x: 800, y: 310 });

  let s = arena.applyInput(posed, "p1", { type: "fire" }, now);
  const startHp = s.fighters.p2.hp;

  let t = now;
  for (let i = 0; i < 60 && s.fighters.p2.hp === startHp; i += 1) {
    t += 50;
    s = arena.tick(s, t);
  }

  assert.ok(s.fighters.p2.hp < startHp, "the bullet must connect, not pass through");
});

test("bullets reach across the arena", () => {
  const { state, now } = toLive();
  // Opposite corners of the play area - the spacing that exposed the old range.
  const posed = place(state, { x: 30, y: 310 }, { x: 970, y: 310 });
  let s = arena.applyInput(posed, "p1", { type: "fire" }, now);
  let t = now;
  for (let i = 0; i < 80 && s.fighters.p2.hp === 100; i += 1) {
    t += 50;
    s = arena.tick(s, t);
  }
  assert.ok(s.fighters.p2.hp < 100, "a shot across the arena should still land");
});

test("you cannot shoot yourself", () => {
  const { state, now } = toLive();
  const alone = { ...state, fighters: { p1: { ...state.fighters.p1, x: 500, y: 300 } }, players: [players[0]] };
  let s = arena.applyInput(alone, "p1", { type: "fire" }, now);
  let t = now;
  for (let i = 0; i < 20; i += 1) { t += 50; s = arena.tick(s, t); }
  assert.equal(s.fighters.p1.hp, 100);
});

test("enough damage knocks you out, credits the shooter, and respawns you", () => {
  const { state, now } = toLive();
  let s = place(state, { x: 400, y: 310 }, { x: 600, y: 310, hp: 25 });

  let t = now;
  for (let i = 0; i < 40 && s.fighters.p2.alive; i += 1) {
    s = arena.applyInput(s, "p1", { type: "fire" }, t);
    t += 50;
    s = arena.tick(s, t);
  }

  assert.equal(s.fighters.p2.alive, false, "25hp should not survive a 25 damage hit");
  assert.equal(s.fighters.p1.kills, 1, "the shooter is credited");
  assert.equal(s.fighters.p2.deaths, 1);
  assert.match(s.feed[0] ?? "", /knocked out/);

  // and they come back
  for (let i = 0; i < 80 && !s.fighters.p2.alive; i += 1) { t += 50; s = arena.tick(s, t); }
  assert.equal(s.fighters.p2.alive, true, "players respawn rather than sitting out");
  assert.equal(s.fighters.p2.hp, 100);
});

test("the match ends on the clock and reports a winner", () => {
  const { state, now } = toLive();
  const ended = arena.tick(state, now + 200_000);
  assert.ok(arena.isComplete(ended));
  const results = arena.getResults(ended);
  assert.equal(results.scores.length, 2);
  assert.ok(typeof results.headline === "string" && results.headline.length > 0);
});

test("auto-aim leads a moving target instead of shooting behind it", () => {
  // A strafing player used to walk out of every shot: aim pointed at where they
  // were, and flight time across the arena exceeded how long it took them to
  // leave. Measured before this: zero hits in sixteen seconds of firing.
  const { state, now } = toLive();
  const posed = place(
    state,
    { x: 200, y: 310 },
    { x: 800, y: 310, dx: 0, dy: 1 }, // Grace running downward
  );

  let s = arena.applyInput(posed, "p1", { type: "fire" }, now);
  const bullet = s.bullets[0];
  assert.ok(bullet.vy > 50, "the shot should be aimed ahead of a target moving down");

  // and it should actually connect while she keeps moving
  let t = now;
  for (let i = 0; i < 40 && s.fighters.p2.hp === 100; i += 1) {
    t += 50;
    s = arena.tick(s, t);
  }
  assert.ok(s.fighters.p2.hp < 100, "a led shot should hit a strafing target");
});
