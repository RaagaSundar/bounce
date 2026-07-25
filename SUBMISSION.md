# Night Hack submission kit — fill the Tally form from this

Form: https://tally.so/r/5BgNMZ · Closes 11:45 PM. Deploy FIRST, then fill.

## ⚠️ Deploy (the only step that needs you — ~3 minutes)

Judges require a link that works outside localhost, no auth, incognito.

```bash
npx wrangler login
```

```bash
npx wrangler d1 create bounce-d1
```

Copy the `database_id` it prints, then (PowerShell):

```bash
$env:CLOUDFLARE_D1_DATABASE_ID="<paste-id-here>"; npm run deploy
```

The URL is `https://bounce.<your-subdomain>.workers.dev`. **Test it in an
incognito window on your phone's cellular data** (not venue wifi): open
`/try`, press START on Motion Duel, wobble the phone pane. If it plays, you
meet the demo requirement.

## Form fields, pre-written

**One-liner (49 chars):**
`One screen. Every phone. Strangers become a crew.`

**Short project description:**
Bounce turns any room with a projector into a live party game that engineers
introductions. The host throws a QR on the big screen; every phone that scans
it becomes a controller — no app, no account, join in ten seconds. Motion Duel
then pairs people who have never met, floods each pair's phones with a matching
colour so they must physically find each other, and makes them duel: hold your
phone steadier than the stranger in front of you. The game is the icebreaker;
the introduction is the product. One Cloudflare Durable Object per room is the
authoritative game server — server-side ticks, anti-cheat input budgets, and
reconnect-with-identity so venue wifi can't kill a round.

**What we built tonight (pick 3–5):**
- A real-time multiplayer engine on Cloudflare Durable Objects: one object per
  room, hibernatable WebSockets, a 120ms authoritative tick, per-player input
  rate budgets, and reconnect tokens that restore identity and score.
- Motion Duel end-to-end: a pairing engine that matches strangers who haven't
  met yet across the whole event, colour-beacon "find your opponent" phase, and
  accelerometer duels judged entirely server-side.
- A pluggable minigame contract (pure functions, seeded RNG, 63 passing tests)
  — adding a game is one file plus one catalog line; two more games (Pair
  Sprint, Crossfire) already run on it server-side.
- The full arcade UI on both surfaces: projector spectacle (QR beacon, live orb
  lobby, duel cards, podium) and phone controller (colour floods, wobble gauge,
  haptics), plus `/try` — both surfaces in one tab for single-device demos.
- Cut the legacy quiz engine entirely; D1 is now a clean archive of finished
  games with one REST read.

**Demo link / Live URL:** `https://bounce.<subdomain>.workers.dev/try`
(judge-proof single-tab demo; `/host` + phones for the live-on-stage version)

**GitHub:** https://github.com/RaagaSundar/bounce — ⚠️ currently PRIVATE.
Make it public before submitting (Settings → General → Danger Zone → Change
visibility) or judges can't open it. Latest push includes everything.

**Sponsor tools used:** Cloudflare Workers, Durable Objects, D1, Miniflare/
workerd (add whatever else you used tonight: Claude Code, etc.)

## 60-second video script (shoot on one take, phone filming the laptop + a phone)

- 0–8s — `/host` on the laptop: "This is Bounce. Any projector, any room."
  Point at the glowing QR.
- 8–18s — Scan with a phone, type a name, orb pops into the lobby on the big
  screen. "No app. Ten seconds and your phone's a controller."
- 18–35s — START Motion Duel. Show both phones flooding the same colour:
  "It pairs strangers who've never met and makes them physically find each
  other." Hold both phones up.
- 35–50s — Steady phase: one hand rock still, shake the other. OUT 💥 on one
  phone, WON 👑 on the other, podium confetti on the projector.
- 50–60s — "One Durable Object per room, server-authoritative, cheat-resistant,
  survives venue wifi. Built tonight. Bounce."

## On-stage runbook (top 10, no slides)

1. Open `/host` on the venue screen BEFORE walking up (room code persists on
   refresh).
2. Ask the judges to scan the QR with their own phones — that IS the demo.
3. Start Motion Duel; narrate the colour-matching moment while they find each
   other; let the room laugh at whoever flinches.
4. If wifi dies mid-round: kill and reopen the phone tab — it rejoins with the
   same score. Say that out loud; it's the flex.
5. Backup if the venue network blocks everything: `/try` runs both surfaces in
   one tab on cellular.
