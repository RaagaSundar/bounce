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
[docs/FABLE_FRONTEND.md](docs/FABLE_FRONTEND.md). Room codes are `[A-Z2-9]{6}`
with ambiguous glyphs excluded; host and player tokens stay out of URLs and off
the projector.

## Frontend

Three surfaces:

| Route | What it is |
|-------|------------|
| `/` | Landing — pick a side |
| `/host` | The big screen: giant animated QR → live lobby fill → game spectacle → podium + power pairs |
| `/play` | The phone: join flow (name → orb builder → vibe) → lobby → thumb-sized controller → "your people tonight" |

Extras carried over from the demo:

- `?lite` on any route swaps the WebGL backdrops for CSS — for weak event
  hardware (and headless testing).
- `window.__bounce` exposes the zustand store in the console for driving a
  session manually.

## Design language — "Ink & Acid"

Event-ephemera system: the host screen is a stage LED board in a dark venue
(ink + acid dot-matrix WebGL floor); the phone is a *printed* object — laminate
pass, ballot stubs, rubber stamps, till receipts on bone paper. Anton for poster
type, Space Mono for metadata, Archivo for body. Four colors total (ink
`#141412`, bone `#e8e4d8`, acid `#c6ff32`, signal `#ff4b1f` + cobalt for
stickers), film grain everywhere, hard offset shadows instead of glow,
difference-blend wordmark on the landing seam. Avatars are generated SVG sticker
badges (no emoji). No neon-gradient-on-dark.

## Migration status

The demo's screens under `src/` are being ported into the App Router. Until that
lands, `src/` is the reference implementation and `app/SideQuestClient.tsx` is
the live (unstyled) client. `src/store/session.js` holds the mocked
`BroadcastChannel` session that the real API and, later, the WebSocket layer
replace.
