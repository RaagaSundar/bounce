import type { GameResults, GameSetup, MiniGame, PlayerScore, SessionPlayer } from "./types";

/**
 * Crossfire - a prompt duel. Everyone privately writes an answer to the same
 * prompt, the answers appear anonymised on the big screen, everyone votes for
 * a favourite that is not their own, and the winning author is revealed with
 * the points.
 *
 * The social job is different from the other modes: it is not about meeting one
 * person, it is about giving a whole room something to react to together. The
 * reveal is what people talk about afterwards.
 *
 * Pure functions throughout - `now` and `seed` are arguments, never read
 * ambiently - so a full match is testable without a Durable Object.
 */

const WRITE_MS = 45_000;
const VOTE_MS = 30_000;
const REVEAL_MS = 12_000;
const TOTAL_ROUNDS = 2;
const MAX_ANSWER_LEN = 100;

const WRITE_POINTS = 50;
const VOTE_POINTS = 300;
const TOP_BONUS = 400;

const PROMPTS = [
  "The worst possible icebreaker line",
  "What this room's energy actually is right now",
  "A terrible name for a startup in this building",
  "The real reason you came tonight",
  "Something you should never say in a lift",
  "The worst superpower to have at a party",
  "A rejected slogan for this event",
  "What the wifi password probably is",
] as const;

export type CrossfirePhase = "writing" | "voting" | "reveal" | "complete";

/** An answer on the ballot. `authorId` is server-side only until the reveal. */
export type Ballot = { id: string; text: string; authorId: string };

export type RoundResult = {
  round: number;
  prompt: string;
  winner: { name: string; text: string; votes: number } | null;
};

export type CrossfireState = {
  phase: CrossfirePhase;
  round: number;
  totalRounds: number;
  seed: number;
  prompt: string;
  players: SessionPlayer[];
  answers: Record<string, string>;
  ballot: Ballot[];
  /** voterId -> ballot id */
  votes: Record<string, string>;
  scores: Record<string, number>;
  phaseEndsAt: number;
  lastRound: RoundResult | null;
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

function promptFor(seed: number, round: number): string {
  return PROMPTS[Math.floor(rng(seed + round * 6151)() * PROMPTS.length)];
}

/**
 * Builds the ballot, shuffled so display order does not track join order - that
 * would make authorship guessable from position alone.
 */
function buildBallot(state: CrossfireState, now: number): CrossfireState {
  const roll = rng(state.seed + state.round * 104729);
  const entries: Ballot[] = Object.entries(state.answers)
    .filter(([, text]) => text.trim())
    .map(([authorId, text], index) => ({ id: `a${index}`, text: text.trim(), authorId }));

  for (let i = entries.length - 1; i > 0; i -= 1) {
    const j = Math.floor(roll() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }

  // Nothing to vote on: skip straight to the reveal rather than showing an
  // empty ballot and a dead 30 second timer.
  if (entries.length < 2) {
    return settle({ ...state, ballot: entries }, now);
  }

  return { ...state, phase: "voting", ballot: entries, votes: {}, phaseEndsAt: now + VOTE_MS };
}

function settle(state: CrossfireState, now: number): CrossfireState {
  const tally = new Map<string, number>();
  for (const ballotId of Object.values(state.votes)) {
    tally.set(ballotId, (tally.get(ballotId) ?? 0) + 1);
  }

  const scores = { ...state.scores };
  for (const [authorId, text] of Object.entries(state.answers)) {
    if (text.trim()) scores[authorId] = (scores[authorId] ?? 0) + WRITE_POINTS;
  }
  for (const entry of state.ballot) {
    const votes = tally.get(entry.id) ?? 0;
    if (votes) scores[entry.authorId] = (scores[entry.authorId] ?? 0) + votes * VOTE_POINTS;
  }

  const ranked = [...state.ballot].sort((a, b) => (tally.get(b.id) ?? 0) - (tally.get(a.id) ?? 0));
  const top = ranked[0];
  const topVotes = top ? (tally.get(top.id) ?? 0) : 0;
  if (top && topVotes > 0) scores[top.authorId] = (scores[top.authorId] ?? 0) + TOP_BONUS;

  const winnerName = top ? state.players.find((p) => p.id === top.authorId)?.name : undefined;

  return {
    ...state,
    phase: "reveal",
    scores,
    phaseEndsAt: now + REVEAL_MS,
    lastRound: {
      round: state.round,
      prompt: state.prompt,
      winner:
        top && topVotes > 0 && winnerName
          ? { name: winnerName, text: top.text, votes: topVotes }
          : null,
    },
  };
}

function startRound(state: CrossfireState, round: number, now: number): CrossfireState {
  return {
    ...state,
    phase: "writing",
    round,
    prompt: promptFor(state.seed, round),
    answers: {},
    ballot: [],
    votes: {},
    phaseEndsAt: now + WRITE_MS,
  };
}

export const crossfire: MiniGame<CrossfireState> = {
  id: "crossfire",
  scope: "room",
  meta: {
    title: "Crossfire",
    tagline: "Same prompt, everyone writes. Best answer wins — and gets unmasked.",
    minPlayers: 2,
    maxPlayers: 300,
    estimatedDurationSeconds: 180,
  },

  createInitialState({ players, now, seed }: GameSetup): CrossfireState {
    const base: CrossfireState = {
      phase: "writing",
      round: 1,
      totalRounds: TOTAL_ROUNDS,
      seed,
      prompt: promptFor(seed, 1),
      players,
      answers: {},
      ballot: [],
      votes: {},
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      phaseEndsAt: now,
      lastRound: null,
    };
    return startRound(base, 1, now);
  },

  applyInput(state, playerId, input) {
    if (!state.players.some((p) => p.id === playerId)) return state;
    const raw = (input as { type?: unknown; text?: unknown; answerId?: unknown } | null) ?? {};

    if (state.phase === "writing" && raw.type === "answer") {
      if (typeof raw.text !== "string") return state;
      const text = raw.text.replace(/\s+/g, " ").trimStart().slice(0, MAX_ANSWER_LEN);
      if (state.answers[playerId] === text) return state;
      return { ...state, answers: { ...state.answers, [playerId]: text } };
    }

    if (state.phase === "voting" && raw.type === "vote") {
      if (typeof raw.answerId !== "string") return state;
      const target = state.ballot.find((entry) => entry.id === raw.answerId);
      if (!target) return state;
      // Voting for yourself is the obvious exploit, so the server refuses it
      // rather than trusting the client to hide the button.
      if (target.authorId === playerId) return state;
      if (state.votes[playerId] === target.id) return state;
      return { ...state, votes: { ...state.votes, [playerId]: target.id } };
    }

    return state;
  },

  tick(state, now) {
    if (state.phase === "complete") return state;

    if (state.phase === "writing") {
      const written = state.players.filter((p) => (state.answers[p.id] ?? "").trim()).length;
      if (written === state.players.length || now >= state.phaseEndsAt) {
        return buildBallot(state, now);
      }
      return state;
    }

    if (state.phase === "voting") {
      // Someone whose answer is the only one they could not vote for still gets
      // to vote, so everyone eligible is simply everyone.
      const voted = state.players.filter((p) => state.votes[p.id]).length;
      if (voted >= state.players.length || now >= state.phaseEndsAt) return settle(state, now);
      return state;
    }

    if (state.phase === "reveal" && now >= state.phaseEndsAt) {
      if (state.round >= state.totalRounds) return { ...state, phase: "complete" };
      return startRound(state, state.round + 1, now);
    }

    return state;
  },

  getViewForPlayer(state, playerId) {
    const revealed = state.phase === "reveal" || state.phase === "complete";

    return {
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      prompt: state.prompt,
      phaseEndsAt: state.phaseEndsAt,
      you: {
        answer: state.answers[playerId] ?? "",
        submitted: Boolean((state.answers[playerId] ?? "").trim()),
        votedFor: state.votes[playerId] ?? null,
        score: state.scores[playerId] ?? 0,
      },
      // authorId is deliberately stripped: the whole game is that you do not
      // know whose answer you are voting for until the reveal.
      ballot: state.ballot.map((entry) => ({
        id: entry.id,
        text: entry.text,
        mine: entry.authorId === playerId,
        author: revealed ? (state.players.find((p) => p.id === entry.authorId)?.name ?? null) : null,
      })),
      writtenCount: state.players.filter((p) => (state.answers[p.id] ?? "").trim()).length,
      votedCount: Object.keys(state.votes).length,
      playerCount: state.players.length,
      lastRound: state.lastRound,
    };
  },

  getHostView(state) {
    const revealed = state.phase === "reveal" || state.phase === "complete";
    const tally = new Map<string, number>();
    for (const ballotId of Object.values(state.votes)) {
      tally.set(ballotId, (tally.get(ballotId) ?? 0) + 1);
    }

    return {
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      prompt: state.prompt,
      phaseEndsAt: state.phaseEndsAt,
      // The projector shows the ballot to the whole room, so authorship stays
      // hidden here too until the reveal.
      ballot: state.ballot.map((entry) => ({
        id: entry.id,
        text: entry.text,
        votes: revealed ? (tally.get(entry.id) ?? 0) : 0,
        author: revealed ? (state.players.find((p) => p.id === entry.authorId)?.name ?? null) : null,
      })),
      writtenCount: state.players.filter((p) => (state.answers[p.id] ?? "").trim()).length,
      votedCount: Object.keys(state.votes).length,
      playerCount: state.players.length,
      lastRound: state.lastRound,
      board: state.players
        .map((p) => ({ playerId: p.id, name: p.name, score: state.scores[p.id] ?? 0 }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    };
  },

  onPlayerLeft(state, playerId) {
    // Drop them from the counts that gate a phase, so a closed tab cannot hold
    // the whole room in a writing phase until the timer runs out.
    if (state.phase === "complete") return state;
    if (!state.players.some((p) => p.id === playerId)) return state;
    return { ...state, players: state.players.filter((p) => p.id !== playerId) };
  },

  isComplete(state) {
    return state.phase === "complete";
  },

  getResults(state): GameResults {
    const scores: PlayerScore[] = state.players
      .map((p) => ({ playerId: p.id, name: p.name, points: state.scores[p.id] ?? 0 }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    const winner = state.lastRound?.winner;
    return {
      scores,
      headline: winner ? `"${winner.text}" — ${winner.name}` : "Nobody landed a punch",
    };
  },
};
