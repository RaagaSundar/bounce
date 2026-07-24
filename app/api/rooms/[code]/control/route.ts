import { controlRoom } from "../../../../../db/game-store";
import { json, readJsonObject, roomCodeFrom, routeError, tokenFrom } from "../../../_game";

export async function POST(request: Request, context: { params: Promise<{ code: string }> | { code: string } }) {
  try {
    const payload = await readJsonObject(request);
    const state = await controlRoom(await roomCodeFrom(context), {
      token: tokenFrom(request, payload),
      command: payload.command,
    });
    return json({ state });
  } catch (error) {
    return routeError(error);
  }
}
