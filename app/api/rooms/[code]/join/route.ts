import { joinRoom } from "../../../../../db/game-store";
import { json, readJsonObject, roomCodeFrom, routeError } from "../../../_game";

export async function POST(request: Request, context: { params: Promise<{ code: string }> | { code: string } }) {
  try {
    const payload = await readJsonObject(request);
    const result = await joinRoom(await roomCodeFrom(context), payload.name, payload.token);
    return json(result, 201);
  } catch (error) {
    return routeError(error);
  }
}
