import type { GameResults, GameSetup, MiniGame, PlayerScore, SessionPlayer } from "./types";

/**
 * Brawl - a Super Smash Bros style free-for-all, played with thumbs.
 *
 * Every phone is a fighter. Each clash you pick a move and a target, and the
 * server resolves everyone simultaneously on Smash's own triangle:
 *
 *   ATTACK beats GRAB, GRAB beats SHIELD, SHIELD beats ATTACK.
 *
 * Damage accumulates as a percentage exactly like Smash: the more damage you
 * are carrying, the harder the next hit lands, so a fighter on 90% is one
 * clean read away from a KO. Lose all your stocks and you are out. Last
 * fighter standing takes it.
 *
 * No motion, no shaking - it is a fighting game with a d-pad, and the read on
 * your opponent is the whole skill.
 *
 * Pure functions throughout: `now` and `seed` are arguments, never ambient.
 */

const INTRO_MS = 4_000;
const CLASH_MS = 5_000;
const RESOLVE_MS = 3_500;

const STARTING_STOCKS = 2;
const KO_AT = 100;
/** Base damage on a clean read. */
const BASE_DAMAGE = 14;
/** Recoil for losing the read - choosing badly has to cost something. */
const RECOIL_DAMAGE = 6;

const MOVES = ["attack", "grab", "shield"] as const;
export type Move = (typeof MOVES)[number];

/** ATTACK > GRAB > SHIELD > ATTACK. Returns true if `a` beats `b`. */
export function beats(a: Move, b: Move): boolean {
  return (
    (a === "attack" && b === "grab") ||
    (a === "grab" && b === "shield") ||
    (a === "shield" && b === "attack")
  );
}

export type Fighter = {
  id: string;
  name: string;
  /** Damage percentage, Smash style. Resets on KO. */
  damage: number;
  stocks: number;
  out: boolean;
  move: Move | null;
  targetId: string | null;
  kos: number;
};

export type BrawlPhase = "intro" | "clash" | "resolve" | "complete";

export type BrawlState = {
  phase: BrawlPhase;
  round: number;
  seed: number;
  players: SessionPlayer[];
  fighters: Record<string, Fighter>;
  phaseEndsAt: number;
  /** Commentary for the projector, newest first. */
  feed: string[];
  winnerId: string | null;
};

function livingIds(state: BrawlState): string[] {
  return Object.values(state.fighters)
    .filter((f) => !f.out)
    .map((f) => f.id);
}

/** Resolves every declared move at once, then applies KOs. */
function resolveClash(state: BrawlState, now: number): BrawlState {
  const fighters: Record<string, Fighter> = Object.fromEntries(
    Object.entries(state.fighters).map(([id, f]) => [id, { ...f }]),
  );
  const feed: string[] = [];
  const damageDealt: Record<string, number> = {};

  for (const attacker of Object.values(fighters)) {
    if (attacker.out || !attacker.move || !attacker.targetId) continue;
    const target = fighters[attacker.targetId];
    if (!target || target.out || target.id === attacker.id) continue;

    // An undeclared defender is wide open.
    const defence: Move = target.move ?? "grab";

    if (beats(attacker.move, defence)) {
      // Knockback scales with the damage the victim is already carrying.
      const hit = BASE_DAMAGE + Math.floor(target.damage / 8);
      damageDealt[target.id] = (damageDealt[target.id] ?? 0) + hit;
      feed.push(`${attacker.name} ${attacker.move}s ${target.name} for ${hit}%`);
    } else if (beats(defence, attacker.move)) {
      damageDealt[attacker.id] = (damageDealt[attacker.id] ?? 0) + RECOIL_DAMAGE;
      feed.push(`${target.name} reads ${attacker.name}`);
    } else {
      feed.push(`${attacker.name} and ${target.name} clash`);
    }
  }

  for (const [id, amount] of Object.entries(damageDealt)) {
    fighters[id].damage += amount;
  }

  // KOs, plus credit to whoever pushed them over.
  for (const fighter of Object.values(fighters)) {
    if (fighter.out || fighter.damage < KO_AT) continue;

    fighter.stocks -= 1;
    fighter.damage = 0;

    const finisher = Object.values(fighters).find(
      (f) => f.targetId === fighter.id && f.move && !f.out && beats(f.move, state.fighters[fighter.id].move ?? "grab"),
    );
    if (finisher && finisher.id !== fighter.id) finisher.kos += 1;

    if (fighter.stocks <= 0) {
      fighter.out = true;
      feed.push(`${fighter.name} is OUT`);
    } else {
      feed.push(`${fighter.name} loses a stock - ${fighter.stocks} left`);
    }
  }

  // Clear declarations for the next clash.
  for (const fighter of Object.values(fighters)) {
    fighter.move = null;
    fighter.targetId = null;
  }

  return {
    ...state,
    phase: "resolve",
    fighters,
    feed: [...feed.reverse(), ...state.feed].slice(0, 12),
    phaseEndsAt: now + RESOLVE_MS,
  };
}

export const brawl: MiniGame<BrawlState> = {
  id: "brawl",
  scope: "room",
  meta: {
    title: "Brawl",
    tagline: "Pick a target, read their move. Attack beats grab, grab beats shield, shield beats attack.",
    minPlayers: 2,
    maxPlayers: 300,
    estimatedDurationSeconds: 150,
  },

  createInitialState({ players, now, seed }: GameSetup): BrawlState {
    return {
      phase: "intro",
      round: 1,
      seed,
      players,
      fighters: Object.fromEntries(
        players.map((p) => [
          p.id,
          { id: p.id, name: p.name, damage: 0, stocks: STARTING_STOCKS, out: false, move: null, targetId: null, kos: 0 },
        ]),
      ),
      phaseEndsAt: now + INTRO_MS,
      feed: [],
      winnerId: null,
    };
  },

  applyInput(state, playerId, input) {
    if (state.phase !== "clash") return state;

    const me = state.fighters[playerId];
    if (!me || me.out) return state;

    const raw = (input as { type?: unknown; move?: unknown; targetId?: unknown } | null) ?? {};
    if (raw.type !== "move") return state;
    if (typeof raw.move !== "string" || !MOVES.includes(raw.move as Move)) return state;
    if (typeof raw.targetId !== "string") return state;

    // You cannot hit yourself, and you cannot hit someone already out.
    const target = state.fighters[raw.targetId];
    if (!target || target.out || target.id === playerId) return state;

    if (me.move === raw.move && me.targetId === raw.targetId) return state; // no-op

    return {
      ...state,
      fighters: { ...state.fighters, [playerId]: { ...me, move: raw.move as Move, targetId: raw.targetId } },
    };
  },

  tick(state, now) {
    if (state.phase === "complete") return state;

    if (state.phase === "intro") {
      if (now < state.phaseEndsAt) return state;
      return { ...state, phase: "clash", phaseEndsAt: now + CLASH_MS };
    }

    if (state.phase === "clash") {
      const alive = livingIds(state);
      const declared = alive.filter((id) => state.fighters[id].move);
      if (declared.length === alive.length || now >= state.phaseEndsAt) {
        return resolveClash(state, now);
      }
      return state;
    }

    if (state.phase === "resolve") {
      if (now < state.phaseEndsAt) return state;

      const alive = livingIds(state);
      if (alive.length <= 1) {
        return { ...state, phase: "complete", winnerId: alive[0] ?? null };
      }
      return { ...state, phase: "clash", round: state.round + 1, phaseEndsAt: now + CLASH_MS };
    }

    return state;
  },

  getViewForPlayer(state, playerId) {
    const me = state.fighters[playerId];

    return {
      phase: state.phase,
      round: state.round,
      phaseEndsAt: state.phaseEndsAt,
      you: me
        ? {
            damage: me.damage,
            stocks: me.stocks,
            out: me.out,
            kos: me.kos,
            // Deliberately echoed back so the phone can show what is locked in.
            move: me.move,
            targetId: me.targetId,
            won: state.winnerId === playerId,
          }
        : null,
      // Opponent moves are hidden during the clash - reading them is the game.
      targets: Object.values(state.fighters)
        .filter((f) => f.id !== playerId && !f.out)
        .map((f) => ({ id: f.id, name: f.name, damage: f.damage, stocks: f.stocks })),
      feed: state.feed,
      winner: state.winnerId ? (state.fighters[state.winnerId]?.name ?? null) : null,
    };
  },

  getHostView(state) {
    return {
      phase: state.phase,
      round: state.round,
      phaseEndsAt: state.phaseEndsAt,
      fighters: Object.values(state.fighters)
        .map((f) => ({
          playerId: f.id,
          name: f.name,
          damage: f.damage,
          stocks: f.stocks,
          out: f.out,
          kos: f.kos,
          // Locked-in state only, never the move itself, since the projector
          // faces the players.
          ready: Boolean(f.move),
        }))
        .sort((a, b) => Number(a.out) - Number(b.out) || b.stocks - a.stocks || a.damage - b.damage),
      feed: state.feed,
      winner: state.winnerId ? (state.fighters[state.winnerId]?.name ?? null) : null,
    };
  },

  onPlayerLeft(state, playerId) {
    const me = state.fighters[playerId];
    if (!me || me.out || state.phase === "complete") return state;
    // Walking away forfeits your remaining stocks rather than stalling clashes.
    return {
      ...state,
      fighters: { ...state.fighters, [playerId]: { ...me, out: true, stocks: 0, move: null, targetId: null } },
      feed: [`${me.name} left the arena`, ...state.feed].slice(0, 12),
    };
  },

  isComplete(state) {
    return state.phase === "complete";
  },

  getResults(state): GameResults {
    const scores: PlayerScore[] = Object.values(state.fighters)
      .map((f) => ({
        playerId: f.id,
        name: f.name,
        // KOs are the real currency; surviving stocks break ties.
        points: f.kos * 500 + f.stocks * 200 + (state.winnerId === f.id ? 750 : 0),
      }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    const winner = state.winnerId ? state.fighters[state.winnerId]?.name : null;
    return { scores, headline: winner ? `${winner} wins the brawl` : "Everybody fell off" };
  },
};
