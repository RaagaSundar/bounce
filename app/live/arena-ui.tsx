"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buzz } from "./useRoomSocket";

/**
 * Arena's two surfaces: the phone controller and the projector.
 *
 * The phone sends a stick vector and fire requests, nothing else. Positions,
 * hits and kills all come back from the server, so this file never decides
 * anything about the game - it only draws it and reads thumbs.
 *
 * Rendering is a canvas driven by requestAnimationFrame, *not* React. The
 * server ticks at 20Hz; drawing straight from those frames looks like players
 * are stepping, and re-rendering an SVG tree twenty times a second janks a
 * phone badly. Instead every snapshot is stashed in a ref and the draw loop
 * interpolates between the last two, so 20Hz of network produces 60fps of
 * motion and React never re-renders during play.
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

/** Stick cadence. Comfortably under the server's 30/s per-player budget. */
const STICK_HZ = 20;
/** Hold-to-fire repeat. The server cooldown is the real limiter. */
const FIRE_REPEAT_MS = 140;

type Snapshot = { at: number; fighters: ArenaFighter[]; bullets: { x: number; y: number }[] };

// ── interpolating canvas ────────────────────────────────────────────────────

function useArenaCanvas(view: ArenaView, highlightId: string | undefined, compact: boolean) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prev = useRef<Snapshot | null>(null);
  const next = useRef<Snapshot | null>(null);

  // Capture each server frame without triggering a render.
  useEffect(() => {
    const snap: Snapshot = { at: performance.now(), fighters: view.fighters, bullets: view.bullets };
    prev.current = next.current ?? snap;
    next.current = snap;
  }, [view]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const a = prev.current;
      const b = next.current;
      if (!canvas || !a || !b) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const scale = Math.min(canvas.width / view.w, canvas.height / view.h);
      const offX = (canvas.width - view.w * scale) / 2;
      const offY = (canvas.height - view.h * scale) / 2;

      // How far between the last two server frames we are. Clamped, so a
      // dropped frame holds position instead of flinging players forward.
      const span = Math.max(1, b.at - a.at);
      const t = Math.min(1, (performance.now() - b.at) / span);
      const lerp = (p: number, q: number) => p + (q - p) * t;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, offX, offY);

      // floor
      ctx.fillStyle = "#0c0c0a";
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.strokeStyle = "rgba(232,228,216,0.07)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= view.w; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, view.h);
        ctx.stroke();
      }
      for (let y = 0; y <= view.h; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(view.w, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(198,255,50,0.35)";
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, view.w, view.h);

      // bullets - matched by index, which is stable enough between adjacent
      // frames to look continuous
      ctx.fillStyle = "#e8e4d8";
      b.bullets.forEach((bullet, i) => {
        const old = a.bullets[i];
        const bx = old ? lerp(old.x, bullet.x) : bullet.x;
        const by = old ? lerp(old.y, bullet.y) : bullet.y;
        ctx.beginPath();
        ctx.arc(bx, by, 9, 0, Math.PI * 2);
        ctx.fill();
      });

      const before = new Map(a.fighters.map((f) => [f.id, f]));
      for (const f of b.fighters) {
        const old = before.get(f.id);
        // A respawn teleports; interpolating that would smear them across the
        // arena, so only tween while they were alive in both frames.
        const tween = old && old.alive && f.alive;
        const x = tween ? lerp(old!.x, f.x) : f.x;
        const y = tween ? lerp(old!.y, f.y) : f.y;

        ctx.globalAlpha = f.alive ? 1 : 0.25;

        if (f.id === highlightId) {
          ctx.strokeStyle = f.colour;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.arc(x, y, 33, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = f.colour;
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(x - 24, y - 38, 48, 6);
        ctx.fillStyle = f.colour;
        ctx.fillRect(x - 24, y - 38, (48 * Math.max(0, f.hp)) / 100, 6);

        if (!compact) {
          ctx.fillStyle = "#e8e4d8";
          ctx.font = "600 18px 'Space Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillText(f.name, x, y + 48);
        }
        ctx.globalAlpha = 1;
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [view.w, view.h, highlightId, compact]);

  return canvasRef;
}

function ArenaCanvas({
  view,
  highlightId,
  compact = false,
}: {
  view: ArenaView;
  highlightId?: string;
  compact?: boolean;
}) {
  const ref = useArenaCanvas(view, highlightId, compact);
  return <canvas ref={ref} className="h-full w-full" style={{ borderRadius: 8, display: "block" }} />;
}

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
  const knobRef = useRef<HTMLDivElement | null>(null);
  const vector = useRef({ dx: 0, dy: 0 });
  const sent = useRef({ dx: 0, dy: 0 });
  const baseRef = useRef<HTMLDivElement | null>(null);
  const touchId = useRef<number | null>(null);
  const firing = useRef(false);

  // The stick is written straight to the DOM: moving it must not re-render the
  // component mid-drag, or the canvas stutters under your thumb.
  const paint = useCallback((kx: number, ky: number, snap: boolean) => {
    const knob = knobRef.current;
    if (!knob) return;
    knob.style.transition = snap ? "transform 120ms ease-out" : "none";
    knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const { dx, dy } = vector.current;
      if (dx === sent.current.dx && dy === sent.current.dy) return;
      sent.current = { dx, dy };
      onStick(dx, dy);
    }, 1000 / STICK_HZ);
    return () => clearInterval(id);
  }, [onStick]);

  // Hold to keep firing. Tapping repeatedly for ninety seconds is miserable,
  // and the server cooldown is the real rate limit anyway.
  useEffect(() => {
    const id = setInterval(() => {
      if (firing.current) onFire();
    }, FIRE_REPEAT_MS);
    return () => clearInterval(id);
  }, [onFire]);

  const track = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current;
      if (!base) return;
      const r = base.getBoundingClientRect();
      const radius = r.width / 2;
      let dx = (clientX - (r.left + radius)) / radius;
      let dy = (clientY - (r.top + radius)) / radius;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      vector.current = { dx: +dx.toFixed(3), dy: +dy.toFixed(3) };
      paint(dx * radius * 0.62, dy * radius * 0.62, false);
    },
    [paint],
  );

  const release = useCallback(() => {
    touchId.current = null;
    vector.current = { dx: 0, dy: 0 };
    paint(0, 0, true);
  }, [paint]);

  const you = view.you;
  const dead = Boolean(you && !you.alive);

  return (
    <div className="skin-ink-acid flex touch-none select-none flex-col" style={{ background: "var(--color-ink)" }}>
      <div className="flex items-center justify-between px-5 pt-4">
        <span className="display text-3xl" style={{ color: you?.colour ?? "var(--color-acid)" }}>
          {you?.kills ?? 0}
          <span className="mono-label ml-1" style={{ color: "var(--color-stone)" }}>KO</span>
        </span>
        <span className="display text-3xl text-bone">{view.secondsLeft}s</span>
      </div>

      <div className="mx-5 mt-2 h-3 overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.12)" }}>
        <div
          className="h-full"
          style={{
            width: `${Math.max(0, you?.hp ?? 0)}%`,
            background: you?.colour ?? "var(--color-acid)",
            transition: "width 120ms linear",
          }}
        />
      </div>

      <div className="mx-4 mt-3 flex-1">
        <ArenaCanvas view={view} highlightId={you?.id} compact />
      </div>

      <p className="mono-label py-2 text-center" style={{ color: dead ? "var(--color-signal)" : "var(--color-stone)" }}>
        {view.phase === "countdown"
          ? `STARTING IN ${view.startsIn}`
          : dead
            ? "RESPAWNING"
            : "DRAG TO MOVE · HOLD TO FIRE"}
      </p>

      <div className="flex items-center justify-between px-7 pb-8">
        <div
          ref={baseRef}
          onPointerDown={(e) => {
            if (touchId.current !== null) return;
            touchId.current = e.pointerId;
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            track(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (touchId.current !== e.pointerId) return;
            track(e.clientX, e.clientY);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
          className="relative h-44 w-44 rounded-full border-2"
          style={{ borderColor: "rgb(232 228 216 / 0.25)", background: "rgb(255 255 255 / 0.05)" }}
        >
          <div
            ref={knobRef}
            className="absolute left-1/2 top-1/2 h-20 w-20 rounded-full"
            style={{ background: you?.colour ?? "var(--color-acid)", transform: "translate(-50%, -50%)" }}
          />
        </div>

        <button
          type="button"
          disabled={dead || view.phase !== "live"}
          onPointerDown={(e) => {
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            firing.current = true;
            buzz(12);
            onFire();
          }}
          onPointerUp={() => { firing.current = false; }}
          onPointerCancel={() => { firing.current = false; }}
          onLostPointerCapture={() => { firing.current = false; }}
          className="h-36 w-36 rounded-full border-4 display text-2xl disabled:opacity-25"
          style={{ borderColor: "var(--color-signal)", background: "var(--color-signal)", color: "var(--color-ink)" }}
        >
          FIRE
        </button>
      </div>
    </div>
  );
}

// ── projector ───────────────────────────────────────────────────────────────

export function ArenaStage({ view }: { view: ArenaView }) {
  const board =
    view.board ??
    [...view.fighters]
      .sort((a, b) => b.kills - a.kills)
      .map((f) => ({ playerId: f.id, name: f.name, colour: f.colour, kills: f.kills, deaths: f.deaths ?? 0 }));

  return (
    <div className="grid h-full grid-cols-[1fr_300px] gap-8">
      <section className="flex min-h-0 flex-col">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="mono-label" style={{ color: "var(--color-stone)" }}>
            {view.phase === "countdown" ? "GET READY" : view.phase === "over" ? "MATCH OVER" : "LIVE"}
          </span>
          <span
            className="display text-5xl"
            style={{ color: view.secondsLeft <= 10 ? "var(--color-signal)" : "var(--color-acid)" }}
          >
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
