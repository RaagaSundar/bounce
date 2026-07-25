import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LITE } from '../../lib/lite.js'

// ─────────────────────────────────────────────────────────────────────────────
// The stage: an LED dot-matrix floor receding into the dark, waves of acid
// light rolling across it. Real geometry, real perspective, pointer parallax.
// ─────────────────────────────────────────────────────────────────────────────

const COLS = 120
const ROWS = 64

function LEDFloor({ energy = 1 }) {
  const ref = useRef(null)
  const { pointer } = useThree()

  const { positions, phases } = useMemo(() => {
    const positions = new Float32Array(COLS * ROWS * 3)
    const phases = new Float32Array(COLS * ROWS)
    let i = 0
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        positions[i * 3] = (c / (COLS - 1) - 0.5) * 58
        positions[i * 3 + 1] = 0
        positions[i * 3 + 2] = (r / (ROWS - 1) - 0.5) * 34
        phases[i] = Math.random() * Math.PI * 2
        i++
      }
    }
    return { positions, phases }
  }, [])

  const colors = useMemo(() => {
    const acid = new THREE.Color('#c6ff32')
    const dim = new THREE.Color('#2a3510')
    const arr = new Float32Array(COLS * ROWS * 3)
    for (let i = 0; i < COLS * ROWS; i++) dim.toArray(arr, i * 3)
    return { arr, acid, dim }
  }, [])

  useFrame(({ clock }) => {
    const pts = ref.current
    if (!pts) return
    const t = clock.elapsedTime
    const pos = pts.geometry.attributes.position
    const col = pts.geometry.attributes.color
    const scanZ = ((t * 0.55) % 1.6) - 0.8 // rolling scan wave
    for (let i = 0; i < COLS * ROWS; i++) {
      const x = pos.array[i * 3]
      const z = pos.array[i * 3 + 2]
      const wave = Math.sin(x * 0.26 + t * 1.2) * Math.cos(z * 0.34 + t * 0.8)
      pos.array[i * 3 + 1] = wave * 0.7 * energy
      // brightness: base shimmer + scan line sweep
      const nz = z / 34
      const scan = Math.max(0, 1 - Math.abs(nz - scanZ) * 5)
      const b = Math.min(1, Math.max(0, 0.2 + wave * 0.14 + Math.sin(phases[i] + t * 2.2) * 0.05 + scan * 1.1 * energy))
      colors.dim.clone().lerp(colors.acid, b).toArray(col.array, i * 3)
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    // pointer parallax on the whole floor
    pts.parent.rotation.z = THREE.MathUtils.lerp(pts.parent.rotation.z, pointer.x * 0.05, 0.04)
    pts.parent.position.x = THREE.MathUtils.lerp(pts.parent.position.x, pointer.x * 1.2, 0.04)
  })

  return (
    <group rotation={[-1.32, 0, 0]} position={[0, -3.6, -1.5]}>
      <points ref={ref}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors.arr, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.13} vertexColors transparent opacity={1} sizeAttenuation depthWrite={false} />
      </points>
    </group>
  )
}

export default function Backdrop({ variant = 'stage', energy = 1, className = '' }) {
  if (LITE)
    return (
      <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden>
        <div className="absolute inset-0 led-dots" style={{ maskImage: 'linear-gradient(180deg, transparent 10%, black 60%)' }} />
      </div>
    )
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 9], fov: 40 }} gl={{ antialias: false, powerPreference: 'low-power' }}>
        <LEDFloor energy={variant === 'stage' ? energy : 0.6} />
      </Canvas>
      {/* vignette so type stays readable */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 30%, transparent 30%, rgb(12 12 10 / 0.82) 90%)' }} />
    </div>
  )
}
