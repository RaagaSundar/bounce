import assert from "node:assert/strict";
import test from "node:test";

import { findOverlaps, normalizeAnswer, pairSprint } from "../games/pair-sprint.ts";

const pair = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Grace" },
];

const T0 = 3_000_000;
const setup = () => pairSprint.createInitialState({ players: pair, now: T0, seed: 11 });

function toSprint() {
  let state = setup();
  let now = T0;
  for (let i = 0; i < 500 && state.phase !== "sprint"; i += 1) {
    now += 250;
    state = pairSprint.tick(state, now);
  }
  assert.equal(state.phase, "sprint");
  return { state, now };
}

const answer = (state, playerId, index, text) =>
  pairSprint.applyInput(state, playerId, { type: "answer", index, text }, T0);

test("it pairs strangers rather than running room-wide", () => {
  assert.equal(pairSprint.scope, "party");
});

test("answers are normalised so obvious matches count", () => {
  assert.equal(normalizeAnswer("  The Beatles!! "), "beatles");
  assert.equal(normalizeAnswer("PIZZA"), "pizza");
  assert.equal(normalizeAnswer("a coffee"), "coffee");
  assert.equal(normalizeAnswer("ice   cream"), "ice cream");
});

test("overlaps need two different people, not one person repeating", () => {
  // Ada writing "pizza" three times is not agreement.
  assert.deepEqual(findOverlaps({ p1: ["pizza", "Pizza", "PIZZA!"] }), []);
  const shared = findOverlaps({ p1: ["pizza", "beer"], p2: ["Pizza!", "wine"] });
  assert.equal(shared.length, 1);
  assert.deepEqual(shared[0].playerIds, ["p1", "p2"]);
});

test("a partner's answers are hidden until the reveal", () => {
  const { state } = toSprint();
  const written = answer(state, "p2", 0, "sardines");

  const view = pairSprint.getViewForPlayer(written, "p1");
  assert.equal(view.partners[0].answers, null, "seeing them early would be copying");
  assert.equal(view.partners[0].filled, 1, "the count is fair game - it builds pressure");
  assert.equal(JSON.stringify(view).includes("sardines"), false);
});

test("the reveal shows both lists and the matches", () => {
  const { state, now } = toSprint();
  let s = state;
  s = answer(s, "p1", 0, "pizza");
  s = answer(s, "p1", 1, "queues");
  s = answer(s, "p1", 2, "small talk");
  s = answer(s, "p2", 0, "Pizza");
  s = answer(s, "p2", 1, "bad music");
  s = answer(s, "p2", 2, "Small Talk!");

  const settled = pairSprint.tick(s, now + 100);
  assert.equal(settled.phase, "reveal");
  assert.equal(settled.overlaps.length, 2, "pizza and small talk should match");

  const view = pairSprint.getViewForPlayer(settled, "p1");
  assert.deepEqual(view.partners[0].answers, ["Pizza", "bad music", "Small Talk!"]);
  assert.equal(view.matched, 2);
});

test("matching is worth far more than merely filling boxes", () => {
  const { state, now } = toSprint();
  let matched = state;
  matched = answer(matched, "p1", 0, "pizza");
  matched = answer(matched, "p2", 0, "pizza");
  const withMatch = pairSprint.tick(matched, matched.phaseEndsAt + 1);

  const { state: s2, now: n2 } = toSprint();
  let missed = s2;
  missed = answer(missed, "p1", 0, "pizza");
  missed = answer(missed, "p2", 0, "haddock");
  const without = pairSprint.tick(missed, missed.phaseEndsAt + 1);

  assert.ok(
    withMatch.scores.p1 > without.scores.p1 * 3,
    "an overlap should dominate the score, not nudge it",
  );
});

test("the sprint ends early once both have filled every slot", () => {
  const { state, now } = toSprint();
  let s = state;
  for (let i = 0; i < 3; i += 1) {
    s = answer(s, "p1", i, `a${i}`);
    s = answer(s, "p2", i, `b${i}`);
  }
  assert.equal(pairSprint.tick(s, now + 10).phase, "reveal");
});

test("re-typing the same text does not allocate a new state", () => {
  const { state } = toSprint();
  const once = answer(state, "p1", 0, "pizza");
  assert.equal(answer(once, "p1", 0, "pizza"), once, "a no-op must not trigger a broadcast");
});

test("out-of-range and malformed answers are rejected", () => {
  const { state } = toSprint();
  for (const bad of [
    { type: "answer", index: -1, text: "x" },
    { type: "answer", index: 99, text: "x" },
    { type: "answer", index: 1.5, text: "x" },
    { type: "answer", index: 0, text: 42 },
    { type: "nonsense", index: 0, text: "x" },
    null,
  ]) {
    assert.equal(pairSprint.applyInput(state, "p1", bad, T0), state);
  }
});

test("a partner leaving settles the sprint instead of stranding the other", () => {
  const { state, now } = toSprint();
  const written = answer(state, "p1", 0, "pizza");
  const left = pairSprint.onPlayerLeft(written, "p2", now + 500);
  assert.equal(left.phase, "reveal", "the one still there should not wait out the timer");
});

test("a full sprint completes and reports the shared answer", () => {
  const { state, now } = toSprint();
  let s = state;
  s = answer(s, "p1", 0, "small talk");
  s = answer(s, "p2", 0, "Small talk");
  s = pairSprint.tick(s, s.phaseEndsAt + 1);
  s = pairSprint.tick(s, s.phaseEndsAt + 1);

  assert.ok(pairSprint.isComplete(s));
  const results = pairSprint.getResults(s);
  assert.equal(results.scores.length, 2);
  assert.match(results.headline, /small talk/i);
});
