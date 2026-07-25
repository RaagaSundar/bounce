import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useSession } from '../../store/session.js'
import { AvatarChip, DigitRoll, Btn, Meta, Stamp, Barcode } from '../../components/ui.jsx'
import { bigCelebration } from '../../lib/fx.js'

// The payoff: a printed intro card. Your score up top, then the three people
// the game says you should walk up to — as a receipt you screenshot.

export default function PlayerResults() {
  const { players, connections, meId } = useSession()
  const me = players.find((p) => p.id === meId)
  const sorted = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players])
  const myRank = sorted.findIndex((p) => p.id === meId) + 1

  const myPeople = useMemo(
    () =>
      connections
        .filter((c) => c.a === meId || c.b === meId)
        .map((c) => ({ conn: c, other: players.find((p) => p.id === (c.a === meId ? c.b : c.a)) }))
        .filter((x) => x.other)
        .slice(0, 3),
    [connections, meId, players],
  )

  useEffect(() => {
    const t = setTimeout(bigCelebration, 400)
    return () => clearTimeout(t)
  }, [])

  if (!me) return null

  return (
    <motion.section className="h-full flex flex-col px-6 pt-4 pb-6 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* score header */}
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }} className="border-2 border-ink bg-white p-4 hard-shadow-ink relative">
        <div className="flex items-center justify-between border-b-2 border-ink pb-2 mb-3">
          <Meta>FINAL SCORE</Meta>
          <Meta className="text-signal">RANK #{myRank}/{players.length}</Meta>
        </div>
        <div className="flex items-center gap-4">
          <AvatarChip player={me} size={56} showName={false} surface="bone" />
          <div>
            <div className="display text-4xl leading-none">
              <DigitRoll value={me.score} />
            </div>
            <Meta className="opacity-60 mt-1">{me.name}</Meta>
          </div>
          {myRank <= 3 && (
            <span className="ml-auto">
              <Stamp tone="signal" rotate={8} solid={myRank === 1} className="text-[10px]">
                {myRank === 1 ? 'CHAMPION' : `TOP ${myRank}`}
              </Stamp>
            </span>
          )}
        </div>
      </motion.div>

      {/* intro card receipt */}
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-6">
        <h3 className="display text-[2.4rem] leading-[0.88]">
          YOUR
          <br />
          <span className="text-signal">PEOPLE.</span>
        </h3>
        <Meta className="opacity-60 mt-2">GO SAY HI — THE GAME ALREADY BROKE THE ICE</Meta>
      </motion.div>

      <div className="mt-4 border-2 border-ink bg-white relative"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), 94% 100%, 88% calc(100% - 7px), 82% 100%, 76% calc(100% - 7px), 70% 100%, 64% calc(100% - 7px), 58% 100%, 52% calc(100% - 7px), 46% 100%, 40% calc(100% - 7px), 34% 100%, 28% calc(100% - 7px), 22% 100%, 16% calc(100% - 7px), 10% 100%, 4% calc(100% - 7px), 0 100%)' }}>
        <div className="px-4 pt-3 pb-6">
          <div className="flex justify-between items-center border-b border-ink/30 border-dashed pb-2">
            <Meta>INTRO CARD — {me.name}</Meta>
            <Meta className="opacity-50">22:41</Meta>
          </div>
          {myPeople.map(({ conn, other }, i) => (
            <motion.div
              key={other.id}
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.7 + i * 0.18, type: 'spring', stiffness: 260, damping: 24 }}
              className="flex items-center gap-3 py-3 border-b border-ink/30 border-dashed last:border-0"
            >
              <span className="font-mono font-bold text-xs text-signal w-7">№{i + 1}</span>
              <AvatarChip player={other} size={40} showName={false} surface="bone" />
              <div className="min-w-0 flex-1">
                <div className="display text-xl leading-none">{other.name}</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.12em] mt-1 text-ink/70 truncate">
                  SYNCED {conn.sameAnswers}×{conn.shared.length > 0 && <> — BOTH INTO {conn.shared.join(' + ')}</>}
                </div>
              </div>
              <span className="font-mono font-bold text-ink/40">→</span>
            </motion.div>
          ))}
          {myPeople.length === 0 && <Meta className="py-4 opacity-50">STILL COMPUTING YOUR MATCHES…</Meta>}
          <div className="mt-3 opacity-70">
            <Barcode seed={`intro-${me.id}`} height={18} />
          </div>
        </div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="mt-auto pt-5 flex flex-col gap-3">
        <Meta className="text-center blink">SCREENSHOT THIS — IT'S YOUR INTRO CARD</Meta>
        <Btn tone="ink" className="w-full py-4 text-sm" onClick={() => bigCelebration()}>
          SHARE THE MOMENT ↗
        </Btn>
      </motion.div>
    </motion.section>
  )
}
