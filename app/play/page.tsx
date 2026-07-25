"use client";

import { useEffect, useRef, useState } from "react";

import { buzz, useRoomSocket } from "../live/useRoomSocket";

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
    const room = new URL(window.location.href).searchParams.get("room");
    if (room && /^[A-Za-z2-9]{6}$/.test(room)) setCode(room.toUpperCase());
    // A returning phone already has a token for this room, so it can rejoin
    // without retyping a name.
    try {
      if (room && window.localStorage.getItem(`bounce:player:${room.toUpperCase()}`)) setName("");
    } catch {
      /* storage unavailable */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { status, room, view, results, error, me, send } = useRoomSocket({
    code,
    role: "player",
    name,
  });
  const tap = view as TapView | null;

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

  if (!tap) {
    return (
      <Shell>
        <Prompt label={`ROOM ${code}`} />
        <div className="text-center">
          <div className="display text-5xl text-acid">YOU&apos;RE IN</div>
          <p className="mono-label mt-3 text-stone">
            {status === "live" ? `${room?.players.length ?? 1} IN THE ROOM` : status.toUpperCase()}
          </p>
          <p className="mt-6 text-bonedim">Eyes on the big screen. Tap the instant it says TAP.</p>
        </div>
      </Shell>
    );
  }

  return <TapPad tap={tap} onTap={() => send({ type: "input", input: { type: "tap" } })} />;
}

function TapPad({ tap, onTap }: { tap: TapView; onTap: () => void }) {
  const buzzed = useRef<string>("");

  // Haptic exactly once per phase change, not on every re-render.
  useEffect(() => {
    const key = `${tap.round}:${tap.phase}`;
    if (buzzed.current === key) return;
    buzzed.current = key;
    if (tap.phase === "live") buzz([0, 30]);
    if (tap.phase === "reveal") buzz(12);
  }, [tap.phase, tap.round]);

  const live = tap.phase === "live";
  const jumped = tap.you.falseStart;

  const background = jumped
    ? "var(--color-signal)"
    : live && !tap.you.tapped
      ? "var(--color-acid)"
      : "transparent";

  return (
    <button
      type="button"
      onClick={() => {
        if (!tap.you.tapped && !jumped) {
          buzz(live ? 22 : [0, 60, 40, 60]);
          onTap();
        }
      }}
      className="skin-ink-acid grain flex w-full flex-col items-center justify-center gap-4 border-0 p-8 text-center transition-colors duration-100"
      style={{ background }}
    >
      <div className="mono-label" style={{ color: live && !tap.you.tapped ? "var(--color-ink)" : "var(--color-stone)" }}>
        ROUND {tap.round} / {tap.totalRounds}
      </div>

      {jumped ? (
        <>
          <div className="display text-7xl text-bone">TOO SOON</div>
          <p className="font-mono text-sm text-bone">You jumped the gun. Sit this round out.</p>
        </>
      ) : tap.you.tapped ? (
        <>
          <div className="display text-8xl text-acid">#{tap.you.rank}</div>
          <div className="font-mono text-2xl text-bone">{tap.you.reactionMs}ms</div>
          <div className="mono-label text-stone">+{tap.you.roundPoints} POINTS</div>
        </>
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

      <div className="mono-label mt-4" style={{ color: live && !tap.you.tapped ? "var(--color-ink)" : "var(--color-stone)" }}>
        {tap.you.score} PTS TOTAL
      </div>
    </button>
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
