# BOUNCE

Live event networking, but it's a game. Scan a QR on the big screen, play
rapid-fire rounds on your phone, and walk away knowing exactly who to go talk to.

This repo is the merge of two halves that were built separately: a real
Cloudflare-backed game engine, and an art-directed frontend. See
[PLAN.md](PLAN.md) for where it's going next.

## Run locally

```bash
npm install
npm run dev
```

Validation:

```bash
npm run lint
npm run build
npm test
```

## Stack

- App Router running on **vinext** / Cloudflare Workers (not the Next CLI)
- **Cloudflare D1** for durable rooms, players, and actions
- **Drizzle** schema and checked-in migration under `drizzle/`
- React 19 · Tailwind v4 · Framer Motion (choreography) · react-three-fiber
  (LED floor) · zustand · qrcode.react · canvas-confetti

## Backend

The server is the sole authority for score, leaderboard, team energy, valid
actions, and authorization. The client never computes a score. Keep these
surfaces intact:

- `app/api/**` — public game API routes (thin handlers)
- `db/game-store.ts` — room lifecycle, scoring, host authorization
- `db/schema.ts` and `drizzle/**` — D1 persistence and migrations

The full HTTP contract is documented in
[docs/LIVE_PROTOCOL.md](docs/LIVE_PROTOCOL.md). Room codes are `[A-Z2-9]{6}`
with ambiguous glyphs excluded; host and player tokens stay out of URLs and off
the projector.

## Frontend

Three surfaces:

| Route | What it is |
|-------|------------|
| `/` | Landing — pick a side |
| `/host` | The big screen: QR + room code → lobby fill → game stage → podium |
| `/play` | The phone: join → lobby → the controller for whatever game is running |
| `/try` | **Both surfaces in one tab.** Start here if you have no second device. |

`/try` runs a real room with the projector and a player phone side by side, each
holding its own WebSocket to the same Durable Object. Nothing about it is
simulated — it exists because a two-surface product is invisible until you have
two devices in your hands.

## Measured, not claimed

Against a room running the real Durable Object:

| | |
|---|---|
| Concurrent sockets in one room | **201** (200 players + host), zero errors |
| Round trip, p50 / p95 under that load | **4.3ms / 44ms** |
| Sub-groups formed from 200 players | **100 pairs**, all served their own private view |
| Fan-out to all 200 on game start | **692ms** |
| Previous architecture's floor | 1300ms HTTP polling |

Inputs never broadcast per-message: they mark their instance dirty and a fixed
120ms tick flushes at most one frame. 400 inputs pushed as fast as a socket
allowed produced **one** frame back, not 400.

## Design language — "Arcade"

The original Bounce look, kept because it stops thumbs: deep violet space
(`#0a0612`) with drifting starfield and gradient blobs, glassmorphic panels,
neon glow on everything that matters. Unbounded for display type, Space Grotesk
for body. Accents: violet `#8b5cf6`, magenta `#ff3dae`, lime `#c8ff3e`, cyan
`#3ee7ff`, amber `#ffb03a`. Players are glowing emoji orbs derived
deterministically from their id (`app/live/arcade.tsx`), so every screen renders
the same creature for the same person with nothing stored. The skin lives at the
end of `app/globals.css` as `.skin-arcade`; the earlier "Ink & Acid" experiment
(`.skin-ink-acid`) remains in the file but no live screen uses it.

## Status

`/`, `/host`, and `/play` all run on the live socket layer. The original quiz
engine (`db/game-store.ts`, its REST routes, and the `src/` demo it was ported
from) has been deleted — D1 is now purely the archive, written when a game
finishes and read back via `GET /api/rooms/:code/history`.

One minigame is fully wired end-to-end: **Motion Duel** (party scope — pairs
strangers who have not met and makes them duel). **Pair Sprint** and
**Crossfire** exist as game modules in `games/catalog.ts` but don't have
host/play UI yet, so starting them currently falls back to the lobby view.
Reaction Tap was cut — it worked solo and never put two specific people in
front of each other, which defeats the point of the product. Every game in the
catalog has to force real interaction between people. Adding one is one file in
`games/` plus a line in `games/catalog.ts`.
