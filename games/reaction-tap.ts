import type {
  GameResults,
  GameSetup,
  MiniGame,
  PlayerScore,
  SessionPlayer,
} from "./types";

/**
 * Reaction Tap - NOT IN ROTATION. Deliberately cut from games/catalog.ts:
 * every shipped mode has to force two specific people to interact, and a
 * solo-playable leaderboard does not. Kept because it is the smallest complete
 * MiniGame, so it is the reference for writing a new one, and its tests pin the
 * interface contract (tick's same-reference rule, view leak-proofing).
 *
 * The simplest possible game, and the one where the difference between 1300ms
 * polling and a real socket push is most obvious.
 *
 * A GO appears at an unpredictable moment; everyone taps; the server ranks by
 * arrival time. Tapping before GO is a false start and scores nothing, so it is
 * "fastest without jumping the gun" rather than pure mashing.
 *
 * Everyone in the room is on the same venue wifi hitting the same Cloudflare
 * edge, so ordering by server arrival time is genuinely fair here.
 *
 * This module has no runtime imports on purpose: the type import above is
 * erased, so tests can load it directly under node --test.
 */

const ARMING_MS = 3_000;
const REVEAL_MS = 5_000;
const MIN_WAIT_MS = 1_500;
const MAX_WAIT_MS = 5_000;
const LIVE_TIMEOUT_MS = 4_000;
const TOTAL_ROUNDS = 3;

// Scoring. Tapping at all is worth something; speed is the real prize.
const TAP_BASE_POINTS = 100;
const MAX_SPEED_POINTS = 800;
const RANK_BONUS = [300, 200, 100];

export type ReactionTapPhase = "arming" | "waiting" | "live" | "reveal" | "complete";

export type Tap = {
  reactionMs: number;
  rank: number;
  points: number;
};

export type RoundSummary = {
  round: number;
  winner: { playerId: string; name: string; reactionMs: number } | null;
  falseStarts: string[];
};

export type ReactionTapState = {
  phase: ReactionTapPhase;
  round: number;
  totalRounds: number;
  seed: number;
  players: SessionPlayer[];
  scores: Record<string, number>;
  /** End of the current purely timed phase (arming / reveal). */
  phaseEndsAt: number;
  /** Server time the GO fires. Never sent to a client before it does. */
  goAt: number;
  taps: Record<string, Tap>;
  falseStarts: string[];
  /** Left the room. Kept out of the "has everyone tapped?" check. */
  absent: string[];
  lastRound: RoundSummary | null;
};

/** mulberry32 - small, fast, and deterministic for a given seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Suspense delay for a round, derived from the seed so runs are reproducible. */
function waitFor(seed: number, round: number): number {
  const roll = rng(seed + round * 7919)();
  return Math.round(MIN_WAIT_MS + roll * (MAX_WAIT_MS - MIN_WAIT_MS));
}

function armRound(state: ReactionTapState, round: number, now: number): ReactionTapState {
  return {
    ...state,
    phase: "arming",
    round,
    phaseEndsAt: now + ARMING_MS,
    goAt: now + ARMING_MS + waitFor(state.seed, round),
    taps: {},
    falseStarts: [],
  };
}

/**
 * True once the GO moment has passed, even if `tick` has not run yet. Without
 * this, a player fast enough to tap inside the tick interval would be scored as
 * a false start purely because of tick granularity.
 */
function isLive(state: ReactionTapState, now: number): boolean {
  return (state.phase === "live" || state.phase === "waiting") && now >= state.goAt;
}

function scoreFor(reactionMs: number, rank: number): number {
  const speed = Math.max(0, MAX_SPEED_POINTS - Math.round(reactionMs));
  return TAP_BASE_POINTS + speed + (RANK_BONUS[rank - 1] ?? 0);
}

/** Banks this round's taps into cumulative scores and records the summary. */
function settleRound(state: ReactionTapState, now: number): ReactionTapState {
  const scores = { ...state.scores };
  for (const [playerId, tap] of Object.entries(state.taps)) {
    scores[playerId] = (scores[playerId] ?? 0) + tap.points;
  }

  const fastest = Object.entries(state.taps).sort((a, b) => a[1].rank - b[1].rank)[0];
  const winner = fastest
    ? {
        playerId: fastest[0],
        name: state.players.find((p) => p.id === fastest[0])?.name ?? "Someone",
        reactionMs: fastest[1].reactionMs,
      }
    : null;

  return {
    ...state,
    phase: "reveal",
    scores,
    phaseEndsAt: now + REVEAL_MS,
    lastRound: { round: state.round, winner, falseStarts: state.falseStarts },
  };
}

export const reactionTap: MiniGame<ReactionTapState> = {
  id: "reaction-tap",
  scope: "room",
  meta: {
    title: "Reaction Tap",
    tagline: "Watch the big screen. Tap the instant it flips. Don't jump early.",
    minPlayers: 1,
    maxPlayers: 300,
    estimatedDurationSeconds: 60,
  },

  createInitialState({ players, now, seed }: GameSetup): ReactionTapState {
    const base: ReactionTapState = {
      phase: "arming",
      round: 1,
      totalRounds: TOTAL_ROUNDS,
      seed,
      players,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      phaseEndsAt: now,
      goAt: now,
      taps: {},
      falseStarts: [],
      absent: [],
      lastRound: null,
    };
    return armRound(base, 1, now);
  },

  applyInput(state, playerId, input, now) {
    const type = (input as { type?: unknown } | null)?.type;
    if (type !== "tap") return state;
    if (!state.players.some((p) => p.id === playerId)) return state;

    // One shot per round, and a false start locks you out of it.
    if (state.taps[playerId] || state.falseStarts.includes(playerId)) return state;

    if (isLive(state, now)) {
      const rank = Object.keys(state.taps).length + 1;
      const reactionMs = Math.max(0, now - state.goAt);
      return {
        ...state,
        taps: {
          ...state.taps,
          [playerId]: { reactionMs, rank, points: scoreFor(reactionMs, rank) },
        },
      };
    }

    if (state.phase === "waiting" || state.phase === "arming") {
      return { ...state, falseStarts: [...state.falseStarts, playerId] };
    }

    return state;
  },

  tick(state, now) {
    if (state.phase === "complete") return state;

    if (state.phase === "arming" && now >= state.phaseEndsAt) {
      return { ...state, phase: "waiting" };
    }

    if (state.phase === "waiting" && now >= state.goAt) {
      return { ...state, phase: "live" };
    }

    if (state.phase === "live") {
      const eligible = state.players.filter(
        (p) => !state.falseStarts.includes(p.id) && !state.absent.includes(p.id),
      );
      const everyoneTapped =
        eligible.length > 0 && eligible.every((p) => Boolean(state.taps[p.id]));
      if (everyoneTapped || now >= state.goAt + LIVE_TIMEOUT_MS) {
        return settleRound(state, now);
      }
      return state;
    }

    if (state.phase === "reveal" && now >= state.phaseEndsAt) {
      if (state.round >= state.totalRounds) return { ...state, phase: "complete" };
      return armRound(state, state.round + 1, now);
    }

    return state;
  },

  getViewForPlayer(state, playerId) {
    const tap = state.taps[playerId] ?? null;
    return {
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      // Deliberately omits goAt while waiting: sending it would let a client
      // schedule a perfect tap instead of reacting.
      armingEndsAt: state.phase === "arming" ? state.phaseEndsAt : null,
      liveSince: state.phase === "live" || state.phase === "reveal" ? state.goAt : null,
      revealEndsAt: state.phase === "reveal" ? state.phaseEndsAt : null,
      you: {
        tapped: Boolean(tap),
        reactionMs: tap?.reactionMs ?? null,
        rank: tap?.rank ?? null,
        roundPoints: tap?.points ?? 0,
        falseStart: state.falseStarts.includes(playerId),
        score: state.scores[playerId] ?? 0,
      },
      tapsIn: Object.keys(state.taps).length,
      playerCount: state.players.length,
      lastRound: state.lastRound,
    };
  },

  getHostView(state) {
    const board = state.players
      .map((player) => {
        const tap = state.taps[player.id];
        return {
          playerId: player.id,
          name: player.name,
          score: state.scores[player.id] ?? 0,
          reactionMs: tap?.reactionMs ?? null,
          rank: tap?.rank ?? null,
          falseStart: state.falseStarts.includes(player.id),
        };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    return {
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      armingEndsAt: state.phase === "arming" ? state.phaseEndsAt : null,
      liveSince: state.phase === "live" || state.phase === "reveal" ? state.goAt : null,
      revealEndsAt: state.phase === "reveal" ? state.phaseEndsAt : null,
      tapsIn: Object.keys(state.taps).length,
      playerCount: state.players.length,
      lastRound: state.lastRound,
      board,
    };
  },

  onPlayerLeft(state, playerId) {
    // They keep their banked score and stay on the leaderboard; they just stop
    // holding up the round everyone else is waiting to finish.
    if (state.absent.includes(playerId)) return state;
    return { ...state, absent: [...state.absent, playerId] };
  },

  isComplete(state) {
    return state.phase === "complete";
  },

  getResults(state): GameResults {
    const scores: PlayerScore[] = state.players
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        points: state.scores[player.id] ?? 0,
      }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    const top = scores[0];
    return {
      scores,
      headline: top && top.points > 0 ? `${top.name} has the fastest thumbs in the room` : "Nobody tapped in time",
    };
  },
};
