/**
 * Splits a roster into sub-groups for "party" scope games.
 *
 * The point of the product is meeting new people, so the algorithm's real job
 * is avoiding repeat pairings across a whole event, not just within one round.
 * Pure and deterministic given `rand`, so it is testable directly.
 */

/** Order-independent key for a pair, so (a,b) and (b,a) are the same meeting. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Greedy matching over a shuffled roster: each unmatched player takes the first
 * partner they have not already met. If everyone remaining has been met before,
 * it falls back to a repeat rather than leaving someone out - being paired with
 * someone twice beats standing on your own.
 *
 * An odd roster produces one trio (the last group has three), because a lone
 * player has nobody to duel.
 */
export function makeGroups(
  playerIds: string[],
  history: ReadonlySet<string>,
  rand: () => number,
): string[][] {
  if (playerIds.length < 2) return playerIds.length ? [[...playerIds]] : [];

  const pool = shuffled(playerIds, rand);
  const taken = new Set<string>();
  const groups: string[][] = [];

  for (const player of pool) {
    if (taken.has(player)) continue;

    const candidates = pool.filter((other) => other !== player && !taken.has(other));
    if (candidates.length === 0) break;

    const fresh = candidates.find((other) => !history.has(pairKey(player, other)));
    const partner = fresh ?? candidates[0];

    taken.add(player);
    taken.add(partner);
    groups.push([player, partner]);
  }

  // Odd roster: fold the leftover into the last group rather than dropping them.
  const leftover = pool.filter((p) => !taken.has(p));
  if (leftover.length && groups.length) groups[groups.length - 1].push(...leftover);
  else if (leftover.length) groups.push(leftover);

  return groups;
}

/** Every pairing implied by a set of groups, for recording into history. */
export function groupPairKeys(groups: string[][]): string[] {
  const keys: string[] = [];
  for (const group of groups) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) keys.push(pairKey(group[i], group[j]));
    }
  }
  return keys;
}
