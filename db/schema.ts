import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * D1 is the archive, not the live store.
 *
 * Everything moment-to-moment - roster, active game, scores in progress - is
 * owned by the RoomSession Durable Object, which is the strongly-consistent
 * authority while a room is playing. This is what is still here tomorrow.
 *
 * The old game_rooms / game_players / game_actions tables were dropped with the
 * quiz engine they served. game_actions in particular had
 * UNIQUE(player_id, round) over a single TEXT column, which is exactly why that
 * schema could only ever model multiple choice.
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
    /**
     * JSON on purpose: every minigame reports a different results shape, and
     * normalising that would mean a migration per game.
     */
    results: text("results").notNull(),
  },
  (table) => [
    index("game_sessions_room_idx").on(table.roomCode, table.endedAt),
    index("game_sessions_game_idx").on(table.gameId, table.endedAt),
  ],
);

/**
 * Runtime initialization, so a fresh database works without a separate
 * migration step. The Durable Object runs these before its first archive write,
 * since it never goes through any other bootstrap path.
 *
 * The checked-in Drizzle migrations remain the production source of truth;
 * tests/schema-parity.test.mjs asserts these two definitions agree.
 */
export const d1SchemaStatements = [
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
