'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { runShaderScene } from '@/lib/art/shader-scene'
import { TOPO_FRAG } from '@/lib/art/backdrops'
import CompassRose from './compass-rose'

/*
  Site-wide art behind every page: a fixed, dim topographic map of
  imaginary Sonoma hills that drifts slowly and pans with scroll, like
  sliding a paper map. It lives in the root layout, so it persists across
  client-side navigation (the contour fade-in plays once per visit). The
  body's CSS gradient stays underneath as the no-WebGL fallback.
*/
export default function SiteBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion() ?? false
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const scene = runShaderScene(canvas, {
      frag: TOPO_FRAG,
      // contour lines want to be crisp, so follow the display density a little
      scale: Math.min(1.25 * dpr, 2),
      fps: 24,
      reducedMotion,
      onReady: () => setReady(true),
    })
    return () => {
      scene?.destroy()
      setReady(false)
    }
  }, [reducedMotion])

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-0 h-[100lvh] w-screen transition-opacity duration-1000"
        style={{ opacity: ready ? 1 : 0 }}
      />
      <CompassRose />
    </>
  )
}
