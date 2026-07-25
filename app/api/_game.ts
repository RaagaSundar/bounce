import { ApiError } from "../../db/room-code";

/**
 * Shared helpers for the REST routes.
 *
 * Live gameplay runs over the socket (see docs/LIVE_PROTOCOL.md); what is left
 * here is the archive read, which is deliberately not real-time. The request
 * body helpers went with the quiz endpoints - nothing left here takes a body.
 */

type RouteContext = { params: Promise<{ code: string }> | { code: string } };

export async function roomCodeFrom(context: RouteContext) {
  const params = await context.params;
  return params.code;
}

export function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function routeError(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error("Bounce API error", error);
  return json({ error: "Something went wrong. Please try again." }, 500);
}
