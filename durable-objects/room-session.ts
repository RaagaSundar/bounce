import { DurableObject } from "cloudflare:workers";

import { catalogSummary, getGame, type AnyMiniGame } from "../games/catalog";
import type { SessionPlayer } from "../games/types";

/**
 * One instance per room, addressed by room code via idFromName.
 *
 * This object is the strongly-consistent authority for "what is happening in
 * this room right now": the roster, the active minigame and its state, and the
 * live socket connections. D1 remains the durable archive.
 *
 * It knows nothing about any specific game - it only drives the MiniGame
 * interface, so new games never touch this file.
 */

const TICK_MS = 120;
const MIN_NAME = 2;
const MAX_NAME = 18;
const ROOM_CODE = /\/api\/rooms\/([A-Za-z2-9]{6})\/live/;

type RosterEntry = SessionPlayer & { token: string; joinedAt: number };

type Attachment = { role: "host" } | { role: "player"; playerId: string };

type ActiveGame = { id: string; state: unknown };

type Env = { DB?: D1Database };

export class RoomSession extends DurableObject<Env> {
  private code = "";
  private hostToken: string | null = null;
  private roster: Record<string, RosterEntry> = {};
  private game: ActiveGame | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Hibernation can evict this object entirely, so rehydrate before serving
    // anything rather than trusting field initialisers.
    ctx.blockConcurrencyWhile(async () => {
      this.code = (await ctx.storage.get<string>("code")) ?? "";
      this.hostToken = (await ctx.storage.get<string>("hostToken")) ?? null;
      this.roster = (await ctx.storage.get<Record<string, RosterEntry>>("roster")) ?? {};
      this.game = (await ctx.storage.get<ActiveGame>("game")) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "Expected a WebSocket upgrade." }, { status: 426 });
    }

    // The object cannot read its own name back, so the code is recovered from
    // the path the worker forwarded.
    if (!this.code) {
      const match = request.url.match(ROOM_CODE);
      if (match) {
        this.code = match[1].toUpperCase();
        await this.ctx.storage.put("code", this.code);
      }
    }

    const [client, server] = Object.values(new WebSocketPair());

    // acceptWebSocket (not server.accept) is what lets an idle room hibernate
    // instead of holding compute open between actions.
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── socket lifecycle ──────────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;

    let message: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      message = parsed as Record<string, unknown>;
    } catch {
      return send(ws, { type: "error", error: "Send a JSON object." });
    }

    try {
      await this.route(ws, message);
    } catch (error) {
      send(ws, {
        type: "error",
        error: error instanceof SessionError ? error.message : "Something went wrong.",
      });
      if (!(error instanceof SessionError)) console.error("RoomSession failure", error);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    // A player who drops keeps their roster entry and score - reconnecting with
    // the same token restores their identity rather than creating a duplicate.
    // 1006 is abnormal (wifi died) and cannot be echoed back.
    ws.close(code === 1006 ? 1011 : code, reason);
  }

  private async route(ws: WebSocket, message: Record<string, unknown>) {
    switch (message.type) {
      case "hello":
        return this.onHello(ws, message);
      case "input":
        return this.onInput(ws, message);
      case "host:start":
        return this.onHostStart(ws, message);
      case "host:end":
        return this.onHostEnd(ws);
      case "ping":
        return send(ws, { type: "pong", at: Date.now() });
      default:
        throw new SessionError(`Unknown message type: ${String(message.type)}`);
    }
  }

  // ── identity ──────────────────────────────────────────────────────────────

  /**
   * Auth happens in the first message rather than the URL, so tokens never land
   * in a query string that could be logged or shoulder-read off a projector.
   */
  private async onHello(ws: WebSocket, message: Record<string, unknown>) {
    if (message.role === "host") return this.helloHost(ws, message);
    if (message.role === "player") return this.helloPlayer(ws, message);
    throw new SessionError("Join as a host or a player.");
  }

  private async helloHost(ws: WebSocket, message: Record<string, unknown>) {
    const offered = optionalString(message.hostToken);

    if (!this.hostToken) {
      // First host to reach an unclaimed code owns it.
      this.hostToken = crypto.randomUUID();
      await this.ctx.storage.put("hostToken", this.hostToken);
    } else if (offered !== this.hostToken) {
      throw new SessionError("This room already has a host.");
    }

    ws.serializeAttachment({ role: "host" } satisfies Attachment);
    send(ws, {
      type: "welcome",
      role: "host",
      code: this.code,
      hostToken: this.hostToken,
      catalog: catalogSummary(),
    });
    this.sendRoom(ws);
    this.sendGameView(ws);
  }

  private async helloPlayer(ws: WebSocket, message: Record<string, unknown>) {
    const token = optionalString(message.playerToken);
    const existing = token ? Object.values(this.roster).find((p) => p.token === token) : undefined;

    let player: RosterEntry;
    if (existing) {
      // Reconnect: same identity, same score, no duplicate roster entry.
      player = existing;
      const renamed = optionalString(message.name);
      if (renamed) player = { ...player, name: uniqueName(renamed, this.roster, player.id) };
    } else {
      const name = requireName(message.name);
      const id = crypto.randomUUID();
      player = { id, name: uniqueName(name, this.roster, id), token: crypto.randomUUID(), joinedAt: Date.now() };
    }

    this.roster = { ...this.roster, [player.id]: player };
    await this.ctx.storage.put("roster", this.roster);

    ws.serializeAttachment({ role: "player", playerId: player.id } satisfies Attachment);
    send(ws, {
      type: "welcome",
      role: "player",
      code: this.code,
      playerId: player.id,
      // The token is only ever sent to the socket that owns it, never broadcast.
      playerToken: player.token,
      name: player.name,
    });

    this.broadcastRoom();
    this.sendGameView(ws);
  }

  // ── gameplay ──────────────────────────────────────────────────────────────

  private async onInput(ws: WebSocket, message: Record<string, unknown>) {
    const who = attachmentOf(ws);
    if (who?.role !== "player") throw new SessionError("Only players can send input.");
    if (!this.game) throw new SessionError("No game is running.");

    const game = this.requireGame(this.game.id);
    // Date.now() here is the server's arrival time. A client cannot claim when
    // it acted, only that it did.
    const next = game.applyInput(this.game.state, who.playerId, message.input, Date.now());

    if (next !== this.game.state) {
      this.game = { ...this.game, state: next };
      await this.persistGame();
      this.broadcastGame();
    }
  }

  private async onHostStart(ws: WebSocket, message: Record<string, unknown>) {
    this.requireHost(ws);

    const game = this.requireGame(requireString(message.gameId, "gameId"));
    const players = Object.values(this.roster)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map(({ id, name }) => ({ id, name }));

    if (players.length < game.meta.minPlayers) {
      throw new SessionError(`${game.meta.title} needs at least ${game.meta.minPlayers} player(s).`);
    }

    const now = Date.now();
    this.game = {
      id: game.id,
      state: game.createInitialState({ players, now, seed: (Math.random() * 2 ** 32) >>> 0 }),
    };
    await this.persistGame();

    this.broadcastGame();
    await this.ctx.storage.setAlarm(now + TICK_MS);
  }

  private async onHostEnd(ws: WebSocket) {
    this.requireHost(ws);
    this.game = null;
    await this.ctx.storage.delete("game");
    await this.ctx.storage.deleteAlarm();
    this.broadcastRoom();
    this.broadcast({ type: "game:ended" });
  }

  /** Fixed server tick. Only scheduled while a game is actually running. */
  async alarm() {
    if (!this.game) return;

    const game = this.requireGame(this.game.id);
    const now = Date.now();
    const next = game.tick(this.game.state, now);

    if (next !== this.game.state) {
      this.game = { ...this.game, state: next };
      await this.persistGame();
      this.broadcastGame();
    }

    if (game.isComplete(next)) {
      this.broadcast({ type: "results", gameId: game.id, results: game.getResults(next) });
      this.game = null;
      await this.ctx.storage.delete("game");
      this.broadcastRoom();
      return; // stop ticking; the room can hibernate again
    }

    await this.ctx.storage.setAlarm(now + TICK_MS);
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  private requireHost(ws: WebSocket) {
    if (attachmentOf(ws)?.role !== "host") throw new SessionError("Only the host can do that.");
  }

  private requireGame(id: string): AnyMiniGame {
    const game = getGame(id);
    if (!game) throw new SessionError(`Unknown game: ${id}`);
    return game;
  }

  private persistGame() {
    return this.ctx.storage.put("game", this.game);
  }

  private roomPayload() {
    return {
      type: "room" as const,
      code: this.code,
      players: Object.values(this.roster)
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map(({ id, name }) => ({ id, name })),
      activeGameId: this.game?.id ?? null,
      catalog: catalogSummary(),
    };
  }

  private sendRoom(ws: WebSocket) {
    send(ws, this.roomPayload());
  }

  private broadcastRoom() {
    this.broadcast(this.roomPayload());
  }

  /** Sends each socket only the view it is entitled to. */
  private sendGameView(ws: WebSocket) {
    if (!this.game) return;
    const game = this.requireGame(this.game.id);
    const who = attachmentOf(ws);
    if (!who) return;

    send(ws, {
      type: "view",
      gameId: game.id,
      view:
        who.role === "host"
          ? game.getHostView(this.game.state)
          : game.getViewForPlayer(this.game.state, who.playerId),
    });
  }

  private broadcastGame() {
    for (const ws of this.ctx.getWebSockets()) this.sendGameView(ws);
  }

  private broadcast(payload: unknown) {
    for (const ws of this.ctx.getWebSockets()) send(ws, payload);
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

class SessionError extends Error {}

function send(ws: WebSocket, payload: unknown) {
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // The socket died between selection and send; the close handler cleans up.
  }
}

function attachmentOf(ws: WebSocket): Attachment | null {
  const raw = ws.deserializeAttachment();
  return raw && typeof raw === "object" ? (raw as Attachment) : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.length <= 200 ? value.trim() : null;
}

function requireString(value: unknown, label: string): string {
  const found = optionalString(value);
  if (!found) throw new SessionError(`A valid ${label} is required.`);
  return found;
}

function requireName(value: unknown): string {
  if (typeof value !== "string") throw new SessionError("Enter your name to join.");
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < MIN_NAME || name.length > MAX_NAME) {
    throw new SessionError(`Use a name between ${MIN_NAME} and ${MAX_NAME} characters.`);
  }
  return name;
}

/** Two people called Sam should still be tellable apart on the projector. */
function uniqueName(name: string, roster: Record<string, RosterEntry>, selfId: string): string {
  const taken = new Set(
    Object.values(roster)
      .filter((p) => p.id !== selfId)
      .map((p) => p.name.toLocaleLowerCase()),
  );
  if (!taken.has(name.toLocaleLowerCase())) return name;

  for (let copy = 2; copy < 1000; copy += 1) {
    const suffix = ` ${copy}`;
    const candidate = `${name.slice(0, Math.max(1, MAX_NAME - suffix.length))}${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return name;
}
