# Bounce frontend handoff

## What is already built

The backend is a working multi-device event-game engine. It persists state in
Cloudflare D1 in production and falls back to in-memory state for local work.
It has no user accounts and needs no WebSocket connection: poll the room state
every 1–2 seconds while a player or host is active.

The default scenario is still called **RoomRaid**. Bounce is the product brand;
the game/scenario may be rethemed later without changing the transport API.

## Frontend boundary

Replace the existing client UI in `app/SideQuestClient.tsx` (or replace
`app/page.tsx` and use a new client component). Do not put host or player
tokens in a URL, on the projector, or in a public API response.

Persist these values in browser local storage:

- Host: `bounce:host:{roomCode}` → `hostToken`
- Player: `bounce:player:{roomCode}` → JSON `{ id, name, token, role }`

For the projector QR code, use the deployed origin plus `/?room={ROOM_CODE}`.
Never hard-code `localhost`.

## HTTP API

All JSON responses set `Cache-Control: no-store`. On failure, the response is
`{ "error": "human-readable message" }` with a non-2xx status.

| Endpoint | Body | Response / use |
| --- | --- | --- |
| `POST /api/rooms` | none | Creates a room. Returns `{ state, hostToken }`. Save `hostToken` only on the host device. |
| `GET /api/rooms/:code` | none | Returns `{ state }`. This is the polling endpoint for both host and player views. |
| `POST /api/rooms/:code/join` | `{ name, token? }` | Returns `{ state, player }`. `name` is 2–18 chars. Send prior `token` to resume the same player and role. |
| `POST /api/rooms/:code/action` | `{ playerId, token, action }` | Selects/replaces this player’s move in the current round. Returns `{ state }`. |
| `POST /api/rooms/:code/control` | `{ token, command }` | Host-only. `command` is `start`, `advance`, or `reset`. Returns `{ state }`. |
| `GET /api/scenario` | none | Returns `{ scenario }` for a generic landing / game catalog view. |

Room codes are six characters matching `[A-Z2-9]{6}`. Normalise pasted codes to
uppercase before making requests.

## State shape

Every game mutation and `GET /api/rooms/:code` returns this state shape:

```ts
type RoomState = {
  room: {
    code: string;
    status: "lobby" | "playing" | "complete";
    round: number; // 0 in lobby; 1-indexed while playing
    version: number;
    createdAt: number;
    updatedAt: number;
    phaseStartedAt: number | null; // epoch ms
  };
  scenario: {
    id: string;
    brand: string;
    title: string;
    subtitle: string;
    intro: string;
    lobbyPrompt: string;
    completionTitle: string;
    completionPrompt: string;
    roles: Role[];
    rounds: GameRound[];
  };
  currentRound: GameRound | null;
  players: PublicPlayer[];
  leaderboard: PublicPlayer[]; // descending score, then join order
  progress: {
    playerCount: number;
    actionCount: number;
    teamEnergy: number;
    teamTarget: number;
    percent: number;
  };
};

type Role = { id: string; label: string; emoji: string; mission: string };
type GameChoice = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  points: number;
  energy: number;
};
type GameRound = {
  id: string;
  eyebrow: string;
  title: string;
  prompt: string;
  timeLimitSeconds: number;
  teamTarget: number;
  choices: GameChoice[];
};
type PublicPlayer = {
  id: string;
  name: string;
  score: number;
  lastAction: string | null;
  lastActionAt: number | null;
  hasActed: boolean; // true only for the current round
};
```

`currentRound` is `null` in the lobby and after completion. During a round,
render `currentRound.choices` exactly as returned; each choice ID is valid for
the action endpoint. A new choice replaces the player’s prior choice in the
same round, so a UI may say “locked in” while still allowing a deliberate
change.

## Required client flows

1. **Host:** call `POST /api/rooms`; show a QR with `?room=CODE`; store the
   host token; poll state; call `control/start`, then `control/advance` between
   phases, and `control/reset` after completion.
2. **Player:** open `?room=CODE`; call `join` with a name; save the returned
   player object; poll state; render the returned role privately; submit one of
   `currentRound.choices` using `action`.
3. **Reconnect:** if local storage has a player record, call `join` with its
   saved `name` and `token`. The backend returns the original player and role
   rather than adding a duplicate.
4. **Late join:** `join` works during a game. Render the current round rather
   than forcing a tutorial.

## Timing and game rules

`phaseStartedAt` and `currentRound.timeLimitSeconds` are enough to display a
local countdown. The server deliberately does **not** auto-advance phases; the
host does that with `control/advance` so live demos stay controllable.

The backend is the source of truth for score, leaderboard, team energy, valid
actions, duplicate-name handling, and authorization. Do not calculate or trust
score client-side.

## Keep it safe

- A `hostToken` can start, advance, and reset a room. Keep it host-only.
- A player `token` can act only for its matching `playerId`. Keep it private.
- The public room state intentionally never includes either token.
- Do not add participant directories, contact info, microphone, camera, or
  location requirements to the MVP.
