import assert from "node:assert/strict";
import test from "node:test";

import { motionDuel, thresholdAt } from "../games/motion-duel.ts";

const players = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Grace" },
];

const T0 = 2_000_000;
const setup = () => motionDuel.createInitialState({ players, now: T0, seed: 7 });

/** Advances to the live duel phase without hardcoding the find-phase length. */
function toSteady() {
  let state = setup();
  let now = T0;
  for (let i = 0; i < 1000 && state.phase !== "steady"; i += 1) {
    now += 250;
    state = motionDuel.tick(state, now);
  }
  assert.equal(state.phase, "steady", "should have reached the duel");
  return { state, now };
}

test("it is a party-scope game so the roster splits into pairs", () => {
  assert.equal(motionDuel.scope, "party");
  assert.ok(motionDuel.meta.minPlayers >= 2);
});

test("players get a find phase before the duel starts", () => {
  const state = setup();
  assert.equal(state.phase, "find");
  // Nobody can be knocked out while they are still looking for each other.
  const jostled = motionDuel.applyInput(state, "p1", { type: "motion", magnitude: 99 }, T0 + 10);
  assert.equal(jostled.duellists.p1.out, false);
});

test("the view names the opponent, which is what makes it an introduction", () => {
  const view = motionDuel.getViewForPlayer(setup(), "p1");
  assert.deepEqual(view.opponents, [{ name: "Grace", out: false }]);
  assert.match(view.colour, /^#[0-9a-f]{6}$/i);
});

test("holding steady keeps you in; a jolt knocks you out", () => {
  const { state, now } = toSteady();

  const gentle = motionDuel.applyInput(state, "p1", { type: "motion", magnitude: 0.2 }, now + 100);
  assert.equal(gentle.duellists.p1.out, false);
  assert.ok(gentle.duellists.p1.wobble > 0, "movement should still accumulate");

  const jolt = motionDuel.applyInput(state, "p1", { type: "motion", magnitude: 50 }, now + 100);
  assert.equal(jolt.duellists.p1.out, true);
});

test("an absurd magnitude is clamped rather than trusted", () => {
  const { state, now } = toSteady();
  const cheat = motionDuel.applyInput(
    state,
    "p1",
    { type: "motion", magnitude: 1e9 },
    now + 100,
  );
  assert.ok(cheat.duellists.p1.wobble <= 60, "magnitude must be clamped to a credible range");
});

test("malformed input is ignored", () => {
  const { state, now } = toSteady();
  for (const bad of [null, {}, { type: "motion" }, { type: "motion", magnitude: "big" }, { type: "motion", magnitude: NaN }]) {
    assert.equal(motionDuel.applyInput(state, "p1", bad, now + 10), state);
  }
});

test("knocking one player out ends the duel and the survivor wins", () => {
  const { state, now } = toSteady();
  const out = motionDuel.applyInput(state, "p1", { type: "motion", magnitude: 50 }, now + 500);
  const settled = motionDuel.tick(out, now + 600);

  assert.equal(settled.phase, "result");
  assert.equal(settled.winnerId, "p2");
  assert.ok(settled.scores.p2 > settled.scores.p1, "the winner should score higher");
});

test("if nobody flinches, the steadiest hand wins on cumulative wobble", () => {
  const { state, now } = toSteady();
  let s = state;
  // Both stay under the threshold, but Grace moves less overall.
  for (let i = 0; i < 10; i += 1) {
    s = motionDuel.applyInput(s, "p1", { type: "motion", magnitude: 0.5 }, now + i * 100);
    s = motionDuel.applyInput(s, "p2", { type: "motion", magnitude: 0.1 }, now + i * 100);
  }
  const timedOut = motionDuel.tick(s, s.phaseEndsAt + 1);
  assert.equal(timedOut.phase, "result");
  assert.equal(timedOut.winnerId, "p2", "lowest cumulative movement should win");
});

test("the sensitivity threshold pulses instead of staying flat", () => {
  const samples = [0, 1000, 2000, 3000, 4000, 5000, 6000].map(thresholdAt);
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.5, "threshold should vary over time");
  assert.ok(samples.every((s) => s > 0), "threshold must never invert");
});

test("a duel reaches completion and reports results", () => {
  const { state, now } = toSteady();
  const out = motionDuel.applyInput(state, "p1", { type: "motion", magnitude: 50 }, now + 800);
  let s = motionDuel.tick(out, now + 900);
  s = motionDuel.tick(s, s.phaseEndsAt + 1);

  assert.ok(motionDuel.isComplete(s));
  const results = motionDuel.getResults(s);
  assert.equal(results.scores.length, 2);
  assert.equal(results.scores[0].name, "Grace");
  assert.match(results.headline, /Grace/);
});
