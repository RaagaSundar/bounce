import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../store/session.js'
import { SESSION_CODE } from '../../data/mock.js'
import Backdrop from '../../components/three/Backdrop.jsx'
import Countdown from '../../components/Countdown.jsx'
import { Logo, Meta, ReactionLayer, Ticker, DigitRoll, CustomCursor } from '../../components/ui.jsx'
import QRLobby from './QRLobby.jsx'
import GameRound from './GameRound.jsx'
import Results from './Results.jsx'

// The stage feed. Ink, LED floor, hairline frame, mono telemetry everywhere.

export default function HostView() {
  const nav = useNavigate()
  const phase = useSession((s) => s.phase)
  const count = useSession((s) => s.players.length)
  const initHost = useSession((s) => s.initHost)

  useEffect(() => {
    initHost()
  }, [initHost])

  const stage = phase === 'qr' || phase === 'lobby' ? 'lobby' : phase === 'countdown' ? 'countdown' : phase === 'results' ? 'results' : 'game'

  return (
    <motion.main
      className="relative h-svh overflow-hidden flex flex-col bg-inkdeep text-bone grain cursor-none-zone"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <CustomCursor />
      <Backdrop variant="stage" energy={stage === 'game' ? 1.4 : 1} />
      <ReactionLayer />

      {/* hairline frame */}
      <div className="absolute inset-3 border hairline-bone pointer-events-none z-10" />

      <header className="relative z-20 flex items-center justify-between px-8 pt-7 pb-4">
        <button onClick={() => nav('/')} className="cursor-pointer text-bone">
          <Logo className="text-[1.7rem]" />
        </button>
        <div className="hidden md:flex items-center gap-3 border hairline-bone px-4 py-2">
          <Meta className="opacity-60">JOIN AT</Meta>
          <span className="font-mono font-bold text-sm tracking-[0.18em] text-acid">BOUNCE.GG/{SESSION_CODE}</span>
        </div>
        <div className="flex items-center gap-5">
          <Meta className="text-signal">
            <span className="w-2 h-2 bg-signal inline-block blink" /> LIVE
          </Meta>
          <span className="font-mono font-bold text-lg text-acid tracking-widest">
            N=<DigitRoll value={count} pad={2} />
          </span>
        </div>
      </header>

      <div className="relative z-10 flex-1 min-h-0">
        <AnimatePresence mode="wait">
          {stage === 'lobby' && <QRLobby key="lobby" />}
          {stage === 'game' && <GameRound key="game" />}
          {stage === 'results' && <Results key="results" />}
        </AnimatePresence>
      </div>

      {/* full-bleed flash frames over everything, header included */}
      <AnimatePresence>{stage === 'countdown' && <Countdown key="cd" />}</AnimatePresence>

      {stage === 'lobby' && <Ticker className="absolute left-8 bottom-6 z-20" />}
    </motion.main>
  )
}
