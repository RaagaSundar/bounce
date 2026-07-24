# Bounce

Bounce turns dead time at an event into a shared, phone-powered game. The
current gameplay is **RoomRaid**: one host screen, a QR join link, and a live
co-op/leaderboard loop.

The backend is ready for a new frontend. Read
[the frontend handoff](docs/FABLE_FRONTEND.md) before replacing the current UI.

## Stack

- Next-style App Router running on vinext / Cloudflare Workers
- Cloudflare D1 for durable rooms, players, and actions
- Drizzle schema and checked-in migration under `drizzle/`
- Polling HTTP API; no auth provider, WebSocket, or localhost dependency

## Run locally

```bash
npm install
npm run dev
```

Validation:

```bash
npm run lint
npm run build
```

## Backend ownership

Keep these surfaces intact while replacing the frontend:

- `app/api/**` — public game API routes
- `db/game-store.ts` — room lifecycle, scoring, host authorization
- `db/schema.ts` and `drizzle/**` — D1 persistence and migrations

The old client is contained in `app/SideQuestClient.tsx`; it can be replaced
without changing the API contract.
