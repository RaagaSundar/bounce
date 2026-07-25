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

## Design language — "Ink & Acid"

Event-ephemera system: the host screen is a stage LED board in a dark venue
(ink + acid dot-matrix WebGL floor); the phone is a *printed* object — laminate
pass, ballot stubs, rubber stamps, till receipts on bone paper. Anton for poster
type, Space Mono for metadata, Archivo for body. Four colors total (ink
`#141412`, bone `#e8e4d8`, acid `#c6ff32`, signal `#ff4b1f` + cobalt for
stickers), film grain everywhere, hard offset shadows instead of glow,
difference-blend wordmark on the landing seam. Avatars are generated SVG sticker
badges (no emoji). No neon-gradient-on-dark.

## Status

`/`, `/host`, and `/play` all run on the live socket layer. The original quiz
engine (`db/game-store.ts`, its REST routes, and the `src/` demo it was ported
from) has been deleted — D1 is now purely the archive, written when a game
finishes and read back via `GET /api/rooms/:code/history`.

Two minigames ship: **Reaction Tap** (room scope) and **Motion Duel** (party
scope — pairs strangers who have not met and makes them duel). Adding another is
one file in `games/` plus a line in `games/catalog.ts`.
