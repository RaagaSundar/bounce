import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from '../store/session'
import GlyphAvatar from './GlyphAvatar.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// BOUNCE primitives — ink & acid. Hard edges, mono metadata, stamp physics.
// No glow, no glass, no rounded-3xl anywhere.
// ─────────────────────────────────────────────────────────────────────────────

// ── mono metadata label ──────────────────────────────────────────────────────

export function Meta({ children, tone = 'inherit', dot = false, className = '' }) {
  return (
    <span className={`mono-label inline-flex items-center gap-2 ${className}`} style={tone !== 'inherit' ? { color: `var(--color-${tone})` } : undefined}>
      {dot && <span className="w-1.5 h-1.5 bg-current inline-block" />}
      {children}
    </span>
  )
}

// ── the button: hard slab, offset shadow, press physics ──────────────────────

const BTN_TONES = {
  acid: { bg: 'var(--color-acid)', fg: 'var(--color-ink)', edge: 'var(--color-ink)' },
  signal: { bg: 'var(--color-signal)', fg: 'var(--color-ink)', edge: 'var(--color-ink)' },
  ink: { bg: 'var(--color-ink)', fg: 'var(--color-bone)', edge: 'var(--color-acid)' },
  bone: { bg: 'var(--color-bone)', fg: 'var(--color-ink)', edge: 'var(--color-ink)' },
  ghost: { bg: 'transparent', fg: 'currentColor', edge: 'currentColor' },
}

export function Btn({ children, tone = 'acid', className = '', onClick, disabled, shadow = true, ...rest }) {
  const t = BTN_TONES[tone]
  const [flash, setFlash] = useState(0)
  return (
    <motion.button
      initial={false}
      animate={{ x: 0, y: 0, boxShadow: shadow ? `5px 5px 0 0 ${t.edge}` : 'none' }}
      whileHover={disabled ? {} : { x: -2, y: -2, boxShadow: shadow ? `8px 8px 0 0 ${t.edge}` : 'none' }}
      whileTap={disabled ? {} : { x: 4, y: 4, boxShadow: '0px 0px 0 0 ' + t.edge }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      disabled={disabled}
      onClick={(e) => {
        setFlash(Date.now())
        onClick?.(e)
      }}
      className={`relative font-mono font-bold uppercase tracking-[0.16em] border-2 select-none inline-flex items-center justify-center gap-3 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
      style={{ background: t.bg, color: t.fg, borderColor: tone === 'ghost' ? 'currentColor' : 'var(--color-ink)' }}
      {...rest}
    >
      {flash > 0 && (
        <span key={flash} className="absolute inset-0 bg-current pointer-events-none" style={{ animation: 'flash-frame 0.22s steps(2) both' }} />
      )}
      <span className="relative z-10 inline-flex items-center gap-3">{children}</span>
    </motion.button>
  )
}

// ── rubber stamp ─────────────────────────────────────────────────────────────

const STAMP_TONES = {
  acid: 'text-acid border-acid',
  signal: 'text-signal border-signal',
  ink: 'text-ink border-ink',
  bone: 'text-bone border-bone',
}

export function Stamp({ children, tone = 'acid', rotate = -8, className = '', solid = false }) {
  const solidCls = solid ? (tone === 'acid' ? 'bg-acid !text-ink' : tone === 'signal' ? 'bg-signal !text-ink' : tone === 'ink' ? 'bg-ink !text-bone' : 'bg-bone !text-ink') : ''
  return (
    <span
      className={`stamp-in inline-block border-[3px] px-3 py-1 font-mono font-bold uppercase tracking-[0.12em] leading-none whitespace-nowrap ${STAMP_TONES[tone]} ${solidCls} ${className}`}
      style={{ '--stamp-r': `${rotate}deg` }}
    >
      {children}
    </span>
  )
}

// ── marquee band ─────────────────────────────────────────────────────────────

export function Marquee({ text, className = '', duration = 16, separator = '▪' }) {
  const chunk = (
    <span className="flex items-center shrink-0">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="flex items-center">
          <span className="whitespace-nowrap">{text}</span>
          <span className="mx-5 text-[0.7em]">{separator}</span>
        </span>
      ))}
    </span>
  )
  return (
    <div className={`overflow-hidden ${className}`} aria-hidden>
      <div className="marquee-track" style={{ '--marquee-t': `${duration}s` }}>
        {chunk}
        {chunk}
      </div>
    </div>
  )
}

// ── barcode (deterministic per seed) ─────────────────────────────────────────

function mulberry(seed) {
  let h = 1779033703
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function Barcode({ seed = 'BNCE-42', className = '', height = 26 }) {
  const rnd = mulberry(seed)
  const bars = []
  let x = 0
  while (x < 100) {
    const w = 0.6 + rnd() * 2.6
    if (rnd() > 0.42) bars.push({ x, w })
    x += w + 0.7
  }
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className={className} style={{ height, width: '100%' }} aria-hidden>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.w} height="20" fill="currentColor" />
      ))}
    </svg>
  )
}

// ── corner registration ticks ────────────────────────────────────────────────

export function CornerTicks({ className = '', size = 14 }) {
  const tick = (pos) => (
    <span className={`absolute ${pos} pointer-events-none`} style={{ width: size, height: size }} aria-hidden>
      <span className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 bg-current" />
      <span className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-current" />
    </span>
  )
  return (
    <span className={`absolute inset-0 pointer-events-none ${className}`}>
      {tick('-top-[7px] -left-[7px]')}
      {tick('-top-[7px] -right-[7px]')}
      {tick('-bottom-[7px] -left-[7px]')}
      {tick('-bottom-[7px] -right-[7px]')}
    </span>
  )
}

// ── slot-machine digits ──────────────────────────────────────────────────────

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function DigitColumn({ d }) {
  return (
    <span className="inline-block overflow-hidden align-baseline" style={{ height: '1em', width: '0.58em' }}>
      <motion.span
        className="block"
        animate={{ y: `-${d}em` }}
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      >
        {DIGITS.map((n) => (
          <span key={n} className="block leading-none" style={{ height: '1em' }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  )
}

export function DigitRoll({ value, className = '', pad = 0 }) {
  const str = Math.round(value).toLocaleString('en-US').padStart(pad, '0')
  return (
    <span className={`inline-flex leading-none ${className}`} aria-label={String(value)}>
      {str.split('').map((ch, i) =>
        /\d/.test(ch) ? <DigitColumn key={`${str.length}-${i}`} d={+ch} /> : (
          <span key={`${str.length}-${i}`} className="inline-block leading-none" style={{ width: '0.35em' }}>
            {ch}
          </span>
        ),
      )}
    </span>
  )
}

// ── question timer: hard bar + mono clock ────────────────────────────────────

export function TimeRail({ deadline, total, tone = 'bone', className = '' }) {
  const barRef = useRef(null)
  const clockRef = useRef(null)
  useEffect(() => {
    let raf
    const tick = () => {
      const left = Math.max(0, deadline - Date.now())
      const p = Math.min(1, left / total)
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${p})`
        barRef.current.style.background = p < 0.28 ? 'var(--color-signal)' : `var(--color-${tone === 'ink' ? 'ink' : 'acid'})`
      }
      if (clockRef.current) {
        clockRef.current.textContent = `00:0${Math.floor(left / 1000)}.${Math.floor((left % 1000) / 100)}`
        clockRef.current.style.color = p < 0.28 ? 'var(--color-signal)' : ''
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [deadline, total, tone])
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className={`relative flex-1 h-[7px] overflow-hidden ${tone === 'ink' ? 'bg-ink/15' : 'bg-bone/15'}`}>
        <div ref={barRef} className="absolute inset-0 origin-left" />
      </div>
      <span ref={clockRef} className="font-mono font-bold text-sm tabular-nums tracking-widest" />
    </div>
  )
}

// ── VU meter — hard bars, no glow ────────────────────────────────────────────

export function VU({ count = 24, tone = 'acid', height = 28, className = '' }) {
  const bars = useRef(Array.from({ length: count }, (_, i) => ({ d: 0.5 + ((i * 7919) % 100) / 90, delay: ((i * 104729) % 60) / 100 })))
  return (
    <div className={`flex items-end gap-[3px] ${className}`} style={{ height }} aria-hidden>
      {bars.current.map((b, i) => (
        <span
          key={i}
          className="flex-1 origin-bottom"
          style={{ background: `var(--color-${tone})`, height: '100%', animation: `vu ${b.d}s ease-in-out ${b.delay}s infinite` }}
        />
      ))}
    </div>
  )
}

// ── avatar chip (glyph sticker + name tag) ───────────────────────────────────

export function AvatarChip({ player, size = 56, showName = true, surface = 'ink', className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <motion.div whileHover={{ scale: 1.08, rotate: 4 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} className="relative">
        <GlyphAvatar player={player} size={size} ring={player.isMe} />
        {player.streak >= 2 && (
          <span className="absolute -top-1.5 -right-2 bg-signal text-ink font-mono font-bold text-[9px] px-1 leading-tight border border-ink">
            ×{player.streak}
          </span>
        )}
      </motion.div>
      {showName && (
        <span
          className={`font-mono font-bold uppercase tracking-[0.1em] leading-none px-1.5 py-1 border ${
            surface === 'ink'
              ? player.isMe
                ? 'text-acid border-acid/60'
                : 'text-bone/80 border-bone/25'
              : player.isMe
                ? 'bg-ink text-acid border-ink'
                : 'text-ink border-ink/40'
          }`}
          style={{ fontSize: Math.max(8, size * 0.16) }}
        >
          {player.name}
        </span>
      )}
    </div>
  )
}

// ── logotype ─────────────────────────────────────────────────────────────────

export function Logo({ className = '' }) {
  return (
    <span className={`display inline-flex items-start leading-none select-none ${className}`}>
      BOUNCE<span className="text-[0.4em] mt-[0.1em] ml-[0.1em]">®</span>
    </span>
  )
}

// ── reaction stamps rising from the crowd ────────────────────────────────────

export function ReactionLayer() {
  const reactions = useSession((s) => s.reactions)
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30" aria-hidden>
      <AnimatePresence>
        {reactions.map((r, i) => (
          <motion.span
            key={r.id}
            className={`absolute bottom-0 font-mono font-bold uppercase tracking-[0.1em] border-[3px] px-2.5 py-1 text-sm ${i % 3 === 0 ? 'text-signal border-signal' : 'text-acid border-acid'}`}
            style={{ left: `${r.x}%`, rotate: `${(i % 2 ? 1 : -1) * (4 + (i % 4) * 3)}deg` }}
            initial={{ y: 30, opacity: 0, scale: 2 }}
            animate={{ y: '-64vh', opacity: [0, 1, 1, 0], scale: [2, 1, 1, 0.9] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.2, ease: [0.16, 0.8, 0.4, 1] }}
          >
            {r.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ── check-in ticker (host, bottom rail) ──────────────────────────────────────

export function Ticker({ className = '' }) {
  const toasts = useSession((s) => s.toasts)
  return (
    <div className={`flex flex-col gap-1.5 pointer-events-none ${className}`}>
      <AnimatePresence>
        {toasts.slice(-4).map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-bone/60 whitespace-nowrap"
          >
            <span className="text-acid mr-2">▸</span>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ── custom cursor (landing + host, fine pointers) ────────────────────────────

export function CustomCursor() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !window.matchMedia('(pointer: fine)').matches) return
    let raf
    let tx = -100
    let ty = -100
    let x = tx
    let y = ty
    let scale = 1
    const move = (e) => {
      tx = e.clientX
      ty = e.clientY
      scale = e.target.closest('button, a, input') ? 2.2 : 1
    }
    const loop = () => {
      x += (tx - x) * 0.35
      y += (ty - y) * 0.35
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('pointermove', move)
    loop()
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div ref={ref} className="fixed top-0 left-0 z-[100] pointer-events-none mix-blend-difference hidden sm:block" aria-hidden>
      <div className="relative w-7 h-7">
        <span className="absolute left-1/2 top-0 bottom-0 w-[1.5px] -translate-x-1/2 bg-bone" />
        <span className="absolute top-1/2 left-0 right-0 h-[1.5px] -translate-y-1/2 bg-bone" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-bone" />
      </div>
    </div>
  )
}
