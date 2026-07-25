import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Backdrop from '../components/three/Backdrop.jsx'
import { Meta, Marquee, CustomCursor, Barcode } from '../components/ui.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// Split poster. Bone half = the printed world (your phone). Ink half = the
// stage (big screen). One wordmark rides the seam in blend-difference so it
// inverts itself across both.
// ─────────────────────────────────────────────────────────────────────────────

const LETTERS = 'BOUNCE'.split('')

function Panel({ side, index, title, sub, onClick }) {
  const ink = side === 'ink'
  return (
    <motion.button
      onClick={onClick}
      whileHover="hover"
      initial="rest"
      animate="rest"
      className={`relative overflow-hidden text-left h-full w-full ${ink ? 'bg-inkdeep text-bone' : 'bg-bone text-ink op-rings'}`}
      style={!ink ? { '--op-x': '78%', '--op-y': '18%' } : undefined}
    >
      {ink && <Backdrop variant="stage" energy={0.8} />}
      <motion.span
        aria-hidden
        variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
        transition={{ duration: 0.12 }}
        className={`absolute inset-0 pointer-events-none ${ink ? 'bg-bone/5' : 'bg-ink/5'}`}
      />

      <div className="relative z-10 h-full flex flex-col justify-between p-7 sm:p-9">
        <Meta dot className="opacity-70">
          {index} — {ink ? 'PROJECTOR FEED' : 'HANDSET'}
        </Meta>

        <div className="mt-auto">
          <motion.div variants={{ rest: { x: 0 }, hover: { x: 10 } }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
            <div className="display text-[clamp(2.6rem,6.5vw,5.2rem)] whitespace-pre-line">{title}</div>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] mt-4 max-w-[34ch] leading-relaxed opacity-70">{sub}</div>
          </motion.div>
          <motion.div
            className="mt-7 inline-flex items-center gap-3 font-mono font-bold text-sm uppercase tracking-[0.2em]"
            variants={{ rest: { x: 0 }, hover: { x: 16 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <span className={`inline-block w-9 h-[2px] ${ink ? 'bg-acid' : 'bg-ink'}`} />
            ENTER {ink ? 'STAGE' : 'PIT'} →
          </motion.div>
        </div>
      </div>

      <span className={`absolute inset-4 border pointer-events-none ${ink ? 'hairline-bone' : 'hairline-ink'}`} />
    </motion.button>
  )
}

export default function Landing() {
  const nav = useNavigate()
  return (
    <motion.main
      className="relative h-svh overflow-hidden grain cursor-none-zone bg-inkdeep"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <CustomCursor />

      <div className="grid grid-rows-2 sm:grid-rows-1 sm:grid-cols-2 h-[calc(100%-56px)]">
        <Panel
          side="bone"
          index="02"
          title={'YOUR\nPHONE'}
          sub="Scan in. Print your pass. Your thumb does the networking."
          onClick={() => nav('/play')}
        />
        <Panel
          side="ink"
          index="01"
          title={'THE BIG\nSCREEN'}
          sub="The stage feed. Giant QR, live crowd, the whole room competing."
          onClick={() => nav('/host')}
        />
      </div>

      {/* wordmark riding the seam — difference blend inverts it per side */}
      <div className="absolute inset-x-0 top-[16%] sm:top-[24%] z-20 pointer-events-none select-none flex flex-col items-center mix-blend-difference text-bone">
        <h1 className="display text-[clamp(4.5rem,16.5vw,15rem)] leading-none flex" aria-label="BOUNCE">
          {LETTERS.map((l, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={{ y: '-120%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.12 + i * 0.06, type: 'spring', stiffness: 320, damping: 20 }}
            >
              {l}
            </motion.span>
          ))}
        </h1>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mono-label mt-3 sm:mt-5">
          LIVE EVENT NETWORKING — BUT IT'S A GAME
        </motion.div>
      </div>

      {/* corner registration */}
      <div className="absolute top-4 inset-x-6 z-30 flex justify-between mix-blend-difference text-bone pointer-events-none">
        <Meta>BOUNCE® — EST. 2026</Meta>
        <Meta className="hidden sm:inline-flex">ROOM BNCE-42</Meta>
        <Meta>DOORS 19:00</Meta>
      </div>
      <div className="absolute bottom-[68px] right-6 z-30 mix-blend-difference text-bone pointer-events-none hidden sm:block w-28">
        <Barcode seed="bounce-landing" height={18} />
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-[68px] left-1/2 -translate-x-1/2 z-30 mix-blend-difference text-bone pointer-events-none"
      >
        <Meta className="blink">TWO WINDOWS = LIVE SYNC</Meta>
      </motion.div>

      {/* acid marquee band */}
      <div className="absolute bottom-0 inset-x-0 h-[56px] bg-acid text-ink border-t-2 border-ink z-20 flex items-center">
        <Marquee text="SCAN — PLAY — ACTUALLY MEET PEOPLE" duration={14} className="display text-[1.6rem]" />
      </div>
    </motion.main>
  )
}
