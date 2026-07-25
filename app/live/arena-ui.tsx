"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buzz } from "./useRoomSocket";

/**
 * Arena's two surfaces: the phone controller and the projector.
 *
 * The phone sends a stick vector and fire requests, nothing else. Positions,
 * hits and kills all come back from the server, so this file never decides
 * anything about the game - it only draws it and reads thumbs.
 */

export type ArenaFighter = {
  id: string;
  name: string;
  colour: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  kills: number;
  deaths?: number;
};

export type ArenaView = {
  phase: "countdown" | "live" | "over";
  w: number;
  h: number;
  startsIn: number;
  secondsLeft: number;
  you?: {
    id: string;
    hp: number;
    alive: boolean;
    kills: number;
    deaths: number;
    colour: string;
    respawnIn: number;
    canFire: boolean;
  } | null;
  fighters: ArenaFighter[];
  bullets: { x: number; y: number }[];
  feed: string[];
  board?: { playerId: string; name: string; colour: string; kills: number; deaths: number }[];
};

/** Stick vectors are sent on a fixed cadence, well under the server's budget. */
const STICK_HZ = 15;

// ── phone controller ────────────────────────────────────────────────────────

export function ArenaPad({
  view,
  onStick,
  onFire,
}: {
  view: ArenaView;
  onStick: (dx: number, dy: number) => void;
  onFire: () => void;
}) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const vector = useRef({ dx: 0, dy: 0 });
  const sent = useRef({ dx: 0, dy: 0 });
  const baseRef = useRef<HTMLDivElement | null>(null);
  const touchId = useRef<number | null>(null);
  // Mirrored into state because the knob's transition depends on it, and refs
  // must not be read during render.
  const [dragging, setDragging] = useState(false);

  // One sender for the whole stick, rather than one message per touch event -
  // a drag fires far faster than the server flushes.
  useEffect(() => {
    const id = setInterval(() => {
      const { dx, dy } = vector.current;
      if (dx === sent.current.dx && dy === sent.current.dy) return;
      sent.current = { dx, dy };
      onStick(dx, dy);
    }, 1000 / STICK_HZ);
    return () => clearInterval(id);
  }, [onStick]);

  const track = useCallback((clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const radius = r.width / 2;

    let dx = (clientX - cx) / radius;
    let dy = (clientY - cy) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    vector.current = { dx: +dx.toFixed(3), dy: +dy.toFixed(3) };
    setKnob({ x: dx * radius * 0.62, y: dy * radius * 0.62 });
  }, []);

  const release = useCallback(() => {
    touchId.current = null;
    setDragging(false);
    vector.current = { dx: 0, dy: 0 };
    setKnob({ x: 0, y: 0 });
  }, []);

  const you = view.you;
  const dead = Boolean(you && !you.alive);

  return (
    <div
      className="skin-ink-acid grain flex touch-none select-none flex-col"
      style={{ background: "var(--color-ink)" }}
    >
      {/* status strip */}
      <div className="flex items-center justify-between px-5 pt-5">
        <span className="display text-3xl" style={{ color: you?.colour ?? "var(--color-acid)" }}>
          {you?.kills ?? 0} <span className="mono-label" style={{ color: "var(--color-stone)" }}>KO</span>
        </span>
        <span className="display text-3xl text-bone">{view.secondsLeft}s</span>
      </div>

      {/* health */}
      <div className="mx-5 mt-3 h-3 overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.12)" }}>
        <div
          className="h-full transition-[width] duration-100"
          style={{ width: `${Math.max(0, you?.hp ?? 0)}%`, background: you?.colour ?? "var(--color-acid)" }}
        />
      </div>

      {/* mini arena so a player can see themselves without looking up */}
      <div className="mx-5 mt-4 flex-1">
        <ArenaCanvas view={view} highlightId={you?.id} compact />
      </div>

      {view.phase === "countdown" ? (
        <p className="mono-label py-3 text-center" style={{ color: "var(--color-acid)" }}>
          STARTING IN {view.startsIn}
        </p>
      ) : dead ? (
        <p className="mono-label py-3 text-center" style={{ color: "var(--color-signal)" }}>
          RESPAWNING {you?.respawnIn.toFixed(1)}s
        </p>
      ) : (
        <p className="mono-label py-3 text-center" style={{ color: "var(--color-stone)" }}>
          DRAG TO MOVE · TAP FIRE
        </p>
      )}

      {/* controls */}
      <div className="flex items-center justify-between px-8 pb-10">
        <div
          ref={baseRef}
          onPointerDown={(e) => {
            if (touchId.current !== null) return;
            touchId.current = e.pointerId;
            setDragging(true);
            (e.target as Element).setPointerCapture?.(e.pointerId);
            track(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (touchId.current !== e.pointerId) return;
            track(e.clientX, e.clientY);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          className="relative h-40 w-40 rounded-full border-2"
          style={{ borderColor: "rgb(232 228 216 / 0.25)", background: "rgb(255 255 255 / 0.04)" }}
        >
          <div
            className="absolute left-1/2 top-1/2 h-16 w-16 rounded-full"
            style={{
              transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
              background: you?.colour ?? "var(--color-acid)",
              transition: dragging ? "none" : "transform 120ms ease-out",
            }}
          />
        </div>

        <button
          type="button"
          disabled={dead || view.phase !== "live"}
          onPointerDown={() => {
            buzz(14);
            onFire();
          }}
          className="h-32 w-32 rounded-full border-4 display text-2xl disabled:opacity-25"
          style={{
            borderColor: "var(--color-signal)",
            background: you?.canFire ? "var(--color-signal)" : "transparent",
            color: you?.canFire ? "var(--color-ink)" : "var(--color-signal)",
          }}
        >
          FIRE
        </button>
      </div>
    </div>
  );
}

// ── shared renderer ─────────────────────────────────────────────────────────

function ArenaCanvas({
  view,
  highlightId,
  compact = false,
}: {
  view: ArenaView;
  highlightId?: string;
  compact?: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${view.w} ${view.h}`}
      className="h-full w-full"
      style={{ background: "var(--color-inkdeep)", borderRadius: 8 }}
      aria-label="arena"
    >
      <defs>
        <pattern id="arena-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0 L0 0 0 50" fill="none" stroke="rgb(232 228 216 / 0.07)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={view.w} height={view.h} fill="url(#arena-grid)" />
      <rect
        width={view.w}
        height={view.h}
        fill="none"
        stroke="rgb(198 255 50 / 0.35)"
        strokeWidth="3"
      />

      {view.bullets.map((b, i) => (
        <circle key={i} cx={b.x} cy={b.y} r={7} fill="var(--color-bone)" />
      ))}

      {view.fighters.map((f) => (
        <g key={f.id} opacity={f.alive ? 1 : 0.22}>
          {f.id === highlightId ? (
            <circle cx={f.x} cy={f.y} r={32} fill="none" stroke={f.colour} strokeWidth="2" strokeDasharray="6 6" />
          ) : null}
          <circle cx={f.x} cy={f.y} r={22} fill={f.colour} />
          {/* health ring */}
          <rect x={f.x - 24} y={f.y - 36} width={48} height={6} rx={3} fill="rgb(0 0 0 / 0.55)" />
          <rect x={f.x - 24} y={f.y - 36} width={(48 * Math.max(0, f.hp)) / 100} height={6} rx={3} fill={f.colour} />
          {!compact ? (
            <text
              x={f.x}
              y={f.y + 46}
              textAnchor="middle"
              fill="var(--color-bone)"
              style={{ font: "600 18px 'Space Mono', monospace" }}
            >
              {f.name}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

// ── projector ───────────────────────────────────────────────────────────────

export function ArenaStage({ view }: { view: ArenaView }) {
  const board = view.board ?? [...view.fighters].sort((a, b) => b.kills - a.kills).map((f) => ({
    playerId: f.id,
    name: f.name,
    colour: f.colour,
    kills: f.kills,
    deaths: f.deaths ?? 0,
  }));

  return (
    <div className="grid h-full grid-cols-[1fr_300px] gap-8">
      <section className="relative flex min-h-0 flex-col">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="mono-label" style={{ color: "var(--color-stone)" }}>
            {view.phase === "countdown" ? "GET READY" : view.phase === "over" ? "MATCH OVER" : "LIVE"}
          </span>
          <span className="display text-5xl" style={{ color: view.secondsLeft <= 10 ? "var(--color-signal)" : "var(--color-acid)" }}>
            {view.phase === "countdown" ? view.startsIn : view.secondsLeft}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <ArenaCanvas view={view} />
        </div>
      </section>

      <aside className="flex min-h-0 flex-col">
        <div className="mono-label" style={{ color: "var(--color-stone)" }}>KNOCKOUTS</div>
        <ol className="mt-3 space-y-1">
          {board.slice(0, 10).map((row, i) => (
            <li key={row.playerId} className="flex items-baseline justify-between border-b hairline-bone pb-1">
              <span className="truncate font-mono text-sm">
                <span style={{ color: "var(--color-stone)" }}>{String(i + 1).padStart(2, "0")}</span>{" "}
                <span style={{ color: row.colour }}>●</span> {row.name}
              </span>
              <span className="display text-xl" style={{ color: "var(--color-acid)" }}>{row.kills}</span>
            </li>
          ))}
        </ol>

        <div className="mono-label mt-6" style={{ color: "var(--color-stone)" }}>FEED</div>
        <ul className="mt-2 space-y-1 overflow-hidden text-sm">
          {view.feed.slice(0, 6).map((line, i) => (
            <li key={i} style={{ color: i === 0 ? "var(--color-bone)" : "var(--color-stone)" }}>{line}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
