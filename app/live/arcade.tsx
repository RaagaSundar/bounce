"use client";

/**
 * Shared pieces of the arcade skin. The server roster is just {id, name}, so a
 * player's orb (colour + face) is derived deterministically from their id —
 * every screen in the room renders the same creature for the same person, with
 * nothing stored anywhere.
 */

const HUES = [265, 320, 200, 150, 85, 35, 0, 230];
const FACES = ["🦊", "🐸", "🐙", "🦉", "🐯", "🐼", "🦄", "🐨", "🦁", "🐺", "🐢", "🐰"];

function hashOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hueOf(id: string): number {
  return HUES[hashOf(id) % HUES.length];
}

export function faceOf(id: string): string {
  return FACES[(hashOf(id) >>> 4) % FACES.length];
}

export function orbBg(hue: number): string {
  return `radial-gradient(circle at 32% 26%, hsl(${hue} 95% 78%), hsl(${hue} 85% 52%) 52%, hsl(${hue} 80% 26%) 100%)`;
}

export function Orb({
  id,
  name,
  size = 56,
  showName = false,
  ring = false,
  className = "",
}: {
  id: string;
  name?: string;
  size?: number;
  showName?: boolean;
  ring?: boolean;
  className?: string;
}) {
  const hue = hueOf(id);
  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <div
        className="relative grid place-items-center rounded-full"
        style={{
          width: size,
          height: size,
          background: orbBg(hue),
          boxShadow: `0 0 ${size / 3}px hsl(${hue} 90% 60% / 0.45), inset 0 -${size / 12}px ${size / 6}px rgb(0 0 0 / 0.3), inset 0 ${size / 14}px ${size / 8}px rgb(255 255 255 / 0.35)`,
          border: ring ? "2px solid var(--lime)" : "2px solid rgb(255 255 255 / 0.18)",
        }}
      >
        <span style={{ fontSize: size * 0.46, lineHeight: 1 }}>{faceOf(id)}</span>
      </div>
      {showName && name ? (
        <span
          className="glass rounded-full px-2 py-0.5 font-semibold leading-none"
          style={{ fontSize: Math.max(10, size * 0.18), color: "var(--milk)" }}
        >
          {name}
        </span>
      ) : null}
    </div>
  );
}

/** Floating gradient blobs + drifting shapes behind every screen. */
export function Ambient() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="float-y absolute -left-24 top-[8%] h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--violet), transparent 70%)" }}
      />
      <div
        className="float-y absolute -right-20 top-[46%] h-80 w-80 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--magenta), transparent 70%)", animationDelay: "-2s" }}
      />
      <div
        className="float-y absolute bottom-[-10%] left-[30%] h-72 w-72 rounded-full opacity-15 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--cyan), transparent 70%)", animationDelay: "-4s" }}
      />
      <div
        className="float-y absolute right-[16%] top-[12%] h-14 w-14 rotate-12 rounded-2xl opacity-25"
        style={{ background: "linear-gradient(135deg, var(--magenta), transparent)", animationDelay: "-1s" }}
      />
      <div
        className="float-y absolute left-[12%] bottom-[18%] h-10 w-10 -rotate-6 rounded-full border-2 opacity-25"
        style={{ borderColor: "var(--violet)", animationDelay: "-3s" }}
      />
      <div
        className="float-y absolute right-[30%] bottom-[10%] h-8 w-8 rotate-45 opacity-20"
        style={{ background: "linear-gradient(135deg, var(--cyan), transparent)", animationDelay: "-5s" }}
      />
    </div>
  );
}

/** Fake sound-reactive equalizer — the room is warming up. */
export function EqBars({ count = 24, color = "var(--violet)", height = 30, className = "" }: { count?: number; color?: string; height?: number; className?: string }) {
  return (
    <div className={`flex items-end gap-1 ${className}`} style={{ height }} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="flex-1 origin-bottom rounded-full"
          style={{
            background: color,
            height: "100%",
            opacity: 0.8,
            animation: `eq-y ${1 + ((i * 7) % 5) * 0.22}s ease-in-out ${(i % 6) * 0.12}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function GlowBtn({
  children,
  tone = "lime",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "lime" | "hot" | "ghost" }) {
  return (
    <button type="button" className={`btn-arcade btn-${tone} ${className}`} {...rest}>
      <span className="relative z-10 inline-flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}
