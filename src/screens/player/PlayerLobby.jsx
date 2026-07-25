import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from '../../store/session.js'
import LaminatePass from '../../components/LaminatePass.jsx'
import { AvatarChip, DigitRoll, Meta } from '../../components/ui.jsx'
import { REACTIONS } from '../../data/mock.js'
import { popBurst } from '../../lib/fx.js'

// The pass prints out of the header slot, then you wait with the crowd.

export default function PlayerLobby() {
  const players = useSession((s) => s.players)
  const meId = useSession((s) => s.meId)
  const react = useSession((s) => s.react)
  const me = players.find((p) => p.id === meId)
  const others = players.filter((p) => p.id !== meId)

  return (
    <motion.section
      className="h-full flex flex-col items-center px-6 pt-4 pb-7"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
    >
      {/* printer slot */}
      <div className="w-full perf-h text-ink mb-4" />
      <Meta className="self-start mb-3 opacity-60">PASS PRINTED — WEAR IT PROUD</Meta>

      <motion.div
        initial={{ y: '-70%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 130, damping: 19, delay: 0.15 }}
      >
        <LaminatePass player={me} width={252} />
      </motion.div>

      <div className="flex items-center gap-3 mt-6">
        <span className="display text-4xl text-ink">
          <DigitRoll value={players.length} pad={2} />
        </span>
        <Meta className="opacity-60">IN THE ROOM</Meta>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mt-3 max-h-16 overflow-hidden">
        <AnimatePresence>
          {others.slice(-7).map((p) => (
            <motion.div key={p.id} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
              <AvatarChip player={p} size={38} showName={false} surface="bone" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 w-full">
        <Meta className="blink">GAME STARTS SOON — WARM UP YOUR THUMB</Meta>
        <div className="flex gap-2">
          {REACTIONS.map((word, i) => (
            <motion.button
              key={word}
              whileTap={{ scale: 0.8, rotate: i % 2 ? 6 : -6 }}
              onClick={(ev) => {
                react(word)
                const r = ev.currentTarget.getBoundingClientRect()
                popBurst((r.x + r.width / 2) / window.innerWidth, r.y / window.innerHeight, 0.4)
              }}
              className="px-2.5 py-2 border-2 border-ink font-mono font-bold text-[10px] uppercase tracking-[0.08em] cursor-pointer bg-bone active:bg-acid"
            >
              {word}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.section>
  )
}
