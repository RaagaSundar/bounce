import { GameStoreError } from "../../db/game-store";

type RouteContext = { params: Promise<{ code: string }> | { code: string } };

export async function roomCodeFrom(context: RouteContext) {
  const params = await context.params;
  return params.code;
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new GameStoreError("Send a JSON object.", 400);
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof GameStoreError) throw error;
    throw new GameStoreError("Send valid JSON.", 400);
  }
}

export function tokenFrom(request: Request, payload: Record<string, unknown>) {
  const header = request.headers.get("x-room-token");
  return typeof payload.token === "string" ? payload.token : header;
}

export function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function routeError(error: unknown) {
  if (error instanceof GameStoreError) return json({ error: error.message }, error.status);
  console.error("RoomRaid API error", error);
  return json({ error: "Something went wrong. Please try again." }, 500);
}
