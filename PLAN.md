# Bounce rebuild plan

Decisions for turning RoomRaid from a reskinned quiz into real, played
minigames. Records *what was verified*, not just what was instructed.

---

## 0. Repo unification (done)

Bounce was split across two codebases that each had half the product:

| Was | Held |
| --- | --- |
| `~/Documents/Codex/2026-07-21/hey-there-this-hackathon-im-interested` | The real backend — D1, Drizzle, vinext on Workers, the room/token trust model. Shipped a plain quiz UI. |
| `~/Bounce` | The Ink & Acid frontend — art direction, choreography, projector view. No server at all; "multiplayer" was a `BroadcastChannel` between two tabs. |

Both are now merged into **this** repo, with both histories preserved. The
backend's two commits are ancestors of the merge, so pushes to
`RaagaSundar/bounce` fast-forward.

**Stack decision: vinext / App Router is retained.** A lighter alternative was
considered and rejected — the backend has **zero Next imports** in `db/`,
`worker/`, or `app/api/` (verified by grep), so it could have run on a plain
Cloudflare Worker serving the existing Vite SPA. That was passed over in favour
of keeping the App Router and migrating the demo's screens into it, so the whole
product lives in one framework rather than two.

Consequence: the demo's screens under `src/` must be ported to App Router client
components. Their routing (React Router) and mocked session (zustand +
`BroadcastChannel`) do **not** come across — that layer is replaced by the API
client and, later, the socket client. `react-router-dom` is already dropped.

---

## 1. Transport: Durable Objects — verified viable

One Durable Object per room (`RoomSession`, keyed by room code via
`idFromName`), Hibernatable WebSockets, `drizzle-orm/durable-sqlite` on
`ctx.storage`. No Node/`ws` fallback, no Firebase/PlayFab/EOS, no game engine.

Verified against the *installed* toolchain rather than assumed, since this stack
is newer than most training data:

- `drizzle-orm@0.45.2` ships `drizzle-orm/durable-sqlite/driver.js`.
- `@cloudflare/vite-plugin@1.37.1` types its inline `config` as
  `Partial<Omit<Unstable_Config, keyof NonApplicableConfig>>`. The excluded list
  is `base_dir, build, find_additional_modules, no_bundle, preserve_file_names,
  rules, site, tsconfig` — **`durable_objects` and `migrations` are not
  excluded**, so both are legal in `localBindingConfig`.
- `wrangler@4.92.0`'s config type carries `durable_objects`, `migrations`, and
  `new_sqlite_classes`.
- The build already emits `dist/server/wrangler.json` containing
  `"durable_objects":{"bindings":[]}` and `"migrations":[]`, and
  `.wrangler/deploy/config.json` points `wrangler deploy` at that file.

**Consequence:** adding the DO binding to `localBindingConfig` in
`vite.config.ts` propagates to production deploy automatically. No separate
`wrangler.toml` needed.

**Gate: CLEARED.** `vinext dev` + Miniflare runs Durable Objects, Hibernatable
WebSockets, and storage alarms locally. Verified against a running server:
reconnecting to the same code resumed persisted state while a different code got
an isolated instance, and a full three-round match ran to completion off the
alarm-driven tick. Socket round trip measured p50 3.1ms / p95 4.6ms over 30
samples on localhost — which proves the server-side budget is negligible, not
that production will be 3ms; real latency will be dominated by network RTT to
the edge. The in-memory `Map` fallback in `game-store.ts` can now be removed.

---

## 2. The OpenAI / Codex scaffolding — strip, in three tiers

| File | Call | Why |
| --- | --- | --- |
| `app/chatgpt-auth.ts` | **Delete** | Verified **zero importers**. Dead code — the "second channel" was scaffolded, never wired. |
| `build/sites-vite-plugin.ts` | **Delete** + drop from `vite.config.ts` | Only copies `.openai/hosting.json` and `drizzle/` into `dist/.openai` for the Sites control plane. `wrangler deploy` reads `dist/server/wrangler.json` and never looks there. |
| `.openai/hosting.json` | **Inline its values, then delete** | ⚠️ **Load-bearing.** `vite.config.ts` destructures `{ d1, r2 }` from it to name the D1 binding. Deleting it naively drops the `DB` binding. |
| `examples/` | **Delete** | Scaffold sample (`examples/d1/**`), unrelated to the game. |
| `drizzle/` | **Keep** | Real migration + `drizzle-kit generate` target. The D1 source of truth. |

**Not preserving ChatGPT-App distribution.** The core loop is *scan a QR on a
projector at a venue*, which has no ChatGPT session to authenticate against; the
auth path is unused today, so nothing working is lost. The `sidequest-sites` git
remote is **kept** so the option isn't destroyed, just not depended on.

**Deploy blocker (needs your Cloudflare account):** `database_id` is the
placeholder `00000000-0000-4000-8000-000000000000`. A real D1 database must be
created and that id substituted before `wrangler deploy` works.

---

## 3. Data model

`game_actions` has `UNIQUE(player_id, round)` over a single `action TEXT`
column — that constraint *is* the multiple-choice game design, and it blocks
every proposed minigame.

**Durable Object SQLite (live authority):** roster, sockets and their
`serializeAttachment` identity, active `MiniGame` id + `TState`, party
assignments, and an append-only input log —
`(id, game_instance_id, player_id, seq, kind, payload JSON, received_at)` with a
server-stamped `received_at` and no per-round uniqueness, so it holds a stroke, a
guess, a vote, or a tap timestamp equally well.

**D1 (archive, demoted from live store):** per-instance results (`results JSON`,
since shapes vary too much to normalize), cross-event history, and pairing
history so Pair Sprint avoids re-pairing across a whole event. Written on room
completion, not on every input.

## 4. `MiniGame` interface

Per the brief (`createInitialState` / `applyInput` / `tick` /
`getViewForPlayer` / `isComplete` / `getResults`, plus `scope: "room" | "party"`),
with two commitments:

- Every method is a **pure function**. No clocks, no I/O, no ambient randomness —
  `now` and a seeded RNG are arguments. This is what makes them unit-testable
  without spinning up a Durable Object.
- `tick` returns the **same reference** when nothing changed, so the DO skips
  broadcasting no-op frames.

`RoomSession` owns sockets, roster, active game, party assignment, and host
control, and never imports a specific game. Success test: **adding a minigame =
adding one file under `games/`**, touching no transport, DO, or lobby code.

## 5. Build order

- **Phase 1 — engine core.** DO + Hibernatable WebSockets + durable-sqlite, the
  `MiniGame` interface, `worker/index.ts` upgrade routing, and collapsing the six
  hand-duplicated `*InD1` / `*InMemory` pairs behind one storage interface. REST
  stays for create-room / first-join / final recap.
- **Phase 2 — Reaction Tap** end to end: the smallest full slice that proves the
  engine, plus the first ported Ink & Acid screens.
- **Phase 3 — Pair Sprint**, including `"party"` scope and no-repeat pairing.
  The mode that justifies the product.
- **Phase 4 — Crossfire**, then Draw & Guess / Human Bingo Hunt as time allows,
  a host "pick next game" lobby, an event recap screen, then `wrangler deploy`.

Running alongside: porting `src/` into the App Router (see §0).

## 6. Targets

Input→broadcast under ~150–200ms (vs. the 1300ms polling floor); one room holding
150–300 connections; reconnect inside ~2s preserving identity, score and role with
no duplicate player; **nothing trusted from the client** — not score, timer,
round, or win claim; one storage implementation per environment.

## 7. Known waste to fix while rebuilding

`buildPublicState` returns `scenario: DEFAULT_SCENARIO` in **every** response,
and every client polls every 1300ms. At 200 players that's ~9,200 responses/min
each re-sending several KB of static prose. The socket layer should send the
scenario once on connect, then deltas.

Also: `game_rooms.scenario_id` is written but never read — `buildPublicState`
reaches straight for the module-level const, so the multi-scenario seam is
implied by the schema and not actually wired. The `MiniGame` catalog replaces it.

## 8. Risks

1. **Local DO support** — gates deleting the memory fallback. Verify by running.
2. **Hibernation vs. `tick`** — a room mid-game can't hibernate. Intended
   resolution: alarm-driven ticks only while a game is active, idle lobbies
   hibernate. Needs measurement.
3. **The UI port** — pulling react-three-fiber and Framer Motion into an RSC app
   means careful `"use client"` boundaries. Not a copy-paste; budget real time.
4. **Placeholder D1 id** — blocks production deploy.
