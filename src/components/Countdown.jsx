import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { VU, Meta } from './ui.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// 3 / 2 / 1 as full-bleed flash frames — hard cuts, background inversions,
// screen shake. The visual equivalent of three kick drums.
// ─────────────────────────────────────────────────────────────────────────────

const FRAMES = {
  3: { bg: 'var(--color-acid)', fg: 'var(--color-ink)', outline: false },
  2: { bg: 'var(--color-ink)', fg: 'var(--color-acid)', outline: true },
  1: { bg: 'var(--color-signal)', fg: 'var(--color-ink)', outline: false },
  GO: { bg: 'var(--color-ink)', fg: 'var(--color-acid)', outline: false },
}

export default function Countdown({ compact = false }) {
  const [n, setN] = useState(3)
  useEffect(() => {
    const t1 = setTimeout(() => setN(2), 1000)
    const t2 = setTimeout(() => setN(1), 2000)
    const t3 = setTimeout(() => setN('GO'), 2900)
    return () => [t1, t2, t3].forEach(clearTimeout)
  }, [])

  const f = FRAMES[n]
  const numSize = compact ? 'text-[11rem]' : 'text-[min(46vh,34vw)]'

  return (
    <motion.div
      className="absolute inset-0 z-40 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      style={{ background: f.bg, color: f.fg }}
    >
      {/* hard-cut frame — re-keyed per beat for the shake */}
      <div key={n} className="absolute inset-0 shake-hard grid place-items-center">
        <span
          className={`display leading-none select-none ${numSize} ${f.outline ? (compact ? '' : 'type-outline-acid') : ''}`}
          style={f.outline && !compact ? {} : { color: f.fg }}
        >
          {n}
        </span>

        <div className="absolute top-0 inset-x-0 flex justify-between px-6 pt-5">
          <Meta className="opacity-80">STAND BY</Meta>
          <Meta className="opacity-80 blink">● SET LOADING</Meta>
        </div>

        {!compact && (
          <>
            <VU count={16} tone={n === 2 || n === 'GO' ? 'acid' : 'ink'} height={44} className="absolute left-8 bottom-8 w-40 opacity-80" />
            <VU count={16} tone={n === 2 || n === 'GO' ? 'acid' : 'ink'} height={44} className="absolute right-8 bottom-8 w-40 opacity-80" />
          </>
        )}
        <div className="absolute bottom-6 inset-x-0 text-center">
          <Meta className="opacity-70">PHONES UP — SET 01 STARTS NOW</Meta>
        </div>
      </div>

      {n !== 'GO' && <div className="absolute inset-0 scanlines pointer-events-none" />}
    </motion.div>
  )
}
