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

type DuelHostView = {
  phase: "find" | "steady" | "result" | "complete";
  colour: string;
  duellists: { playerId: string; name: string; out: boolean; wobble: number; score: number }[];
  winner: string | null;
};

export default function HostPage() {
  const [code, setCode] = useState("");
  // What RUN IT BACK restarts; also which stage a live view belongs to.
  const lastStarted = useRef<string>("reaction-tap");

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(next);
  }, []);

  const { status, room, view, viewGameId, groups, results, error, send } = useRoomSocket({
    code,
    role: "host",
  });

  const joinUrl = useMemo(
    () => (code ? `${window.location.origin}/play?room=${code}` : ""),
    [code],
  );

  const start = (gameId: string) => {
    lastStarted.current = gameId;
    send({ type: "host:start", gameId });
  };

  if (!code) return <div className="skin-ink-acid grain" />;

  const inGame = Boolean(view) && !results;

  return (
    <div className="skin-ink-acid grain led-dots flex flex-col">
      <header className="flex items-center justify-between px-10 pt-8">
        <div className="flex items-baseline gap-4">
          <span className="display text-3xl text-acid">BOUNCE</span>
          <span className="mono-label text-stone">ROOM {code}</span>
        </div>
        <div className="flex items-center gap-6">
          {inGame ? (
            <button
              type="button"
              onClick={() => send({ type: "host:end" })}
              className="border-2 border-signal px-4 py-1.5 mono-label"
              style={{ color: "var(--color-signal)" }}
            >
              END GAME ✕
            </button>
          ) : null}
          <div className="mono-label" style={{ color: status === "live" ? "var(--color-acid)" : "var(--color-signal)" }}>
            <span className={status === "live" ? "" : "blink"}>●</span>{" "}
            {status === "live" ? "CONNECTED" : status.toUpperCase()}
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-10 mt-4 border-2 border-signal px-4 py-2 mono-label" style={{ color: "var(--color-signal)" }}>
          {error}
        </div>
      ) : null}

      <main className="flex-1 min-h-0 px-10 py-6">
        {results ? (
          <Podium
            results={results}
            onAgain={() => start(lastStarted.current)}
            onLobby={() => send({ type: "host:end" })}
          />
        ) : view && viewGameId === "motion-duel" ? (
          <DuelStage groups={(groups ?? []).map((g) => ({ id: g.id, view: g.view as unknown as DuelHostView }))} />
        ) : view && viewGameId === "reaction-tap" ? (
          <TapStage tap={view as unknown as TapView} />
        ) : (
          <Lobby
            code={code}
            joinUrl={joinUrl}
            players={room?.players ?? []}
            catalog={room?.catalog ?? []}
            onStart={start}
          />
        )}
      </main>
    </div>
  );
}

// ── Lobby: the QR and the game shelf ────────────────────────────────────────

function Lobby({
  code,
  joinUrl,
  players,
  catalog,
  onStart,
}: {
  code: string;
  joinUrl: string;
  players: { id: string; name: string }[];
  catalog: { id: string; title: string; tagline: string; minPlayers: number }[];
  onStart: (gameId: string) => void;
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
        <div className="mono-label text-stone">{players.length} CONNECTED</div>
        <div className="flex max-w-[280px] flex-wrap justify-center gap-2">
          {players.map((p) => (
            <span key={p.id} className="stamp-in border-2 hairline-bone px-3 py-1 font-mono text-sm">
              {p.name}
            </span>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-col">
        <h1 className="display text-6xl leading-none">
          THE ROOM IS QUIET.
          <br />
          <span className="type-outline-acid">FIX THAT.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-bonedim">
          Scan the code — no app, no account. Then pick tonight&apos;s first game.
        </p>

        <div className="mt-8 grid max-w-3xl gap-5">
          {catalog.map((game, i) => {
            const locked = players.length < game.minPlayers;
            return (
              <button
                key={game.id}
                type="button"
                disabled={locked}
                onClick={() => onStart(game.id)}
                className="group flex items-center justify-between gap-6 border-2 hairline-bone px-6 py-5 text-left transition-colors hover:border-acid disabled:opacity-40"
              >
                <div>
                  <div className="flex items-baseline gap-4">
                    <span className="mono-label text-stone">{String(i + 1).padStart(2, "0")}</span>
                    <span className="display text-4xl group-hover:text-acid">{game.title}</span>
                    {game.id === "motion-duel" ? (
                      <span className="border border-signal px-2 py-0.5 mono-label" style={{ color: "var(--color-signal)" }}>
                        PAIRS YOU UP
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-sm text-bonedim">{game.tagline}</p>
                </div>
                <span className="display text-3xl text-acid">
                  {locked ? `NEEDS ${game.minPlayers}+` : "START →"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Reaction Tap stage ──────────────────────────────────────────────────────

function TapStage({ tap }: { tap: TapView }) {
  // Local 10fps clock purely for rendering the arming countdown; the server
  // remains the only authority for when the round actually flips.
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

// ── Motion Duel stage: every duel in the room, live ─────────────────────────

const PHASE_BANNER: Record<DuelHostView["phase"], [string, string]> = {
  find: ["FIND YOUR OPPONENT", "PHONES ARE GLOWING — MATCH THE COLOUR"],
  steady: ["HOLD STILL", "MOVE AND YOU'RE OUT. THE LINE IS PULSING."],
  result: ["HANDS REVEALED", "WINNERS KEPT FROZEN. LOSERS FLINCHED."],
  complete: ["DUELS OVER", "SCORES ARE IN"],
};

function DuelStage({ groups }: { groups: { id: string; view: DuelHostView }[] }) {
  const phase = groups[0]?.view.phase ?? "find";
  const [title, sub] = PHASE_BANNER[phase];

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="mono-label text-stone">MOTION DUEL — {groups.length} DUEL{groups.length === 1 ? "" : "S"}</div>
          <h2 className={`display text-7xl leading-none ${phase === "steady" ? "text-signal" : "text-bone"}`}>{title}</h2>
        </div>
        <div className="mono-label pb-1 text-stone">{sub}</div>
      </div>

      <div
        className="grid min-h-0 flex-1 content-start gap-5"
        style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, groups.length))}, minmax(0, 1fr))` }}
      >
        {groups.map(({ id, view }) => (
          <DuelCard key={id} view={view} />
        ))}
      </div>
    </div>
  );
}

function DuelCard({ view }: { view: DuelHostView }) {
  const maxWobble = Math.max(60, ...view.duellists.map((d) => d.wobble));

  return (
    <div className="relative border-2 hairline-bone" style={{ borderTop: `10px solid ${view.colour}` }}>
      <div className="flex flex-col gap-3 p-5">
        {view.duellists.map((d) => {
          const isWinner = view.phase !== "steady" && view.winner === d.name;
          return (
            <div key={d.playerId} className={d.out && !isWinner ? "opacity-50" : ""}>
              <div className="flex items-baseline justify-between">
                <span className="display truncate text-3xl">
                  {d.name}
                  {isWinner ? <span className="ml-3 text-acid">★</span> : null}
                </span>
                {d.out ? (
                  <span className="stamp-in border-2 border-signal px-2 py-0.5 mono-label" style={{ color: "var(--color-signal)" }}>
                    OUT
                  </span>
                ) : (
                  <span className="mono-label text-stone">{d.score} PTS</span>
                )}
              </div>
              {/* cumulative wobble: the truth-teller when nobody flinches */}
              <div className="mt-1.5 h-2 w-full border hairline-bone">
                <div
                  className="h-full transition-[width] duration-150"
                  style={{
                    width: `${Math.min(100, (d.wobble / maxWobble) * 100)}%`,
                    background: d.out ? "var(--color-signal)" : "var(--color-acid)",
                  }}
                />
              </div>
            </div>
          );
        })}

        {view.phase === "result" ? (
          <div className="stamp-in mt-1 self-center border-2 border-acid px-3 py-1 mono-label text-acid">
            {view.winner ? `${view.winner.toUpperCase()} TAKES IT` : "DEAD HEAT"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Podium ──────────────────────────────────────────────────────────────────

function Podium({
  results,
  onAgain,
  onLobby,
}: {
  results: { headline: string; scores: { playerId: string; name: string; points: number }[] };
  onAgain: () => void;
  onLobby: () => void;
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

      <div className="mt-10 flex items-center gap-5">
        <button type="button" onClick={onAgain} className="bg-acid px-8 py-3 display text-2xl text-ink hard-shadow-bone">
          RUN IT BACK →
        </button>
        <button type="button" onClick={onLobby} className="border-2 hairline-bone px-8 py-3 display text-2xl text-bone">
          GAME SHELF
        </button>
      </div>
    </div>
  );
}
