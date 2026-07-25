import confetti from 'canvas-confetti'

// Paper scraps, not glitter — flat rectangles in the four system colors.
const PALETTE = ['#141412', '#c6ff32', '#ff4b1f', '#e8e4d8']

export function popBurst(x = 0.5, y = 0.5, scale = 1) {
  confetti({
    particleCount: Math.round(26 * scale),
    spread: 65,
    startVelocity: 30,
    scalar: 1.1,
    ticks: 110,
    gravity: 1.3,
    flat: true,
    shapes: ['square'],
    origin: { x, y },
    colors: PALETTE,
    disableForReducedMotion: true,
  })
}

export function bigCelebration() {
  const end = Date.now() + 1400
  const frame = () => {
    confetti({ particleCount: 4, angle: 62, spread: 52, startVelocity: 52, gravity: 1.25, flat: true, shapes: ['square'], scalar: 1.2, origin: { x: 0, y: 0.8 }, colors: PALETTE, disableForReducedMotion: true })
    confetti({ particleCount: 4, angle: 118, spread: 52, startVelocity: 52, gravity: 1.25, flat: true, shapes: ['square'], scalar: 1.2, origin: { x: 1, y: 0.8 }, colors: PALETTE, disableForReducedMotion: true })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
  confetti({ particleCount: 120, spread: 100, startVelocity: 38, gravity: 1.25, flat: true, shapes: ['square'], scalar: 1.3, origin: { y: 0.35 }, colors: PALETTE, disableForReducedMotion: true })
}
