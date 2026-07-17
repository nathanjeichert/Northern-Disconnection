'use client'

import { useEffect, useRef } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { TreeLine } from './flora'
import { PALETTE, cappedDpr, makeGlowSprite, makeRng } from './support'

/*
  Specimen 01 — layered atmosphere with zero dependencies.
  Depth comes from stacked silhouette layers driven by one pair of CSS
  variables (--par-x / --par-y) that a rAF loop eases toward the pointer;
  fog, god rays, and tree sway are pure CSS keyframes; fireflies are a
  36-particle canvas using a pre-rendered glow sprite.
*/

const FIREFLY_COUNT = 36

interface Firefly {
  x0: number
  y0: number
  ax: number
  ay: number
  sa: number
  sb: number
  pa: number
  pb: number
  tw: number
  tp: number
  size: number
}

function makeFireflies(): Firefly[] {
  const rng = makeRng(4021)
  return Array.from({ length: FIREFLY_COUNT }, () => ({
    x0: rng(),
    y0: 0.38 + rng() * 0.55,
    ax: 12 + rng() * 34,
    ay: 8 + rng() * 22,
    sa: 0.12 + rng() * 0.2,
    sb: 0.05 + rng() * 0.12,
    pa: rng() * Math.PI * 2,
    pb: rng() * Math.PI * 2,
    tw: 0.6 + rng() * 1.6,
    tp: rng() * Math.PI * 2,
    size: 3.5 + rng() * 4.5,
  }))
}

const STARS = (() => {
  const rng = makeRng(977)
  return Array.from({ length: 26 }, () => ({
    left: rng() * 100,
    top: rng() * 48,
    delay: rng() * 4,
    duration: 2.6 + rng() * 3.4,
  }))
})()

export default function MistyGrove() {
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inView = useInView(frameRef, { margin: '15% 0px 15% 0px' })
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const frame = frameRef.current
    const canvas = canvasRef.current
    if (!frame || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = cappedDpr(1.5)
    const sprite = makeGlowSprite(PALETTE.gold)
    const flies = makeFireflies()
    let width = 0
    let height = 0

    const resize = () => {
      const rect = frame.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(frame)

    const drawFlies = (t: number, still: boolean) => {
      ctx.clearRect(0, 0, width, height)
      for (const f of flies) {
        const x = f.x0 * width + (still ? 0 : Math.sin(t * f.sa + f.pa) * f.ax + Math.sin(t * f.sb + f.pb) * f.ax * 0.4)
        const y = f.y0 * height + (still ? 0 : Math.cos(t * f.sb + f.pb) * f.ay + Math.sin(t * f.sa * 0.7 + f.pa) * f.ay * 0.5)
        const twinkle = still ? 0.4 : 0.18 + 0.82 * Math.pow(0.5 + 0.5 * Math.sin(t * f.tw + f.tp), 2.6)
        const s = f.size * 3
        ctx.globalAlpha = twinkle
        ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s)
      }
      ctx.globalAlpha = 1
    }

    if (reducedMotion) {
      drawFlies(0, true)
      return () => ro.disconnect()
    }

    // one loop: ease parallax vars toward the pointer + animate fireflies
    let raf = 0
    let targetX = 0
    let targetY = 0
    let curX = 0
    let curY = 0
    const start = performance.now()

    const onPointerMove = (e: PointerEvent) => {
      const rect = frame.getBoundingClientRect()
      targetX = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1))
      targetY = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1))
    }
    const onPointerLeave = () => {
      targetX = 0
      targetY = 0
    }
    frame.addEventListener('pointermove', onPointerMove)
    frame.addEventListener('pointerleave', onPointerLeave)

    const tick = (now: number) => {
      const t = (now - start) / 1000
      curX += (targetX - curX) * 0.045
      curY += (targetY - curY) * 0.045
      frame.style.setProperty('--par-x', curX.toFixed(4))
      frame.style.setProperty('--par-y', curY.toFixed(4))
      drawFlies(t, false)
      raf = requestAnimationFrame(tick)
    }
    if (inView) raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      frame.removeEventListener('pointermove', onPointerMove)
      frame.removeEventListener('pointerleave', onPointerLeave)
      ro.disconnect()
    }
  }, [inView, reducedMotion])

  const parallax = (fx: number, fy: number): React.CSSProperties => ({
    transform: `translate3d(calc(var(--par-x, 0) * ${fx}px), calc(var(--par-y, 0) * ${fy}px), 0)`,
  })

  return (
    <div
      ref={frameRef}
      className="relative w-full touch-pan-y overflow-hidden bg-[#081a10] aspect-[3/4] sm:aspect-[16/9]"
    >
      {/* dusk sky */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#06140d_0%,#123227_48%,#1d4030_80%,#123227_100%)]" />

      {/* stars */}
      <div className="absolute inset-0" aria-hidden="true">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="lab-star"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </div>

      {/* moon + halo */}
      <div className="absolute left-[68%] top-[8%] h-40 w-40 -translate-x-1/2" style={parallax(-4, -2)}>
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(247,242,229,0.5),transparent_65%)] blur-2xl" />
        <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(247,242,229,0.95)_30%,rgba(247,242,229,0.35)_60%,transparent_75%)]" />
      </div>

      {/* far ridge, half-lost in fog */}
      <TreeLine
        seed={11}
        count={14}
        fill="#28503c"
        minH={0.34}
        maxH={0.62}
        opacity={0.55}
        className="lab-sway lab-sway--slow absolute bottom-0 left-[-4%] h-[68%] w-[108%] blur-[1.5px]"
        style={{ '--par-f': '-7px', '--par-fy': '-3px' } as React.CSSProperties}
      />

      {/* high fog bank */}
      <div className="lab-fog lab-fog--a left-[-25%] top-[30%] h-[45%] w-[150%] bg-[radial-gradient(closest-side,rgba(239,230,207,0.17),rgba(239,230,207,0.05)_60%,transparent)]" />

      {/* middle stand */}
      <TreeLine
        seed={23}
        count={10}
        fill="#122b1f"
        minH={0.5}
        maxH={0.82}
        opacity={0.92}
        className="lab-sway lab-sway--slow absolute bottom-0 left-[-4%] h-[84%] w-[108%] blur-[0.5px]"
        style={{ '--par-f': '-14px', '--par-fy': '-6px' } as React.CSSProperties}
      />

      {/* god rays slanting down from the moon */}
      <div className="absolute inset-0" aria-hidden="true">
        <div
          className="lab-ray left-[49%] w-[10%] bg-[linear-gradient(to_bottom,rgba(233,185,73,0.30),rgba(233,185,73,0.06)_55%,transparent_78%)] [clip-path:polygon(38%_0,62%_0,100%_100%,0_100%)]"
          style={{ '--ray-angle': '7deg' } as React.CSSProperties}
        />
        <div
          className="lab-ray lab-ray--slow left-[58%] w-[7%] bg-[linear-gradient(to_bottom,rgba(233,185,73,0.24),rgba(233,185,73,0.05)_50%,transparent_72%)] [clip-path:polygon(35%_0,65%_0,100%_100%,0_100%)]"
          style={{ '--ray-angle': '11deg' } as React.CSSProperties}
        />
        <div
          className="lab-ray left-[64%] w-[13%] bg-[linear-gradient(to_bottom,rgba(247,242,229,0.16),rgba(247,242,229,0.04)_50%,transparent_70%)] [clip-path:polygon(40%_0,60%_0,100%_100%,0_100%)]"
          style={{ '--ray-angle': '15deg' } as React.CSSProperties}
        />
      </div>

      {/* low fog */}
      <div className="lab-fog lab-fog--b left-[-30%] top-[52%] h-[42%] w-[160%] bg-[radial-gradient(closest-side,rgba(232,220,198,0.15),rgba(232,220,198,0.04)_65%,transparent)]" />

      {/* near giants */}
      <TreeLine
        seed={37}
        count={7}
        fill="#04100a"
        minH={0.72}
        maxH={1.04}
        className="lab-sway absolute bottom-0 left-[-4%] h-[100%] w-[108%]"
        style={{ '--par-f': '-26px', '--par-fy': '-10px' } as React.CSSProperties}
      />

      {/* ground mist */}
      <div className="absolute bottom-0 h-[20%] w-full bg-gradient-to-t from-[rgba(232,220,198,0.12)] to-transparent" />

      {/* fireflies */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

      {/* vignette into the card frame */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(6,17,11,0.5)_100%)]" />

      <p className="absolute bottom-3 right-4 hidden text-xs italic text-sand/50 sm:block">
        move your cursor — the grove breathes
      </p>
    </div>
  )
}
