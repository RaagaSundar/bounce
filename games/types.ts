/**
 * The contract every minigame implements. The session layer (RoomSession) knows
 * only this interface, never a specific game's rules, so adding a game means
 * adding one file here and one catalog entry - no transport, Durable Object or
 * lobby code changes.
 *
 * Every method is a pure function of its arguments. Nothing reads the clock,
 * performs I/O, or pulls ambient randomness: `now` and `seed` are passed in.
 * That is what makes these testable directly, without a Durable Object.
 */

export type GameScope = "room" | "party";
// "room"  - one shared state everyone plays into.
// "party" - the roster is split into sub-groups, each running its own
//           independent instance of the same game (Pair Sprint needs this).

export type SessionPlayer = {
  id: string;
  name: string;
};

export type MiniGameMeta = {
  title: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedDurationSeconds: number;
};

export type GameSetup = {
  players: SessionPlayer[];
  /** Server clock at creation. Never read from a client. */
  now: number;
  /** Seeds the game's deterministic RNG so runs are reproducible in tests. */
  seed: number;
};

export type PlayerScore = {
  playerId: string;
  name: string;
  points: number;
};

export type GameResults = {
  /** Descending by points. Feeds both the live leaderboard and the archive. */
  scores: PlayerScore[];
  headline: string;
};

export interface MiniGame<TState> {
  id: string;
  scope: GameScope;
  meta: MiniGameMeta;

  createInitialState(setup: GameSetup): TState;

  /**
   * Called for every message a client sends. Validates against current state
   * before mutating. Never trusts a claimed round, timer, or score - the only
   * thing a client can assert is that it did something, and `now` is the
   * server's arrival time.
   */
  applyInput(state: TState, playerId: string, input: unknown, now: number): TState;

  /**
   * Fixed server tick for anything timer- or countdown-driven. Returns the
   * same reference when nothing changed so the session can skip broadcasting
   * a no-op frame.
   */
  tick(state: TState, now: number): TState;

  /**
   * What actually goes down the socket to one player. Different players can
   * legitimately see different things (a drawer's secret word, another pair's
   * hidden progress), so this is the only sanctioned way state reaches a phone.
   */
  getViewForPlayer(state: TState, playerId: string): unknown;

  /** The projector view. Safe to show to a whole room. */
  getHostView(state: TState): unknown;

  isComplete(state: TState): boolean;

  getResults(state: TState): GameResults;
}
