import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession, uid } from '../../store/session.js'
import GlyphAvatar from '../../components/GlyphAvatar.jsx'
import { Btn, Meta } from '../../components/ui.jsx'
import { AVATAR_FACES, INTERESTS, VIBE_TAGS } from '../../data/mock.js'

// Check-in, not a form. Three beats: name the guest, cut the sticker, stamp
// the vibe — then the pass prints.

const STICKER_HUES = [85, 0, 265, 320] // acid / signal / cobalt / bone
const FACE_PICKS = AVATAR_FACES.slice(0, 6)

const slide = {
  initial: { x: 70, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -70, opacity: 0 },
  transition: { type: 'spring', stiffness: 260, damping: 28 },
}

function StepMeter({ step }) {
  return (
    <div className="flex items-center gap-3">
      <Meta>CHECK-IN {String(step + 1).padStart(2, '0')}/03</Meta>
      <div className="flex gap-1.5 flex-1">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="h-[3px] flex-1 origin-left bg-ink" initial={false} animate={{ scaleX: step >= i ? 1 : 0.12, opacity: step >= i ? 1 : 0.3 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
        ))}
      </div>
    </div>
  )
}

export default function JoinFlow() {
  const joinAs = useSession((s) => s.joinAs)
  const [step, setStep] = useState(0)
  const nameRef = useRef(null)

  // focus after the slide-in settles — autoFocus mid-animation makes the
  // browser scroll the overflow-hidden phone shell sideways
  useEffect(() => {
    if (step !== 0) return
    const t = setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 450)
    return () => clearTimeout(t)
  }, [step])
  const [name, setName] = useState('')
  const [face, setFace] = useState(FACE_PICKS[0])
  const [hue, setHue] = useState(85)
  const [vibe, setVibe] = useState(null)
  const [picks, setPicks] = useState([])

  const randomize = () => {
    setFace(FACE_PICKS[Math.floor(Math.random() * FACE_PICKS.length)])
    setHue(STICKER_HUES[Math.floor(Math.random() * STICKER_HUES.length)])
  }

  const togglePick = (x) => setPicks((p) => (p.includes(x) ? p.filter((i) => i !== x) : p.length < 3 ? [...p, x] : p))

  const dropIn = () => joinAs({ id: uid(), name: name.trim().toUpperCase(), face, hue, tag: vibe || 'Just curious', interests: picks })

  return (
    <motion.section className="h-full flex flex-col px-6 pt-6 pb-7" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }}>
      <StepMeter step={step} />

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" {...slide} className="flex-1 flex flex-col pt-8">
            <h2 className="display text-[3.2rem] leading-[0.88]">
              FIRST —<br />
              WHO ARE
              <br />
              <span className="text-signal">YOU?</span>
            </h2>
            <div className="mt-10">
              <Meta className="opacity-50">PRINT NAME</Meta>
              <input
                ref={nameRef}
                value={name}
                maxLength={12}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim().length >= 2 && setStep(1)}
                placeholder="TYPE HERE"
                className="w-full bg-transparent font-mono font-bold text-3xl uppercase tracking-[0.06em] placeholder:text-ink/25 outline-none border-b-[3px] border-ink focus:border-signal transition-colors pb-2 mt-2 caret-signal"
              />
            </div>
            <div className="mt-auto">
              <AnimatePresence>
                {name.trim().length >= 2 && (
                  <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }}>
                    <Btn tone="ink" shadow className="w-full py-5 text-base" onClick={() => setStep(1)}>
                      THAT'S ME →
                    </Btn>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" {...slide} className="flex-1 flex flex-col pt-6 min-h-0">
            <h2 className="display text-[2.6rem] leading-[0.88]">
              CUT YOUR
              <br />
              <span className="text-signal">STICKER.</span>
            </h2>

            <div className="flex-1 grid place-items-center min-h-0 py-2">
              <motion.div
                key={`${hue}-${face}`}
                initial={{ scale: 1.6, rotate: -6, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                className="bg-white border-2 border-ink p-4 hard-shadow-ink"
              >
                <GlyphAvatar hue={hue} face={face} size={150} />
                <div className="font-mono font-bold text-center text-xs uppercase tracking-[0.2em] mt-2">{name.trim() || 'YOU'}</div>
              </motion.div>
            </div>

            <Meta className="opacity-50 mb-2">INK</Meta>
            <div className="flex gap-2.5 mb-4">
              {STICKER_HUES.map((h) => (
                <motion.button key={h} whileTap={{ scale: 0.8 }} onClick={() => setHue(h)} className="w-10 h-10 border-2 border-ink cursor-pointer" style={{ background: h === 85 ? 'var(--color-acid)' : h === 0 ? 'var(--color-signal)' : h === 265 ? 'var(--color-cobalt)' : 'var(--color-bone)', outline: hue === h ? '3px solid var(--color-ink)' : 'none', outlineOffset: 3 }} />
              ))}
            </div>

            <Meta className="opacity-50 mb-2">FACE</Meta>
            <div className="flex gap-2 mb-5">
              {FACE_PICKS.map((f) => (
                <motion.button key={f} whileTap={{ scale: 0.8 }} onClick={() => setFace(f)} className={`w-12 h-12 grid place-items-center border-2 cursor-pointer bg-white ${face === f ? 'border-signal' : 'border-ink/30'}`}>
                  <GlyphAvatar hue={320} face={f} size={34} />
                </motion.button>
              ))}
            </div>

            <div className="flex gap-3 mt-auto">
              <Btn tone="bone" className="px-4 py-4 text-sm" onClick={randomize}>
                ⟳
              </Btn>
              <Btn tone="ink" className="flex-1 py-4 text-base" onClick={() => setStep(2)}>
                SO ME →
              </Btn>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" {...slide} className="flex-1 flex flex-col pt-6 min-h-0">
            <h2 className="display text-[2.6rem] leading-[0.88]">
              WHY ARE
              <br />
              YOU <span className="text-signal">HERE?</span>
            </h2>

            <div className="flex flex-wrap gap-2 mt-5 mb-5">
              {VIBE_TAGS.map((t) => (
                <motion.button
                  key={t}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setVibe(t)}
                  className={`px-3 py-1.5 border-2 font-mono font-bold text-[10px] uppercase tracking-[0.12em] cursor-pointer transition-colors ${vibe === t ? 'bg-ink text-bone border-ink' : 'border-ink/40 text-ink/80'}`}
                >
                  {t}
                </motion.button>
              ))}
            </div>

            <Meta className="opacity-50 mb-2">
              NERD OUT ABOUT — {picks.length}/3
            </Meta>
            <div className="grid grid-cols-2 gap-1.5 content-start overflow-y-auto min-h-0">
              {INTERESTS.map((x, i) => (
                <motion.button
                  key={x}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.03 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => togglePick(x)}
                  className={`px-2.5 py-2.5 border-2 font-mono font-bold text-[10px] uppercase tracking-[0.1em] cursor-pointer text-left flex items-center justify-between gap-1 ${picks.includes(x) ? 'bg-acid border-ink' : 'border-ink/40 text-ink/80'}`}
                >
                  {x}
                  <span className={picks.includes(x) ? '' : 'opacity-20'}>✓</span>
                </motion.button>
              ))}
            </div>

            <div className="mt-auto pt-4">
              <Btn tone="signal" className="w-full py-5 text-base" onClick={dropIn} disabled={!picks.length}>
                PRINT MY PASS ↓
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}
