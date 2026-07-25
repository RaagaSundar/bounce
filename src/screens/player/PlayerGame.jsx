import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from '../../store/session.js'
import { QUESTIONS, REACTIONS } from '../../data/mock.js'
import { DigitRoll, TimeRail, Meta, Stamp } from '../../components/ui.jsx'
import { popBurst } from '../../lib/fx.js'

// The controller: two (or four) ballot stubs. Tap = ink it. Reveal = points
// roll in like a till receipt.

const LETTER = ['A', 'B', 'C', 'D']

function BallotStub({ choice, index, chosen, locked, four, onPick }) {
  const isMine = chosen === index
  return (
    <motion.button
      layout
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: locked && !isMine ? 0.3 : 1, scale: locked && !isMine ? 0.97 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.1 + index * 0.06 }}
      whileTap={!locked ? { scale: 0.95, x: 3, y: 3 } : {}}
      disabled={locked}
      onClick={(e) => onPick(index, e)}
      className={`relative w-full border-[3px] border-ink text-left cursor-pointer overflow-hidden ${four ? 'p-3.5' : 'p-5'} ${isMine ? 'bg-acid' : 'bg-bone active:bg-bonedim'}`}
      style={{ boxShadow: isMine ? '0px 0px 0 0 var(--color-ink)' : '5px 5px 0 0 var(--color-ink)' }}
    >
      <div className="flex items-start justify-between">
        <span className={`display leading-[0.8] ${four ? 'text-3xl' : 'text-5xl'} ${isMine ? 'text-ink' : 'type-outline-ink opacity-60'}`}>{LETTER[index]}</span>
        {isMine && <Stamp tone="ink" rotate={5} className="text-[9px]">LOCKED</Stamp>}
      </div>
      <div className={`display mt-2 ${four ? 'text-lg' : 'text-[1.65rem]'} leading-[0.95] text-ink`}>{choice.label}</div>
    </motion.button>
  )
}

function RevealPanel({ q, me, reveal, myAnswer, players }) {
  const gained = reveal?.gains?.[me.id] ?? 0
  const didSync = reveal?.synced?.[me.id]
  const mates = (reveal?.matches?.[me.id] || []).map((id) => players.find((p) => p.id === id)).filter(Boolean)
  const myRank = useMemo(() => [...players].sort((a, b) => b.score - a.score).findIndex((p) => p.id === me.id) + 1, [players, me.id])
  const choiceLabel = myAnswer != null ? q.choices[myAnswer]?.label : null

  return (
    <motion.div key="reveal" className="flex-1 flex flex-col items-center justify-center text-center gap-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div>
        <Meta className="opacity-50">POINTS THIS ROUND</Meta>
        <motion.div
          initial={{ scale: 2.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 340, damping: 17, delay: 0.1 }}
          className={`display text-[5.5rem] leading-none ${gained > 0 ? 'text-ink' : 'text-ink/30'}`}
        >
          +<DigitRoll value={gained} />
        </motion.div>
        <div className={`h-[6px] mx-auto w-32 mt-1 ${gained > 0 ? 'bg-acid' : 'bg-ink/20'}`} />
      </div>

      <div className="min-h-[40px]">
        {myAnswer == null ? (
          <Stamp tone="ink" rotate={-4}>TOO SLOW</Stamp>
        ) : didSync ? (
          <Stamp tone="acid" solid rotate={-4}>ROOM SYNC ✓</Stamp>
        ) : (
          <Stamp tone="signal" rotate={-4}>MAVERICK</Stamp>
        )}
      </div>

      {me.streak >= 2 && <Meta className="text-signal">SYNC STREAK ×{me.streak}</Meta>}

      {mates.length > 0 && (
        <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="border-2 border-ink px-4 py-3 max-w-[280px] bg-white">
          <Meta className="opacity-50">SAME PICK — {choiceLabel}</Meta>
          <div className="display text-xl mt-1">
            {mates.slice(0, 2).map((m) => m.name).join(' + ')}
            {mates.length > 2 && ` +${mates.length - 2}`}
          </div>
        </motion.div>
      )}

      <Meta className="opacity-60">
        RANK #{myRank} — <DigitRoll value={me.score} /> PTS
      </Meta>
    </motion.div>
  )
}

export default function PlayerGame() {
  const { qIndex, phase, deadline, players, answers, reveal, meId, answer, react } = useSession()
  const [jolt, setJolt] = useState(0)
  const q = QUESTIONS[qIndex]
  const me = players.find((p) => p.id === meId)
  const isReveal = phase === 'reveal'
  const myAnswer = answers[qIndex]?.[meId]?.choice
  const locked = myAnswer != null
  const four = q.choices.length === 4

  const pick = (ci, e) => {
    answer(ci)
    setJolt(Date.now())
    const r = e.currentTarget.getBoundingClientRect()
    popBurst((r.x + r.width / 2) / window.innerWidth, (r.y + r.height / 2) / window.innerHeight, 0.6)
  }

  if (!me) return null

  return (
    <motion.section className="h-full flex flex-col px-5 pt-4 pb-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={qIndex}
          className="flex flex-col h-full"
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        >
          <div className="flex items-center justify-between mb-2">
            <Meta className="text-ink/60">
              Q.{String(qIndex + 1).padStart(2, '0')}/{String(QUESTIONS.length).padStart(2, '0')}
            </Meta>
            <Meta className="text-ink/60">{q.kicker}</Meta>
          </div>

          <h2 className="display text-[1.75rem] leading-[0.95] mb-3">{q.text}</h2>

          {!isReveal && <TimeRail deadline={deadline} total={q.time} tone="ink" className="mb-4" />}

          <AnimatePresence mode="wait">
            {!isReveal ? (
              <motion.div
                key={`choices-${jolt}`}
                className={`flex-1 min-h-0 ${four ? 'grid grid-cols-2 gap-3 content-center' : 'flex flex-col justify-center gap-5'} ${jolt ? 'shake-hard' : ''}`}
                exit={{ opacity: 0 }}
              >
                {q.choices.map((c, ci) => (
                  <BallotStub key={ci} choice={c} index={ci} four={four} chosen={myAnswer} locked={locked} onPick={pick} />
                ))}
                {locked && <Meta className="text-center blink text-ink/60">LOCKED — WATCHING THE ROOM DECIDE</Meta>}
              </motion.div>
            ) : (
              <RevealPanel q={q} me={me} reveal={reveal} myAnswer={myAnswer} players={players} />
            )}
          </AnimatePresence>

          <div className="flex justify-center gap-2 pt-3">
            {REACTIONS.map((word) => (
              <motion.button
                key={word}
                whileTap={{ scale: 0.8 }}
                onClick={() => react(word)}
                className="px-2 py-1.5 border-2 border-ink/50 font-mono font-bold text-[9px] uppercase tracking-[0.08em] cursor-pointer active:bg-acid active:border-ink"
              >
                {word}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.section>
  )
}
