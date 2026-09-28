'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { BANDS, StumpAnalysis } from './analysis'
import { fitCanvas, startLoop } from './engine'
import type { StumpVariantProps } from './types'

/*
  "Linocut" — the stump as a living relief print. Cream ink on pine paper:
  thirty hand-cut growth rings, each one a frequency band (bass at the
  heart, cymbals at the rim). A fixed "cutter" at twelve o'clock carves
  each band's loudness into its ring as the block turns, so every ring is
  a circular ridge-line of its recent past — peaks fresh at the top,
  weathering flat as they come around. Rings are inked from the outside
  in and each one masks what lies behind it, which gives the Unknown
  Pleasures ridge depth. Carved hatch strokes make the bark; the ring
  that caught the latest beat flashes gold.
*/

const RINGS = 30
const SAMPLES = 240
/** Block speed: 2½ rpm, clockwise. */
const OMEGA = ((2 * Math.PI) / 60) * 2.5
const HEAD = -Math.PI / 2
const TAU = Math.PI * 2

const INK = '#f1e8d2'
const INK_RGB = [241, 232, 210]
const GOLD_RGB = [233, 185, 73]
const PAPER = '#0f271b'

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface RingShape {
  base: number // radius as a fraction of R
  space: number
  ph: [number, number, number]
  amp: [number, number, number]
  wph: [number, number]
}

function buildRings(rand: () => number): RingShape[] {
  const rings: RingShape[] = []
  const r0 = 0.085
  const r1 = 0.845
  for (let i = 0; i < RINGS; i++) {
    const u = i / (RINGS - 1)
    const base = r0 + (r1 - r0) * Math.pow(u, 0.9)
    const next = r0 + (r1 - r0) * Math.pow(Math.min(1, (i + 1) / (RINGS - 1)), 0.9)
    rings.push({
      base,
      space: Math.max(0.012, next - base),
      ph: [rand() * TAU, rand() * TAU, rand() * TAU],
      amp: [0.5 + rand() * 0.5, 0.3 + rand() * 0.4, 0.15 + rand() * 0.3],
      wph: [rand() * TAU, rand() * TAU],
    })
  }
  return rings
}

interface Stroke {
  a: number
  r0: number
  r1: number
  w: number
  tilt: number
}

/** Bark: rows of carved gouge strokes, all leaning the same way like a hand at work. */
function buildBark(rand: () => number): Stroke[] {
  const out: Stroke[] = []
  const n = 210
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rand() - 0.5) * 0.012
    const len = 0.028 + rand() * 0.05 * (0.6 + 0.4 * Math.sin(i * 0.37) ** 2)
    const r1 = 0.972 - rand() * 0.01
    out.push({ a, r0: r1 - len, r1, w: 0.0045 + rand() * 0.004, tilt: 0.045 + (rand() - 0.5) * 0.02 })
  }
  for (let i = 0; i < 70; i++) {
    const a = rand() * TAU
    const r1 = 0.905 + rand() * 0.02
    out.push({ a, r0: r1 - 0.012 - rand() * 0.018, r1, w: 0.004 + rand() * 0.003, tilt: 0.04 })
  }
  return out
}

function makePaper(size: number, rand: () => number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  const img = g.createImageData(size, size)
  const d = img.data
  for (let i = 0; i < size * size; i++) {
    const n = rand()
    const v = 0.9 + n * 0.14
    d[i * 4] = 15 * v
    d[i * 4 + 1] = 39 * v
    d[i * 4 + 2] = 27 * v
    d[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  // soft fibres
  g.globalAlpha = 0.05
  g.strokeStyle = '#6f8f6a'
  for (let i = 0; i < size / 3; i++) {
    const x = rand() * size
    const y = rand() * size
    const a = rand() * TAU
    const l = (4 + rand() * 14) * (size / 800)
    g.lineWidth = 0.6 * (size / 800)
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
    g.stroke()
  }
  return c
}

/** Sparse specks and scuffs where the ink didn't take. */
function makeSpeckle(size: number, rand: () => number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  const k = size / 800
  g.fillStyle = '#000'
  for (let i = 0; i < 2600; i++) {
    const r = (0.35 + rand() * rand() * 1.6) * k
    g.globalAlpha = 0.35 + rand() * 0.65
    g.beginPath()
    g.arc(rand() * size, rand() * size, r, 0, TAU)
    g.fill()
  }
  g.lineCap = 'round'
  for (let i = 0; i < 90; i++) {
    const x = rand() * size
    const y = rand() * size
    const a = rand() * TAU
    const l = (6 + rand() * 22) * k
    g.globalAlpha = 0.3 + rand() * 0.4
    g.lineWidth = (0.5 + rand()) * k
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(a + 0.4) * l * 0.5, y + Math.sin(a + 0.4) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
    g.stroke()
  }
  return c
}

export default function LinocutStump({
  analyserRef,
  playing,
  synthetic,
  progress = 0,
  onToggle,
  className,
}: StumpVariantProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const redrawRef = useRef<() => void>(() => {})
  const reducedMotion = useReducedMotion() ?? false
  const [failed, setFailed] = useState(false)
  const live = useRef({ playing, synthetic })
  live.current = { playing, synthetic }
  const progressRef = useRef(progress)
  progressRef.current = progress

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setFailed(true)
      return
    }
    const ink = document.createElement('canvas')
    const ictx = ink.getContext('2d')!
    const rand = mulberry(2025)
    const rings = buildRings(rand)
    const bark = buildBark(rand)
    const cracks = [0.7, 3.4].map((a) => {
      const pts: [number, number, number][] = []
      let ang = a
      const inner = 0.36 + rand() * 0.2
      for (let r = 0.99; r > inner; r -= 0.012) {
        ang += (rand() - 0.5) * 0.02
        pts.push([ang, r, (r - inner) / (0.99 - inner)])
      }
      return pts
    })

    let paper: HTMLCanvasElement | null = null
    let speckle: HTMLCanvasElement | null = null
    let size = 0

    const analysis = new StumpAnalysis(23)
    const hist = new Float32Array(RINGS * SAMPLES)
    // a quiet, irregular pattern for the idle print
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SAMPLES; j++) {
        const a = (j / SAMPLES) * TAU
        const v = 0.5 + 0.5 * Math.sin(a * 3 + i * 0.7) * Math.sin(a * 7 - i * 0.3)
        hist[i * SAMPLES + j] = Math.pow(Math.max(0, v - 0.55), 2) * 1.4 * (0.4 + rand() * 0.6)
      }
    }
    const level = new Float32Array(RINGS)
    const avg = new Float32Array(RINGS).fill(0.4)
    const gold = new Float32Array(RINGS)
    let rot = 0
    let omega = 0
    let lastIdx = -1
    const xs = new Float32Array(SAMPLES)
    const ys = new Float32Array(SAMPLES)
    const rr = new Float32Array(SAMPLES)
    const trig = Array.from({ length: SAMPLES }, (_, j) => {
      const a = (j / SAMPLES) * TAU
      return [Math.sin(a * 2), Math.cos(a * 2), Math.sin(a * 3), Math.cos(a * 3), Math.sin(a * 6), Math.cos(a * 6)]
    })

    const bandOf = (i: number) => {
      const b0 = Math.floor((i / RINGS) * BANDS)
      const b1 = Math.max(b0 + 1, Math.floor(((i + 1) / RINGS) * BANDS))
      return [b0, b1] as const
    }

    const draw = (t: number, dt: number) => {
      const p = live.current
      // still frames (reduced motion, offscreen redraws) ignore the audio
      if (dt > 0) analysis.update(analyserRef.current, p.playing, !!p.synthetic, dt)

      if (p.playing) omega += (OMEGA - omega) * (1 - Math.exp(-dt / 0.7))
      else omega = Math.max(0, omega - (0.03 + 0.5 * omega) * dt)
      rot += omega * dt

      // band levels relative to their own running average: peaks, not mush
      for (let i = 0; i < RINGS; i++) {
        const [b0, b1] = bandOf(i)
        let v = 0
        for (let b = b0; b < b1; b++) v = Math.max(v, analysis.raw[b])
        avg[i] += (v - avg[i]) * (1 - Math.exp(-(dt || 0.016) / 2.5))
        const peak = Math.max(0, v - avg[i] * 0.8) * (1.9 + (i / RINGS) * 1.2)
        level[i] += (peak - level[i]) * (1 - Math.exp(-(dt || 0.016) / (peak > level[i] ? 0.02 : 0.12)))
        gold[i] *= Math.exp(-(dt || 0.016) / 0.35)
      }
      if (analysis.beat) {
        const ring = Math.min(RINGS - 1, Math.floor((analysis.beatBand / BANDS) * RINGS))
        gold[ring] = 1
      }

      // the cutter at twelve o'clock carves the current levels into the block
      const headIdx = Math.floor(((((HEAD - rot) / TAU) % 1) + 1) % 1 * SAMPLES) % SAMPLES
      if (lastIdx < 0) lastIdx = headIdx
      if (p.playing || omega > 0.01) {
        let guard = 0
        while (lastIdx !== headIdx && guard++ < SAMPLES) {
          lastIdx = (lastIdx - 1 + SAMPLES) % SAMPLES
          for (let i = 0; i < RINGS; i++) hist[i * SAMPLES + lastIdx] = p.playing ? Math.min(1.4, level[i]) : 0
        }
      }
      lastIdx = headIdx

      if (!size || !paper || !speckle) return
      const S = size
      const cx = S / 2
      const cy = S / 2
      const R = S * 0.46
      const k = S / 800

      // paper disc
      ctx.clearRect(0, 0, S, S)
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.005, 0, TAU)
      ctx.clip()
      ctx.drawImage(paper, 0, 0)
      ctx.restore()

      // ---- ink layer ----
      ictx.clearRect(0, 0, S, S)
      ictx.fillStyle = INK
      // block edge: a heavy, slightly uneven border
      ictx.beginPath()
      for (let j = 0; j <= 180; j++) {
        const a = (j / 180) * TAU
        const w = 1 + 0.004 * Math.sin(a * 7 + 1.3) + 0.003 * Math.sin(a * 17)
        const x = cx + Math.cos(a + rot) * R * w
        const y = cy + Math.sin(a + rot) * R * w
        if (j === 0) ictx.moveTo(x, y)
        else ictx.lineTo(x, y)
      }
      for (let j = 180; j >= 0; j--) {
        const a = (j / 180) * TAU
        const w = 0.978 + 0.004 * Math.sin(a * 5 + 0.4)
        ictx.lineTo(cx + Math.cos(a + rot) * R * w, cy + Math.sin(a + rot) * R * w)
      }
      ictx.fill('evenodd')

      // bark: carved V-gouge hatching
      for (const s of bark) {
        const a = s.a + rot
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const ta = Math.cos(a + Math.PI / 2)
        const tb = Math.sin(a + Math.PI / 2)
        const x0 = cx + ca * R * s.r0
        const y0 = cy + sa * R * s.r0
        const x1 = cx + Math.cos(a + s.tilt) * R * s.r1
        const y1 = cy + Math.sin(a + s.tilt) * R * s.r1
        const w = s.w * R * 0.5
        ictx.beginPath()
        ictx.moveTo(x0, y0)
        ictx.lineTo(x1 + ta * w, y1 + tb * w)
        ictx.lineTo(x1 - ta * w, y1 - tb * w)
        ictx.closePath()
        ictx.fill()
      }

      // rings, outside in; each one blanks what it covers before inking
      for (let i = RINGS - 1; i >= 0; i--) {
        const ring = rings[i]
        const amp = ring.space * R * (2.9 - 1.3 * (i / RINGS))
        const swell = ring.space * R * 0.9 * level[i]
        const wob = ring.space * R * 0.2
        const row = i * SAMPLES
        const [p0, p1, p2] = ring.ph
        const c0 = Math.cos(p0), s0 = Math.sin(p0), c1 = Math.cos(p1), s1 = Math.sin(p1), c2 = Math.cos(p2), s2 = Math.sin(p2)
        for (let j = 0; j < SAMPLES; j++) {
          const tr = trig[j]
          const age = ((j - headIdx + SAMPLES) % SAMPLES) / SAMPLES
          const env = Math.pow(1 - age, 1.7)
          const shared = R * 0.01 * (tr[0] * 0.27 + tr[1] * 0.96 + 0.6 * (tr[2] * 0.92 - tr[3] * 0.39)) * (i / RINGS)
          const wobble =
            wob *
            (ring.amp[0] * (tr[0] * c0 + tr[1] * s0) + ring.amp[1] * (tr[2] * c1 + tr[3] * s1) + ring.amp[2] * (tr[4] * c2 + tr[5] * s2))
          // round the peaks a little, like ink settling into a cut
          const h =
            0.2 * hist[row + ((j + SAMPLES - 1) % SAMPLES)] + 0.6 * hist[row + j] + 0.2 * hist[row + ((j + 1) % SAMPLES)]
          const r = ring.base * R + shared + wobble + swell + amp * Math.pow(h, 1.25) * env
          rr[j] = r
          xs[j] = Math.cos((j / SAMPLES) * TAU + rot)
          ys[j] = Math.sin((j / SAMPLES) * TAU + rot)
        }
        const lw = k * (1.25 + 0.5 * (i / RINGS))
        // blank the interior
        ictx.globalCompositeOperation = 'destination-out'
        ictx.beginPath()
        for (let j = 0; j < SAMPLES; j++) {
          const x = cx + xs[j] * (rr[j] + lw)
          const y = cy + ys[j] * (rr[j] + lw)
          if (j === 0) ictx.moveTo(x, y)
          else ictx.lineTo(x, y)
        }
        ictx.closePath()
        ictx.fill()
        // ink the ring as a ribbon of varying weight
        ictx.globalCompositeOperation = 'source-over'
        const g = gold[i]
        ictx.fillStyle =
          g > 0.02
            ? `rgb(${Math.round(INK_RGB[0] + (GOLD_RGB[0] - INK_RGB[0]) * g)},${Math.round(INK_RGB[1] + (GOLD_RGB[1] - INK_RGB[1]) * g)},${Math.round(INK_RGB[2] + (GOLD_RGB[2] - INK_RGB[2]) * g)})`
            : INK
        ictx.beginPath()
        for (let j = 0; j < SAMPLES; j++) {
          const a = (j / SAMPLES) * TAU
          const w = lw * (0.75 + 0.5 * (0.5 + 0.5 * Math.sin(a * 5 + ring.wph[0]) * Math.sin(a * 2 + ring.wph[1]))) * (1 + g * 0.6)
          const x = cx + xs[j] * (rr[j] + w)
          const y = cy + ys[j] * (rr[j] + w)
          if (j === 0) ictx.moveTo(x, y)
          else ictx.lineTo(x, y)
        }
        ictx.closePath()
        for (let j = SAMPLES - 1; j >= 0; j--) {
          const a = (j / SAMPLES) * TAU
          const w = lw * (0.75 + 0.5 * (0.5 + 0.5 * Math.sin(a * 5 + ring.wph[0]) * Math.sin(a * 2 + ring.wph[1]))) * (1 + g * 0.6)
          const x = cx + xs[j] * (rr[j] - w)
          const y = cy + ys[j] * (rr[j] - w)
          if (j === SAMPLES - 1) ictx.moveTo(x, y)
          else ictx.lineTo(x, y)
        }
        ictx.closePath()
        ictx.fill('evenodd')
      }

      // pith: a cut star
      ictx.fillStyle = INK
      ictx.beginPath()
      ictx.arc(cx, cy, R * (0.03 + 0.01 * analysis.kick), 0, TAU)
      ictx.fill()
      ictx.globalCompositeOperation = 'destination-out'
      ictx.beginPath()
      ictx.arc(cx, cy, R * 0.011, 0, TAU)
      ictx.fill()

      // drying checks carved through the block
      ictx.lineCap = 'round'
      for (const crack of cracks) {
        for (let n = 1; n < crack.length; n++) {
          const [a0, r0, w0] = crack[n - 1]
          const [a1, r1] = crack[n]
          ictx.lineWidth = k * (0.8 + 5 * w0 * w0)
          ictx.beginPath()
          ictx.moveTo(cx + Math.cos(a0 + rot) * r0 * R, cy + Math.sin(a0 + rot) * r0 * R)
          ictx.lineTo(cx + Math.cos(a1 + rot) * r1 * R, cy + Math.sin(a1 + rot) * r1 * R)
          ictx.stroke()
        }
      }
      // where the ink didn't take
      ictx.drawImage(speckle, 0, 0)
      ictx.globalCompositeOperation = 'source-over'

      ctx.drawImage(ink, 0, 0)

      // song progress: the block's border inks gold, clockwise from the cutter
      const prog = progressRef.current
      if (prog > 0.001) {
        ctx.strokeStyle = 'rgba(233,185,73,0.95)'
        ctx.lineWidth = R * 0.017
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.arc(cx, cy, R * 0.989, HEAD, HEAD + prog * TAU)
        ctx.stroke()
      }
      // the cutter: a gold gouge at twelve o'clock, where the rings are carved
      ctx.fillStyle = '#e9b949'
      ctx.beginPath()
      ctx.moveTo(cx, cy - R * 0.955)
      ctx.lineTo(cx - R * 0.022, cy - R * 1.035)
      ctx.lineTo(cx + R * 0.022, cy - R * 1.035)
      ctx.closePath()
      ctx.fill()
    }

    const loop = startLoop(canvas, draw, reducedMotion)
    redrawRef.current = loop.redraw
    const unfit = fitCanvas(canvas, (w, h) => {
      const s = Math.min(w, h)
      if (s !== size) {
        size = s
        ink.width = s
        ink.height = s
        const r2 = mulberry(77)
        paper = makePaper(s, r2)
        speckle = makeSpeckle(s, r2)
      }
      loop.redraw()
    })
    return () => {
      loop.stop()
      unfit()
      redrawRef.current = () => {}
    }
  }, [analyserRef, reducedMotion])

  useEffect(() => {
    redrawRef.current()
  }, [playing, progress])

  const onKey = (e: React.KeyboardEvent) => {
    if (onToggle && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onToggle()
    }
  }

  return (
    <div
      className={`relative select-none ${className ?? ''}`}
      role={onToggle ? 'button' : undefined}
      tabIndex={onToggle ? 0 : undefined}
      aria-label={onToggle ? (playing ? 'Pause' : 'Play') : undefined}
      onClick={onToggle}
      onKeyDown={onKey}
      style={{ cursor: onToggle ? 'pointer' : undefined, WebkitTapHighlightColor: 'transparent' }}
    >
      {failed ? (
        <div
          className="aspect-square w-full"
          aria-hidden="true"
          style={{
            borderRadius: '50%',
            background: `repeating-radial-gradient(circle, ${PAPER} 0 2.2%, ${INK} 2.4% 2.7%, ${PAPER} 2.9%)`,
          }}
        />
      ) : (
        <canvas
          ref={canvasRef}
          className="block aspect-square w-full"
          role="img"
          aria-label="A linocut of tree rings, each ring a frequency band carved by the music"
        />
      )}
    </div>
  )
}
