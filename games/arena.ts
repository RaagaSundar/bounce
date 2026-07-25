import type { GameResults, GameSetup, MiniGame, PlayerScore, SessionPlayer } from "./types";

/**
 * Arena - a real-time top-down shooter. Brawl Stars shaped: move with a thumb
 * stick, tap FIRE, auto-aim picks the nearest enemy. Everyone plays at once on
 * one arena rendered on the big screen.
 *
 * The server owns every position, every bullet, every hit. A phone sends its
 * stick vector and a fire request and nothing else - it cannot assert where it
 * is, who it hit, or that it killed anyone.
 *
 * Timed deathmatch rather than elimination on purpose: nobody sits out watching
 * after thirty seconds, and the match always ends when the clock says so.
 *
 * Pure functions throughout - `now` and `seed` are arguments - so a whole match
 * can be simulated in a test with no sockets.
 */

export const ARENA_W = 1000;
export const ARENA_H = 620;

const MATCH_MS = 90_000;
const COUNTDOWN_MS = 4_000;
const RESPAWN_MS = 1_600;

const PLAYER_R = 22;
const MOVE_SPEED = 250; // units/sec
const MAX_HP = 100;

/**
 * Fast enough that a shot crosses the arena in well under half a second. At
 * 760 the flight time across 800 units was over a second, which a player
 * moving at MOVE_SPEED simply walks out of - a strafing target was untouchable.
 */
const BULLET_SPEED = 1500; // units/sec
const BULLET_R = 9;
const BULLET_DAMAGE = 25;
/**
 * Has to comfortably cross the arena. At 620 two players on opposite sides were
 * 787 units apart, so every shot died in mid-air and firing felt broken.
 */
const BULLET_RANGE = 950;
const FIRE_COOLDOWN_MS = 340;

const KILL_POINTS = 300;
const DAMAGE_POINTS_PER_HIT = 40;

/** Ink & Acid palette, walked by index so neighbours never collide. */
const COLOURS = ["#c6ff32", "#ff4b1f", "#3d5afe", "#e8e4d8", "#8b8778", "#ffd166", "#5be7e0", "#ff6b9d"];

export type ArenaPhase = "countdown" | "live" | "over";

export type Fighter = {
  id: string;
  name: string;
  colour: string;
  x: number;
  y: number;
  /** Stick vector, already clamped to the unit circle. */
  dx: number;
  dy: number;
  /** Facing, used when there is nobody to auto-aim at. */
  aimX: number;
  aimY: number;
  hp: number;
  alive: boolean;
  respawnAt: number;
  kills: number;
  deaths: number;
  hits: number;
  lastFiredAt: number;
};

export type Bullet = {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  travelled: number;
};

export type ArenaState = {
  phase: ArenaPhase;
  seed: number;
  players: SessionPlayer[];
  fighters: Record<string, Fighter>;
  bullets: Bullet[];
  nextBulletId: number;
  /** Server clock of the previous tick, so dt is real elapsed time. */
  lastTick: number;
  startsAt: number;
  endsAt: number;
  feed: string[];
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

/** Spawns spread around a ring so nobody starts inside somebody else. */
function spawnPoint(index: number, total: number, roll: () => number) {
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  const jitter = 0.85 + roll() * 0.3;
  return {
    x: ARENA_W / 2 + Math.cos(angle) * (ARENA_W * 0.33) * jitter,
    y: ARENA_H / 2 + Math.sin(angle) * (ARENA_H * 0.33) * jitter,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Shortest distance from a point to a line segment.
 *
 * Collision has to be swept, not sampled at the bullet's new position: at
 * 760 u/s a bullet advances ~38 units per 50ms tick while the hit radius is
 * only 31, so testing endpoints alone lets bullets tunnel clean through a
 * player. Measured before this: roughly one hit landed out of seventy shots.
 */
function pointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export const arena: MiniGame<ArenaState> = {
  id: "arena",
  scope: "room",
  // 20Hz. Movement and projectiles have to integrate far more often than the
  // 120ms default, or players visibly teleport.
  tickMs: 50,
  meta: {
    title: "Arena",
    tagline: "Move with your thumb, tap to fire. Most kills in 90 seconds wins.",
    minPlayers: 1,
    // Brawl-Stars sized. Beyond this the shared screen stops being readable and
    // the per-tick fan-out stops being cheap.
    maxPlayers: 12,
    estimatedDurationSeconds: 95,
  },

  createInitialState({ players, now, seed }: GameSetup): ArenaState {
    const roll = rng(seed);
    return {
      phase: "countdown",
      seed,
      players,
      fighters: Object.fromEntries(
        players.map((p, i) => {
          const spot = spawnPoint(i, players.length, roll);
          return [
            p.id,
            {
              id: p.id,
              name: p.name,
              colour: COLOURS[i % COLOURS.length],
              x: spot.x,
              y: spot.y,
              dx: 0,
              dy: 0,
              aimX: 1,
              aimY: 0,
              hp: MAX_HP,
              alive: true,
              respawnAt: 0,
              kills: 0,
              deaths: 0,
              hits: 0,
              lastFiredAt: 0,
            } satisfies Fighter,
          ];
        }),
      ),
      bullets: [],
      nextBulletId: 1,
      lastTick: now,
      startsAt: now + COUNTDOWN_MS,
      endsAt: now + COUNTDOWN_MS + MATCH_MS,
      feed: [],
    };
  },

  applyInput(state, playerId, input, now) {
    if (state.phase !== "live") return state;

    const me = state.fighters[playerId];
    if (!me || !me.alive) return state;

    const raw = (input as { type?: unknown; dx?: unknown; dy?: unknown } | null) ?? {};

    if (raw.type === "stick") {
      if (typeof raw.dx !== "number" || typeof raw.dy !== "number") return state;
      if (!Number.isFinite(raw.dx) || !Number.isFinite(raw.dy)) return state;

      // Clamp to the unit circle so a crafted client cannot outrun everyone by
      // sending a stick vector of length 50.
      let dx = clamp(raw.dx, -1, 1);
      let dy = clamp(raw.dy, -1, 1);
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      if (me.dx === dx && me.dy === dy) return state; // no-op

      const aim = len > 0.15 ? { aimX: dx / len, aimY: dy / len } : { aimX: me.aimX, aimY: me.aimY };
      return { ...state, fighters: { ...state.fighters, [playerId]: { ...me, dx, dy, ...aim } } };
    }

    if (raw.type === "fire") {
      // Cooldown is enforced here, not on the phone: holding the button down
      // must not fire faster than everyone else.
      if (now - me.lastFiredAt < FIRE_COOLDOWN_MS) return state;

      // Auto-aim at the nearest living enemy, which is what makes this playable
      // with one thumb. Falls back to facing when the arena is empty.
      let best: Fighter | null = null;
      let bestDist = Infinity;
      for (const other of Object.values(state.fighters)) {
        if (other.id === playerId || !other.alive) continue;
        const d = Math.hypot(other.x - me.x, other.y - me.y);
        if (d < bestDist) {
          bestDist = d;
          best = other;
        }
      }

      let ax = me.aimX;
      let ay = me.aimY;
      if (best) {
        // Lead the target. Aiming at where they are means a moving player just
        // walks out of the shot; aim assist in a mobile shooter aims at where
        // they will be once the bullet arrives.
        const rough = Math.hypot(best.x - me.x, best.y - me.y) || 1;
        const flight = rough / BULLET_SPEED;
        const leadX = best.x + best.dx * MOVE_SPEED * flight;
        const leadY = best.y + best.dy * MOVE_SPEED * flight;

        const d = Math.hypot(leadX - me.x, leadY - me.y) || 1;
        ax = (leadX - me.x) / d;
        ay = (leadY - me.y) / d;
      }

      const bullet: Bullet = {
        id: state.nextBulletId,
        ownerId: playerId,
        x: me.x + ax * (PLAYER_R + 2),
        y: me.y + ay * (PLAYER_R + 2),
        vx: ax * BULLET_SPEED,
        vy: ay * BULLET_SPEED,
        travelled: 0,
      };

      return {
        ...state,
        nextBulletId: state.nextBulletId + 1,
        bullets: [...state.bullets, bullet],
        fighters: { ...state.fighters, [playerId]: { ...me, lastFiredAt: now, aimX: ax, aimY: ay } },
      };
    }

    return state;
  },

  tick(state, now) {
    if (state.phase === "over") return state;

    if (state.phase === "countdown") {
      if (now < state.startsAt) return state;
      return { ...state, phase: "live", lastTick: now };
    }

    // Real elapsed time, capped so a hibernation gap cannot teleport everyone
    // across the arena in one step.
    const dt = Math.min(0.25, Math.max(0, (now - state.lastTick) / 1000));
    if (dt <= 0) return state;

    const fighters: Record<string, Fighter> = {};
    for (const [id, f] of Object.entries(state.fighters)) fighters[id] = { ...f };
    const feed: string[] = [];

    // Movement + respawns.
    for (const f of Object.values(fighters)) {
      if (!f.alive) {
        if (now >= f.respawnAt) {
          const spot = spawnPoint(Math.floor(rng(state.seed + f.deaths)() * 8), 8, rng(now));
          f.alive = true;
          f.hp = MAX_HP;
          f.x = spot.x;
          f.y = spot.y;
          f.dx = 0;
          f.dy = 0;
        }
        continue;
      }
      f.x = clamp(f.x + f.dx * MOVE_SPEED * dt, PLAYER_R, ARENA_W - PLAYER_R);
      f.y = clamp(f.y + f.dy * MOVE_SPEED * dt, PLAYER_R, ARENA_H - PLAYER_R);
    }

    // Bullets: advance, expire, then resolve hits.
    const bullets: Bullet[] = [];
    for (const b of state.bullets) {
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      const travelled = b.travelled + Math.hypot(nx - b.x, ny - b.y);

      if (travelled > BULLET_RANGE || nx < 0 || nx > ARENA_W || ny < 0 || ny > ARENA_H) continue;

      let hitSomeone = false;
      for (const f of Object.values(fighters)) {
        if (!f.alive || f.id === b.ownerId) continue;
        // Swept against the whole step, so fast bullets cannot skip past.
        if (pointToSegment(f.x, f.y, b.x, b.y, nx, ny) > PLAYER_R + BULLET_R) continue;

        hitSomeone = true;
        f.hp -= BULLET_DAMAGE;
        const shooter = fighters[b.ownerId];
        if (shooter) shooter.hits += 1;

        if (f.hp <= 0) {
          f.alive = false;
          f.hp = 0;
          f.deaths += 1;
          f.respawnAt = now + RESPAWN_MS;
          if (shooter) {
            shooter.kills += 1;
            feed.push(`${shooter.name} knocked out ${f.name}`);
          }
        }
        break;
      }

      if (!hitSomeone) bullets.push({ ...b, x: nx, y: ny, travelled });
    }

    const phase: ArenaPhase = now >= state.endsAt ? "over" : "live";

    return {
      ...state,
      phase,
      fighters,
      bullets,
      lastTick: now,
      feed: feed.length ? [...feed.reverse(), ...state.feed].slice(0, 8) : state.feed,
    };
  },

  getViewForPlayer(state, playerId, now) {
    const me = state.fighters[playerId];

    // Everyone is on one shared arena, so positions are public by design - it
    // is rendered on the projector. Coordinates are rounded to keep 20Hz frames
    // small.
    return {
      phase: state.phase,
      w: ARENA_W,
      h: ARENA_H,
      startsIn: state.phase === "countdown" ? Math.max(0, Math.ceil((state.startsAt - now) / 1000)) : 0,
      secondsLeft: Math.max(0, Math.ceil((state.endsAt - now) / 1000)),
      you: me
        ? {
            id: me.id,
            hp: me.hp,
            alive: me.alive,
            kills: me.kills,
            deaths: me.deaths,
            colour: me.colour,
            respawnIn: me.alive ? 0 : Math.max(0, Math.ceil((me.respawnAt - now) / 100) / 10),
            canFire: me.alive && now - me.lastFiredAt >= FIRE_COOLDOWN_MS,
          }
        : null,
      fighters: Object.values(state.fighters).map((f) => ({
        id: f.id,
        name: f.name,
        colour: f.colour,
        x: round1(f.x),
        y: round1(f.y),
        hp: f.hp,
        alive: f.alive,
        kills: f.kills,
      })),
      bullets: state.bullets.map((b) => ({ x: round1(b.x), y: round1(b.y) })),
      feed: state.feed,
    };
  },

  getHostView(state, now) {
    return {
      phase: state.phase,
      w: ARENA_W,
      h: ARENA_H,
      startsIn: state.phase === "countdown" ? Math.max(0, Math.ceil((state.startsAt - now) / 1000)) : 0,
      secondsLeft: Math.max(0, Math.ceil((state.endsAt - now) / 1000)),
      fighters: Object.values(state.fighters).map((f) => ({
        id: f.id,
        name: f.name,
        colour: f.colour,
        x: round1(f.x),
        y: round1(f.y),
        hp: f.hp,
        alive: f.alive,
        kills: f.kills,
        deaths: f.deaths,
      })),
      bullets: state.bullets.map((b) => ({ x: round1(b.x), y: round1(b.y) })),
      feed: state.feed,
      board: Object.values(state.fighters)
        .map((f) => ({ playerId: f.id, name: f.name, colour: f.colour, kills: f.kills, deaths: f.deaths }))
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name)),
    };
  },

  onPlayerLeft(state, playerId) {
    const me = state.fighters[playerId];
    if (!me) return state;
    // Park them off the board so they stop being a target, but keep their score
    // on the leaderboard.
    return {
      ...state,
      fighters: { ...state.fighters, [playerId]: { ...me, alive: false, respawnAt: Infinity, dx: 0, dy: 0 } },
    };
  },

  isComplete(state) {
    return state.phase === "over";
  },

  getResults(state): GameResults {
    const scores: PlayerScore[] = Object.values(state.fighters)
      .map((f) => ({
        playerId: f.id,
        name: f.name,
        points: f.kills * KILL_POINTS + f.hits * DAMAGE_POINTS_PER_HIT,
      }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    const top = Object.values(state.fighters).sort((a, b) => b.kills - a.kills)[0];
    return {
      scores,
      headline: top && top.kills > 0 ? `${top.name} takes it with ${top.kills} knockouts` : "Nobody landed a shot",
    };
  },
};
