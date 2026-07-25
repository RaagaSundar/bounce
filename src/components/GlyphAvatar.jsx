import { AVATAR_FACES } from '../data/mock.js'

// ─────────────────────────────────────────────────────────────────────────────
// Sticker-sheet avatars. No emoji, no gradients — hard-color vinyl badges with
// ink linework faces, deterministic from the player's existing hue + face data.
// ─────────────────────────────────────────────────────────────────────────────

// hue → one of four sticker colors
export function stickerColor(hue) {
  if (hue >= 60 && hue < 180) return { bg: 'var(--color-acid)', fg: '#141412' } // acid
  if (hue < 60) return { bg: 'var(--color-signal)', fg: '#141412' } // signal
  if (hue >= 180 && hue < 300) return { bg: 'var(--color-cobalt)', fg: '#e8e4d8' } // cobalt
  return { bg: 'var(--color-bone)', fg: '#141412' } // bone
}

export function faceIndex(face) {
  const i = AVATAR_FACES.indexOf(face)
  return (i < 0 ? face?.length || 0 : i) % 6
}

// six ink linework faces, drawn in a 100×100 box
function Face({ idx, stroke }) {
  const s = { stroke, strokeWidth: 7, strokeLinecap: 'round', fill: 'none' }
  switch (idx) {
    case 0: // grin
      return (
        <g {...s}>
          <circle cx="35" cy="42" r="4.5" fill={stroke} stroke="none" />
          <circle cx="65" cy="42" r="4.5" fill={stroke} stroke="none" />
          <path d="M32 60 Q50 74 68 60" />
        </g>
      )
    case 1: // dazed
      return (
        <g {...s}>
          <path d="M29 37 L41 49 M41 37 L29 49" />
          <path d="M59 37 L71 49 M71 37 L59 49" />
          <path d="M36 65 L64 65" />
        </g>
      )
    case 2: // wow
      return (
        <g {...s}>
          <circle cx="35" cy="41" r="4.5" fill={stroke} stroke="none" />
          <circle cx="65" cy="41" r="4.5" fill={stroke} stroke="none" />
          <circle cx="50" cy="64" r="9" />
        </g>
      )
    case 3: // wink
      return (
        <g {...s}>
          <circle cx="35" cy="42" r="4.5" fill={stroke} stroke="none" />
          <path d="M57 42 L73 42" />
          <path d="M34 60 Q44 70 54 62 Q62 56 68 63" />
        </g>
      )
    case 4: // visor bot
      return (
        <g {...s}>
          <rect x="27" y="34" width="46" height="14" rx="2" />
          <path d="M40 64 L60 64" strokeWidth={9} />
        </g>
      )
    default: // side-eye zigzag
      return (
        <g {...s}>
          <circle cx="39" cy="42" r="4.5" fill={stroke} stroke="none" />
          <circle cx="69" cy="42" r="4.5" fill={stroke} stroke="none" />
          <path d="M32 63 L41 58 L50 66 L59 58 L68 64" />
        </g>
      )
  }
}

export default function GlyphAvatar({ player, hue, face, size = 56, ring = false, className = '' }) {
  const h = hue ?? player?.hue ?? 265
  const f = face ?? player?.face
  const c = stickerColor(h)
  const idx = faceIndex(f)
  const ringStyle = idx % 3 // 0 solid edge, 1 dashed orbit, 2 dotted orbit
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden>
      {ring && <circle cx="50" cy="50" r="48" fill="none" stroke="var(--color-acid)" strokeWidth="3.5" strokeDasharray="10 7" />}
      <circle cx="50" cy="50" r={ring ? 40 : 45} fill={c.bg} stroke="#141412" strokeWidth="3" />
      {ringStyle === 1 && <circle cx="50" cy="50" r={ring ? 33 : 38} fill="none" stroke={c.fg} strokeWidth="2" strokeDasharray="8 6" opacity="0.55" />}
      {ringStyle === 2 && <circle cx="50" cy="50" r={ring ? 33 : 38} fill="none" stroke={c.fg} strokeWidth="2.5" strokeDasharray="0.1 9" strokeLinecap="round" opacity="0.55" />}
      <g transform={ring ? 'translate(50 50) scale(0.82) translate(-50 -50)' : undefined}>
        <Face idx={idx} stroke={c.fg} />
      </g>
    </svg>
  )
}
