import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../store/session.js'
import Countdown from '../../components/Countdown.jsx'
import { Logo, Meta } from '../../components/ui.jsx'
import JoinFlow from './JoinFlow.jsx'
import PlayerLobby from './PlayerLobby.jsx'
import PlayerGame from './PlayerGame.jsx'
import PlayerResults from './PlayerResults.jsx'

// The printed half. Bone paper, ink type, rubber stamps. On desktop the phone
// sits in an ink bezel against the dark; on a real phone it's full-bleed.

export default function PlayerView() {
  const nav = useNavigate()
  const phase = useSession((s) => s.phase)
  const meId = useSession((s) => s.meId)
  const connected = useSession((s) => s.connected)
  const initPlayer = useSession((s) => s.initPlayer)

  useEffect(() => {
    initPlayer()
  }, [initPlayer])

  const stage = !meId
    ? 'join'
    : phase === 'qr' || phase === 'lobby'
      ? 'lobby'
      : phase === 'countdown'
        ? 'countdown'
        : phase === 'results'
          ? 'results'
          : 'game'

  return (
    <motion.main
      className="min-h-svh sm:grid sm:place-items-center sm:py-6 relative bg-inkdeep"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* venue backdrop behind the handset */}
      <div className="hidden sm:block absolute inset-0 overflow-hidden led-dots opacity-40" aria-hidden />
      <div className="hidden sm:flex absolute top-5 inset-x-8 justify-between text-bone/60">
        <Meta>HANDSET PREVIEW</Meta>
        <Meta>ROOM BNCE-42</Meta>
      </div>

      <div className="relative sm:w-[400px] sm:h-[min(calc(100svh-3rem),840px)] w-full h-svh sm:border-[10px] sm:border-ink bg-bone text-ink overflow-hidden grain" style={{ boxShadow: '14px 14px 0 0 rgb(198 255 50 / 0.25)' }}>
        {/* header */}
        <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-5 pt-4 border-b-2 border-ink bg-bone pb-2.5">
          <button onClick={() => nav('/')} className="cursor-pointer">
            <Logo className="text-xl" />
          </button>
          <span className={`mono-label inline-flex items-center gap-2 border px-2 py-1 ${connected ? 'border-ink text-ink' : 'border-ink/40 text-ink/50'}`}>
            <span className={`w-1.5 h-1.5 inline-block ${connected ? 'bg-signal blink' : 'bg-ink/40'}`} />
            {connected ? 'LINKED TO BIG SCREEN' : 'SOLO PREVIEW'}
          </span>
        </div>

        <div className="relative h-full pt-[52px]">
          <AnimatePresence mode="wait">
            {stage === 'join' && <JoinFlow key="join" />}
            {stage === 'lobby' && <PlayerLobby key="lobby" />}
            {stage === 'game' && <PlayerGame key="game" />}
            {stage === 'results' && <PlayerResults key="results" />}
          </AnimatePresence>
          <AnimatePresence>{stage === 'countdown' && <Countdown key="cd" compact />}</AnimatePresence>
        </div>
      </div>
    </motion.main>
  )
}
