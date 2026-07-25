import assert from "node:assert/strict";
import test from "node:test";

import { groupPairKeys, makeGroups, pairKey } from "../games/pairing.ts";

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
/** Deterministic stand-in for Math.random so runs are reproducible. */
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

test("pair keys are order independent", () => {
  assert.equal(pairKey("a", "b"), pairKey("b", "a"));
});

test("an even roster splits into pairs, everyone included exactly once", () => {
  const groups = makeGroups(ids(8), new Set(), seeded(1));
  assert.equal(groups.length, 4);
  assert.ok(groups.every((g) => g.length === 2));
  assert.deepEqual([...groups.flat()].sort(), ids(8).sort());
});

test("an odd roster makes one trio rather than stranding anyone", () => {
  const groups = makeGroups(ids(7), new Set(), seeded(2));
  const flat = groups.flat();
  assert.equal(flat.length, 7, "nobody may be dropped");
  assert.equal(new Set(flat).size, 7, "nobody may be duplicated");
  assert.equal(groups.filter((g) => g.length === 3).length, 1);
});

test("a roster of two pairs, a roster of one does not crash", () => {
  assert.deepEqual(makeGroups(["a", "b"], new Set(), seeded(3)).flat().sort(), ["a", "b"]);
  assert.deepEqual(makeGroups(["a"], new Set(), seeded(3)), [["a"]]);
  assert.deepEqual(makeGroups([], new Set(), seeded(3)), []);
});

test("people already paired this event are not paired again", () => {
  const roster = ids(6);
  const history = new Set();

  // Two rounds back to back; the second must avoid every pair from the first.
  const first = makeGroups(roster, history, seeded(4));
  for (const key of groupPairKeys(first)) history.add(key);

  const second = makeGroups(roster, history, seeded(5));
  for (const key of groupPairKeys(second)) {
    assert.equal(
      groupPairKeys(first).includes(key),
      false,
      `pair ${key} repeated in the very next round`,
    );
  }
});

test("it falls back to a repeat rather than leaving someone unpaired", () => {
  // Four people who have all already met each other: a repeat is unavoidable,
  // and standing alone would be worse.
  const roster = ids(4);
  const history = new Set(groupPairKeys([[...roster]]));
  const groups = makeGroups(roster, history, seeded(6));
  assert.equal(groups.flat().length, 4);
  assert.equal(new Set(groups.flat()).size, 4);
});

test("groupPairKeys expands a trio into all three meetings", () => {
  assert.deepEqual(groupPairKeys([["a", "b", "c"]]).sort(), ["a|b", "a|c", "b|c"]);
});
