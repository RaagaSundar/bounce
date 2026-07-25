# BOUNCE

Live event networking, but it's a game. Scan a QR on the big screen, play rapid-fire
sync-or-clash rounds on your phone, and walk away knowing exactly who to go talk to.
Frontend-only demo — the whole "multiplayer" experience is mocked and choreographed.

## Run it

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**.

## The demo tour

| Route | What it is |
|-------|------------|
| `/` | Landing — pick a side |
| `/host` | The big screen: giant animated QR → live lobby fill → game spectacle → podium + power pairs |
| `/play` | The phone: join flow (name → 3D orb builder → vibe) → lobby → thumb-sized game controller → "your people tonight" |

**The party trick:** open `/host` and `/play` in two separate windows. They sync live
over a `BroadcastChannel` — join on the phone window and your avatar pops into the
host lobby; host hits START and the phone becomes a controller. No backend involved.

A solo `/play` visit (no host window) quietly runs its own fake session so the full
loop is still playable single-window.

## Extras

- `?lite` on any route swaps the WebGL backdrops for CSS — for weak event hardware
  (and headless testing).
- `window.__bounce` exposes the zustand store in the console for driving the session
  manually (`window.__bounce.getState().startGame()` etc.).

## Where the backend will plug in

All "network" traffic flows through one seam: `src/store/session.js`. The
`BroadcastChannel` `post`/`onmessage` pair speaks a tiny message protocol
(`hello` / `state` / `join` / `answer` / `react`). Swap those two functions for a
WebSocket client and the rest of the app doesn't change. The host tab currently
plays the role of the authoritative game server (mock crowd + game clock); that
logic lifts out to a real server as-is.

## Design language — "Ink & Acid"

Event-ephemera system, built after studying current Awwwards SOTD work: the host
screen is a stage LED board in a dark venue (ink + acid dot-matrix WebGL floor);
the phone is a *printed* object — laminate pass, ballot stubs, rubber stamps,
till receipts on bone paper. Anton for poster type, Space Mono for metadata,
Archivo for body. Four colors total (ink `#141412`, bone `#e8e4d8`, acid
`#c6ff32`, signal `#ff4b1f` + cobalt for stickers), film grain everywhere, hard
offset shadows instead of glow, difference-blend wordmark on the landing seam.
Avatars are generated SVG sticker badges (no emoji).

## Stack

React 19 + Vite · react-three-fiber (LED floor) · Framer Motion (choreography) ·
Tailwind v4 · zustand · qrcode.react · canvas-confetti (paper scraps)
