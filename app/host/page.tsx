"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { useRoomSocket } from "../live/useRoomSocket";
import { Ambient, EqBars, GlowBtn, Orb } from "../live/arcade";
import { ArenaStage, type ArenaView } from "../live/arena-ui";

// Ambiguous glyphs are excluded so a code read off a projector is unambiguous.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

type DuelHostView = {
  phase: "find" | "steady" | "result" | "complete";
  colour: string;
  duellists: { playerId: string; name: string; out: boolean; wobble: number; score: number }[];
  winner: string | null;
};

const GAME_FLAIR: Record<string, { icon: string; grad: string }> = {
  arena: { icon: "🎮", grad: "linear-gradient(135deg, var(--lime), var(--magenta))" },
  brawl: { icon: "⚔️", grad: "linear-gradient(135deg, var(--magenta), var(--amber))" },
  "motion-duel": { icon: "🤝", grad: "linear-gradient(135deg, var(--cyan), var(--violet))" },
  "pair-sprint": { icon: "🏃", grad: "linear-gradient(135deg, var(--lime), var(--cyan))" },
  crossfire: { icon: "🎯", grad: "linear-gradient(135deg, var(--magenta), var(--amber))" },
};

/**
 * Games whose projector stage + phone pad are actually built. The catalog can
 * run ahead of the UI; anything not listed shows as "in the lab" instead of
 * starting a mode the big screen cannot render mid-demo.
 */
const PLAYABLE = new Set(["arena", "brawl", "motion-duel"]);

export default function HostPage() {
  const [code, setCode] = useState("");
  // What RUN IT BACK restarts; also which stage a live view belongs to.
  const lastStarted = useRef<string>("arena");

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

  if (!code) return <div className="skin-arcade" />;

  const inGame = Boolean(view) && !results;

  return (
    <div className="skin-arcade flex flex-col">
      <Ambient />

      <header className="relative z-20 flex items-center justify-between px-8 py-5">
        <span className="font-display gradient-text text-2xl font-black tracking-tight">BOUNCE</span>
        <div className="glass flex items-center gap-3 rounded-full px-5 py-2.5 text-sm">
          <span style={{ color: "var(--faint)" }}>join at</span>
          <span className="font-display font-bold tracking-wider" style={{ color: "var(--magenta)" }}>
            /play · {code}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {inGame ? (
            <button
              type="button"
              onClick={() => send({ type: "host:end" })}
              className="glass rounded-full px-4 py-2 text-sm font-semibold transition-transform hover:scale-105"
              style={{ color: "var(--coral)" }}
            >
              end game ✕
            </button>
          ) : null}
          <div className="glass flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-semibold">
            <span
              className="pulse-soft h-2.5 w-2.5 rounded-full"
              style={{
                background: status === "live" ? "var(--lime)" : "var(--coral)",
                boxShadow: `0 0 10px ${status === "live" ? "var(--lime)" : "var(--coral)"}`,
              }}
            />
            <span className="font-display" style={{ color: "var(--lime)" }}>
              {room?.players.length ?? 0}
            </span>
            in the room
          </div>
        </div>
      </header>

      {error ? (
        <div className="glass relative z-20 mx-8 rounded-2xl px-4 py-2 text-sm font-semibold" style={{ color: "var(--coral)" }}>
          {error}
        </div>
      ) : null}

      <main className="relative z-10 min-h-0 flex-1 px-8 pb-8">
        {results ? (
          <Podium
            results={results}
            onAgain={() => start(lastStarted.current)}
            onLobby={() => send({ type: "host:end" })}
          />
        ) : view && viewGameId === "arena" ? (
          <ArenaStage view={view as unknown as ArenaView} />
        ) : view && viewGameId === "motion-duel" ? (
          <DuelStage groups={(groups ?? []).map((g) => ({ id: g.id, view: g.view as unknown as DuelHostView }))} />
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

// ── Lobby: the QR beacon and the game shelf ─────────────────────────────────

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
    <div className="grid h-full grid-cols-[auto_1fr] items-center gap-12">
      <div className="flex flex-col items-center gap-5">
        <div className="conic-border glass flex flex-col items-center rounded-[2rem] p-8">
          <div className="pulse-soft font-display text-xs font-bold uppercase tracking-[0.35em]" style={{ color: "var(--magenta)" }}>
            Scan to join
          </div>
          <div className="relative my-5 rounded-2xl bg-white/95 p-4" style={{ boxShadow: "0 0 60px -10px rgb(139 92 246 / 0.7)" }}>
            {joinUrl ? <QRCodeSVG value={joinUrl} size={230} fgColor="#140d22" bgColor="transparent" level="M" /> : null}
            <span className="ring-out absolute -inset-2 rounded-3xl border-2" style={{ borderColor: "rgb(255 61 174 / 0.4)" }} />
          </div>
          <div className="font-display gradient-text text-4xl font-black tracking-widest">{code}</div>
          <div className="mt-2 text-xs" style={{ color: "var(--faint)" }}>
            point your camera — you&apos;re 10 seconds from the game
          </div>
        </div>
        <EqBars count={26} height={30} className="w-64 opacity-70" />
      </div>

      <div className="flex min-h-0 flex-col gap-6">
        <div>
          <h1 className="font-display text-6xl font-black leading-[1.02]">
            THE ROOM IS QUIET.
            <br />
            <span className="gradient-text glow-violet">FIX THAT.</span>
          </h1>
          <p className="mt-3 max-w-xl text-lg" style={{ color: "var(--faint)" }}>
            No app, no account. Every phone becomes a controller the second it scans in.
          </p>
        </div>

        <div className="flex min-h-[76px] flex-wrap content-start items-start gap-x-5 gap-y-3">
          {players.map((p, i) => (
            <div key={p.id} className="pop-in float-y" style={{ animationDelay: `${(i % 5) * 0.08}s, ${(i % 4) * 0.6}s` }}>
              <Orb id={p.id} name={p.name} size={58} showName />
            </div>
          ))}
          {players.length === 0 ? (
            <span className="pulse-soft text-sm" style={{ color: "var(--faint)" }}>
              waiting for the first brave soul…
            </span>
          ) : null}
        </div>

        <div className="grid max-w-3xl gap-4">
          {catalog.map((game) => {
            const soon = !PLAYABLE.has(game.id);
            const locked = soon || players.length < game.minPlayers;
            const flair = GAME_FLAIR[game.id] ?? { icon: "🎮", grad: "linear-gradient(135deg, var(--violet), var(--cyan))" };
            return (
              <div key={game.id} className={`glass flex items-center gap-5 rounded-3xl p-5 transition-transform ${soon ? "opacity-70" : "hover:scale-[1.015]"}`}>
                <div
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-3xl"
                  style={{ background: flair.grad, boxShadow: "0 8px 30px -8px rgb(0 0 0 / 0.6)" }}
                >
                  {flair.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-2xl font-bold">{game.title}</span>
                    {game.id === "motion-duel" ? (
                      <span className="glass rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: "var(--magenta)" }}>
                        pairs you with a stranger
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm" style={{ color: "var(--faint)" }}>
                    {game.tagline}
                  </p>
                </div>
                <GlowBtn tone={locked ? "ghost" : "lime"} disabled={locked} onClick={() => onStart(game.id)} className="shrink-0 px-7 py-3.5 text-lg">
                  {soon ? "in the lab 🧪" : locked ? `needs ${game.minPlayers}+` : "START ⚡"}
                </GlowBtn>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Motion Duel stage ───────────────────────────────────────────────────────

const PHASE_BANNER: Record<DuelHostView["phase"], [string, string]> = {
  find: ["FIND YOUR OPPONENT 📳", "phones are glowing — match the colour"],
  steady: ["HOLD. STILL. 🫨", "move and you're out — the line is pulsing"],
  result: ["HANDS REVEALED", "steady hands won. flinchers know who they are."],
  complete: ["DUELS OVER", "scores are in"],
};

function DuelStage({ groups }: { groups: { id: string; view: DuelHostView }[] }) {
  const phase = groups[0]?.view.phase ?? "find";
  const [title, sub] = PHASE_BANNER[phase];

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-display text-xs font-bold uppercase tracking-[0.3em]" style={{ color: "var(--faint)" }}>
            Motion Duel — {groups.length} duel{groups.length === 1 ? "" : "s"} running
          </div>
          <h2 className={`font-display text-6xl font-black leading-tight ${phase === "steady" ? "glow-magenta" : "gradient-text"}`} style={phase === "steady" ? { color: "var(--magenta)" } : undefined}>
            {title}
          </h2>
        </div>
        <div className="pb-2 text-sm font-semibold" style={{ color: "var(--faint)" }}>
          {sub}
        </div>
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
    <div
      className="glass rounded-[1.6rem] p-5"
      style={{ border: `1px solid ${view.colour}55`, boxShadow: `0 0 44px -14px ${view.colour}aa` }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="h-3.5 w-3.5 rounded-full" style={{ background: view.colour, boxShadow: `0 0 12px ${view.colour}` }} />
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--faint)" }}>
          duel colour
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {view.duellists.map((d) => {
          const isWinner = view.phase !== "steady" && view.winner === d.name;
          return (
            <div key={d.playerId} className={`flex items-center gap-3 ${d.out && !isWinner ? "opacity-45" : ""}`}>
              <div className="relative">
                <Orb id={d.playerId} size={46} />
                {isWinner ? <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xl">👑</span> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="truncate font-display font-bold">{d.name}</span>
                  {d.out ? (
                    <span className="pop-in text-xs font-bold" style={{ color: "var(--coral)" }}>
                      FLINCHED 💥
                    </span>
                  ) : (
                    <span className="font-display text-sm font-bold" style={{ color: "var(--lime)" }}>
                      {d.score}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.08)" }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-150"
                    style={{
                      width: `${Math.min(100, (d.wobble / maxWobble) * 100)}%`,
                      background: d.out ? "var(--coral)" : "linear-gradient(90deg, var(--cyan), var(--magenta))",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {view.phase === "result" ? (
        <div className="pop-in mt-4 rounded-full px-4 py-1.5 text-center font-display text-sm font-bold" style={{ background: "rgb(200 255 62 / 0.15)", color: "var(--lime)" }}>
          {view.winner ? `${view.winner} takes it ⚡` : "dead heat 🤝"}
        </div>
      ) : null}
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
        particleCount: 180,
        spread: 110,
        origin: { y: 0.4 },
        colors: ["#8b5cf6", "#ff3dae", "#c8ff3e", "#3ee7ff", "#ffb03a"],
        disableForReducedMotion: true,
      });
    });
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="font-display text-xs font-bold uppercase tracking-[0.35em]" style={{ color: "var(--faint)" }}>
        Results
      </div>
      <h2 className="slam-in font-display gradient-text mt-3 max-w-4xl text-6xl font-black leading-tight">
        {results.headline} 🏆
      </h2>

      <ol className="mt-10 w-full max-w-2xl">
        {results.scores.slice(0, 5).map((row, i) => (
          <li
            key={row.playerId}
            className="pop-in flex items-center gap-4 border-b py-2.5"
            style={{ borderColor: "rgb(255 255 255 / 0.1)", animationDelay: `${0.2 + i * 0.12}s` }}
          >
            <span className="font-display w-8 text-right text-2xl font-black" style={{ color: i === 0 ? "var(--lime)" : "var(--faint)" }}>
              {i + 1}
            </span>
            <Orb id={row.playerId} size={44} />
            <span className="flex-1 text-left font-display text-2xl font-bold">
              {row.name}
              {i === 0 ? " 👑" : ""}
            </span>
            <span className="font-display text-2xl font-black" style={{ color: "var(--lime)" }}>
              {row.points}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex items-center gap-4">
        <GlowBtn tone="hot" onClick={onAgain} className="px-9 py-4 text-xl">
          RUN IT BACK 🔁
        </GlowBtn>
        <GlowBtn tone="ghost" onClick={onLobby} className="px-9 py-4 text-xl">
          game shelf
        </GlowBtn>
      </div>
    </div>
  );
}
