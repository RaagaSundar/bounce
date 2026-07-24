import { getScenario } from "../../../db/game-store";
import { json, routeError } from "../_game";

export async function GET() {
  try {
    return json({ scenario: getScenario() });
  } catch (error) {
    return routeError(error);
  }
}
