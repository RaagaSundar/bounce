import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from '../../store/session.js'
import { QUESTIONS } from '../../data/mock.js'
import { AvatarChip, DigitRoll, TimeRail, Meta, Stamp, Marquee } from '../../components/ui.jsx'

// The shared spectacle: poster-type question, choice stubs that fill with the
// crowd, reveal inverts the winning stub to acid and runs the connection
// marquee like a stadium ribbon board.

const LETTER = ['A', 'B', 'C', 'D']

function ChoiceStub({ choice, index, playersHere, isReveal, isWinner, four }) {
  const inverted = isReveal && isWinner
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 70 }}
      animate={{ opacity: isReveal && !isWinner ? 0.38 : 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26, delay: index * 0.07 }}
      className={`relative flex flex-col border-2 overflow-hidden ${
        inverted ? 'bg-acid text-ink border-acid' : 'bg-inkdeep/60 text-bone border-bone/30'
      } ${four ? 'p-4' : 'p-6'}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`display leading-[0.8] ${four ? 'text-5xl' : 'text-7xl'} ${inverted ? 'text-ink' : 'type-outline-bone opacity-70'}`}>
          {LETTER[index]}
        </span>
        <span className={`display leading-none ${four ? 'text-4xl' : 'text-6xl'} ${inverted ? 'text-ink' : 'text-acid'}`}>
          <DigitRoll value={playersHere.length} pad={2} />
        </span>
      </div>

      <div className={`display mt-2 ${four ? 'text-xl' : 'text-[2rem]'} leading-[0.95]`}>{choice.label}</div>

      {inverted && (
        <div className="absolute bottom-4 right-4">
          <Stamp tone="ink" rotate={6}>ROOM SYNC</Stamp>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
        <AnimatePresence>
          {playersHere.map((p) => (
            <motion.div
              key={p.id}
              initial={{ scale: 2.4, y: -60, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            >
              <AvatarChip player={p} size={four ? 28 : 44} showName={false} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function Leaderboard({ players }) {
  const top = useMemo(() => [...players].sort((a, b) => b.score - a.score).slice(0, 5), [players])
  return (
    <motion.aside
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 28 }}
      className="w-[290px] shrink-0 border-2 border-bone/30 bg-inkdeep/70 self-center"
    >
      <div className="border-b-2 border-bone/30 px-4 py-2 flex items-center justify-between">
        <Meta>STANDINGS</Meta>
        <Meta className="text-acid">TOP 5</Meta>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {top.map((p, i) => (
          <motion.div key={p.id} layout transition={{ type: 'spring', stiffness: 300, damping: 28 }} className={`flex items-center gap-3 px-2 py-1.5 ${i === 0 ? 'bg-acid/10 border-l-4 border-acid' : 'border-l-4 border-transparent'}`}>
            <span className={`font-mono font-bold text-sm w-6 ${i === 0 ? 'text-acid' : 'text-bone/50'}`}>{String(i + 1).padStart(2, '0')}</span>
            <AvatarChip player={p} size={30} showName={false} />
            <span className="font-mono font-bold uppercase tracking-[0.08em] text-sm flex-1 truncate">
              {p.name}
              {p.isMe ? ' ✦' : ''}
            </span>
            {p.streak >= 2 && <span className="font-mono text-[10px] text-signal font-bold">×{p.streak}</span>}
            <span className="font-mono font-bold text-sm text-acid">
              <DigitRoll value={p.score} />
            </span>
          </motion.div>
        ))}
      </div>
    </motion.aside>
  )
}

function connectionMoment(players, reveal) {
  if (!reveal) return null
  for (const p of players) {
    for (const mid of reveal.matches[p.id] || []) {
      const other = players.find((o) => o.id === mid)
      const shared = (p.interests || []).filter((x) => (other?.interests || []).includes(x))
      if (shared.length) return { a: p, b: other, shared: shared[0] }
    }
  }
  return null
}

export default function GameRound() {
  const { qIndex, phase, deadline, players, answers, reveal } = useSession()
  const q = QUESTIONS[qIndex]
  const isReveal = phase === 'reveal'
  const forQ = answers[qIndex] || {}
  const four = q.choices.length === 4

  const byChoice = q.choices.map((_, ci) => players.filter((p) => forQ[p.id]?.choice === ci))
  const moment = useMemo(() => (isReveal ? connectionMoment(players, reveal) : null), [isReveal, reveal, players])

  return (
    <motion.section className="h-full flex flex-col px-10 pb-14 gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={qIndex}
          className="flex flex-col gap-4 h-full"
          initial={{ x: '6%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-6%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 26 }}
        >
          {/* meta row */}
          <div className="flex items-center gap-6">
            <Meta className="text-acid">
              Q.{String(qIndex + 1).padStart(2, '0')}/{String(QUESTIONS.length).padStart(2, '0')}
            </Meta>
            <Meta className="opacity-60">{q.kicker}</Meta>
            {!isReveal ? (
              <TimeRail deadline={deadline} total={q.time} className="flex-1 max-w-xl ml-auto" />
            ) : (
              <span className="ml-auto">
                <Stamp tone="acid" rotate={-3} solid>
                  {Math.round((reveal?.winnerShare || 0) * 100)}% SYNCED
                </Stamp>
              </span>
            )}
          </div>

          {/* the question, poster-size */}
          <h2 className="display text-[clamp(2.2rem,5.6vw,4.6rem)] max-w-[24ch]">
            {q.text.split(' ').map((w, i) => (
              <span key={i} className="inline-block overflow-hidden align-bottom mr-[0.3em]">
                <motion.span
                  className="inline-block"
                  initial={{ y: '105%' }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.1 + i * 0.045, type: 'spring', stiffness: 280, damping: 26 }}
                >
                  {w}
                </motion.span>
              </span>
            ))}
          </h2>

          {/* stubs + leaderboard */}
          <div className="flex-1 min-h-0 flex gap-6 items-stretch">
            <div className={`flex-1 grid gap-5 ${four ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2'}`}>
              {q.choices.map((c, ci) => (
                <ChoiceStub key={ci} choice={c} index={ci} four={four} playersHere={byChoice[ci]} isReveal={isReveal} isWinner={reveal?.winner === ci} />
              ))}
            </div>
            <AnimatePresence>{isReveal && <Leaderboard key="lb" players={players} />}</AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* connection ribbon — stadium board style */}
      <div className="absolute bottom-14 inset-x-0 h-12 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {moment && (
            <motion.div
              key="moment"
              initial={{ y: 56 }}
              animate={{ y: 0 }}
              exit={{ y: 56 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.45 }}
              className="h-full bg-signal text-ink border-y-2 border-ink flex items-center"
            >
              <Marquee
                text={`CONNECTION — ${moment.a.name} × ${moment.b.name} — BOTH INTO ${moment.shared}`}
                duration={9}
                className="display text-[1.4rem]"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}
