import { DurableObject } from "cloudflare:workers";

/**
 * One instance per room, addressed by room code. Owns the live socket
 * connections for that room.
 *
 * This is the viability slice: it proves Durable Objects and the Hibernatable
 * WebSocket API work end to end in this toolchain before the game engine is
 * built on top.
 */
export class RoomSession extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "Expected a WebSocket upgrade." }, { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());

    // acceptWebSocket (not server.accept) is what lets the object hibernate
    // between messages instead of holding compute open for an idle room.
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "Send JSON." }));
      return;
    }

    const type = (payload as { type?: unknown } | null)?.type;

    if (type === "ping") {
      // Echoes back enough to prove the round trip and that state survives.
      const seen = ((await this.ctx.storage.get<number>("pings")) ?? 0) + 1;
      await this.ctx.storage.put("pings", seen);

      ws.send(
        JSON.stringify({
          type: "pong",
          pings: seen,
          sockets: this.ctx.getWebSockets().length,
          at: Date.now(),
        }),
      );
      return;
    }

    ws.send(JSON.stringify({ type: "error", error: `Unknown message type: ${String(type)}` }));
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    // 1006 is an abnormal close (the phone lost wifi); it cannot be sent back.
    ws.close(code === 1006 ? 1011 : code, reason);
  }
}
