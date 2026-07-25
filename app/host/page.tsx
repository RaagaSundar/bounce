"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { useRoomSocket } from "../live/useRoomSocket";

// Ambiguous glyphs are excluded so a code read off a projector is unambiguous.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

type TapView = {
  phase: "arming" | "waiting" | "live" | "reveal" | "complete";
  round: number;
  totalRounds: number;
  armingEndsAt: number | null;
  liveSince: number | null;
  tapsIn: number;
  playerCount: number;
  lastRound: { winner: { name: string; reactionMs: number } | null; falseStarts: string[] } | null;
  board: {
    playerId: string;
    name: string;
    score: number;
    reactionMs: number | null;
    rank: number | null;
    falseStart: boolean;
  }[];
};

export default function HostPage() {
  const [code, setCode] = useState("");

  // The code lives in the URL so a projector refresh keeps the same room.
  useEffect(() => {
    const url = new URL(window.location.href);
    const existing = url.searchParams.get("room");
    const next = existing && /^[A-Z2-9]{6}$/.test(existing) ? existing : newCode();
    if (next !== existing) {
      url.searchParams.set("room", next);
      window.history.replaceState(null, "", url);
    }
    // Mount-only: the code comes from the URL, which does not exist during SSR.
    // Reading it in render instead would hydrate a different value than the
    // server produced.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(next);
  }, []);

  const { status, room, view, results, error, send } = useRoomSocket({ code, role: "host" });
  const tap = view as TapView | null;

  const joinUrl = useMemo(
    () => (code ? `${window.location.origin}/play?room=${code}` : ""),
    [code],
  );

  if (!code) return <div className="skin-ink-acid grain" />;

  return (
    <div className="skin-ink-acid grain led-dots flex flex-col">
      <header className="flex items-center justify-between px-10 pt-8">
        <div className="flex items-baseline gap-4">
          <span className="display text-3xl text-acid">BOUNCE</span>
          <span className="mono-label text-stone">LIVE EVENT GAMES</span>
        </div>
        <div className="mono-label" style={{ color: status === "live" ? "var(--color-acid)" : "var(--color-signal)" }}>
          <span className={status === "live" ? "" : "blink"}>●</span>{" "}
          {status === "live" ? "CONNECTED" : status.toUpperCase()}
        </div>
      </header>

      {error ? (
        <div className="mx-10 mt-4 border-2 border-signal px-4 py-2 mono-label" style={{ color: "var(--color-signal)" }}>
          {error}
        </div>
      ) : null}

      <main className="flex-1 min-h-0 px-10 py-6">
        {results ? (
          <Podium results={results} onAgain={() => send({ type: "host:start", gameId: "reaction-tap" })} />
        ) : tap ? (
          <Stage tap={tap} />
        ) : (
          <Lobby
            code={code}
            joinUrl={joinUrl}
            players={room?.players ?? []}
            canStart={(room?.players.length ?? 0) >= 1}
            onStart={() => send({ type: "host:start", gameId: "reaction-tap" })}
          />
        )}
      </main>
    </div>
  );
}

function Lobby({
  code,
  joinUrl,
  players,
  canStart,
  onStart,
}: {
  code: string;
  joinUrl: string;
  players: { id: string; name: string }[];
  canStart: boolean;
  onStart: () => void;
}) {
  return (
    <div className="grid h-full grid-cols-[auto_1fr] gap-12">
      <div className="flex flex-col items-center gap-6">
        <div className="bg-bone p-5 hard-shadow-acid">
          {joinUrl ? <QRCodeSVG value={joinUrl} size={260} fgColor="#141412" bgColor="transparent" level="M" /> : null}
        </div>
        <div className="text-center">
          <div className="mono-label text-stone">ROOM CODE</div>
          <div className="display text-7xl text-acid tracking-wider">{code}</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-col">
        <h1 className="display text-6xl leading-none">
          THE ROOM IS QUIET.
          <br />
          <span className="type-outline-acid">FIX THAT.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-bonedim">
          Scan the code. No app, no account. We&apos;ll start the moment everyone&apos;s in.
        </p>

        <div className="mono-label mt-8 text-stone">{players.length} CONNECTED</div>
        <div className="mt-3 flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-hidden">
          {players.map((p) => (
            <span key={p.id} className="stamp-in border-2 hairline-bone px-3 py-1 font-mono text-sm">
              {p.name}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={onStart}
          disabled={!canStart}
          className="mt-6 w-fit bg-acid px-10 py-4 display text-3xl text-ink hard-shadow-bone disabled:opacity-30"
        >
          START REACTION TAP →
        </button>
      </div>
    </div>
  );
}

function Stage({ tap }: { tap: TapView }) {
  // Local 10fps clock purely for rendering the arming countdown; the countdown
  // itself is derived rather than stored, so no state is set synchronously.
  // The server remains the only authority for when the round actually flips.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (tap.phase !== "arming") return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [tap.phase]);

  const countdown = tap.armingEndsAt ? Math.max(0, Math.ceil((tap.armingEndsAt - now) / 1000)) : null;

  return (
    <div className="grid h-full grid-cols-[1fr_360px] gap-10">
      <section className="relative flex flex-col items-center justify-center border-2 hairline-bone scanlines">
        <div className="mono-label absolute left-5 top-4 text-stone">
          ROUND {tap.round} / {tap.totalRounds}
        </div>

        {tap.phase === "arming" ? (
          <>
            <div className="mono-label text-stone">GET READY</div>
            <div className="display text-[14rem] leading-none text-bone">{countdown ?? 3}</div>
          </>
        ) : tap.phase === "waiting" ? (
          <>
            <div className="mono-label text-signal blink">DO NOT TAP YET</div>
            <div className="display text-[10rem] leading-none type-outline-acid">HOLD</div>
          </>
        ) : tap.phase === "live" ? (
          <div className="go-flare flex flex-col items-center">
            <div className="display text-[18rem] leading-none text-acid">TAP</div>
            <div className="mono-label text-bone">{tap.tapsIn} / {tap.playerCount} IN</div>
          </div>
        ) : tap.phase === "reveal" ? (
          <div className="stamp-in flex flex-col items-center text-center">
            <div className="mono-label text-stone">FASTEST THUMB</div>
            <div className="display text-8xl text-acid">{tap.lastRound?.winner?.name ?? "NOBODY"}</div>
            {tap.lastRound?.winner ? (
              <div className="mt-2 font-mono text-2xl text-bone">{tap.lastRound.winner.reactionMs}ms</div>
            ) : null}
            {tap.lastRound?.falseStarts.length ? (
              <div className="mono-label mt-4 text-signal">
                {tap.lastRound.falseStarts.length} JUMPED THE GUN
              </div>
            ) : null}
          </div>
        ) : (
          <div className="display text-8xl text-acid">MATCH OVER</div>
        )}
      </section>

      <aside className="flex min-h-0 flex-col border-2 hairline-bone p-5">
        <div className="mono-label text-stone">LEADERBOARD</div>
        <ol className="mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
          {tap.board.map((row, i) => (
            <li key={row.playerId} className="flex items-baseline justify-between border-b hairline-bone pb-1">
              <span className="truncate font-mono text-sm">
                <span className="text-stone">{String(i + 1).padStart(2, "0")}</span> {row.name}
                {row.falseStart ? <span className="ml-2 text-signal">✕</span> : null}
              </span>
              <span className="display text-xl text-acid">{row.score}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function Podium({
  results,
  onAgain,
}: {
  results: { headline: string; scores: { playerId: string; name: string; points: number }[] };
  onAgain: () => void;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Loaded on demand so the projector bundle stays small until it's needed.
    void import("canvas-confetti").then(({ default: confetti }) => {
      confetti({
        particleCount: 160,
        spread: 100,
        origin: { y: 0.4 },
        colors: ["#c6ff32", "#e8e4d8", "#ff4b1f"],
        disableForReducedMotion: true,
      });
    });
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mono-label text-stone">RESULTS</div>
      <h2 className="stamp-in display mt-2 max-w-4xl text-7xl text-acid">{results.headline}</h2>

      <ol className="mt-10 w-full max-w-2xl">
        {results.scores.slice(0, 5).map((row, i) => (
          <li key={row.playerId} className="flex items-baseline justify-between border-b hairline-bone py-2">
            <span className="display text-3xl">
              <span className="text-stone">{i + 1}</span> {row.name}
            </span>
            <span className="display text-3xl text-acid">{row.points}</span>
          </li>
        ))}
      </ol>

      <button type="button" onClick={onAgain} className="mt-10 bg-acid px-8 py-3 display text-2xl text-ink hard-shadow-bone">
        RUN IT BACK →
      </button>
    </div>
  );
}
