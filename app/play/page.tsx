"use client";

import { useEffect, useRef, useState } from "react";

import { buzz, useRoomSocket } from "../live/useRoomSocket";
import { useMotion } from "../live/useMotion";

type TapView = {
  phase: "arming" | "waiting" | "live" | "reveal" | "complete";
  round: number;
  totalRounds: number;
  armingEndsAt: number | null;
  tapsIn: number;
  playerCount: number;
  you: {
    tapped: boolean;
    reactionMs: number | null;
    rank: number | null;
    roundPoints: number;
    falseStart: boolean;
    score: number;
  };
  lastRound: { winner: { name: string; reactionMs: number } | null } | null;
};

type DuelView = {
  phase: "find" | "steady" | "result" | "complete";
  colour: string;
  opponents: { name: string; out: boolean }[];
  findEndsAt: number | null;
  duelEndsAt: number | null;
  threshold: number | null;
  you: { out: boolean; wobble: number; score: number; won: boolean };
  winner: string | null;
};

/** Ink text on the light pair colours, bone on the dark ones. */
function inkOn(colour: string): boolean {
  return colour === "#c6ff32" || colour === "#e8e4d8";
}

/** Ticks a coarse local clock while `until` is in the future. Render-only —
 * the server decides when phases actually flip. */
function useCountdown(until: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : null;
}

export default function PlayPage() {
  const [code, setCode] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [codeDraft, setCodeDraft] = useState("");

  // Mount-only: the room code lives in the URL and the resume token in
  // localStorage, neither of which exists during SSR. Reading them in render
  // would hydrate a different value than the server produced.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const room = params.get("room");
    if (room && /^[A-Za-z2-9]{6}$/.test(room)) setCode(room.toUpperCase());
    // A returning phone already has a token for this room, so it can rejoin
    // without retyping a name.
    try {
      if (room && window.localStorage.getItem(`bounce:player:${room.toUpperCase()}`)) {
        setName("");
        return;
      }
    } catch {
      /* storage unavailable */
    }
    // `?name=` skips the join form. Used by the solo demo at /try, where making
    // someone name themselves before anything happens is pure friction.
    const preset = params.get("name")?.trim().slice(0, 18);
    if (preset && preset.length >= 2) setName(preset);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { status, room, view, viewGameId, results, error, me, send } = useRoomSocket({
    code,
    role: "player",
    name,
  });

  if (!code) {
    return (
      <Shell>
        <Prompt label="ROOM CODE" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^[A-Za-z2-9]{6}$/.test(codeDraft)) setCode(codeDraft.toUpperCase());
          }}
          className="w-full"
        >
          <input
            value={codeDraft}
            onChange={(e) => setCodeDraft(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC234"
            autoCapitalize="characters"
            autoCorrect="off"
            className="w-full border-2 hairline-bone bg-transparent px-4 py-4 text-center display text-4xl tracking-widest text-bone outline-none focus:border-acid"
          />
          <SubmitButton disabled={codeDraft.length !== 6}>ENTER →</SubmitButton>
        </form>
      </Shell>
    );
  }

  if (name === null) {
    return (
      <Shell>
        <Prompt label={`ROOM ${code}`} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim().length >= 2) {
              buzz();
              setName(draft.trim());
            }
          }}
          className="w-full"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 18))}
            placeholder="YOUR NAME"
            className="w-full border-2 hairline-bone bg-transparent px-4 py-4 text-center display text-3xl text-bone outline-none focus:border-acid"
          />
          <SubmitButton disabled={draft.trim().length < 2}>JOIN THE ROOM →</SubmitButton>
        </form>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="border-2 border-signal px-5 py-4 text-center" style={{ color: "var(--color-signal)" }}>
          <div className="mono-label">CAN&apos;T JOIN</div>
          <p className="mt-2 font-mono text-sm">{error}</p>
        </div>
      </Shell>
    );
  }

  if (results) {
    const mine = results.scores.findIndex((s) => s.playerId === me?.playerId);
    return (
      <Shell>
        <Prompt label="FINAL" />
        <div className="stamp-in text-center">
          <div className="display text-8xl text-acid">{mine >= 0 ? `#${mine + 1}` : "—"}</div>
          <div className="mono-label mt-2 text-stone">
            {results.scores[mine]?.points ?? 0} POINTS
          </div>
        </div>
        <p className="mt-6 text-center text-bonedim">{results.headline}</p>
      </Shell>
    );
  }

  if (view && viewGameId === "reaction-tap") {
    return (
      <TapPad
        tap={view as unknown as TapView}
        onTap={() => send({ type: "input", input: { type: "tap" } })}
      />
    );
  }

  if (view && viewGameId === "motion-duel") {
    return (
      <DuelPad
        duel={view as unknown as DuelView}
        sendMagnitude={(magnitude) => send({ type: "input", input: { type: "motion", magnitude } })}
      />
    );
  }

  return (
    <Shell>
      <Prompt label={`ROOM ${code}`} />
      <div className="text-center">
        <div className="display text-5xl text-acid">YOU&apos;RE IN</div>
        <p className="mono-label mt-3 text-stone">
          {status === "live" ? `${room?.players.length ?? 1} IN THE ROOM` : status.toUpperCase()}
        </p>
        <p className="mt-6 text-bonedim">Eyes on the big screen — the host picks what happens next.</p>
      </div>
    </Shell>
  );
}

// ── Reaction Tap ────────────────────────────────────────────────────────────

function TapPad({ tap, onTap }: { tap: TapView; onTap: () => void }) {
  const buzzed = useRef<string>("");
  // Server frames flush on a 120ms tick, which is an eternity for a tap. Echo
  // the press locally the same frame; the server still owns rank and timing.
  const [pendingRound, setPendingRound] = useState(0);

  useEffect(() => {
    const key = `${tap.round}:${tap.phase}`;
    if (buzzed.current === key) return;
    buzzed.current = key;
    if (tap.phase === "live") buzz([0, 30]);
    if (tap.phase === "reveal") buzz(12);
  }, [tap.phase, tap.round]);

  const live = tap.phase === "live";
  const jumped = tap.you.falseStart;
  const tapped = tap.you.tapped || (live && pendingRound === tap.round);

  const background = jumped
    ? "var(--color-signal)"
    : live && !tapped
      ? "var(--color-acid)"
      : "transparent";

  return (
    <button
      type="button"
      onClick={() => {
        if (!tap.you.tapped && !jumped) {
          buzz(live ? 22 : [0, 60, 40, 60]);
          if (live) setPendingRound(tap.round);
          onTap();
        }
      }}
      className="skin-ink-acid grain flex w-full flex-col items-center justify-center gap-4 border-0 p-8 text-center transition-colors duration-100"
      style={{ background }}
    >
      <div className="mono-label" style={{ color: live && !tapped ? "var(--color-ink)" : "var(--color-stone)" }}>
        ROUND {tap.round} / {tap.totalRounds}
      </div>

      {jumped ? (
        <>
          <div className="display text-7xl text-bone">TOO SOON</div>
          <p className="font-mono text-sm text-bone">You jumped the gun. Sit this round out.</p>
        </>
      ) : tapped ? (
        tap.you.tapped ? (
          <>
            <div className="display text-8xl text-acid">#{tap.you.rank}</div>
            <div className="font-mono text-2xl text-bone">{tap.you.reactionMs}ms</div>
            <div className="mono-label text-stone">+{tap.you.roundPoints} POINTS</div>
          </>
        ) : (
          <div className="go-flare display text-8xl text-acid">IN!</div>
        )
      ) : live ? (
        <div className="go-flare display text-[7rem] leading-none text-ink">TAP</div>
      ) : tap.phase === "arming" ? (
        <>
          <div className="display text-6xl text-bone">GET READY</div>
          <p className="mono-label text-stone">HANDS OFF</p>
        </>
      ) : tap.phase === "waiting" ? (
        <>
          <div className="display text-7xl type-outline-acid">WAIT</div>
          <p className="mono-label text-signal blink">DON&apos;T TAP YET</p>
        </>
      ) : (
        <>
          <div className="display text-5xl text-bone">
            {tap.lastRound?.winner ? tap.lastRound.winner.name : "NOBODY"}
          </div>
          <p className="mono-label text-stone">TOOK THE ROUND</p>
        </>
      )}

      <div className="mono-label mt-4" style={{ color: live && !tapped ? "var(--color-ink)" : "var(--color-stone)" }}>
        {tap.you.score} PTS TOTAL
      </div>
    </button>
  );
}

// ── Motion Duel ─────────────────────────────────────────────────────────────

/** Stream at ~12Hz — comfortably under the server's 30/s input budget. */
const MOTION_SEND_MS = 80;

function DuelPad({ duel, sendMagnitude }: { duel: DuelView; sendMagnitude: (m: number) => void }) {
  const streaming = duel.phase === "steady" && !duel.you.out;
  const peak = useRef(0);
  const [meter, setMeter] = useState(0);
  const { status: motionStatus, arm } = useMotion(streaming || duel.phase === "find", (m) => {
    if (m > peak.current) peak.current = m;
  });

  // One flush loop: send the worst moment since the last flush, then decay the
  // on-screen meter so it twitches with you rather than pinning.
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      const worst = peak.current;
      peak.current = 0;
      if (worst > 0.02) sendMagnitude(+worst.toFixed(3));
      setMeter((prev) => Math.max(worst, prev * 0.6));
    }, MOTION_SEND_MS);
    return () => clearInterval(id);
  }, [streaming, sendMagnitude]);

  const wasOut = useRef(false);
  useEffect(() => {
    if (duel.you.out && !wasOut.current) buzz([0, 80, 50, 120]);
    if (duel.phase === "result" && duel.you.won) buzz([0, 30, 40, 30, 40, 60]);
    wasOut.current = duel.you.out;
  }, [duel.you.out, duel.phase, duel.you.won]);

  const findLeft = useCountdown(duel.findEndsAt);
  const duelLeft = useCountdown(duel.duelEndsAt);

  const ink = inkOn(duel.colour);
  const fg = ink ? "var(--color-ink)" : "var(--color-bone)";
  const opponentNames = duel.opponents.map((o) => o.name).join(" + ") || "…";
  const needsArming = motionStatus !== "armed";

  // FIND: the phone becomes the beacon. Whole screen floods the pair colour.
  if (duel.phase === "find") {
    return (
      <div className="skin-ink-acid grain flex flex-col items-center justify-center gap-5 p-8 text-center" style={{ background: duel.colour, color: fg }}>
        <div className="mono-label" style={{ color: fg }}>HOLD YOUR PHONE UP</div>
        <div className="display text-6xl leading-none">FIND THIS COLOUR</div>
        <div className="mono-label" style={{ color: fg }}>
          YOUR DUEL — YOU × {opponentNames.toUpperCase()}
        </div>
        {needsArming ? (
          <button
            type="button"
            onClick={() => {
              buzz();
              void arm();
            }}
            className="mt-4 border-4 px-8 py-5 display text-3xl"
            style={{ borderColor: fg, color: fg }}
          >
            {motionStatus === "denied" ? "SENSORS BLOCKED — RETRY" : "ARM SENSORS →"}
          </button>
        ) : (
          <div className="stamp-in border-2 px-4 py-2 mono-label" style={{ borderColor: fg, color: fg }}>
            SENSORS HOT — GO MEET THEM
          </div>
        )}
        <div className="display text-8xl">{findLeft ?? ""}</div>
      </div>
    );
  }

  // STEADY: the duel. Colour shrinks to a frame; the meter is the star.
  if (duel.phase === "steady") {
    if (duel.you.out) {
      return (
        <div className="skin-ink-acid grain flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ background: "var(--color-signal)" }}>
          <div className="display text-9xl text-ink">OUT</div>
          <p className="mono-label text-ink">YOU FLINCHED</p>
          <p className="mt-4 max-w-xs font-mono text-sm text-ink">
            The duel&apos;s lost, the introduction isn&apos;t. You&apos;re standing next to {opponentNames} — say hi.
          </p>
        </div>
      );
    }

    const threshold = duel.threshold ?? 2.6;
    const fill = Math.min(1, meter / (threshold * 1.15));
    const danger = fill > 0.8;

    return (
      <div className="skin-ink-acid grain flex flex-col items-center justify-between p-6 text-center" style={{ border: `10px solid ${duel.colour}` }}>
        <div className="mono-label text-stone">
          DUEL VS {opponentNames.toUpperCase()} — {duelLeft ?? "–"}s
        </div>

        <div className={danger ? "shake-hard" : ""}>
          <div className="display text-7xl" style={{ color: danger ? "var(--color-signal)" : "var(--color-bone)" }}>
            HOLD
            <br />
            STILL
          </div>
        </div>

        {/* the wobble meter — climb past the line and you're out */}
        <div className="relative h-56 w-24 border-2 hairline-bone">
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-75"
            style={{
              height: `${fill * 100}%`,
              background: danger ? "var(--color-signal)" : "var(--color-acid)",
            }}
          />
          <div className="absolute inset-x-[-14px] blink" style={{ bottom: `${(1 / 1.15) * 100}%`, borderTop: "3px solid var(--color-signal)" }} />
        </div>

        <div className="mono-label text-stone">
          {duel.opponents.filter((o) => o.out).length > 0
            ? "THEY FLINCHED — STAY FROZEN TO TAKE IT"
            : "THE LINE PULSES. BREATHE."}
        </div>
      </div>
    );
  }

  // RESULT / COMPLETE
  const won = duel.you.won;
  return (
    <div
      className="skin-ink-acid grain flex flex-col items-center justify-center gap-4 p-8 text-center"
      style={{ background: won ? "var(--color-acid)" : "transparent" }}
    >
      {won ? (
        <>
          <div className="stamp-in display text-9xl text-ink">WON</div>
          <div className="mono-label text-ink">STEADIEST HAND IN THE PAIR</div>
        </>
      ) : (
        <>
          <div className="display text-7xl text-bone">{duel.winner ? duel.winner.toUpperCase() : "DEAD HEAT"}</div>
          <div className="mono-label text-stone">{duel.winner ? "TOOK YOUR DUEL" : "NOBODY FLINCHED"}</div>
        </>
      )}
      <div className="mono-label mt-6" style={{ color: won ? "var(--color-ink)" : "var(--color-stone)" }}>
        {duel.you.score} PTS THIS GAME
      </div>
      <p className="font-mono text-sm" style={{ color: won ? "var(--color-ink)" : "var(--color-bonedim)" }}>
        You just met {opponentNames}. That was the point.
      </p>
    </div>
  );
}

// ── small shared pieces ─────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="skin-ink-acid grain flex flex-col items-center justify-center gap-6 p-8">{children}</div>
  );
}

function Prompt({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="display text-2xl text-acid">BOUNCE</div>
      <div className="mono-label mt-1 text-stone">{label}</div>
    </div>
  );
}

function SubmitButton({ children, disabled }: { children: React.ReactNode; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-4 w-full bg-acid px-6 py-4 display text-2xl text-ink hard-shadow-bone disabled:opacity-30"
    >
      {children}
    </button>
  );
}
