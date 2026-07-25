import { createRoom } from "../../../db/game-store";
import { json, routeError } from "../_game";

export async function POST() {
  try {
    const { state, hostToken } = await createRoom();
    return json({ state, hostToken }, 201);
  } catch (error) {
    return routeError(error);
  }
}
