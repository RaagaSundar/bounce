# Bounce live protocol

Everything moment-to-moment runs over one WebSocket. This is the contract to
build a frontend against; it is stable and the backend will not change it
without updating this file.

```
ws(s)://<origin>/api/rooms/:code/live
```

`:code` is `[A-Z2-9]{6}` (ambiguous glyphs excluded so it reads cleanly off a
projector). The room's Durable Object is addressed by that code, so connecting
to the same code always reaches the same room.

The REST API in `docs/FABLE_FRONTEND.md` still exists for the legacy quiz. New
work should use this socket.

## Connecting

There is no create-room call. **The first client to send `hello` as a host
claims that code** and receives a `hostToken`. Generate a random code on the
host, connect, and if you get `"This room already has a host."` back, roll a new
code and retry.

**Auth is the first message, never the URL.** Tokens must not appear in query
strings, which get logged and can be read off a projector.

## Client → server

| Message | Shape | Notes |
| --- | --- | --- |
| `hello` (host) | `{ type, role: "host", hostToken? }` | Omit the token to claim an unclaimed room; send it to resume. |
| `hello` (player) | `{ type, role: "player", name?, playerToken? }` | Send `playerToken` to resume an identity; `name` is 2–18 chars and only needed on first join. |
| `input` | `{ type, input: <game specific> }` | Routed to the sender's game instance. |
| `host:start` | `{ type, gameId }` | Host only. |
| `host:end` | `{ type }` | Host only. Stops the game and returns to lobby. |
| `ping` | `{ type }` | Replies `{ type: "pong", at }`. |

## Server → client

| Message | Shape |
| --- | --- |
| `welcome` | `{ type, role, code, hostToken? , playerId?, playerToken?, name?, catalog? }` |
| `room` | `{ type, code, players: [{id,name}], activeGameId, catalog }` |
| `view` | `{ type, gameId, scope, view, groups? }` |
| `results` | `{ type, gameId, results: { headline, scores: [{playerId,name,points}] } }` |
| `game:ended` | `{ type }` |
| `error` | `{ type, error }` |

`playerToken` and `hostToken` are only ever sent to the socket that owns them.
They never appear in `room` or in any host view — the projector is safe to show.

Persist them under `bounce:host:{code}` and `bounce:player:{code}` and resend on
reconnect. A dropped phone that resends its token returns as the **same player
with the same score**, not a duplicate.

## Send rate and flush timing

**Read this before writing an input loop.**

Inputs are applied immediately but are **not** broadcast or persisted on
arrival. They mark their instance dirty, and the fixed ~120ms server tick
flushes at most one frame per instance. A motion game streaming samples per
player would otherwise mean thousands of storage writes and fan-out sends per
second at event scale.

Practical consequences:

- **You get roughly 8 `view` frames a second, maximum.** Sending input faster
  than that does not produce more frames. Interpolate or animate locally
  between frames rather than expecting one per input.
- **Sending faster than 30 inputs/second/player is pointless** — a sliding
  window drops the excess silently, with no error, to stop one client flooding
  a room. Sample motion at ~10–20Hz.
- Worst-case added latency from an input to its frame is one tick (~120ms),
  well inside the perceptual budget.
- When nothing changes, nothing is sent, so an idle room can hibernate.

## Disconnects

Closing the last socket for a player triggers the game's `onPlayerLeft`, if it
implements one. A `motion-duel` opponent who walks away forfeits immediately
rather than leaving their partner holding a phone still for the full timer; a
`reaction-tap` player stops being counted in "has everyone tapped?".

Their roster entry and banked score survive. Reconnecting with the stored
`playerToken` restores the same identity and score - it is not a new player.

## Views

`getViewForPlayer` is the only path state reaches a phone, so a player cannot
see another player's private detail. The host gets a separate projector view.

For `scope: "party"` games the roster is split into sub-groups; a player's
`view` is their own group only, while the host additionally receives `groups`,
an array of `{ id, view }` for every sub-group.

Everything timing-related is server-stamped. The client may render a countdown
from the timestamps it is given, but the server decides when phases flip.

## Games

`GET`ting the catalog is unnecessary — it arrives in `welcome` and `room`.

### `reaction-tap` (scope: `room`)

Input: `{ type: "tap" }`. Server arrival order decides rank; the client never
reports its own timing.

Player view:
```ts
{
  phase: "arming" | "waiting" | "live" | "reveal" | "complete",
  round, totalRounds,
  armingEndsAt: number | null,
  liveSince: number | null,     // null until GO actually fires
  revealEndsAt: number | null,
  you: { tapped, reactionMs, rank, roundPoints, falseStart, score },
  tapsIn, playerCount,
  lastRound: { round, winner: { playerId, name, reactionMs } | null, falseStarts } | null,
}
```

Host view adds `board: [{ playerId, name, score, reactionMs, rank, falseStart }]`.

The GO timestamp is deliberately withheld while `phase === "waiting"` — sending
it would let a client schedule a perfect tap instead of reacting. Do not try to
predict it.

### `motion-duel` (scope: `party`)

Input: `{ type: "motion", magnitude: number }` — send the accelerometer
magnitude a few times a second while `phase === "steady"`. The server clamps it
and decides elimination.

Player view:
```ts
{
  phase: "find" | "steady" | "result" | "complete",
  colour: string,               // your group's colour; find the matching phone
  opponents: [{ name, out }],
  findEndsAt, duelEndsAt, threshold,
  you: { out, wobble, score, won },
  winner: string | null,
}
```

**Frontend requirement:** `DeviceMotionEvent.requestPermission()` must be called
from a user gesture on iOS 13+, and needs HTTPS. Put it behind an explicit
"I'm ready" button in the find phase. On other browsers, listen to `devicemotion`
directly. Send `Math.hypot(x, y, z)` from `accelerationIncludingGravity` minus
the ~9.8 baseline, or just the delta between samples.

## Worked example

```js
const ws = new WebSocket(`wss://${location.host}/api/rooms/${code}/live`);
ws.onopen = () => ws.send(JSON.stringify({
  type: "hello", role: "player",
  name, playerToken: localStorage.getItem(`bounce:player:${code}`) ?? undefined,
}));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === "welcome" && m.playerToken) {
    localStorage.setItem(`bounce:player:${code}`, m.playerToken);
  }
  if (m.type === "view") render(m.view);
};
```

`app/live/useRoomSocket.ts` is a working reference implementation with
reconnect-with-backoff already handled.

## Recap / history (REST)

Finished games are archived to D1 when they complete. Live play is the socket's
job; the archive is REST, because nothing here is needed moment-to-moment.

```
GET /api/rooms/:code/history  ->  { sessions: [...] }
```

Newest first, capped at 50:

```ts
{
  id, gameId, scope,
  playerCount, groupCount,
  startedAt, endedAt,
  results: { headline, scores: [{ playerId, name, points }] },
}
```

A room that has never finished a game returns `{ sessions: [] }` with `200`,
not an error — so an event recap screen can call it unconditionally.

## Guarantees

- The server is the sole authority for score, ranking, timing and elimination.
- No message is broadcast when a tick changes nothing, so idle rooms are quiet
  and can hibernate.
- Reconnecting with a token restores identity, score and group membership.
- Sub-group state never leaks across groups.

The one place the client is trusted is `motion-duel`'s magnitude, because the
accelerometer physically lives on the phone. It is clamped, and the server still
owns the outcome, but a determined cheater could under-report movement. Accepted
trade for a party game.
