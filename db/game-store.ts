/**
 * DEPRECATED - the legacy RoomRaid quiz.
 *
 * Live gameplay has moved to the RoomSession Durable Object
 * (see docs/LIVE_PROTOCOL.md). This module still backs `app/api/**` and the old
 * client at `/`, and nothing new should be built on it.
 *
 * It carries known debt that is deliberately NOT being paid down, because the
 * whole module is scheduled for deletion once the new frontend covers `/`:
 *
 * - Six operations are hand-implemented twice, once against D1 and once against
 *   an in-memory Map. The Durable Object is now the in-memory-with-persistence
 *   layer, so the fallback has stopped earning its keep.
 * - `buildPublicState` returns the entire scenario on every response, and the
 *   old client polls every 1300ms - several KB of static prose re-sent ~46
 *   times a minute per phone.
 * - `game_rooms.scenario_id` is written but never read; the multi-scenario seam
 *   it implies was never wired. The MiniGame catalog replaces it.
 * - `game_actions` has UNIQUE(player_id, round) over one TEXT column, which is
 *   exactly why this could only ever model multiple choice.
 *
 * Refactoring this would be work on code that is about to be removed. Delete it
 * with `app/api/**` and `app/SideQuestClient.tsx` once `/` is ported.
 */
import { getD1 } from "./index";
import { d1SchemaStatements } from "./schema";

export type RoomStatus = "lobby" | "playing" | "complete";

export type GameChoice = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  points: number;
  energy: number;
};

export type GameRound = {
  id: string;
  eyebrow: string;
  title: string;
  prompt: string;
  timeLimitSeconds: number;
  teamTarget: number;
  choices: GameChoice[];
};

export type GameRole = {
  id: string;
  label: string;
  emoji: string;
  mission: string;
};

export const DEFAULT_SCENARIO = {
  id: "demo-demon",
  brand: "Bounce / RoomRaid",
  title: "Defeat the Demo Demon",
  subtitle: "A 90-second raid for rooms full of strangers.",
  intro:
    "An overconfident demo gremlin is feeding on awkward silence. Build a crew, make a connection, and send it back to the slide deck before time runs out.",
  lobbyPrompt: "Join the raid. Your secret role arrives when the Demo Demon wakes up.",
  completionTitle: "Demo Demon defeated",
  completionPrompt: "You turned a room full of strangers into a crew. Find your MVP, then keep the conversation going.",
  roles: [
    {
      id: "striker",
      label: "Striker",
      emoji: "⚔",
      mission: "Turn panic into damage. When the room calls for a hit, bring the energy.",
    },
    {
      id: "guardian",
      label: "Guardian",
      emoji: "⬡",
      mission: "Keep the room alive. Your job is to hold the shield when the Demon pushes back.",
    },
    {
      id: "spark",
      label: "Spark",
      emoji: "⚡",
      mission: "Charge the final blow. Find another Spark and make the room light up together.",
    },
    {
      id: "scout",
      label: "Scout",
      emoji: "✦",
      mission: "Make the room less awkward. You get one tiny mission to meet someone new.",
    },
  ] satisfies GameRole[],
  rounds: [
    {
      id: "phase-one",
      eyebrow: "PHASE 01 · BREACH THE SILENCE",
      title: "Make some noise",
      prompt: "The Demo Demon is awake. Pick your move and show the room you are in this together.",
      timeLimitSeconds: 35,
      teamTarget: 320,
      choices: [
        {
          id: "strike",
          label: "Land a hit",
          emoji: "💥",
          description: "You turned awkward silence into damage.",
          points: 100,
          energy: 80,
        },
        {
          id: "shield",
          label: "Raise the shield",
          emoji: "🛡️",
          description: "You kept the whole raid alive.",
          points: 140,
          energy: 120,
        },
        {
          id: "charge",
          label: "Charge the team",
          emoji: "⚡",
          description: "You made the room's combo meter jump.",
          points: 160,
          energy: 150,
        },
      ],
    },
    {
      id: "power-duo",
      eyebrow: "PHASE 02 · POWER DUO WINDOW",
      title: "Find one new person",
      prompt: "Ask someone you did not arrive with: What would you build if sleep was optional for a week?",
      timeLimitSeconds: 40,
      teamTarget: 440,
      choices: [
        {
          id: "said-hello",
          label: "I said hello",
          emoji: "👋",
          description: "You opened a channel with someone new.",
          points: 150,
          energy: 130,
        },
        {
          id: "power-duo",
          label: "We found a shared idea",
          emoji: "🔗",
          description: "Two strangers gave the whole room a shield.",
          points: 190,
          energy: 170,
        },
        {
          id: "squad-up",
          label: "We formed a crew",
          emoji: "🫂",
          description: "The room just became less full of strangers.",
          points: 220,
          energy: 210,
        },
      ],
    },
    {
      id: "final-blow",
      eyebrow: "PHASE 03 · FINAL BLOW",
      title: "Finish the raid",
      prompt: "Bring your crew near the screen. Choose the move that gives everyone one last push.",
      timeLimitSeconds: 30,
      teamTarget: 500,
      choices: [
        {
          id: "final-hit",
          label: "Hold for the final hit",
          emoji: "💥",
          description: "You helped overload the Demo Demon.",
          points: 180,
          energy: 150,
        },
        {
          id: "sync-burst",
          label: "Sync with the room",
          emoji: "⚡",
          description: "You timed your energy with the crew.",
          points: 220,
          energy: 190,
        },
        {
          id: "crew-win",
          label: "Lock in the crew",
          emoji: "🏆",
          description: "You made the shared moment real.",
          points: 240,
          energy: 220,
        },
      ],
    },
  ] satisfies GameRound[],
} as const;

export type PublicPlayer = {
  id: string;
  name: string;
  score: number;
  lastAction: string | null;
  lastActionAt: number | null;
  hasActed: boolean;
};

export type PublicRoomState = {
  room: {
    code: string;
    status: RoomStatus;
    round: number;
    version: number;
    createdAt: number;
    updatedAt: number;
    phaseStartedAt: number | null;
  };
  scenario: typeof DEFAULT_SCENARIO;
  currentRound: GameRound | null;
  players: PublicPlayer[];
  leaderboard: PublicPlayer[];
  progress: {
    playerCount: number;
    actionCount: number;
    teamEnergy: number;
    teamTarget: number;
    percent: number;
  };
};

export type JoinedPlayer = {
  id: string;
  name: string;
  token: string;
  role: GameRole;
};

type StoredRoom = PublicRoomState["room"] & {
  id: string;
  hostToken: string;
  scenarioId: string;
};

type StoredPlayer = Omit<PublicPlayer, "hasActed"> & {
  roomId: string;
  token: string;
  role: string;
  joinedAt: number;
};

type StoredAction = {
  id: string;
  roomId: string;
  playerId: string;
  round: number;
  action: string;
  points: number;
  createdAt: number;
};

type MemoryStore = {
  rooms: Map<string, StoredRoom>;
  players: Map<string, StoredPlayer>;
  actions: Map<string, StoredAction>;
};

const memory: MemoryStore = {
  rooms: new Map(),
  players: new Map(),
  actions: new Map(),
};

const initializedD1 = new WeakMap<object, Promise<void>>();
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class GameStoreError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "GameStoreError";
  }
}

export function normalizeRoomCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    throw new GameStoreError("Enter a valid six-character room code.", 400);
  }
  return code;
}

export function getScenario() {
  return DEFAULT_SCENARIO;
}

export async function createRoom(): Promise<{
  state: PublicRoomState;
  hostToken: string;
}> {
  const d1 = getD1();
  return d1 ? createRoomInD1(d1) : createRoomInMemory();
}

export async function getRoomState(codeInput: string): Promise<PublicRoomState> {
  const code = normalizeRoomCode(codeInput);
  const d1 = getD1();
  return d1 ? getRoomStateFromD1(d1, code) : getRoomStateFromMemory(code);
}

export async function joinRoom(
  codeInput: string,
  rawName: unknown,
  rawExistingToken?: unknown,
): Promise<{ state: PublicRoomState; player: JoinedPlayer }> {
  const code = normalizeRoomCode(codeInput);
  const name = normalizeName(rawName);
  const existingToken = optionalShortString(rawExistingToken);
  const d1 = getD1();
  return d1
    ? joinRoomInD1(d1, code, name, existingToken)
    : joinRoomInMemory(code, name, existingToken);
}

export async function selectAction(
  codeInput: string,
  input: { playerId: unknown; token: unknown; action: unknown },
): Promise<PublicRoomState> {
  const code = normalizeRoomCode(codeInput);
  const playerId = requireShortString(input.playerId, "playerId");
  const token = requireShortString(input.token, "player token");
  const action = requireShortString(input.action, "action");
  const d1 = getD1();
  return d1
    ? selectActionInD1(d1, code, playerId, token, action)
    : selectActionInMemory(code, playerId, token, action);
}

export async function controlRoom(
  codeInput: string,
  input: { token: unknown; command: unknown },
): Promise<PublicRoomState> {
  const code = normalizeRoomCode(codeInput);
  const token = requireShortString(input.token, "host token");
  const command = requireControlCommand(input.command);
  const d1 = getD1();
  return d1
    ? controlRoomInD1(d1, code, token, command)
    : controlRoomInMemory(code, token, command);
}

async function createRoomInD1(d1: D1Database) {
  await ensureD1Schema(d1);
  const now = Date.now();
  const hostToken = createId();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const room: StoredRoom = {
      id: createId(),
      code: createRoomCode(),
      hostToken,
      scenarioId: DEFAULT_SCENARIO.id,
      status: "lobby",
      round: 0,
      phaseStartedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await d1
        .prepare(
          `INSERT INTO game_rooms
           (id, code, host_token, scenario_id, status, round, phase_started_at, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          room.id,
          room.code,
          room.hostToken,
          room.scenarioId,
          room.status,
          room.round,
          room.phaseStartedAt,
          room.version,
          room.createdAt,
          room.updatedAt,
        )
        .run();
      return { state: await getRoomStateFromD1(d1, room.code), hostToken };
    } catch (error) {
      if (!isUniqueConstraint(error) || attempt === 11) throw error;
    }
  }

  throw new GameStoreError("Could not make a room code. Please try again.", 500);
}

async function createRoomInMemory() {
  const now = Date.now();
  const hostToken = createId();
  let code = createRoomCode();
  while (memory.rooms.has(code)) code = createRoomCode();

  memory.rooms.set(code, {
    id: createId(),
    code,
    hostToken,
    scenarioId: DEFAULT_SCENARIO.id,
    status: "lobby",
    round: 0,
    phaseStartedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  return { state: await getRoomStateFromMemory(code), hostToken };
}

async function joinRoomInD1(
  d1: D1Database,
  code: string,
  name: string,
  existingToken: string | null,
) {
  await ensureD1Schema(d1);
  const room = await readRoomFromD1(d1, code);
  if (existingToken) {
    const existing = await d1
      .prepare(
        "SELECT id, room_id, name, player_token, role, score, last_action, last_action_at, joined_at FROM game_players WHERE room_id = ? AND player_token = ?",
      )
      .bind(room.id, existingToken)
      .first<D1PlayerRow>();
    if (existing) {
      const player = toStoredPlayer(existing);
      return { state: await getRoomStateFromD1(d1, code), player: toJoinedPlayer(player) };
    }
  }
  if (room.status === "complete") {
    throw new GameStoreError("This mission is complete. Ask the host to reset it first.", 409);
  }

  const now = Date.now();
  const playerCount =
    (
      await d1
        .prepare("SELECT COUNT(*) AS count FROM game_players WHERE room_id = ?")
        .bind(room.id)
        .first<{ count: number }>()
    )?.count ?? 0;
  const role = DEFAULT_SCENARIO.roles[playerCount % DEFAULT_SCENARIO.roles.length];
  const nameRows = await d1
    .prepare("SELECT name FROM game_players WHERE room_id = ?")
    .bind(room.id)
    .all<{ name: string }>();
  const player: StoredPlayer = {
    id: createId(),
    roomId: room.id,
    name: makeUniqueDisplayName(name, nameRows.results.map((row) => row.name)),
    token: createId(),
    role: role.id,
    score: 0,
    lastAction: null,
    lastActionAt: null,
    joinedAt: now,
  };

  await d1
    .prepare(
      `INSERT INTO game_players
       (id, room_id, name, player_token, role, score, last_action, last_action_at, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      player.id,
      player.roomId,
      player.name,
      player.token,
      player.role,
      player.score,
      player.lastAction,
      player.lastActionAt,
      player.joinedAt,
    )
    .run();

  return {
    state: await getRoomStateFromD1(d1, code),
    player: toJoinedPlayer(player),
  };
}

async function joinRoomInMemory(
  code: string,
  name: string,
  existingToken: string | null,
) {
  const room = readRoomFromMemory(code);
  if (existingToken) {
    const existing = getMemoryPlayers(room.id).find((player) => player.token === existingToken);
    if (existing) return { state: await getRoomStateFromMemory(code), player: toJoinedPlayer(existing) };
  }
  if (room.status === "complete") {
    throw new GameStoreError("This mission is complete. Ask the host to reset it first.", 409);
  }

  const role = DEFAULT_SCENARIO.roles[
    getMemoryPlayers(room.id).length % DEFAULT_SCENARIO.roles.length
  ];
  const player: StoredPlayer = {
    id: createId(),
    roomId: room.id,
    name: makeUniqueDisplayName(name, getMemoryPlayers(room.id).map((candidate) => candidate.name)),
    token: createId(),
    role: role.id,
    score: 0,
    lastAction: null,
    lastActionAt: null,
    joinedAt: Date.now(),
  };
  memory.players.set(player.id, player);

  return {
    state: await getRoomStateFromMemory(code),
    player: toJoinedPlayer(player),
  };
}

async function selectActionInD1(
  d1: D1Database,
  code: string,
  playerId: string,
  token: string,
  action: string,
) {
  await ensureD1Schema(d1);
  const room = await readRoomFromD1(d1, code);
  const choice = getCurrentChoice(room, action);
  const player = await d1
    .prepare("SELECT * FROM game_players WHERE id = ? AND room_id = ? AND player_token = ?")
    .bind(playerId, room.id, token)
    .first<D1PlayerRow>();
  if (!player) throw new GameStoreError("That player session is no longer valid.", 403);

  const now = Date.now();
  await d1.batch([
    d1.prepare("DELETE FROM game_actions WHERE room_id = ? AND player_id = ? AND round = ?").bind(room.id, playerId, room.round),
    d1
      .prepare(
        `INSERT INTO game_actions (id, room_id, player_id, round, action, points, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(createId(), room.id, playerId, room.round, choice.id, choice.points, now),
    d1
      .prepare(
        `UPDATE game_players
         SET score = (SELECT COALESCE(SUM(points), 0) FROM game_actions WHERE player_id = ?),
             last_action = ?, last_action_at = ?
         WHERE id = ?`,
      )
      .bind(playerId, choice.id, now, playerId),
    d1
      .prepare("UPDATE game_rooms SET version = version + 1, updated_at = ? WHERE id = ?")
      .bind(now, room.id),
  ]);

  return getRoomStateFromD1(d1, code);
}

async function selectActionInMemory(
  code: string,
  playerId: string,
  token: string,
  action: string,
) {
  const room = readRoomFromMemory(code);
  const choice = getCurrentChoice(room, action);
  const player = memory.players.get(playerId);
  if (!player || player.roomId !== room.id || player.token !== token) {
    throw new GameStoreError("That player session is no longer valid.", 403);
  }

  for (const [id, entry] of memory.actions) {
    if (entry.playerId === playerId && entry.round === room.round) memory.actions.delete(id);
  }
  const actionId = createId();
  memory.actions.set(actionId, {
    id: actionId,
    roomId: room.id,
    playerId,
    round: room.round,
    action: choice.id,
    points: choice.points,
    createdAt: Date.now(),
  });
  player.lastAction = choice.id;
  player.lastActionAt = Date.now();
  player.score = getMemoryActions(playerId).reduce((sum, entry) => sum + entry.points, 0);
  touchRoom(room);

  return getRoomStateFromMemory(code);
}

async function controlRoomInD1(
  d1: D1Database,
  code: string,
  token: string,
  command: ControlCommand,
) {
  await ensureD1Schema(d1);
  const room = await readRoomFromD1(d1, code);
  assertHostToken(room, token);
  const now = Date.now();

  if (command === "reset") {
    await d1.batch([
      d1.prepare("DELETE FROM game_actions WHERE room_id = ?").bind(room.id),
      d1
        .prepare("UPDATE game_players SET score = 0, last_action = NULL, last_action_at = NULL WHERE room_id = ?")
        .bind(room.id),
      d1
        .prepare(
          "UPDATE game_rooms SET status = 'lobby', round = 0, phase_started_at = NULL, version = version + 1, updated_at = ? WHERE id = ?",
        )
        .bind(now, room.id),
    ]);
  } else if (command === "start") {
    if (room.status !== "lobby") {
      throw new GameStoreError("The mission has already started. Use reset to play again.", 409);
    }
    await d1
      .prepare(
        "UPDATE game_rooms SET status = 'playing', round = 1, phase_started_at = ?, version = version + 1, updated_at = ? WHERE id = ?",
      )
      .bind(now, now, room.id)
      .run();
  } else {
    if (room.status !== "playing") {
      throw new GameStoreError("Start the mission before advancing it.", 409);
    }
    const isFinalRound = room.round >= DEFAULT_SCENARIO.rounds.length;
    await d1
      .prepare(
        `UPDATE game_rooms
         SET status = ?, round = ?, phase_started_at = ?, version = version + 1, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        isFinalRound ? "complete" : "playing",
        isFinalRound ? room.round : room.round + 1,
        now,
        now,
        room.id,
      )
      .run();
  }

  return getRoomStateFromD1(d1, code);
}

async function controlRoomInMemory(
  code: string,
  token: string,
  command: ControlCommand,
) {
  const room = readRoomFromMemory(code);
  assertHostToken(room, token);

  if (command === "reset") {
    for (const [id, action] of memory.actions) {
      if (action.roomId === room.id) memory.actions.delete(id);
    }
    for (const player of getMemoryPlayers(room.id)) {
      player.score = 0;
      player.lastAction = null;
      player.lastActionAt = null;
    }
    room.status = "lobby";
    room.round = 0;
    room.phaseStartedAt = null;
  } else if (command === "start") {
    if (room.status !== "lobby") {
      throw new GameStoreError("The mission has already started. Use reset to play again.", 409);
    }
    room.status = "playing";
    room.round = 1;
    room.phaseStartedAt = Date.now();
  } else {
    if (room.status !== "playing") {
      throw new GameStoreError("Start the mission before advancing it.", 409);
    }
    if (room.round >= DEFAULT_SCENARIO.rounds.length) room.status = "complete";
    else room.round += 1;
    room.phaseStartedAt = Date.now();
  }
  touchRoom(room);
  return getRoomStateFromMemory(code);
}

async function getRoomStateFromD1(d1: D1Database, code: string): Promise<PublicRoomState> {
  await ensureD1Schema(d1);
  const room = await readRoomFromD1(d1, code);
  const [playersResult, actionsResult] = await Promise.all([
    d1
      .prepare(
        "SELECT id, room_id, name, player_token, role, score, last_action, last_action_at, joined_at FROM game_players WHERE room_id = ? ORDER BY joined_at ASC",
      )
      .bind(room.id)
      .all<D1PlayerRow>(),
    d1
      .prepare("SELECT id, room_id, player_id, round, action, points, created_at FROM game_actions WHERE room_id = ?")
      .bind(room.id)
      .all<D1ActionRow>(),
  ]);
  return buildPublicState(room, playersResult.results.map(toStoredPlayer), actionsResult.results.map(toStoredAction));
}

async function getRoomStateFromMemory(code: string): Promise<PublicRoomState> {
  const room = readRoomFromMemory(code);
  return buildPublicState(room, getMemoryPlayers(room.id), getMemoryActionsForRoom(room.id));
}

function buildPublicState(
  room: StoredRoom,
  storedPlayers: StoredPlayer[],
  actions: StoredAction[],
): PublicRoomState {
  const currentRound = room.round > 0 ? DEFAULT_SCENARIO.rounds[room.round - 1] ?? null : null;
  const actedPlayerIds = new Set(
    actions.filter((action) => action.round === room.round).map((action) => action.playerId),
  );
  const roundActions = actions.filter((action) => action.round === room.round);
  const teamEnergy = currentRound
    ? roundActions.reduce((total, action) => total + energyForAction(room.round, action.action), 0)
    : 0;
  const players: PublicPlayer[] = storedPlayers.map((player) => ({
    id: player.id,
    name: player.name,
    score: player.score,
    lastAction: player.lastAction,
    lastActionAt: player.lastActionAt,
    hasActed: actedPlayerIds.has(player.id),
  }));
  const leaderboard = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const teamTarget = currentRound?.teamTarget ?? 0;

  return {
    room: {
      code: room.code,
      status: room.status,
      round: room.round,
      version: room.version,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      phaseStartedAt: room.phaseStartedAt,
    },
    scenario: DEFAULT_SCENARIO,
    currentRound,
    players,
    leaderboard,
    progress: {
      playerCount: players.length,
      actionCount: roundActions.length,
      teamEnergy,
      teamTarget,
      percent: teamTarget ? Math.min(100, Math.round((teamEnergy / teamTarget) * 100)) : 0,
    },
  };
}

async function readRoomFromD1(d1: D1Database, code: string): Promise<StoredRoom> {
  const row = await d1
    .prepare(
      "SELECT id, code, host_token, scenario_id, status, round, phase_started_at, version, created_at, updated_at FROM game_rooms WHERE code = ?",
    )
    .bind(code)
    .first<D1RoomRow>();
  if (!row) throw new GameStoreError("That room does not exist yet.", 404);
  return toStoredRoom(row);
}

function readRoomFromMemory(code: string): StoredRoom {
  const room = memory.rooms.get(code);
  if (!room) throw new GameStoreError("That room does not exist yet.", 404);
  return room;
}

async function ensureD1Schema(d1: D1Database) {
  const existing = initializedD1.get(d1 as unknown as object);
  if (existing) return existing;
  const initializing = d1.batch(d1SchemaStatements.map((statement) => d1.prepare(statement))).then(() => undefined);
  initializedD1.set(d1 as unknown as object, initializing);
  try {
    await initializing;
  } catch (error) {
    initializedD1.delete(d1 as unknown as object);
    throw error;
  }
}

function getCurrentChoice(room: StoredRoom, action: string): GameChoice {
  if (room.status !== "playing" || room.round < 1) {
    throw new GameStoreError("The mission has not started yet.", 409);
  }
  const round = DEFAULT_SCENARIO.rounds[room.round - 1];
  if (!round) throw new GameStoreError("The mission is already complete.", 409);
  const choice = round.choices.find((candidate) => candidate.id === action);
  if (!choice) throw new GameStoreError("That action is not available in this round.", 400);
  return choice;
}

function energyForAction(roundNumber: number, actionId: string): number {
  return DEFAULT_SCENARIO.rounds[roundNumber - 1]?.choices.find((choice) => choice.id === actionId)?.energy ?? 0;
}

function toJoinedPlayer(player: StoredPlayer): JoinedPlayer {
  const role = DEFAULT_SCENARIO.roles.find((candidate) => candidate.id === player.role);
  if (!role) throw new GameStoreError("This player has an unknown role.", 500);
  return { id: player.id, name: player.name, token: player.token, role };
}

function getMemoryPlayers(roomId: string) {
  return [...memory.players.values()]
    .filter((player) => player.roomId === roomId)
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

function getMemoryActionsForRoom(roomId: string) {
  return [...memory.actions.values()].filter((action) => action.roomId === roomId);
}

function getMemoryActions(playerId: string) {
  return [...memory.actions.values()].filter((action) => action.playerId === playerId);
}

function touchRoom(room: StoredRoom) {
  room.version += 1;
  room.updatedAt = Date.now();
}

function assertHostToken(room: StoredRoom, token: string) {
  if (room.hostToken !== token) throw new GameStoreError("Only the room host can do that.", 403);
}

type ControlCommand = "start" | "advance" | "reset";

function requireControlCommand(value: unknown): ControlCommand {
  if (value === "start" || value === "advance" || value === "reset") return value;
  throw new GameStoreError("Choose start, advance, or reset.", 400);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") throw new GameStoreError("Enter your name to join.", 400);
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 18) {
    throw new GameStoreError("Use a name between 2 and 18 characters.", 400);
  }
  return name;
}

function optionalShortString(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.length <= 200 ? value.trim() : null;
}

function makeUniqueDisplayName(name: string, existingNames: string[]): string {
  const used = new Set(existingNames.map((existing) => existing.toLocaleLowerCase()));
  if (!used.has(name.toLocaleLowerCase())) return name;

  for (let copy = 2; copy < 1000; copy += 1) {
    const suffix = ` · ${copy}`;
    const candidate = `${name.slice(0, Math.max(1, 18 - suffix.length))}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `${name.slice(0, 14)} · 999`;
}

function requireShortString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new GameStoreError(`A valid ${label} is required.`, 400);
  }
  return value.trim();
}

function createRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

function createId() {
  return crypto.randomUUID();
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Error && /unique|constraint/i.test(error.message);
}

type D1RoomRow = {
  id: string;
  code: string;
  host_token: string;
  scenario_id: string;
  status: RoomStatus;
  round: number;
  phase_started_at: number | null;
  version: number;
  created_at: number;
  updated_at: number;
};

type D1PlayerRow = {
  id: string;
  room_id: string;
  name: string;
  player_token: string;
  role: string;
  score: number;
  last_action: string | null;
  last_action_at: number | null;
  joined_at: number;
};

type D1ActionRow = {
  id: string;
  room_id: string;
  player_id: string;
  round: number;
  action: string;
  points: number;
  created_at: number;
};

function toStoredRoom(row: D1RoomRow): StoredRoom {
  return {
    id: row.id,
    code: row.code,
    hostToken: row.host_token,
    scenarioId: row.scenario_id,
    status: row.status,
    round: row.round,
    phaseStartedAt: row.phase_started_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStoredPlayer(row: D1PlayerRow): StoredPlayer {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    token: row.player_token,
    role: row.role,
    score: row.score,
    lastAction: row.last_action,
    lastActionAt: row.last_action_at,
    joinedAt: row.joined_at,
  };
}

function toStoredAction(row: D1ActionRow): StoredAction {
  return {
    id: row.id,
    roomId: row.room_id,
    playerId: row.player_id,
    round: row.round,
    action: row.action,
    points: row.points,
    createdAt: row.created_at,
  };
}
