'use client'

import { useEffect, useRef, useState } from 'react'
import { cappedDpr } from './support'

/*
  Specimen 05 — live halftone. The stage photo is resampled on a canvas
  into a duotone dot screen — pine ink on parchment with a misregistered
  gold underlay, like a pulled screen print. Rendered once (it's a still,
  not a loop), so it costs one pass of pixel math per resize.
*/

const SRC = '/band-photos/gfest-live.jpg'
const CELL = 5.5

export default function HalftonePrint() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [inked, setInked] = useState(false)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.src = SRC

    const render = () => {
      if (!img.complete || !img.naturalWidth) return
      const rect = wrap.getBoundingClientRect()
      if (rect.width < 2) return
      const dpr = cappedDpr(1.5)
      const w = rect.width
      const h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // sample luminance at dot-grid resolution with an object-cover crop
      const gw = Math.ceil(w / CELL)
      const gh = Math.ceil(h / CELL)
      const off = document.createElement('canvas')
      off.width = gw
      off.height = gh
      const octx = off.getContext('2d', { willReadFrequently: true })!
      // crop the source so its aspect matches the container, centered
      const targetAspect = w / h
      let sw = img.naturalWidth
      let sh = img.naturalHeight
      if (sw / sh > targetAspect) sw = sh * targetAspect
      else sh = sw / targetAspect
      const sx = (img.naturalWidth - sw) / 2
      const sy = (img.naturalHeight - sh) / 2
      octx.drawImage(img, sx, sy, sw, sh, 0, 0, gw, gh)
      const data = octx.getImageData(0, 0, gw, gh).data

      const lum = (gx: number, gy: number) => {
        const i = (Math.min(gh - 1, gy) * gw + Math.min(gw - 1, gx)) * 4
        return (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
      }

      ctx.fillStyle = '#efe6cf'
      ctx.fillRect(0, 0, w, h)
      const maxR = CELL * 0.66

      // gold pass, nudged off-register
      ctx.fillStyle = 'rgba(233,185,73,0.55)'
      for (let gy = 0; gy < gh; gy++) {
        const stagger = gy % 2 ? CELL / 2 : 0
        for (let gx = 0; gx < gw; gx++) {
          const d = 1 - lum(gx, gy)
          if (d < 0.22 || d > 0.8) continue
          const r = maxR * Math.sqrt(d) * 0.62
          ctx.beginPath()
          ctx.arc(gx * CELL + stagger + CELL * 0.42, gy * CELL + CELL * 0.36, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // pine ink pass
      ctx.fillStyle = '#0c2318'
      for (let gy = 0; gy < gh; gy++) {
        const stagger = gy % 2 ? CELL / 2 : 0
        for (let gx = 0; gx < gw; gx++) {
          const d = 1 - lum(gx, gy)
          if (d < 0.04) continue
          const r = maxR * Math.sqrt(d) * 0.92
          ctx.beginPath()
          ctx.arc(gx * CELL + stagger, gy * CELL, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    img.onload = render
    render()
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(render)
    })
    ro.observe(wrap)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div
      ref={wrapRef}
      className={`lab-print relative w-full overflow-hidden aspect-[1744/902] ${inked ? 'is-inked' : ''}`}
      onClick={() => setInked((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setInked((v) => !v)
        }
      }}
      aria-pressed={inked}
      aria-label="Toggle between the photograph and its halftone print"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SRC}
        alt="Northern Disconnection live at G-Fest"
        className="lab-print__photo absolute inset-0 h-full w-full object-cover"
      />
      <canvas ref={canvasRef} className="lab-print__halftone absolute inset-0 h-full w-full" aria-hidden="true" />
      <p className="pointer-events-none absolute bottom-3 right-4 hidden text-xs italic text-cream/60 mix-blend-difference sm:block">
        hover — pull the print
      </p>
    </div>
  )
}
