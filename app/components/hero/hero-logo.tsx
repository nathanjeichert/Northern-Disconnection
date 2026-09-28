'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import './hero-logo.css'

/*
  The home-page logo moment, as a three-colour screenprint: burgundy and
  gold plates pull first, then the cream key plate lands (almost) in
  register on top, and the plates drift gently with the pointer. The band's
  hand-drawn artwork is painted through masks (see hero-logo.css) — only
  its inks change, never the drawing.
*/

const MASKS = ['/logo/mark-ink.svg', '/logo/mark-fill.svg', '/logo-wordmark.png']

const CREAM = '#f7f2e5'
const PAPER = '#f2e8cf'
const INK = '#0b1f15'
const GOLD = '#e9b949'
const BURGUNDY = '#8e2b39'

/** Resolves once the mask artwork is decoded, so no layer pops in late. */
function useMasksReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const loads = MASKS.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new window.Image()
          img.onload = () => resolve()
          img.onerror = () => resolve()
          img.src = src
        })
    )
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2500))
    Promise.race([Promise.all(loads), timeout]).then(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])
  return ready
}

/** Pointer parallax for the print plates (gentle auto-drift on touch). */
function useParallax(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const fine = window.matchMedia('(pointer: fine)').matches
    let tx = 0
    let ty = 0
    let x = 0
    let y = 0
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      raf = 0
      if (!fine) {
        const s = (now - start) / 1000
        tx = Math.sin(s * 0.35) * 0.45
        ty = Math.cos(s * 0.27) * 0.35
      }
      x += (tx - x) * 0.06
      y += (ty - y) * 0.06
      el.style.setProperty('--hl-px', x.toFixed(4))
      el.style.setProperty('--hl-py', y.toFixed(4))
      // on desktop, sleep once the plates have caught up with the pointer
      if (!fine || Math.abs(tx - x) + Math.abs(ty - y) > 0.002) raf = requestAnimationFrame(tick)
    }
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2
      ty = (e.clientY / window.innerHeight - 0.5) * 2
      if (!raf) raf = requestAnimationFrame(tick)
    }
    if (fine) window.addEventListener('pointermove', onMove, { passive: true })
    else raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [ref, enabled])
}

/* ------------------------------ plates ------------------------------ */

function MarkSilhouette({ color, className = '' }: { color: string; className?: string }) {
  return <div className={`hl-mark hl-sil ${className}`} style={{ background: color }} />
}

function Wordmark({ color, className = '', style }: { color?: string; className?: string; style?: React.CSSProperties }) {
  return <div className={`hl-word hl-wordmask ${className}`} style={{ background: color, ...style }} />
}

function KeyMark({ fill = PAPER, ink = INK }: { fill?: string; ink?: string }) {
  return (
    <>
      <div className="hl-mark hl-fill" style={{ background: fill }} />
      <div className="hl-mark hl-ink" style={{ background: ink }} />
    </>
  )
}

function Screenprint() {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion() ?? false
  useParallax(ref, !reduced)
  return (
    <div ref={ref} className="hl-full">
      <div className="sp-plate sp-plate--burgundy">
        <MarkSilhouette color={BURGUNDY} />
        <Wordmark color={BURGUNDY} />
      </div>
      <div className="sp-plate sp-plate--gold">
        <MarkSilhouette color={GOLD} />
        <Wordmark color={GOLD} />
      </div>
      <div className="sp-plate sp-plate--key">
        <KeyMark />
        <div className="hl-mark hl-fill sp-grain" style={{ opacity: 0.14 }} />
        <Wordmark color={CREAM} />
        <Wordmark className="sp-grain" style={{ opacity: 0.16 }} />
      </div>
    </div>
  )
}

/* ------------------------------- entry ------------------------------ */

export default function HeroLogo() {
  const ready = useMasksReady()
  return (
    <div className="hl-box" role="img" aria-label="Northern Disconnection">
      {ready && <Screenprint />}
    </div>
  )
}
