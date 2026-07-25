"use client";

import { useEffect, useRef, useState } from "react";

import { buzz, useRoomSocket } from "../live/useRoomSocket";
import { useMotion } from "../live/useMotion";
import { Ambient, EqBars, GlowBtn, Orb } from "../live/arcade";

type BrawlView = {
  phase: "intro" | "clash" | "resolve" | "complete";
  round: number;
  phaseEndsAt: number;
  you: { damage: number; stocks: number; out: boolean; kos: number; move: string | null; targetId: string | null; won: boolean } | null;
  targets: { id: string; name: string; damage: number; stocks: number }[];
  feed: string[];
  winner: string | null;
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

/** Dark text on the light pair colours, light text on the dark ones. */
function darkTextOn(colour: string): boolean {
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
        <Prompt label="room code" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^[A-Za-z2-9]{6}$/.test(codeDraft)) setCode(codeDraft.toUpperCase());
          }}
          className="w-full max-w-sm"
        >
          <input
            value={codeDraft}
            onChange={(e) => setCodeDraft(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC234"
            autoCapitalize="characters"
            autoCorrect="off"
            className="glass w-full rounded-2xl px-4 py-4 text-center font-display text-4xl font-bold tracking-[0.2em] outline-none transition-colors"
            style={{ color: "var(--milk)", caretColor: "var(--magenta)" }}
          />
          <GlowBtn tone="lime" disabled={codeDraft.length !== 6} className="mt-4 w-full py-4 text-xl" {...{ type: "submit" as const }}>
            LET ME IN ⚡
          </GlowBtn>
        </form>
      </Shell>
    );
  }

  if (name === null) {
    return (
      <Shell>
        <Prompt label={`room ${code}`} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim().length >= 2) {
              buzz();
              setName(draft.trim());
            }
          }}
          className="w-full max-w-sm"
        >
          <div className="mb-4 flex justify-center">
            <div className="float-y">
              <Orb id={draft.trim() || "?"} size={110} />
            </div>
          </div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 18))}
            placeholder="your name"
            className="glass w-full rounded-2xl px-4 py-4 text-center font-display text-3xl font-bold outline-none"
            style={{ color: "var(--milk)", caretColor: "var(--magenta)" }}
          />
          <GlowBtn tone="hot" disabled={draft.trim().length < 2} className="mt-4 w-full py-4 text-xl" {...{ type: "submit" as const }}>
            THAT&apos;S ME →
          </GlowBtn>
        </form>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="glass rounded-3xl px-6 py-5 text-center" style={{ color: "var(--coral)" }}>
          <div className="font-display text-sm font-bold uppercase tracking-[0.25em]">can&apos;t join</div>
          <p className="mt-2 text-sm">{error}</p>
        </div>
      </Shell>
    );
  }

  if (results) {
    const mine = results.scores.findIndex((s) => s.playerId === me?.playerId);
    return (
      <Shell confetti>
        <Prompt label="final" />
        <div className="slam-in text-center">
          <div className="font-display gradient-text text-[7rem] font-black leading-none">
            {mine >= 0 ? `#${mine + 1}` : "—"}
          </div>
          <div className="font-display mt-2 text-xl font-bold" style={{ color: "var(--lime)" }}>
            {results.scores[mine]?.points ?? 0} points
          </div>
        </div>
        <p className="mt-4 text-center" style={{ color: "var(--faint)" }}>
          {results.headline}
        </p>
      </Shell>
    );
  }

  if (view && viewGameId === "brawl") {
    return (
      <BrawlPad
        brawl={view as unknown as BrawlView}
        onMove={(move, targetId) => send({ type: "input", input: { type: "move", move, targetId } })}
      />
    );
  }

  if (view && viewGameId === "motion-duel") {
    return (
      <DuelPad
        duel={view as unknown as DuelView}
        meId={me?.playerId ?? "me"}
        sendMagnitude={(magnitude) => send({ type: "input", input: { type: "motion", magnitude } })}
      />
    );
  }

  return (
    <Shell>
      <Prompt label={`room ${code}`} />
      <div className="relative flex flex-col items-center text-center">
        {me ? (
          <div className="relative mb-5">
            <span className="ring-out absolute inset-0 rounded-full border-2" style={{ borderColor: "rgb(139 92 246 / 0.5)" }} />
            <div className="float-y">
              <Orb id={me.playerId} size={120} />
            </div>
          </div>
        ) : null}
        <div className="font-display glow-lime text-5xl font-black" style={{ color: "var(--lime)" }}>
          YOU&apos;RE IN
        </div>
        <p className="mt-2 font-semibold" style={{ color: "var(--faint)" }}>
          {status === "live" ? `${room?.players.length ?? 1} in the room` : status}
        </p>
        <EqBars count={18} height={24} className="mt-6 w-44 opacity-60" />
        <p className="mt-3 text-sm" style={{ color: "var(--faint)" }}>
          eyes on the big screen — the host picks what happens next
        </p>
      </div>
    </Shell>
  );
}

// ── Motion Duel ─────────────────────────────────────────────────────────────

/** Stream at ~12Hz — comfortably under the server's 30/s input budget. */
const MOTION_SEND_MS = 80;

function DuelPad({ duel, meId, sendMagnitude }: { duel: DuelView; meId: string; sendMagnitude: (m: number) => void }) {
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

  const dark = darkTextOn(duel.colour);
  const fg = dark ? "#101318" : "#ffffff";
  const opponentNames = duel.opponents.map((o) => o.name).join(" + ") || "…";
  const needsArming = motionStatus !== "armed";

  // FIND: the phone becomes the beacon. Whole screen floods the pair colour.
  if (duel.phase === "find") {
    return (
      <div className="skin-arcade flex flex-col items-center justify-center gap-5 p-8 text-center" style={{ background: duel.colour, color: fg }}>
        <div className="font-display text-xs font-bold uppercase tracking-[0.3em]" style={{ color: fg, opacity: 0.75 }}>
          hold your phone up 📳
        </div>
        <div className="slam-in font-display text-6xl font-black leading-none">FIND THIS COLOUR</div>
        <div className="flex items-center gap-3">
          <Orb id={meId} size={54} />
          <span className="font-display text-2xl font-black">×</span>
          {duel.opponents.map((o) => (
            <Orb key={o.name} id={o.name} size={54} />
          ))}
        </div>
        <div className="font-display text-sm font-bold uppercase tracking-[0.2em]" style={{ color: fg, opacity: 0.8 }}>
          you × {opponentNames}
        </div>
        {needsArming ? (
          <GlowBtn
            tone="hot"
            className="mt-3 px-9 py-4 text-2xl"
            onClick={() => {
              buzz();
              void arm();
            }}
          >
            {motionStatus === "denied" ? "sensors blocked — retry" : "ARM SENSORS 📡"}
          </GlowBtn>
        ) : (
          <div className="pop-in glass rounded-full px-5 py-2 font-display text-sm font-bold" style={{ color: fg, borderColor: fg }}>
            sensors hot — go find them 🏃
          </div>
        )}
        <div key={findLeft} className="slam-in font-display text-8xl font-black">{findLeft ?? ""}</div>
      </div>
    );
  }

  // STEADY: the duel. Your orb sits inside a meter ring that fills as you move.
  if (duel.phase === "steady") {
    if (duel.you.out) {
      return (
        <div className="skin-arcade flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ background: "var(--coral)" }}>
          <div className="slam-in font-display text-9xl font-black text-white">OUT 💥</div>
          <p className="font-display text-sm font-bold uppercase tracking-[0.25em] text-white/90">you flinched</p>
          <p className="mt-3 max-w-xs text-sm font-semibold text-white">
            The duel&apos;s lost — the introduction isn&apos;t. You&apos;re standing next to {opponentNames}. Say hi.
          </p>
        </div>
      );
    }

    const threshold = duel.threshold ?? 2.6;
    const fill = Math.min(1, meter / (threshold * 1.15));
    const danger = fill > 0.8;
    const R = 84;
    const CIRC = 2 * Math.PI * R;

    return (
      <div
        className="skin-arcade flex flex-col items-center justify-between p-7 text-center"
        style={{ boxShadow: `inset 0 0 0 8px ${duel.colour}`, borderRadius: 0 }}
      >
        <div className="font-display text-xs font-bold uppercase tracking-[0.25em]" style={{ color: "var(--faint)" }}>
          duel vs {opponentNames} — {duelLeft ?? "–"}s
        </div>

        <div className={`font-display text-6xl font-black leading-tight ${danger ? "wobble-shake" : "pulse-soft"}`} style={{ color: danger ? "var(--coral)" : "var(--milk)" }}>
          HOLD
          <br />
          STILL
        </div>

        {/* the wobble ring: your orb inside a gauge that fills as you move */}
        <div className="relative grid place-items-center" style={{ width: 220, height: 220 }}>
          <svg width="220" height="220" viewBox="0 0 220 220" className="absolute inset-0 -rotate-90">
            <circle cx="110" cy="110" r={R} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="14" />
            <circle
              cx="110"
              cy="110"
              r={R}
              fill="none"
              stroke={danger ? "var(--coral)" : "var(--cyan)"}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - fill)}
              style={{ transition: "stroke-dashoffset 90ms linear, stroke 150ms" }}
            />
          </svg>
          <div className={danger ? "wobble-shake" : ""}>
            <Orb id={meId} size={104} />
          </div>
        </div>

        <div className="font-display text-xs font-bold uppercase tracking-[0.2em]" style={{ color: danger ? "var(--coral)" : "var(--faint)" }}>
          {duel.opponents.some((o) => o.out)
            ? "they flinched 👀 stay frozen to take it"
            : danger
              ? "easy… easy…"
              : "the line pulses. breathe."}
        </div>
      </div>
    );
  }

  // RESULT / COMPLETE
  const won = duel.you.won;
  return (
    <div
      className="skin-arcade flex flex-col items-center justify-center gap-4 p-8 text-center"
      style={won ? { background: "var(--lime)" } : undefined}
    >
      {!won ? <Ambient /> : null}
      <div className="relative z-10">
        {won ? (
          <>
            <div className="slam-in font-display text-8xl font-black leading-none" style={{ color: "#101800" }}>
              WON 👑
            </div>
            <div className="mt-2 font-display text-sm font-bold uppercase tracking-[0.25em]" style={{ color: "#101800" }}>
              steadiest hand in the pair · +500
            </div>
          </>
        ) : (
          <>
            <div className="font-display text-6xl font-black" style={{ color: "var(--milk)" }}>
              {duel.winner ?? "DEAD HEAT"}
            </div>
            <div className="mt-2 font-display text-sm font-bold uppercase tracking-[0.25em]" style={{ color: "var(--faint)" }}>
              {duel.winner ? "took your duel" : "nobody flinched"}
            </div>
          </>
        )}
        <div className="mt-6 font-display text-lg font-bold" style={{ color: won ? "#101800" : "var(--lime)" }}>
          {duel.you.score} pts this game
        </div>
        <p className="mt-1 text-sm font-semibold" style={{ color: won ? "#101800" : "var(--faint)" }}>
          you just met {opponentNames}. that was the point 🤝
        </p>
      </div>
    </div>
  );
}

// ── small shared pieces ─────────────────────────────────────────────────────


// -- Brawl -------------------------------------------------------------------

const MOVES = [
  { id: "attack", label: "ATTACK", beatsLabel: "beats GRAB" },
  { id: "grab", label: "GRAB", beatsLabel: "beats SHIELD" },
  { id: "shield", label: "SHIELD", beatsLabel: "beats ATTACK" },
] as const;

function BrawlPad({
  brawl,
  onMove,
}: {
  brawl: BrawlView;
  onMove: (move: string, targetId: string) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const left = useCountdown(brawl.phaseEndsAt);
  const you = brawl.you;

  // Default to whoever is closest to being knocked out - the read most people
  // want, and it means one tap is enough if you do not care who.
  const defaultTarget =
    target && brawl.targets.some((t) => t.id === target)
      ? target
      : ([...brawl.targets].sort((a, b) => b.damage - a.damage)[0]?.id ?? null);

  const wasOut = useRef(false);
  useEffect(() => {
    if (you?.out && !wasOut.current) buzz([0, 80, 50, 120]);
    wasOut.current = Boolean(you?.out);
  }, [you?.out]);

  if (!you) return <Shell><Prompt label="brawl" /></Shell>;

  if (you.out) {
    return (
      <Shell>
        <Prompt label="brawl" />
        <div className="text-center">
          <div className="font-display text-4xl font-bold" style={{ color: "var(--magenta)" }}>KO&apos;D OUT</div>
          <p className="mt-2" style={{ color: "var(--faint)" }}>{you.kos} KO{you.kos === 1 ? "" : "s"} landed</p>
        </div>
      </Shell>
    );
  }

  const locked = Boolean(you.move);

  return (
    <Shell confetti={brawl.phase === "complete" && you.won}>
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-5xl font-bold" style={{ color: you.damage > 70 ? "var(--magenta)" : "var(--lime)" }}>
            {you.damage}%
          </span>
          <span style={{ color: "var(--faint)" }}>
            {"◆".repeat(Math.max(0, you.stocks))} · {you.kos} KO
          </span>
        </div>

        {brawl.phase === "clash" ? (
          <>
            <p className="text-sm" style={{ color: "var(--faint)" }}>
              {locked ? "locked in — wait for the clash" : `pick a target · ${left ?? ""}s`}
            </p>

            <div className="flex flex-wrap gap-2">
              {brawl.targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTarget(t.id); buzz(10); }}
                  className="rounded-lg border-2 px-3 py-2 text-sm"
                  style={{
                    borderColor: t.id === defaultTarget ? "var(--lime)" : "rgb(255 255 255 / 0.18)",
                    opacity: locked ? 0.4 : 1,
                  }}
                >
                  {t.name} <span style={{ color: "var(--faint)" }}>{t.damage}%</span>
                </button>
              ))}
            </div>

            <div className="grid gap-2">
              {MOVES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={locked || !defaultTarget}
                  onClick={() => { buzz(22); if (defaultTarget) onMove(m.id, defaultTarget); }}
                  className="rounded-xl border-2 px-4 py-4 text-left disabled:opacity-30"
                  style={{ borderColor: you.move === m.id ? "var(--lime)" : "rgb(255 255 255 / 0.18)" }}
                >
                  <span className="font-display text-2xl font-bold">{m.label}</span>
                  <span className="ml-2 text-xs" style={{ color: "var(--faint)" }}>{m.beatsLabel}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="min-h-[9rem]">
            <p className="text-sm" style={{ color: "var(--faint)" }}>
              {brawl.phase === "intro" ? "get ready" : brawl.phase === "complete" ? (brawl.winner ? `${brawl.winner} wins` : "over") : "clash!"}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {brawl.feed.slice(0, 5).map((line, i) => (
                <li key={i} style={{ color: i === 0 ? "var(--paper)" : "var(--faint)" }}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, confetti = false }: { children: React.ReactNode; confetti?: boolean }) {
  const fired = useRef(false);
  useEffect(() => {
    if (!confetti || fired.current) return;
    fired.current = true;
    void import("canvas-confetti").then(({ default: fire }) => {
      fire({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.5 },
        colors: ["#8b5cf6", "#ff3dae", "#c8ff3e", "#3ee7ff", "#ffb03a"],
        disableForReducedMotion: true,
      });
    });
  }, [confetti]);

  return (
    <div className="skin-arcade flex flex-col items-center justify-center gap-6 p-8">
      <Ambient />
      <div className="relative z-10 flex w-full flex-col items-center gap-6">{children}</div>
    </div>
  );
}

function Prompt({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="font-display gradient-text text-3xl font-black tracking-tight">BOUNCE</div>
      <div className="mt-1 font-display text-xs font-bold uppercase tracking-[0.3em]" style={{ color: "var(--faint)" }}>
        {label}
      </div>
    </div>
  );
}
