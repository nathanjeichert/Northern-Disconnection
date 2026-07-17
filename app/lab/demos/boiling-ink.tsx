'use client'

import { useEffect, useId, useRef } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'

/*
  Specimen 02 — the "boiling line" from hand-inked cartoons, on live text.
  Two SVG turbulence filters displace the type; stepping the noise seed at
  ~7 fps makes the ink wobble like every frame was drawn by hand. Hover or
  press and the displacement scale ramps up until the print melts.
  Costs nothing: no canvas, no WebGL, no libraries.
*/

const SEED_INTERVAL_MS = 140
const HEAD_BASE = 5
const HEAD_MELT = 26
const TRIM_BASE = 8
const TRIM_MELT = 34

export default function BoilingInk() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const turbHead = useRef<SVGFETurbulenceElement>(null)
  const turbTrim = useRef<SVGFETurbulenceElement>(null)
  const dispHead = useRef<SVGFEDisplacementMapElement>(null)
  const dispTrim = useRef<SVGFEDisplacementMapElement>(null)
  const inView = useInView(wrapRef, { margin: '20% 0px 20% 0px' })
  const reducedMotion = useReducedMotion()
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const headId = `boil-head-${uid}`
  const trimId = `boil-trim-${uid}`

  useEffect(() => {
    if (!inView || reducedMotion) return

    let seed = 1
    const stepSeeds = setInterval(() => {
      seed = (seed % 9) + 1
      turbHead.current?.setAttribute('seed', String(seed))
      turbTrim.current?.setAttribute('seed', String(seed * 3 + 1))
    }, SEED_INTERVAL_MS)

    // ease displacement toward "melted" while the pointer is down/over
    let raf = 0
    let target = 0
    let cur = 0
    const tick = () => {
      cur += (target - cur) * 0.07
      dispHead.current?.setAttribute('scale', (HEAD_BASE + cur * HEAD_MELT).toFixed(2))
      dispTrim.current?.setAttribute('scale', (TRIM_BASE + cur * TRIM_MELT).toFixed(2))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const wrap = wrapRef.current
    const melt = () => { target = 1 }
    const settle = () => { target = 0 }
    wrap?.addEventListener('pointerenter', melt)
    wrap?.addEventListener('pointerleave', settle)
    wrap?.addEventListener('pointerdown', melt)
    window.addEventListener('pointerup', settle)

    return () => {
      clearInterval(stepSeeds)
      cancelAnimationFrame(raf)
      wrap?.removeEventListener('pointerenter', melt)
      wrap?.removeEventListener('pointerleave', settle)
      wrap?.removeEventListener('pointerdown', melt)
      window.removeEventListener('pointerup', settle)
    }
  }, [inView, reducedMotion])

  return (
    <div ref={wrapRef} className="bg-parchment px-4 py-10 sm:py-14">
      <svg viewBox="0 0 800 400" className="mx-auto w-full max-w-2xl select-none" role="img" aria-label="Vintage handbill mockup with wobbling hand-inked type">
        <defs>
          <filter id={headId} x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence ref={turbHead} type="fractalNoise" baseFrequency="0.013 0.021" numOctaves="2" seed="3" result="n" />
            <feDisplacementMap ref={dispHead} in="SourceGraphic" in2="n" scale={HEAD_BASE} xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id={trimId} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence ref={turbTrim} type="fractalNoise" baseFrequency="0.02 0.032" numOctaves="2" seed="7" result="n" />
            <feDisplacementMap ref={dispTrim} in="SourceGraphic" in2="n" scale={TRIM_BASE} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>

        <g filter={`url(#${trimId})`} fill="#1d4030">
          <text
            x="400"
            y="64"
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-body), Georgia, serif', fontSize: 21, fontWeight: 700, letterSpacing: '0.42em' }}
          >
            ONE NIGHT ONLY · UNDER THE REDWOODS
          </text>
          <line x1="180" y1="92" x2="620" y2="92" stroke="#7a2230" strokeWidth="2.5" />
        </g>

        <g filter={`url(#${headId})`} fill="#0c2318">
          <text
            x="400"
            y="185"
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: 88, fontWeight: 640, fontVariationSettings: "'SOFT' 60, 'WONK' 1" }}
          >
            Northern
          </text>
          <text
            x="400"
            y="272"
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: 65, fontWeight: 640, fontVariationSettings: "'SOFT' 60, 'WONK' 1" }}
          >
            Disconnection
          </text>
        </g>

        <g filter={`url(#${trimId})`}>
          <text x="400" y="330" textAnchor="middle" fill="#7a2230" style={{ fontSize: 30 }}>
            ❦
          </text>
          <text
            x="400"
            y="374"
            textAnchor="middle"
            fill="#1d4030"
            style={{ fontFamily: 'var(--font-body), Georgia, serif', fontSize: 19, fontWeight: 700, letterSpacing: '0.34em' }}
          >
            RIVER THEATRE · GUERNEVILLE, CALIF.
          </text>
        </g>
      </svg>

      <p className="mt-6 text-center text-xs italic text-[#1d4030]/70">
        hold your cursor on the bill — the ink melts
      </p>
    </div>
  )
}
