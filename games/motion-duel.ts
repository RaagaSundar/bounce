import type { GameResults, GameSetup, MiniGame, PlayerScore, SessionPlayer } from "./types";

/**
 * Motion Duel - the flagship. A "party" scope game: the roster is split into
 * pairs who have not met yet, and each pair runs its own private duel.
 *
 * Inspired by the jostling mechanic in Johann Sebastian Joust, with two
 * deliberate departures:
 *
 * 1. It is non-contact. The original works because a PlayStation Move is a
 *    rugged controller with a wrist strap; asking strangers to jostle each
 *    other while holding their own phone is how screens get cracked. Here you
 *    win by holding *your own* phone steadier, not by shoving anyone.
 * 2. Opponents are assigned rather than a free-for-all, so the game forces
 *    contact with one specific stranger. A free-for-all is high energy but you
 *    can finish a round without learning a single name.
 *
 * The phone screen is the "light": each pair is given a colour, and finding
 * your opponent means finding the other phone glowing the same colour.
 *
 * Trust note: motion magnitude necessarily originates on the client, since the
 * accelerometer lives there. The server clamps it to a sane range and remains
 * the sole authority for elimination, scoring and timing - but a determined
 * cheater could under-report movement. That is an accepted trade for a party
 * game; nothing else in the system trusts the client.
 */

const FIND_MS = 12_000;
const DUEL_MS = 45_000;
const RESULT_MS = 6_000;

/** Above this, you flinched. Pulses over time so the tension rises and falls. */
const BASE_THRESHOLD = 2.6;
const THRESHOLD_SWING = 1.5;
const PULSE_PERIOD_MS = 7_000;
/** Accelerometer readings are clamped here before the server believes them. */
const MAX_CREDIBLE_MAGNITUDE = 60;

const WIN_POINTS = 500;
const SURVIVAL_POINTS_PER_SEC = 10;

/** Pair colours, drawn from the Ink & Acid palette. */
const COLOURS = ["#c6ff32", "#ff4b1f", "#3d5afe", "#e8e4d8", "#8b8778"];

export type MotionDuelPhase = "find" | "steady" | "result" | "complete";

export type DuelPlayer = {
  id: string;
  name: string;
  /** Cumulative movement; the tiebreak when nobody flinches. */
  wobble: number;
  out: boolean;
  outAt: number | null;
};

export type MotionDuelState = {
  phase: MotionDuelPhase;
  seed: number;
  colour: string;
  players: SessionPlayer[];
  duellists: Record<string, DuelPlayer>;
  startedAt: number;
  phaseEndsAt: number;
  winnerId: string | null;
  scores: Record<string, number>;
};

/** Sensitivity at a moment in the duel. Lower threshold = twitchier. */
export function thresholdAt(elapsedMs: number): number {
  const pulse = Math.sin((elapsedMs / PULSE_PERIOD_MS) * Math.PI * 2);
  return BASE_THRESHOLD + THRESHOLD_SWING * pulse;
}

function settle(state: MotionDuelState, now: number, winnerId: string | null): MotionDuelState {
  const scores = { ...state.scores };

  for (const duellist of Object.values(state.duellists)) {
    const survivedMs = duellist.outAt === null ? now - state.startedAt : duellist.outAt - state.startedAt;
    scores[duellist.id] =
      (scores[duellist.id] ?? 0) +
      Math.round((Math.max(0, survivedMs) / 1000) * SURVIVAL_POINTS_PER_SEC) +
      (duellist.id === winnerId ? WIN_POINTS : 0);
  }

  return { ...state, phase: "result", winnerId, phaseEndsAt: now + RESULT_MS, scores };
}

export const motionDuel: MiniGame<MotionDuelState> = {
  id: "motion-duel",
  scope: "party",
  meta: {
    title: "Motion Duel",
    tagline: "Find the phone glowing your colour. Hold steadier than they do.",
    minPlayers: 2,
    maxPlayers: 300,
    estimatedDurationSeconds: 70,
  },

  createInitialState({ players, now, seed }: GameSetup): MotionDuelState {
    return {
      phase: "find",
      seed,
      colour: COLOURS[seed % COLOURS.length],
      players,
      duellists: Object.fromEntries(
        players.map((p) => [p.id, { id: p.id, name: p.name, wobble: 0, out: false, outAt: null }]),
      ),
      startedAt: now + FIND_MS,
      phaseEndsAt: now + FIND_MS,
      winnerId: null,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    };
  },

  applyInput(state, playerId, input, now) {
    if (state.phase !== "steady") return state;

    const me = state.duellists[playerId];
    if (!me || me.out) return state;

    const raw = (input as { type?: unknown; magnitude?: unknown } | null) ?? {};
    if (raw.type !== "motion" || typeof raw.magnitude !== "number" || !Number.isFinite(raw.magnitude)) {
      return state;
    }

    // Never trust the reported number outright.
    const magnitude = Math.min(Math.abs(raw.magnitude), MAX_CREDIBLE_MAGNITUDE);
    const limit = thresholdAt(now - state.startedAt);

    const updated: DuelPlayer = {
      ...me,
      wobble: me.wobble + magnitude,
      out: magnitude > limit,
      outAt: magnitude > limit ? now : null,
    };

    return { ...state, duellists: { ...state.duellists, [playerId]: updated } };
  },

  tick(state, now) {
    if (state.phase === "complete" || state.phase === "result") {
      if (state.phase === "result" && now >= state.phaseEndsAt) {
        return { ...state, phase: "complete" };
      }
      return state;
    }

    if (state.phase === "find") {
      if (now < state.phaseEndsAt) return state;
      return { ...state, phase: "steady", startedAt: now, phaseEndsAt: now + DUEL_MS };
    }

    // steady
    const alive = Object.values(state.duellists).filter((d) => !d.out);

    if (alive.length <= 1) {
      return settle(state, now, alive[0]?.id ?? null);
    }

    if (now >= state.phaseEndsAt) {
      // Nobody flinched: steadiest hand overall takes it.
      const steadiest = [...alive].sort((a, b) => a.wobble - b.wobble)[0];
      return settle(state, now, steadiest?.id ?? null);
    }

    return state;
  },

  getViewForPlayer(state, playerId, now) {
    const me = state.duellists[playerId];
    const opponents = Object.values(state.duellists)
      .filter((d) => d.id !== playerId)
      .map((d) => ({ name: d.name, out: d.out }));

    return {
      phase: state.phase,
      colour: state.colour,
      // Naming the opponent is the whole point: it is what turns the duel into
      // an introduction.
      opponents,
      findEndsAt: state.phase === "find" ? state.phaseEndsAt : null,
      duelEndsAt: state.phase === "steady" ? state.phaseEndsAt : null,
      threshold: state.phase === "steady" ? +thresholdAt(now - state.startedAt).toFixed(2) : null,
      you: {
        out: me?.out ?? false,
        wobble: me ? Math.round(me.wobble) : 0,
        score: state.scores[playerId] ?? 0,
        won: state.winnerId === playerId,
      },
      winner: state.winnerId ? state.duellists[state.winnerId]?.name ?? null : null,
    };
  },

  getHostView(state) {
    return {
      phase: state.phase,
      colour: state.colour,
      duellists: Object.values(state.duellists).map((d) => ({
        playerId: d.id,
        name: d.name,
        out: d.out,
        wobble: Math.round(d.wobble),
        score: state.scores[d.id] ?? 0,
      })),
      winner: state.winnerId ? state.duellists[state.winnerId]?.name ?? null : null,
    };
  },

  onPlayerLeft(state, playerId, now) {
    // A duellist who walks away forfeits, so their opponent is not left holding
    // a phone still for 45 seconds against nobody.
    const me = state.duellists[playerId];
    if (!me || me.out || state.phase === "result" || state.phase === "complete") return state;

    return {
      ...state,
      duellists: { ...state.duellists, [playerId]: { ...me, out: true, outAt: now } },
    };
  },

  isComplete(state) {
    return state.phase === "complete";
  },

  getResults(state): GameResults {
    const scores: PlayerScore[] = state.players
      .map((p) => ({ playerId: p.id, name: p.name, points: state.scores[p.id] ?? 0 }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    const winner = state.winnerId ? state.duellists[state.winnerId]?.name : null;
    return {
      scores,
      headline: winner ? `${winner} held steadiest` : "A dead heat",
    };
  },
};
