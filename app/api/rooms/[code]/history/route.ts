import { getD1 } from "../../../../../db/index";
import { normalizeRoomCode } from "../../../../../db/game-store";
import { json, roomCodeFrom, routeError } from "../../../_game";

/**
 * Every finished game in a room, newest first - the recap / leaderboard read.
 *
 * Live play runs over the socket; this is the archive side, so it is REST on
 * purpose. Nothing here is needed moment-to-moment.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> | { code: string } },
) {
  try {
    const code = normalizeRoomCode(await roomCodeFrom(context));
    const db = getD1();
    if (!db) return json({ sessions: [] });

    const { results } = await db
      .prepare(
        `SELECT id, game_id, scope, player_count, group_count, started_at, ended_at, results
           FROM game_sessions
          WHERE room_code = ?
          ORDER BY ended_at DESC
          LIMIT 50`,
      )
      .bind(code)
      .all<{
        id: string;
        game_id: string;
        scope: string;
        player_count: number;
        group_count: number;
        started_at: number;
        ended_at: number;
        results: string;
      }>();

    return json({
      sessions: results.map((row) => ({
        id: row.id,
        gameId: row.game_id,
        scope: row.scope,
        playerCount: row.player_count,
        groupCount: row.group_count,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        // Stored as JSON because every minigame reports a different shape.
        results: JSON.parse(row.results) as unknown,
      })),
    });
  } catch (error) {
    // A room that has never finished a game has no table rows yet, not an error.
    if (error instanceof Error && /no such table/i.test(error.message)) {
      return json({ sessions: [] });
    }
    return routeError(error);
  }
}
