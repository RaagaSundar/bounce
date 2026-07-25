"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The "open the link cold" view.
 *
 * Bounce is a two-surface product — a projector and a phone — which normally
 * means two devices before anything is visible. This route runs both surfaces
 * in one tab against a single real room, so the live engine can be seen
 * without a second device. Nothing is simulated: the two frames hold separate
 * WebSocket connections to the same Durable Object.
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

// The two surfaces are designed at these sizes and scaled to fit, rather than
// reflowed — a squeezed projector layout would misrepresent the real thing.
const STAGE = { w: 1280, h: 800 };
const PHONE = { w: 390, h: 780 };

export default function TryPage() {
  const [code, setCode] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(newCode());
  }, []);

  if (!code) return <div className="skin-arcade" />;

  return (
    <div className="skin-arcade flex flex-col">
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-6 py-3" style={{ borderBottom: "1px solid rgb(255 255 255 / 0.1)" }}>
        <div className="flex items-baseline gap-4">
          <Link href="/" className="font-display gradient-text text-2xl font-black tracking-tight">
            BOUNCE
          </Link>
          <span className="font-display text-xs font-bold uppercase tracking-[0.25em]" style={{ color: "var(--faint)" }}>
            solo demo — room {code}
          </span>
        </div>
        <p className="text-xs font-semibold" style={{ color: "var(--faint)" }}>
          Press <span style={{ color: "var(--lime)" }}>START</span> on a game, then play it on the phone pane.
        </p>
        <button
          type="button"
          onClick={() => setCode(newCode())}
          className="glass rounded-full px-4 py-1.5 text-xs font-bold transition-transform hover:scale-105"
          style={{ color: "var(--milk)" }}
        >
          FRESH ROOM ⟳
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row">
        <Pane label="THE PROJECTOR" grow>
          <ScaledFrame
            key={`stage-${code}`}
            title="Bounce big screen"
            src={`/host?room=${code}`}
            {...STAGE}
          />
        </Pane>
        <Pane label="A PLAYER'S PHONE">
          <ScaledFrame
            key={`phone-${code}`}
            title="Bounce player phone"
            src={`/play?room=${code}&name=YOU`}
            {...PHONE}
          />
        </Pane>
      </div>
    </div>
  );
}

function Pane({
  label,
  grow = false,
  children,
}: {
  label: string;
  grow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`glass flex min-h-0 flex-col overflow-hidden rounded-2xl ${grow ? "flex-[3]" : "flex-1"}`}>
      <div
        className="px-3 py-2 font-display text-[11px] font-bold uppercase tracking-[0.25em]"
        style={{ color: "var(--faint)", borderBottom: "1px solid rgb(255 255 255 / 0.1)" }}
      >
        {label}
      </div>
      {children}
    </section>
  );
}

/** Renders `src` at its design size and scales it down to fit the pane. */
function ScaledFrame({
  src,
  w,
  h,
  title,
}: {
  src: string;
  w: number;
  h: number;
  title: string;
}) {
  const pane = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const element = pane.current;
    if (!element) return;

    let frame = 0;
    let retries = 0;

    // A scale of 0 renders two blank panes, which is the worst possible failure
    // for the one link a judge clicks. ResizeObserver alone is not enough: in a
    // backgrounded or not-yet-composited tab it may not deliver an observation
    // at all, so measure directly and keep retrying until the layout is real.
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setScale(Math.min(width / w, height / h));
        return;
      }
      if (retries++ < 120) frame = requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [w, h]);

  return (
    <div ref={pane} className="relative min-h-0 flex-1">
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <iframe
          title={title}
          src={src}
          // Motion Duel asks for the accelerometer; without this the permission
          // request is rejected outright inside a frame.
          allow="accelerometer; gyroscope"
          style={{
            width: w,
            height: h,
            border: 0,
            transform: `scale(${scale})`,
            // Painting at full size before the first measurement lands would
            // flash an oversized frame.
            visibility: scale ? "visible" : "hidden",
          }}
        />
      </div>
    </div>
  );
}
