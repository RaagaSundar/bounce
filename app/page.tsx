import type { Metadata } from "next";
import Link from "next/link";

import { Ambient, EqBars, Orb } from "./live/arcade";

export const metadata: Metadata = {
  title: "Bounce — turn waiting time into shared momentum",
  description:
    "A live social game for events: one screen, every phone, and 90 seconds to turn strangers into a crew.",
};

// A little crowd for the hero, so the landing feels like the lobby it leads to.
const HERO_CREW = ["priya", "diego", "yuki", "marcus", "zara", "sam"];

export default function Home() {
  return (
    <div className="skin-arcade">
      <Ambient />
      <div className="relative z-10 flex h-full flex-col overflow-y-auto px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <span className="font-display gradient-text text-3xl font-black tracking-tight">BOUNCE</span>
          <span className="glass rounded-full px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.25em]" style={{ color: "var(--faint)" }}>
            live event games
          </span>
        </header>

        <main className="flex flex-1 flex-col justify-center py-12">
          <p className="font-display text-xs font-bold uppercase tracking-[0.3em]" style={{ color: "var(--magenta)" }}>
            the antidote to the awkward five minutes
          </p>
          <h1 className="font-display mt-4 text-6xl font-black leading-[1.02] sm:text-8xl">
            THE ROOM IS QUIET.
            <br />
            <span className="gradient-text glow-violet">FIX THAT.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg" style={{ color: "var(--faint)" }}>
            One screen. Every phone. Ninety seconds of organised chaos that leaves strangers
            knowing exactly who to go talk to. No app, no account.
          </p>

          <div className="mt-8 flex items-center gap-4">
            {HERO_CREW.map((id, i) => (
              <div key={id} className="float-y" style={{ animationDelay: `${i * -0.9}s` }}>
                <Orb id={id} size={52} />
              </div>
            ))}
            <EqBars count={16} height={26} className="w-36 opacity-60" />
          </div>

          <div className="mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            <Link href="/host" className="glass group rounded-3xl p-6 transition-transform hover:scale-[1.02]">
              <div
                className="grid h-14 w-14 place-items-center rounded-2xl text-2xl"
                style={{ background: "linear-gradient(135deg, var(--violet), var(--magenta))", boxShadow: "0 8px 30px -8px rgb(0 0 0 / 0.6)" }}
              >
                📺
              </div>
              <div className="font-display mt-4 text-3xl font-black" style={{ color: "var(--milk)" }}>
                BIG SCREEN <span style={{ color: "var(--magenta)" }}>→</span>
              </div>
              <p className="mt-2 text-sm" style={{ color: "var(--faint)" }}>
                Open a room and put this on the projector. Players scan the QR.
              </p>
            </Link>

            <Link href="/play" className="glass group rounded-3xl p-6 transition-transform hover:scale-[1.02]">
              <div
                className="grid h-14 w-14 place-items-center rounded-2xl text-2xl"
                style={{ background: "linear-gradient(135deg, var(--cyan), var(--violet))", boxShadow: "0 8px 30px -8px rgb(0 0 0 / 0.6)" }}
              >
                📱
              </div>
              <div className="font-display mt-4 text-3xl font-black" style={{ color: "var(--milk)" }}>
                MY PHONE <span style={{ color: "var(--cyan)" }}>→</span>
              </div>
              <p className="mt-2 text-sm" style={{ color: "var(--faint)" }}>
                Already in the room? Punch in the six-character code on the screen.
              </p>
            </Link>
          </div>

          {/* Judges and anyone opening this link cold get a working demo without
              needing a second device in their hand. */}
          <div className="conic-border glass mt-8 max-w-3xl rounded-3xl p-6">
            <div className="font-display text-xs font-bold uppercase tracking-[0.3em]" style={{ color: "var(--lime)" }}>
              no second device? start here
            </div>
            <Link href="/try" className="font-display glow-lime mt-2 block text-4xl font-black" style={{ color: "var(--lime)" }}>
              TRY IT SOLO ⚡
            </Link>
            <p className="mt-2 text-sm" style={{ color: "var(--faint)" }}>
              Opens a real room with the projector and a player phone side by side — same live
              server, one browser tab.
            </p>
          </div>
        </main>

        <footer className="flex flex-wrap gap-2">
          {["Cloudflare Workers", "Durable Objects", "WebSockets", "D1"].map((t) => (
            <span key={t} className="glass rounded-full px-3.5 py-1.5 text-xs font-semibold" style={{ color: "var(--faint)" }}>
              {t}
            </span>
          ))}
        </footer>
      </div>
    </div>
  );
}
