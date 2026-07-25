import { DurableObject } from "cloudflare:workers";

import { d1SchemaStatements } from "../db/schema";
import { catalogSummary, getGame, type AnyMiniGame } from "../games/catalog";
import { groupPairKeys, makeGroups } from "../games/pairing";
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
/** WebSocket.OPEN — workerd's constructor doesn't expose the static, so inline it. */
const WS_OPEN = 1;
const MIN_NAME = 2;
const MAX_NAME = 18;
const ROOM_CODE = /\/api\/rooms\/([A-Za-z2-9]{6})\/live/;

type RosterEntry = SessionPlayer & { token: string; joinedAt: number };

type Attachment = { role: "host" } | { role: "player"; playerId: string };

/**
 * A "room" scope game runs one instance for everybody. A "party" scope game
 * runs one independent instance per sub-group, so pairs duel privately.
 */
type GameInstance = { id: string; playerIds: string[]; state: unknown };
type ActiveGame = { id: string; instances: GameInstance[] };

/**
 * Inputs never broadcast or persist directly. A motion game streams samples
 * many times a second per player; at event scale that would mean thousands of
 * storage writes and fan-out sends per second. Instead an input marks its
 * instance dirty and the fixed tick flushes at most once per interval, which
 * bounds both regardless of how hard clients push.
 */
const MAX_INPUTS_PER_SECOND = 30;

type Env = { DB?: D1Database };

export class RoomSession extends DurableObject<Env> {
  private code = "";
  private hostToken: string | null = null;
  private roster: Record<string, RosterEntry> = {};
  private game: ActiveGame | null = null;
  /** Every pairing seen this event, so nobody gets matched twice. */
  private metBefore = new Set<string>();
  /** Instances changed since the last flush. Not persisted; rebuilt at runtime. */
  private dirty = new Set<string>();
  /** Sliding input budget per player. Cleared by hibernation, which is fine. */
  private inputBudget = new Map<string, { windowStart: number; used: number }>();
  /** When the current game began, for the archive record. */
  private startedAt: number | null = null;
  /** In-flight archive-schema bootstrap, deduped per instance. */
  private schemaReady: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Hibernation can evict this object entirely, so rehydrate before serving
    // anything rather than trusting field initialisers.
    ctx.blockConcurrencyWhile(async () => {
      this.code = (await ctx.storage.get<string>("code")) ?? "";
      this.hostToken = (await ctx.storage.get<string>("hostToken")) ?? null;
      this.roster = (await ctx.storage.get<Record<string, RosterEntry>>("roster")) ?? {};
      this.game = (await ctx.storage.get<ActiveGame>("game")) ?? null;
      this.metBefore = new Set((await ctx.storage.get<string[]>("metBefore")) ?? []);
      this.startedAt = (await ctx.storage.get<number>("startedAt")) ?? null;
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
    // The game logic runs BEFORE the close attempt on purpose: closing a socket
    // that is already closing throws, and that would silently skip the forfeit
    // below.
    this.handleDeparture(ws);

    try {
      // 1006 is abnormal (wifi died) and cannot be echoed back.
      ws.close(code === 1006 ? 1011 : code, reason);
    } catch {
      // Already gone; nothing to do.
    }
  }

  /** A socket erroring out is a departure too, not just a clean close. */
  async webSocketError(ws: WebSocket) {
    this.handleDeparture(ws);
  }

  /**
   * A player who drops keeps their roster entry and score - reconnecting with
   * the same token restores their identity rather than creating a duplicate.
   * But a running game should stop waiting on them, if it cares.
   */
  private handleDeparture(ws: WebSocket) {
    const who = attachmentOf(ws);
    if (who?.role !== "player") return;
    if (this.stillConnected(who.playerId, ws)) return; // another tab is open

    const instance = this.instanceFor(who.playerId);
    const game = this.game ? getGame(this.game.id) : null;
    if (!instance || !game?.onPlayerLeft) return;

    const next = game.onPlayerLeft(instance.state, who.playerId, Date.now());
    if (next === instance.state) return;

    instance.state = next;
    this.dirty.add(instance.id);
  }

  /**
   * True if this player still has another live socket - a second tab, or a
   * reconnect that already landed.
   *
   * Identity is not enough on its own: the socket being closed can still appear
   * in getWebSockets(), and after hibernation the wrapper handed to the close
   * handler need not be the same object. Readiness is the reliable signal.
   */
  private stillConnected(playerId: string, closing: WebSocket): boolean {
    return this.ctx.getWebSockets().some((other) => {
      if (other === closing) return false;
      if (other.readyState !== WS_OPEN) return false;
      const who = attachmentOf(other);
      return who?.role === "player" && who.playerId === playerId;
    });
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
    const instance = this.instanceFor(who.playerId);
    if (!instance) throw new SessionError("You are not in this round.");

    const now = Date.now();
    if (!this.spendInputBudget(who.playerId, now)) return; // silently drop the flood

    // `now` here is the server's arrival time. A client cannot claim when it
    // acted, only that it did.
    const next = game.applyInput(instance.state, who.playerId, message.input, now);
    if (next === instance.state) return;

    instance.state = next;
    // Deliberately no broadcast or persist here - the tick flushes it.
    this.dirty.add(instance.id);
  }

  /** Cheap sliding window so one client cannot flood the room. */
  private spendInputBudget(playerId: string, now: number): boolean {
    const entry = this.inputBudget.get(playerId);
    if (!entry || now - entry.windowStart >= 1000) {
      this.inputBudget.set(playerId, { windowStart: now, used: 1 });
      return true;
    }
    if (entry.used >= MAX_INPUTS_PER_SECOND) return false;
    entry.used += 1;
    return true;
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
    const byId = new Map(players.map((p) => [p.id, p]));

    // "party" scope splits the roster into sub-groups that have not met yet;
    // "room" scope is simply one group containing everybody.
    const groups =
      game.scope === "party"
        ? makeGroups(players.map((p) => p.id), this.metBefore, Math.random)
        : [players.map((p) => p.id)];

    this.game = {
      id: game.id,
      instances: groups.map((playerIds, index) => ({
        id: `${game.id}-${index}`,
        playerIds,
        state: game.createInitialState({
          players: playerIds.map((id) => byId.get(id)).filter(Boolean) as SessionPlayer[],
          now,
          seed: (Math.random() * 2 ** 32) >>> 0,
        }),
      })),
    };

    if (game.scope === "party") {
      for (const key of groupPairKeys(groups)) this.metBefore.add(key);
      await this.ctx.storage.put("metBefore", [...this.metBefore]);
    }

    this.startedAt = now;
    await this.ctx.storage.put("startedAt", now);
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
    let changed = false;

    for (const instance of this.game.instances) {
      const next = game.tick(instance.state, now);
      const movedByTick = next !== instance.state;
      if (movedByTick) instance.state = next;

      // Flush if the tick advanced it, or if inputs landed since the last flush.
      // Same reference and no inputs means nothing happened, so no frame goes
      // out and an idle room stays quiet enough to hibernate.
      if (!movedByTick && !this.dirty.has(instance.id)) continue;

      changed = true;
      this.dirty.delete(instance.id);
      this.broadcastGameFor(instance);
    }

    if (changed) await this.persistGame();

    if (this.game.instances.every((i) => game.isComplete(i.state))) {
      const results = mergeResults(this.game.instances.map((i) => game.getResults(i.state)));
      this.broadcast({ type: "results", gameId: game.id, results });

      // Hand the finished game to the archive before dropping it. Failure to
      // archive must never take the room down, so it is caught inside.
      await this.archive(game, results, now);

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

  /**
   * Writes the finished game to D1, the durable system of record. The Durable
   * Object owns "now"; this is what is still around tomorrow.
   *
   * Best-effort by design: a room mid-event must not fail because the archive
   * is unreachable, so an error here is logged and swallowed.
   */
  private async archive(game: AnyMiniGame, results: unknown, endedAt: number) {
    const db = this.env.DB;
    if (!db || !this.game) return;

    try {
      // The Durable Object never goes through game-store, so nothing else
      // bootstraps the archive table for it. Deduped per instance.
      this.schemaReady ??= db
        .batch(d1SchemaStatements.map((statement) => db.prepare(statement)))
        .then(() => undefined);
      await this.schemaReady;

      await db
        .prepare(
          `INSERT INTO game_sessions
             (id, room_code, game_id, scope, player_count, group_count, started_at, ended_at, results)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          this.code,
          game.id,
          game.scope,
          new Set(this.game.instances.flatMap((i) => i.playerIds)).size,
          this.game.instances.length,
          this.startedAt ?? endedAt,
          endedAt,
          JSON.stringify(results),
        )
        .run();
    } catch (error) {
      // Retry the bootstrap next time rather than caching a rejected promise.
      this.schemaReady = null;
      console.error("Failed to archive session", error);
    }
  }

  private instanceFor(playerId: string): GameInstance | null {
    return this.game?.instances.find((i) => i.playerIds.includes(playerId)) ?? null;
  }

  /** Sends each socket only the view it is entitled to. */
  private sendGameView(ws: WebSocket) {
    if (!this.game) return;
    const game = this.requireGame(this.game.id);
    const who = attachmentOf(ws);
    if (!who) return;

    const now = Date.now();

    if (who.role === "host") {
      // The projector sees every sub-group; a phone only ever sees its own.
      send(ws, {
        type: "view",
        gameId: game.id,
        scope: game.scope,
        view: game.getHostView(this.game.instances[0].state, now),
        groups: this.game.instances.map((i) => ({ id: i.id, view: game.getHostView(i.state, now) })),
      });
      return;
    }

    const instance = this.instanceFor(who.playerId);
    if (!instance) return;
    send(ws, {
      type: "view",
      gameId: game.id,
      scope: game.scope,
      view: game.getViewForPlayer(instance.state, who.playerId, now),
    });
  }

  /** Only wakes the sockets that belong to the instance that changed. */
  private broadcastGameFor(instance: GameInstance) {
    for (const ws of this.ctx.getWebSockets()) {
      const who = attachmentOf(ws);
      if (!who) continue;
      if (who.role === "host" || instance.playerIds.includes(who.playerId)) this.sendGameView(ws);
    }
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

/** Folds every sub-group's results into one room-wide leaderboard. */
function mergeResults(all: { scores: { playerId: string; name: string; points: number }[]; headline: string }[]) {
  const scores = all
    .flatMap((r) => r.scores)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  // One group means one game, so its own headline is the right one. Across many
  // sub-groups it is not: picking any single duel's headline would name an
  // arbitrary pair as though they had won the room. Name the overall leader.
  const headline =
    all.length === 1
      ? all[0].headline
      : scores.length
        ? `${scores[0].name} tops the room`
        : "Round over";

  return { scores, headline };
}

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
