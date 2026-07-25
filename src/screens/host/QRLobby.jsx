import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useSession } from '../../store/session.js'
import { SESSION_CODE } from '../../data/mock.js'
import { Btn, AvatarChip, DigitRoll, Meta, VU, Barcode, CornerTicks } from '../../components/ui.jsx'

// Act one: a ticket the size of a door. Act two: the QR docks and the crowd
// wall takes the stage. Framer `layout` runs the morph.

function TicketQR({ docked }) {
  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
      className="relative bg-bone text-ink border-2 border-ink"
      style={{ boxShadow: docked ? '6px 6px 0 0 var(--color-acid)' : '10px 10px 0 0 var(--color-acid)', rotate: docked ? '0deg' : '-1.5deg' }}
    >
      <CornerTicks className="text-bone/60" />
      <div className={docked ? 'p-4' : 'p-7'}>
        <div className="flex items-center justify-between gap-6 border-b-2 border-ink pb-2 mb-4">
          <Meta>ADMIT ALL</Meta>
          <Meta className="blink text-signal">● OPEN</Meta>
        </div>
        <QRCodeSVG value={`${window.location.origin}/play`} size={docked ? 148 : 296} fgColor="#141412" bgColor="transparent" level="M" />
        <div className={`display text-center mt-4 ${docked ? 'text-2xl' : 'text-5xl'}`}>{SESSION_CODE}</div>
        <div className="mt-3 border-t-2 border-ink pt-2">
          <Barcode seed={SESSION_CODE} height={docked ? 14 : 22} />
        </div>
      </div>
    </motion.div>
  )
}

export default function QRLobby() {
  const players = useSession((s) => s.players)
  const startGame = useSession((s) => s.startGame)
  const docked = players.length > 0

  return (
    <motion.section
      className="h-full flex items-stretch gap-10 px-10 pb-16 pt-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.3 }}
    >
      {/* left: poster type, then the crowd wall */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {!docked ? (
          <div>
            {['SCAN', 'TO', 'JOIN'].map((w, i) => (
              <div key={w} className="overflow-hidden">
                <motion.div
                  initial={{ y: '110%' }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.15 + i * 0.09, type: 'spring', stiffness: 200, damping: 24 }}
                  className={`display text-[clamp(5rem,17vh,11rem)] ${i === 2 ? 'text-acid' : 'text-bone'}`}
                >
                  {w}
                </motion.div>
              </div>
            ))}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-6 flex items-center gap-6">
              <VU count={20} tone="acid" height={26} className="w-44 opacity-70" />
              <Meta className="opacity-70">POINT YOUR CAMERA — 10 SECONDS TO THE GAME</Meta>
            </motion.div>
          </div>
        ) : (
          <motion.div
            key="crowd"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 24 }}
            className="flex flex-col gap-7 min-h-0"
          >
            <div className="flex items-end gap-6">
              <span className="display text-[clamp(4rem,12vh,8rem)] text-acid leading-none">
                <DigitRoll value={players.length} pad={2} />
              </span>
              <div className="pb-2">
                <div className="display text-3xl">IN THE ROOM</div>
                <Meta className="opacity-60 mt-1">CAPACITY UNLIMITED — COURAGE REQUIRED</Meta>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-5 content-start max-h-[38vh] overflow-hidden pr-4">
              <AnimatePresence>
                {players.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ scale: 2, opacity: 0, rotate: -10 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                  >
                    <AvatarChip player={p} size={64} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-6 mt-2">
              <Btn tone="acid" className="px-10 py-5 text-lg" onClick={startGame} disabled={players.length < 3}>
                START THE GAME →
              </Btn>
              <Meta className="opacity-60 max-w-[24ch] leading-relaxed normal-case">Every phone in the room becomes a controller</Meta>
            </div>
          </motion.div>
        )}
      </div>

      {/* right: the ticket */}
      <motion.div layout className={`shrink-0 flex ${docked ? 'items-end pb-2' : 'items-center'}`}>
        <TicketQR docked={docked} />
      </motion.div>
    </motion.section>
  )
}
