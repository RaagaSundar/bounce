import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Bounce — turn waiting time into shared momentum",
  description:
    "A live social game for events: one screen, every phone, and 90 seconds to turn strangers into a crew.",
};

export default function Home() {
  return (
    <div className="skin-ink-acid grain led-dots">
      <div className="flex h-full flex-col overflow-y-auto px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <span className="display text-3xl text-acid">BOUNCE</span>
          <span className="mono-label text-stone">LIVE EVENT GAMES</span>
        </header>

        <main className="flex flex-1 flex-col justify-center py-12">
          <p className="mono-label text-stone">THE ANTIDOTE TO THE AWKWARD FIVE MINUTES</p>
          <h1 className="display mt-4 text-6xl leading-none sm:text-8xl">
            THE ROOM IS QUIET.
            <br />
            <span className="type-outline-acid">FIX THAT.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-bonedim">
            One screen. Every phone. Ninety seconds of organised chaos that leaves strangers
            knowing exactly who to go talk to. No app, no account.
          </p>

          <div className="mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            <Link
              href="/host"
              className="group border-2 hairline-bone px-6 py-6 transition-colors hover:border-acid"
            >
              <div className="mono-label text-stone">01 / THE VENUE</div>
              <div className="display mt-2 text-4xl group-hover:text-acid">BIG SCREEN →</div>
              <p className="mt-2 font-mono text-sm text-bonedim">
                Open a room and put this on the projector. Players scan the QR.
              </p>
            </Link>

            <Link
              href="/play"
              className="group border-2 hairline-bone px-6 py-6 transition-colors hover:border-acid"
            >
              <div className="mono-label text-stone">02 / YOUR POCKET</div>
              <div className="display mt-2 text-4xl group-hover:text-acid">MY PHONE →</div>
              <p className="mt-2 font-mono text-sm text-bonedim">
                Already in the room? Punch in the six-character code on the screen.
              </p>
            </Link>
          </div>

          {/* Judges and anyone opening this link cold get a working demo without
              needing a second device in their hand. */}
          <div className="mt-8 max-w-3xl border-2 border-acid px-6 py-5">
            <div className="mono-label" style={{ color: "var(--color-acid)" }}>
              NO SECOND DEVICE? START HERE
            </div>
            <Link href="/try" className="display mt-2 block text-4xl text-acid">
              TRY IT SOLO →
            </Link>
            <p className="mt-2 font-mono text-sm text-bonedim">
              Opens a real room with the projector and a player phone side by side — same live
              server, one browser tab.
            </p>
          </div>
        </main>

        <footer className="mono-label flex flex-wrap gap-x-8 gap-y-2 text-stone">
          <span>CLOUDFLARE WORKERS</span>
          <span>DURABLE OBJECTS</span>
          <span>WEBSOCKETS</span>
          <span>D1</span>
        </footer>
      </div>
    </div>
  );
}
