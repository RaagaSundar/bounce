import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useSession } from '../../store/session.js'
import { AvatarChip, DigitRoll, Btn, Meta, Stamp } from '../../components/ui.jsx'
import { bigCelebration } from '../../lib/fx.js'

// Paper-scrap confetti, hard-block podium, and the real deliverable printed as
// a receipt: tonight's power pairs.

const PODIUM = [
  { rank: 2, h: 150, delay: 0.25, cls: 'bg-bone text-ink' },
  { rank: 1, h: 220, delay: 0.5, cls: 'bg-acid text-ink' },
  { rank: 3, h: 100, delay: 0.1, cls: 'bg-signal text-ink' },
]

function Pedestal({ player, rank, h, delay, cls }) {
  if (!player) return null
  return (
    <div className="flex flex-col items-center justify-end gap-3" style={{ height: 400 }}>
      <motion.div
        initial={{ y: -60, opacity: 0, scale: 1.6 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ delay: delay + 0.3, type: 'spring', stiffness: 320, damping: 18 }}
        className="flex flex-col items-center gap-2"
      >
        <AvatarChip player={player} size={rank === 1 ? 84 : 62} />
        <span className="font-mono font-bold text-lg text-acid">
          <DigitRoll value={player.score} />
        </span>
      </motion.div>
      <motion.div
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay, type: 'spring', stiffness: 200, damping: 24 }}
        className={`w-36 shrink-0 origin-bottom border-2 border-ink relative ${cls}`}
        style={{ height: h }}
      >
        <span className="absolute top-2 left-1/2 -translate-x-1/2 display text-6xl">{rank}</span>
        {rank === 1 && (
          <span className="absolute -top-4 -right-5 rotate-12">
            <Stamp tone="ink" rotate={12} solid className="text-[10px]">CHAMPION</Stamp>
          </span>
        )}
      </motion.div>
    </div>
  )
}

export default function Results() {
  const { players, connections, playAgain } = useSession()
  const sorted = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players])
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players])
  const pairs = connections.slice(0, 4)

  useEffect(() => {
    const t = setTimeout(bigCelebration, 600)
    return () => clearTimeout(t)
  }, [])

  return (
    <motion.section className="h-full flex items-center justify-center gap-16 px-12 pb-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* podium */}
      <div className="flex flex-col items-start gap-2">
        <div className="overflow-hidden">
          <motion.h2 initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 26 }} className="display text-[clamp(2.4rem,6vh,4rem)]">
            FINAL <span className="text-acid">STANDINGS</span>
          </motion.h2>
        </div>
        <div className="flex items-end gap-3">
          {PODIUM.map(({ rank, h, delay, cls }) => (
            <Pedestal key={rank} rank={rank} h={h} delay={delay} cls={cls} player={sorted[rank - 1]} />
          ))}
        </div>
        <Btn tone="signal" className="px-8 py-4 text-base mt-4 self-center" onClick={playAgain}>
          RUN IT BACK ↻
        </Btn>
      </div>

      {/* the receipt */}
      <motion.aside
        initial={{ x: 120, opacity: 0, rotate: 2 }}
        animate={{ x: 0, opacity: 1, rotate: 1 }}
        transition={{ delay: 0.8, type: 'spring', stiffness: 160, damping: 22 }}
        className="w-[400px] bg-bone text-ink border-2 border-ink hard-shadow-acid relative"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), 96% 100%, 92% calc(100% - 8px), 88% 100%, 84% calc(100% - 8px), 80% 100%, 76% calc(100% - 8px), 72% 100%, 68% calc(100% - 8px), 64% 100%, 60% calc(100% - 8px), 56% 100%, 52% calc(100% - 8px), 48% 100%, 44% calc(100% - 8px), 40% 100%, 36% calc(100% - 8px), 32% 100%, 28% calc(100% - 8px), 24% 100%, 20% calc(100% - 8px), 16% 100%, 12% calc(100% - 8px), 8% 100%, 4% calc(100% - 8px), 0 100%)' }}
      >
        <div className="px-6 pt-5 pb-8">
          <div className="flex items-center justify-between border-b-2 border-ink pb-3">
            <Meta>TONIGHT'S POWER PAIRS</Meta>
            <Meta className="text-signal">PRINTED 22:41</Meta>
          </div>
          <div className="display text-3xl mt-3 mb-1">
            GO FIND <span className="text-signal">EACH OTHER.</span>
          </div>
          <Meta className="opacity-60">THE GAME ALREADY BROKE THE ICE</Meta>

          <div className="mt-5 flex flex-col">
            {pairs.map((c, i) => {
              const a = byId[c.a]
              const b = byId[c.b]
              if (!a || !b) return null
              return (
                <motion.div
                  key={`${c.a}-${c.b}`}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1 + i * 0.16 }}
                  className="py-3 border-b border-ink/25 border-dashed flex items-center gap-3"
                >
                  <span className="font-mono font-bold text-xs w-8 text-signal">№{i + 1}</span>
                  <div className="flex -space-x-2">
                    <AvatarChip player={a} size={38} showName={false} surface="bone" />
                    <AvatarChip player={b} size={38} showName={false} surface="bone" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="display text-lg leading-none">
                      {a.name} × {b.name}
                      {(a.isMe || b.isMe) && <span className="text-signal"> ←YOU</span>}
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] mt-1 text-ink/70 truncate">
                      SYNCED {c.sameAnswers}× {c.shared.length > 0 && <>— BOTH INTO {c.shared.join(' + ')}</>}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </motion.aside>
    </motion.section>
  )
}
