import type { GameResults, GameSetup, MiniGame, PlayerScore, SessionPlayer } from "./types";

/**
 * Pair Sprint - the mode that executes the mission instead of describing it.
 *
 * Two strangers who have not met are paired and given the same prompt at the
 * same moment: name three of something. The server compares their answers and
 * scores the overlaps, then shows both lists side by side. The payoff is the
 * "wait, you said that too?" moment, which is a conversation opener that
 * survives the game ending.
 *
 * Everything here is a pure function of its arguments - `now` and `seed` are
 * passed in - so a whole sprint can be driven from a test.
 */

const FIND_MS = 12_000;
const SPRINT_MS = 75_000;
const REVEAL_MS = 14_000;
const SLOTS = 3;
const MAX_ANSWER_LEN = 40;

const ANSWER_POINTS = 60;
/** The whole point of the mode, so it dwarfs merely filling the boxes. */
const OVERLAP_POINTS = 350;
const SWEEP_BONUS = 250;

const COLOURS = ["#c6ff32", "#ff4b1f", "#3d5afe", "#e8e4d8", "#8b8778"];

const PROMPTS = [
  "Name three things that instantly ruin a party",
  "Name three foods that are wildly overrated",
  "Name three things everyone claims to enjoy but doesn't",
  "Name three things you'd smuggle onto a desert island",
  "Name three worst possible icebreaker questions",
  "Name three things this room has too many of",
  "Name three excuses for leaving an event early",
  "Name three objects on your desk right now",
] as const;

export type PairSprintPhase = "find" | "sprint" | "reveal" | "complete";

export type Overlap = { text: string; playerIds: string[] };

export type PairSprintState = {
  phase: PairSprintPhase;
  seed: number;
  colour: string;
  prompt: string;
  slots: number;
  players: SessionPlayer[];
  /** Raw text as typed, so the reveal shows what they actually wrote. */
  answers: Record<string, string[]>;
  overlaps: Overlap[];
  scores: Record<string, number>;
  phaseEndsAt: number;
};

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Two people typing the same idea rarely type the same characters. Lowercase,
 * strip punctuation, drop a leading article, and collapse whitespace so "The
 * Beatles" and "beatles" count as the match they obviously are.
 */
export function normalizeAnswer(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/, "");
}

/** Answers written by more than one member of the pair. */
export function findOverlaps(answers: Record<string, string[]>): Overlap[] {
  const byNormalized = new Map<string, { text: string; playerIds: Set<string> }>();

  for (const [playerId, list] of Object.entries(answers)) {
    // A player repeating themselves must not count as agreeing with themselves.
    const seen = new Set<string>();
    for (const raw of list) {
      const key = normalizeAnswer(raw ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const entry = byNormalized.get(key) ?? { text: raw.trim(), playerIds: new Set<string>() };
      entry.playerIds.add(playerId);
      byNormalized.set(key, entry);
    }
  }

  return [...byNormalized.values()]
    .filter((entry) => entry.playerIds.size > 1)
    .map((entry) => ({ text: entry.text, playerIds: [...entry.playerIds].sort() }));
}

function settle(state: PairSprintState, now: number): PairSprintState {
  const overlaps = findOverlaps(state.answers);
  const scores = { ...state.scores };

  for (const player of state.players) {
    const filled = (state.answers[player.id] ?? []).filter((a) => a && a.trim()).length;
    scores[player.id] = (scores[player.id] ?? 0) + filled * ANSWER_POINTS;
  }

  for (const overlap of overlaps) {
    for (const playerId of overlap.playerIds) {
      scores[playerId] = (scores[playerId] ?? 0) + OVERLAP_POINTS;
    }
  }

  // Matching on every single slot deserves calling out.
  if (overlaps.length >= state.slots) {
    for (const player of state.players) scores[player.id] = (scores[player.id] ?? 0) + SWEEP_BONUS;
  }

  return { ...state, phase: "reveal", overlaps, scores, phaseEndsAt: now + REVEAL_MS };
}

export const pairSprint: MiniGame<PairSprintState> = {
  id: "pair-sprint",
  scope: "party",
  meta: {
    title: "Pair Sprint",
    tagline: "You and one stranger. Same prompt, same moment. Match answers to score.",
    minPlayers: 2,
    maxPlayers: 300,
    estimatedDurationSeconds: 100,
  },

  createInitialState({ players, now, seed }: GameSetup): PairSprintState {
    const roll = rng(seed);
    return {
      phase: "find",
      seed,
      colour: COLOURS[seed % COLOURS.length],
      prompt: PROMPTS[Math.floor(roll() * PROMPTS.length)],
      slots: SLOTS,
      players,
      answers: Object.fromEntries(players.map((p) => [p.id, Array(SLOTS).fill("")])),
      overlaps: [],
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      phaseEndsAt: now + FIND_MS,
    };
  },

  applyInput(state, playerId, input) {
    if (state.phase !== "sprint") return state;
    if (!state.players.some((p) => p.id === playerId)) return state;

    const raw = (input as { type?: unknown; index?: unknown; text?: unknown } | null) ?? {};
    if (raw.type !== "answer") return state;
    if (typeof raw.index !== "number" || !Number.isInteger(raw.index)) return state;
    if (raw.index < 0 || raw.index >= state.slots) return state;
    if (typeof raw.text !== "string") return state;

    const text = raw.text.replace(/\s+/g, " ").trimStart().slice(0, MAX_ANSWER_LEN);
    const current = state.answers[playerId] ?? Array(state.slots).fill("");
    if (current[raw.index] === text) return state; // no-op, so no frame goes out

    const next = [...current];
    next[raw.index] = text;
    return { ...state, answers: { ...state.answers, [playerId]: next } };
  },

  tick(state, now) {
    if (state.phase === "complete") return state;

    if (state.phase === "find") {
      if (now < state.phaseEndsAt) return state;
      return { ...state, phase: "sprint", phaseEndsAt: now + SPRINT_MS };
    }

    if (state.phase === "sprint") {
      const everyoneDone = state.players.every((p) =>
        (state.answers[p.id] ?? []).every((a) => a && a.trim()),
      );
      if (everyoneDone || now >= state.phaseEndsAt) return settle(state, now);
      return state;
    }

    if (state.phase === "reveal" && now >= state.phaseEndsAt) {
      return { ...state, phase: "complete" };
    }

    return state;
  },

  getViewForPlayer(state, playerId) {
    const partners = state.players.filter((p) => p.id !== playerId);
    const mine = state.answers[playerId] ?? [];

    // Before the reveal a player sees only their own answers - seeing the other
    // list would turn a simultaneous sprint into copying.
    const revealed = state.phase === "reveal" || state.phase === "complete";

    return {
      phase: state.phase,
      colour: state.colour,
      prompt: state.prompt,
      slots: state.slots,
      partners: partners.map((p) => ({
        name: p.name,
        // "How many boxes have they filled" is fair game and builds pressure.
        filled: (state.answers[p.id] ?? []).filter((a) => a && a.trim()).length,
        answers: revealed ? (state.answers[p.id] ?? []) : null,
      })),
      findEndsAt: state.phase === "find" ? state.phaseEndsAt : null,
      sprintEndsAt: state.phase === "sprint" ? state.phaseEndsAt : null,
      revealEndsAt: state.phase === "reveal" ? state.phaseEndsAt : null,
      you: {
        answers: mine,
        filled: mine.filter((a) => a && a.trim()).length,
        score: state.scores[playerId] ?? 0,
      },
      overlaps: revealed ? state.overlaps : [],
      matched: revealed ? state.overlaps.filter((o) => o.playerIds.includes(playerId)).length : 0,
    };
  },

  getHostView(state) {
    const names = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
    return {
      phase: state.phase,
      colour: state.colour,
      prompt: state.prompt,
      pair: state.players.map((p) => ({
        playerId: p.id,
        name: p.name,
        filled: (state.answers[p.id] ?? []).filter((a) => a && a.trim()).length,
        score: state.scores[p.id] ?? 0,
      })),
      // What the projector rotates through: the matches found across the room.
      overlaps: state.overlaps.map((o) => ({
        text: o.text,
        names: o.playerIds.map((id) => names[id] ?? "someone"),
      })),
      phaseEndsAt: state.phaseEndsAt,
    };
  },

  onPlayerLeft(state, playerId, now) {
    // Their partner should not sit through 75 seconds alone. Settle on what
    // exists; the leaver keeps whatever they had already banked.
    if (state.phase !== "sprint" && state.phase !== "find") return state;
    if (!state.players.some((p) => p.id === playerId)) return state;
    return settle(state, now);
  },

  isComplete(state) {
    return state.phase === "complete";
  },

  getResults(state): GameResults {
    const scores: PlayerScore[] = state.players
      .map((p) => ({ playerId: p.id, name: p.name, points: state.scores[p.id] ?? 0 }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    const best = state.overlaps[0];
    return {
      scores,
      headline: best
        ? `Both said "${best.text}"`
        : state.overlaps.length === 0 && state.players.length > 1
          ? "Not one answer in common"
          : "Sprint over",
    };
  },
};
