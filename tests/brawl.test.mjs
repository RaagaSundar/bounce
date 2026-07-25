import assert from "node:assert/strict";
import test from "node:test";

import { beats, brawl } from "../games/brawl.ts";

const players = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Grace" },
  { id: "p3", name: "Kat" },
];

const T0 = 5_000_000;
const setup = () => brawl.createInitialState({ players, now: T0, seed: 3 });

/** Advances to a clash phase, where moves are accepted. */
function toClash(state = setup(), now = T0) {
  let s = state;
  let t = now;
  for (let i = 0; i < 200 && s.phase !== "clash"; i += 1) {
    t += 250;
    s = brawl.tick(s, t);
  }
  assert.equal(s.phase, "clash");
  return { state: s, now: t };
}

const move = (s, id, m, targetId) => brawl.applyInput(s, id, { type: "move", move: m, targetId }, T0);

test("the Smash triangle resolves correctly", () => {
  assert.equal(beats("attack", "grab"), true);
  assert.equal(beats("grab", "shield"), true);
  assert.equal(beats("shield", "attack"), true);
  assert.equal(beats("grab", "attack"), false);
  assert.equal(beats("attack", "attack"), false);
});

test("fighters start on 0% with stocks", () => {
  const s = setup();
  assert.equal(s.fighters.p1.damage, 0);
  assert.ok(s.fighters.p1.stocks >= 1);
  assert.equal(s.phase, "intro", "there is a beat before the first clash");
});

test("winning the read deals damage, losing it costs recoil", () => {
  const { state, now } = toClash();
  let s = move(state, "p1", "attack", "p2");
  s = move(s, "p2", "grab", "p1");
  const resolved = brawl.tick(s, now + 9000);

  assert.equal(resolved.phase, "resolve");
  // p1 read it right: attack beats grab, so p2 eats the hit AND the recoil for
  // losing their own exchange. Reading correctly means taking nothing.
  assert.ok(resolved.fighters.p2.damage > 0, "attack beats grab");
  assert.equal(resolved.fighters.p1.damage, 0, "a correct read should cost nothing");
});

test("identical moves clash for no damage", () => {
  const { state, now } = toClash();
  let s = move(state, "p1", "attack", "p2");
  s = move(s, "p2", "attack", "p1");
  const resolved = brawl.tick(s, now + 9000);
  // Both attacked each other: neither beats the other, so it is a clean clash.
  assert.equal(resolved.fighters.p1.damage, 0);
  assert.equal(resolved.fighters.p2.damage, 0);
});

test("knockback scales with damage already carried", () => {
  const { state, now } = toClash();
  // Kept under the KO threshold, since a KO resets damage to 0 and would make
  // the comparison meaningless.
  const hurt = { ...state, fighters: { ...state.fighters, p2: { ...state.fighters.p2, damage: 40 } } };

  let fresh = move(state, "p1", "attack", "p2");
  fresh = brawl.tick(fresh, now + 9000);
  const cleanHit = fresh.fighters.p2.damage;

  let heavy = move(hurt, "p1", "attack", "p2");
  heavy = brawl.tick(heavy, now + 9000);
  const heavyHit = heavy.fighters.p2.damage - 40;

  assert.ok(heavyHit > cleanHit, "a fighter on 40% should get hit harder than one on 0%");
});

test("crossing 100% costs a stock and resets damage", () => {
  const { state, now } = toClash();
  const nearly = { ...state, fighters: { ...state.fighters, p2: { ...state.fighters.p2, damage: 99 } } };
  let s = move(nearly, "p1", "attack", "p2");
  const resolved = brawl.tick(s, now + 9000);

  assert.equal(resolved.fighters.p2.stocks, state.fighters.p2.stocks - 1);
  assert.equal(resolved.fighters.p2.damage, 0, "damage resets after a KO");
  assert.equal(resolved.fighters.p1.kos, 1, "the finisher is credited");
});

test("you cannot target yourself, someone who is out, or send a bogus move", () => {
  const { state } = toClash();
  assert.equal(move(state, "p1", "attack", "p1"), state);
  assert.equal(move(state, "p1", "sword", "p2"), state);
  assert.equal(brawl.applyInput(state, "p1", { type: "move", move: "attack" }, T0), state);
  assert.equal(brawl.applyInput(state, "p1", null, T0), state);

  const dead = { ...state, fighters: { ...state.fighters, p3: { ...state.fighters.p3, out: true } } };
  assert.equal(move(dead, "p1", "attack", "p3"), dead);
});

test("opponents' declared moves are never visible during the clash", () => {
  const { state } = toClash();
  const s = move(state, "p2", "shield", "p1");

  const view = brawl.getViewForPlayer(s, "p1");
  assert.equal(view.targets.some((t) => "move" in t), false, "reading them must take a guess");
  assert.equal(JSON.stringify(view.targets).includes("shield"), false);

  // The projector faces the players, so it only shows who is locked in.
  const host = brawl.getHostView(s);
  assert.equal(host.fighters.find((f) => f.playerId === "p2").ready, true);
  assert.equal(JSON.stringify(host.fighters).includes("shield"), false);
});

test("a fighter who leaves forfeits instead of stalling the clash", () => {
  const { state } = toClash();
  const left = brawl.onPlayerLeft(state, "p3", T0);
  assert.equal(left.fighters.p3.out, true);
});

test("a whole brawl ends with one fighter standing", () => {
  let s = setup();
  let now = T0;

  for (let i = 0; i < 4000 && !brawl.isComplete(s); i += 1) {
    now += 250;
    if (s.phase === "clash") {
      // Ada always reads correctly; the others always throw grab.
      for (const p of players) {
        const f = s.fighters[p.id];
        if (f.out || f.move) continue;
        const victim = Object.values(s.fighters).find((o) => !o.out && o.id !== p.id);
        if (!victim) continue;
        s = move(s, p.id, p.id === "p1" ? "attack" : "grab", victim.id);
      }
    }
    s = brawl.tick(s, now);
  }

  assert.ok(brawl.isComplete(s), "the brawl should reach a winner");
  const results = brawl.getResults(s);
  assert.equal(results.scores.length, 3);
  assert.ok(results.scores[0].points >= results.scores[1].points, "sorted descending");
  assert.match(results.headline, /wins the brawl|fell off/);
});
