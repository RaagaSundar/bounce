import { crossfire } from "./crossfire";
import { motionDuel } from "./motion-duel";
import { pairSprint } from "./pair-sprint";
import type { MiniGame, MiniGameMeta } from "./types";

// The session layer holds games without knowing their state shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMiniGame = MiniGame<any>;

/**
 * Every playable minigame. Adding one means adding a file next to this and a
 * line here - nothing in the transport, the Durable Object, or the lobby.
 */
/**
 * Ordered as a host would run a night: the two modes that put strangers
 * together, then the one that gives the whole room something to react to.
 * Every game here has to force at least two specific people to interact —
 * a solo-playable leaderboard doesn't belong (Reaction Tap was cut for this).
 */
export const GAME_CATALOG: readonly AnyMiniGame[] = [
  motionDuel,
  pairSprint,
  crossfire,
];

export function getGame(id: string): AnyMiniGame | null {
  return GAME_CATALOG.find((game) => game.id === id) ?? null;
}

export type CatalogEntry = MiniGameMeta & { id: string; scope: string };

/** Safe to show the host when picking what to play next. */
export function catalogSummary(): CatalogEntry[] {
  return GAME_CATALOG.map((game) => ({ id: game.id, scope: game.scope, ...game.meta }));
}
