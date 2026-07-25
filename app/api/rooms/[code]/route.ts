import { getRoomState } from "../../../../db/game-store";
import { json, roomCodeFrom, routeError } from "../../_game";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> | { code: string } }) {
  try {
    return json({ state: await getRoomState(await roomCodeFrom(context)) });
  } catch (error) {
    return routeError(error);
  }
}
