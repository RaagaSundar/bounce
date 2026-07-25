import assert from "node:assert/strict";
import test from "node:test";

import { reactionTap } from "../games/reaction-tap.ts";

// Every MiniGame method is pure, so a whole match can be driven by feeding it
// timestamps - no Durable Object, no sockets, no clock.

const players = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Grace" },
  { id: "p3", name: "Katherine" },
];

const T0 = 1_000_000;
const setup = () => reactionTap.createInitialState({ players, now: T0, seed: 42 });

/** Runs tick until the predicate holds, so tests don't hardcode phase timings. */
function advanceUntil(state, predicate, { step = 100, limit = 1000 } = {}) {
  let current = state;
  let now = T0;
  for (let i = 0; i < limit; i += 1) {
    if (predicate(current, now)) return { state: current, now };
    now += step;
    current = reactionTap.tick(current, now);
  }
  throw new Error("advanceUntil never satisfied its predicate");
}

test("a fresh game arms before it goes live", () => {
  const state = setup();
  assert.equal(state.phase, "arming");
  assert.equal(state.round, 1);
  assert.equal(state.totalRounds, 3);
  assert.ok(state.goAt > state.phaseEndsAt, "GO must come after the arming countdown");
});

test("the same seed always produces the same GO moment", () => {
  assert.equal(setup().goAt, setup().goAt);
  const other = reactionTap.createInitialState({ players, now: T0, seed: 43 });
  assert.notEqual(setup().goAt, other.goAt, "a different seed should move the GO");
});

test("phases advance arming -> waiting -> live", () => {
  const waiting = advanceUntil(setup(), (s) => s.phase === "waiting");
  assert.equal(waiting.state.phase, "waiting");
  const live = advanceUntil(setup(), (s) => s.phase === "live");
  assert.equal(live.state.phase, "live");
});

test("tick returns the same reference when nothing changed", () => {
  const state = setup();
  const ticked = reactionTap.tick(state, T0 + 1);
  assert.equal(ticked, state, "a no-op tick must not allocate a new state");
});

test("taps are ranked by arrival and scored by speed", () => {
  const { state: live } = advanceUntil(setup(), (s) => s.phase === "live");

  const first = reactionTap.applyInput(live, "p1", { type: "tap" }, live.goAt + 180);
  const second = reactionTap.applyInput(first, "p2", { type: "tap" }, live.goAt + 400);

  assert.equal(second.taps.p1.rank, 1);
  assert.equal(second.taps.p2.rank, 2);
  assert.equal(second.taps.p1.reactionMs, 180);
  assert.equal(second.taps.p2.reactionMs, 400);
  assert.ok(
    second.taps.p1.points > second.taps.p2.points,
    "the faster tap must be worth more",
  );
});

test("a player cannot tap twice in one round", () => {
  const { state: live } = advanceUntil(setup(), (s) => s.phase === "live");
  const once = reactionTap.applyInput(live, "p1", { type: "tap" }, live.goAt + 200);
  const twice = reactionTap.applyInput(once, "p1", { type: "tap" }, live.goAt + 210);
  assert.equal(twice.taps.p1.reactionMs, 200, "the second tap must be ignored");
  assert.equal(Object.keys(twice.taps).length, 1);
});

test("tapping before GO is a false start and locks the round out", () => {
  const { state: waiting } = advanceUntil(setup(), (s) => s.phase === "waiting");

  const jumped = reactionTap.applyInput(waiting, "p1", { type: "tap" }, waiting.goAt - 200);
  assert.deepEqual(jumped.falseStarts, ["p1"]);
  assert.equal(jumped.taps.p1, undefined);

  // Even a legitimate tap after GO must not rescue a false start.
  const afterGo = reactionTap.applyInput(jumped, "p1", { type: "tap" }, jumped.goAt + 150);
  assert.equal(afterGo.taps.p1, undefined, "a false start cannot be redeemed");
});

test("a tap between GO and the next tick still counts", () => {
  // The regression this guards: `live` is only set by tick, so a player fast
  // enough to tap inside the tick interval would otherwise be scored as a false
  // start purely because of tick granularity.
  const { state: waiting } = advanceUntil(setup(), (s) => s.phase === "waiting");
  assert.equal(waiting.phase, "waiting");

  const tapped = reactionTap.applyInput(waiting, "p1", { type: "tap" }, waiting.goAt + 5);
  assert.deepEqual(tapped.falseStarts, [], "must not be treated as a false start");
  assert.equal(tapped.taps.p1.reactionMs, 5);
});

test("the waiting view never leaks when GO will happen", () => {
  const { state: waiting } = advanceUntil(setup(), (s) => s.phase === "waiting");
  const view = reactionTap.getViewForPlayer(waiting, "p1");
  const host = reactionTap.getHostView(waiting);

  // Leaking goAt would let a client schedule a perfect tap instead of reacting.
  assert.equal(JSON.stringify(view).includes(String(waiting.goAt)), false);
  assert.equal(JSON.stringify(host).includes(String(waiting.goAt)), false);
  assert.equal(view.liveSince, null);
});

test("a player only sees their own tap detail", () => {
  const { state: live } = advanceUntil(setup(), (s) => s.phase === "live");
  const tapped = reactionTap.applyInput(live, "p2", { type: "tap" }, live.goAt + 200);

  const view = reactionTap.getViewForPlayer(tapped, "p1");
  assert.equal(view.you.tapped, false);
  assert.equal(view.tapsIn, 1, "the count is shared, the detail is not");
  assert.equal(JSON.stringify(view).includes("Grace"), false);
});

test("the round settles once everyone has tapped", () => {
  const { state: live } = advanceUntil(setup(), (s) => s.phase === "live");
  let state = live;
  for (const [i, player] of players.entries()) {
    state = reactionTap.applyInput(state, player.id, { type: "tap" }, live.goAt + 150 + i * 50);
  }

  const settled = reactionTap.tick(state, live.goAt + 400);
  assert.equal(settled.phase, "reveal");
  assert.equal(settled.lastRound.winner.name, "Ada");
  assert.ok(settled.scores.p1 > 0, "points must be banked into cumulative scores");
});

test("a round with no taps still settles, via timeout", () => {
  const { state: live } = advanceUntil(setup(), (s) => s.phase === "live");
  const timedOut = reactionTap.tick(live, live.goAt + 60_000);
  assert.equal(timedOut.phase, "reveal");
  assert.equal(timedOut.lastRound.winner, null);
});

test("a full match runs three rounds and then completes", () => {
  let state = setup();
  let now = T0;

  for (let i = 0; i < 4000 && !reactionTap.isComplete(state); i += 1) {
    now += 50;
    state = reactionTap.tick(state, now);
    if (state.phase === "live" && !state.taps.p1) {
      state = reactionTap.applyInput(state, "p1", { type: "tap" }, now);
    }
  }

  assert.ok(reactionTap.isComplete(state), "the match should reach completion");
  assert.equal(state.round, 3);

  const results = reactionTap.getResults(state);
  assert.equal(results.scores.length, 3);
  assert.equal(results.scores[0].playerId, "p1", "the only tapper should win");
  assert.ok(
    results.scores[0].points >= results.scores[1].points,
    "results must be sorted descending",
  );
  assert.match(results.headline, /Ada/);
});
