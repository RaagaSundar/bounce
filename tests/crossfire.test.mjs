import assert from "node:assert/strict";
import test from "node:test";

import { crossfire } from "../games/crossfire.ts";

const players = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Grace" },
  { id: "p3", name: "Katherine" },
];

const T0 = 4_000_000;
const setup = () => crossfire.createInitialState({ players, now: T0, seed: 5 });

const write = (state, playerId, text) =>
  crossfire.applyInput(state, playerId, { type: "answer", text }, T0);
const vote = (state, playerId, answerId) =>
  crossfire.applyInput(state, playerId, { type: "vote", answerId }, T0);

/** Everyone writes, then the phase is pushed to voting. */
function toVoting() {
  let s = setup();
  s = write(s, "p1", "ask about their commute");
  s = write(s, "p2", "compliment the carpet");
  s = write(s, "p3", "recite the wifi password");
  s = crossfire.tick(s, T0 + 10);
  assert.equal(s.phase, "voting");
  return s;
}

test("a full ballot is built once everyone has written", () => {
  const s = toVoting();
  assert.equal(s.ballot.length, 3);
  assert.equal(new Set(s.ballot.map((b) => b.id)).size, 3, "ballot ids must be unique");
});

test("the voting view never leaks who wrote what", () => {
  const s = toVoting();

  for (const player of players) {
    const view = crossfire.getViewForPlayer(s, player.id);
    for (const entry of view.ballot) {
      assert.equal(entry.author, null, "authors stay hidden until the reveal");
      assert.equal("authorId" in entry, false, "authorId must never reach a client");
    }
    // Their own entry is flagged so the UI can disable it, without naming anyone.
    assert.equal(view.ballot.filter((e) => e.mine).length, 1);
  }

  // The projector shows the ballot to the whole room, so it must hide it too.
  // The projector carries a scoreboard, so player ids legitimately appear on it.
  // What must not appear is any link from a ballot entry to its author.
  const host = crossfire.getHostView(s);
  assert.equal(host.ballot.every((e) => e.author === null), true);
  assert.equal(host.ballot.every((e) => !("authorId" in e)), true);
  for (const entry of host.ballot) {
    assert.equal(JSON.stringify(entry).includes("p1"), false, `ballot entry leaks an author id`);
  }
});

test("you cannot vote for your own answer", () => {
  const s = toVoting();
  const own = s.ballot.find((b) => b.authorId === "p1");
  assert.equal(vote(s, "p1", own.id), s, "the server must refuse, not trust the UI to hide it");
});

test("votes for someone else are recorded, and re-voting the same is a no-op", () => {
  const s = toVoting();
  const other = s.ballot.find((b) => b.authorId !== "p1");
  const voted = vote(s, "p1", other.id);
  assert.equal(voted.votes.p1, other.id);
  assert.equal(vote(voted, "p1", other.id), voted);
});

test("a vote for an unknown ballot id is ignored", () => {
  const s = toVoting();
  assert.equal(vote(s, "p1", "nope"), s);
});

test("the winning author is revealed with their votes", () => {
  let s = toVoting();
  const target = s.ballot.find((b) => b.authorId === "p2");
  s = vote(s, "p1", target.id);
  s = vote(s, "p3", target.id);

  // p2 never votes, so the phase ends on its timer rather than early.
  const settled = crossfire.tick(s, s.phaseEndsAt + 1);
  assert.equal(settled.phase, "reveal");
  assert.equal(settled.lastRound.winner.name, "Grace");
  assert.equal(settled.lastRound.winner.votes, 2);
  assert.ok(settled.scores.p2 > settled.scores.p1, "votes received should dominate");

  const view = crossfire.getViewForPlayer(settled, "p1");
  assert.ok(view.ballot.some((e) => e.author === "Grace"), "authors appear at the reveal");
});

test("writing scores something even with no votes", () => {
  let s = toVoting();
  const settled = crossfire.tick(s, s.phaseEndsAt + 1);
  assert.equal(settled.phase, "reveal");
  assert.ok(settled.scores.p1 > 0, "turning up and writing should not score zero");
  assert.equal(settled.lastRound.winner, null, "nobody voted, so nobody won");
});

test("fewer than two answers skips voting instead of stalling", () => {
  // One person writes; a ballot of one cannot be voted on without self-voting.
  let s = setup();
  s = write(s, "p1", "only answer");
  const pushed = crossfire.tick(s, s.phaseEndsAt + 1);
  assert.equal(pushed.phase, "reveal", "must not sit in a dead voting phase");
});

test("a player leaving does not hold the room in the writing phase", () => {
  let s = setup();
  s = write(s, "p1", "one");
  s = write(s, "p2", "two");
  // p3 shuts their tab; the remaining two have both written.
  const gone = crossfire.onPlayerLeft(s, "p3", T0 + 100);
  assert.equal(crossfire.tick(gone, T0 + 200).phase, "voting");
});

test("answers are length-capped and whitespace-normalised", () => {
  const s = setup();
  const long = write(s, "p1", "  x".padEnd(400, "y"));
  assert.ok(long.answers.p1.length <= 100);
  assert.equal(write(s, "p1", "a    b").answers.p1, "a b");
});

test("a full match runs both rounds and completes", () => {
  let s = setup();
  let now = T0;

  for (let i = 0; i < 5000 && !crossfire.isComplete(s); i += 1) {
    now += 250;
    if (s.phase === "writing") {
      for (const p of players) if (!s.answers[p.id]) s = write(s, p.id, `${p.name} says ${s.round}`);
    }
    if (s.phase === "voting") {
      for (const p of players) {
        if (s.votes[p.id]) continue;
        const target = s.ballot.find((b) => b.authorId !== p.id);
        if (target) s = vote(s, p.id, target.id);
      }
    }
    s = crossfire.tick(s, now);
  }

  assert.ok(crossfire.isComplete(s), "the match should reach completion");
  assert.equal(s.round, 2);
  const results = crossfire.getResults(s);
  assert.equal(results.scores.length, 3);
  assert.ok(results.scores[0].points >= results.scores[1].points, "sorted descending");
});
