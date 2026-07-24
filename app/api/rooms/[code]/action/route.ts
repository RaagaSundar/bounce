import { selectAction } from "../../../../../db/game-store";
import { json, readJsonObject, roomCodeFrom, routeError, tokenFrom } from "../../../_game";

export async function POST(request: Request, context: { params: Promise<{ code: string }> | { code: string } }) {
  try {
    const payload = await readJsonObject(request);
    const state = await selectAction(await roomCodeFrom(context), {
      playerId: payload.playerId,
      token: tokenFrom(request, payload),
      action: payload.action,
    });
    return json({ state });
  } catch (error) {
    return routeError(error);
  }
}
