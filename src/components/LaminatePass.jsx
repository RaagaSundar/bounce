import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import GlyphAvatar from './GlyphAvatar.jsx'
import { Barcode, Logo } from './ui.jsx'
import { SESSION_CODE } from '../data/mock.js'

// ─────────────────────────────────────────────────────────────────────────────
// The laminate: your event pass. Real 3D — perspective tilt follows the
// pointer, a glare stripe sweeps the lamination. This IS the player's avatar.
// ─────────────────────────────────────────────────────────────────────────────

export default function LaminatePass({ player, className = '', width = 270, tilt = true }) {
  const ref = useRef(null)
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const rX = useSpring(useTransform(my, [0, 1], [14, -14]), { stiffness: 220, damping: 22 })
  const rY = useSpring(useTransform(mx, [0, 1], [-16, 16]), { stiffness: 220, damping: 22 })
  const glareX = useTransform(mx, [0, 1], ['-60%', '160%'])

  const onMove = (e) => {
    if (!tilt || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width)
    my.set((e.clientY - r.top) / r.height)
  }
  const onLeave = () => {
    mx.set(0.5)
    my.set(0.5)
  }

  if (!player) return null

  return (
    <div style={{ perspective: 900 }} className={className}>
      <motion.div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX: tilt ? rX : 0, rotateY: tilt ? rY : 0, width, transformStyle: 'preserve-3d' }}
        className="relative bg-bone text-ink border-2 border-ink hard-shadow-ink overflow-hidden"
      >
        {/* lamination glare */}
        <motion.span
          className="absolute inset-y-0 w-1/3 pointer-events-none z-20"
          style={{ left: glareX, background: 'linear-gradient(100deg, transparent, rgb(255 255 255 / 0.45), transparent)' }}
          aria-hidden
        />

        {/* punch hole */}
        <div className="flex justify-center pt-3">
          <span className="w-12 h-2.5 border-2 border-ink bg-ink/10" />
        </div>

        <div className="px-5 pb-4 pt-2">
          <div className="flex items-center justify-between border-b-2 border-ink pb-2">
            <Logo className="text-lg" />
            <span className="font-mono font-bold text-[10px] tracking-[0.2em]">{SESSION_CODE}</span>
          </div>

          <div className="flex items-center gap-4 py-4">
            <GlyphAvatar player={player} size={84} />
            <div className="min-w-0">
              <div className="display text-[1.7rem] leading-[0.9] break-words">{player.name}</div>
              <div className="font-mono text-[9px] uppercase tracking-[0.16em] mt-1.5 text-ink/70 truncate">{player.tag}</div>
            </div>
          </div>

          {player.interests?.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-3">
              {player.interests.slice(0, 3).map((x) => (
                <span key={x} className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] border border-ink px-1.5 py-0.5">
                  {x}
                </span>
              ))}
            </div>
          )}

          <div className="border-t-2 border-ink pt-2.5">
            <Barcode seed={player.id + player.name} height={22} />
            <div className="flex justify-between font-mono text-[8px] uppercase tracking-[0.18em] mt-1.5 text-ink/70">
              <span>GATE A</span>
              <span>ADMIT ONE</span>
              <span>24.07</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
