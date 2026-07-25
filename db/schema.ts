import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Durable state for a Bounce room. Keep game rules in `game-store.ts`; this
 * schema intentionally only models the pieces that must survive reloads.
 */
export const gameRooms = sqliteTable(
  "game_rooms",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    hostToken: text("host_token").notNull(),
    scenarioId: text("scenario_id").notNull(),
    status: text("status").notNull().default("lobby"),
    round: integer("round").notNull().default(0),
    phaseStartedAt: integer("phase_started_at"),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("game_rooms_code_unique").on(table.code)],
);

export const gamePlayers = sqliteTable(
  "game_players",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    name: text("name").notNull(),
    playerToken: text("player_token").notNull(),
    role: text("role").notNull(),
    score: integer("score").notNull().default(0),
    lastAction: text("last_action"),
    lastActionAt: integer("last_action_at"),
    joinedAt: integer("joined_at").notNull(),
  },
  (table) => [
    index("game_players_room_score_idx").on(table.roomId, table.score),
    uniqueIndex("game_players_token_unique").on(table.playerToken),
  ],
);

export const gameActions = sqliteTable(
  "game_actions",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    playerId: text("player_id").notNull(),
    round: integer("round").notNull(),
    action: text("action").notNull(),
    points: integer("points").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("game_actions_player_round_unique").on(table.playerId, table.round),
    index("game_actions_room_round_idx").on(table.roomId, table.round),
  ],
);

/**
 * The archive. Live gameplay is owned by the RoomSession Durable Object, which
 * is the strongly-consistent authority for what is happening right now; this
 * table is what survives once the room goes quiet, and what cross-event
 * questions get asked against later.
 *
 * `results` is JSON on purpose: every minigame reports a different shape, and
 * normalising that would mean a migration per game.
 */
export const gameSessions = sqliteTable(
  "game_sessions",
  {
    id: text("id").primaryKey(),
    roomCode: text("room_code").notNull(),
    gameId: text("game_id").notNull(),
    scope: text("scope").notNull(),
    playerCount: integer("player_count").notNull(),
    groupCount: integer("group_count").notNull(),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at").notNull(),
    results: text("results").notNull(),
  },
  (table) => [
    index("game_sessions_room_idx").on(table.roomCode, table.endedAt),
    index("game_sessions_game_idx").on(table.gameId, table.endedAt),
  ],
);

/**
 * Runtime initialization keeps `vinext dev` usable without a separate D1
 * migration command. The checked-in Drizzle migration remains the production
 * source of truth.
 */
export const d1SchemaStatements = [
  `CREATE TABLE IF NOT EXISTS game_rooms (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL,
    host_token TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'lobby',
    round INTEGER NOT NULL DEFAULT 0,
    phase_started_at INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS game_rooms_code_unique ON game_rooms (code)",
  `CREATE TABLE IF NOT EXISTS game_players (
    id TEXT PRIMARY KEY NOT NULL,
    room_id TEXT NOT NULL,
    name TEXT NOT NULL,
    player_token TEXT NOT NULL,
    role TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    last_action TEXT,
    last_action_at INTEGER,
    joined_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS game_players_room_score_idx ON game_players (room_id, score)",
  "CREATE UNIQUE INDEX IF NOT EXISTS game_players_token_unique ON game_players (player_token)",
  `CREATE TABLE IF NOT EXISTS game_actions (
    id TEXT PRIMARY KEY NOT NULL,
    room_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    action TEXT NOT NULL,
    points INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS game_actions_player_round_unique ON game_actions (player_id, round)",
  "CREATE INDEX IF NOT EXISTS game_actions_room_round_idx ON game_actions (room_id, round)",
  `CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    room_code TEXT NOT NULL,
    game_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    player_count INTEGER NOT NULL,
    group_count INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    results TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS game_sessions_room_idx ON game_sessions (room_code, ended_at)",
  "CREATE INDEX IF NOT EXISTS game_sessions_game_idx ON game_sessions (game_id, ended_at)",
] as const;
