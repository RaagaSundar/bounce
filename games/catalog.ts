import { crossfire } from "./crossfire";
import { motionDuel } from "./motion-duel";
import { pairSprint } from "./pair-sprint";
import { reactionTap } from "./reaction-tap";
import type { MiniGame, MiniGameMeta } from "./types";

// The session layer holds games without knowing their state shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMiniGame = MiniGame<any>;

/**
 * Every playable minigame. Adding one means adding a file next to this and a
 * line here - nothing in the transport, the Durable Object, or the lobby.
 */
/**
 * Ordered as a host would run a night: a fast warm-up that needs no
 * explanation, then the two modes that put strangers together, then the one
 * that gives the whole room something to react to.
 */
export const GAME_CATALOG: readonly AnyMiniGame[] = [
  reactionTap,
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
