# Night Hack submission kit — fill the Tally form from this

Form: https://tally.so/r/5BgNMZ · Closes 11:45 PM.

## ✅ Deploy — done, this is your link

```
https://machine-step-sign-genome.trycloudflare.com
```

This is a Cloudflare quick tunnel straight into the dev server running on this
laptop (real `wrangler deploy` needs an interactive Cloudflare login this
environment couldn't do in time). Verified working: loads with no login wall,
tested from a clean incognito-equivalent request, room + WebSocket connect to
the real Durable Object.

**⚠️ Keep it alive until judging is fully done:**
- Leave this laptop on, plugged in, and awake (disable sleep — Settings →
  System → Power → set screen/sleep to "Never" for now).
- Don't close the terminal windows running the dev server or the tunnel.
- Stay on this wifi. If the network drops, the link drops.

If you get a free minute later and want a permanent (non-laptop-dependent)
URL instead: run `npx wrangler login` yourself in a terminal (needs your own
browser to approve), then `npx wrangler d1 create bounce-d1`, then
`CLOUDFLARE_D1_DATABASE_ID=<id> npm run deploy`. Not required to submit —
the tunnel link above already satisfies the demo requirements.

## Form fields, pre-written

**One-liner (49 chars):**
`One screen. Every phone. Strangers become a crew.`

**Short project description:**
Bounce turns any room with a projector into a live party game that engineers
introductions. The host throws a QR on the big screen; every phone that scans
it becomes a controller — no app, no account, join in ten seconds. Motion Duel
pairs people who have never met, floods each pair's phones with a matching
colour so they must physically find each other, and makes them duel: hold your
phone steadier than the stranger in front of you. Brawl throws the whole room
into a Smash-style free-for-all played entirely with thumbs — pick a target,
pick a move, read the room. The game is the icebreaker; the introduction is the
product. One Cloudflare Durable Object per room is the authoritative game
server — server-side ticks, anti-cheat input budgets, and reconnect-with-identity
so venue wifi can't kill a round.

**What we built tonight (pick 3–5):**
- A real-time multiplayer engine on Cloudflare Durable Objects: one object per
  room, hibernatable WebSockets, a 120ms authoritative tick, per-player input
  rate budgets, and reconnect tokens that restore identity and score.
- Motion Duel end-to-end: a pairing engine that matches strangers who haven't
  met yet across the whole event, colour-beacon "find your opponent" phase, and
  accelerometer duels judged entirely server-side.
- Brawl end-to-end: a whole-room free-for-all — attack/grab/shield resolved
  simultaneously for every player each clash, Smash-style damage percentages
  and stocks, all server-authoritative.
- A pluggable minigame contract (pure functions, seeded RNG, 73 passing tests)
  — adding a game is one file plus one catalog line; two more games (Pair
  Sprint, Crossfire) already run on it server-side, UI still in progress.
- The full arcade UI on both surfaces: projector spectacle (QR beacon, live orb
  lobby, duel/brawl cards, podium) and phone controller (colour floods, wobble
  gauge, move picker, haptics), plus `/try` — both surfaces in one tab for
  single-device demos.

**Demo link / Live URL:**
`https://machine-step-sign-genome.trycloudflare.com/try`
(judge-proof single-tab demo; `/host` + phones for the live-on-stage version)

**GitHub:** https://github.com/RaagaSundar/bounce — already public, ready to
paste as-is.

**Sponsor tools used:** Cloudflare Workers, Durable Objects, D1, Miniflare/
workerd, Claude Code (add whatever else you used tonight).

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
  survives venue wifi. Built tonight. Bounce." (Optional: if you have a few
  extra people around, swap in a Brawl clash instead — pick target, pick move,
  show a KO.)

## On-stage runbook (top 10, no slides)

1. Open `/host` on the venue screen BEFORE walking up (room code persists on
   refresh) — use the tunnel URL, and make sure this laptop is still plugged
   in and awake.
2. Ask the judges to scan the QR with their own phones — that IS the demo.
3. Start Motion Duel (most rehearsed) or Brawl if you want more people
   involved at once; narrate what's happening while it plays out.
4. If wifi dies mid-round: kill and reopen the phone tab — it rejoins with the
   same score. Say that out loud; it's the flex.
5. Backup if the venue network blocks everything: `/try` runs both surfaces in
   one tab on cellular.
