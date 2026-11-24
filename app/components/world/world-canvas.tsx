'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { PLACES, placeIndexForPath } from '@/lib/world/places'
import { registerWorld, type WorldHandle } from '@/lib/world/bus'

/*
  Mounts the world behind every page (see lib/world/engine.ts). The engine
  and its paint are loaded after first paint; until the first frame lands —
  or if WebGL2 isn't there — the wrapper shows a flat two-ink stand-in for
  the place (see .world in global.css).
*/
export default function WorldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<WorldHandle | null>(null)
  const pathname = usePathname()
  const index = placeIndexForPath(pathname)
  const indexRef = useRef(index)
  indexRef.current = index

  useEffect(() => {
    let dead = false
    const canvas = canvasRef.current
    if (!canvas) return
    const root = document.documentElement
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const start = async () => {
      const { createWorld } = await import('@/lib/world/engine')
      if (dead) return
      const world = createWorld(canvas, {
        place: indexRef.current,
        reducedMotion: reduced,
        onReady: () => {
          root.dataset.world = 'ready'
        },
      })
      if (!world) {
        root.dataset.world = 'none'
        return
      }
      worldRef.current = world
      registerWorld(world)
      world.setPlace(indexRef.current, true)
      if (process.env.NODE_ENV !== 'production') {
        const t = new URLSearchParams(window.location.search).get('wt')
        if (t !== null) {
          const poll = window.setInterval(() => {
            if (root.dataset.world === 'ready') {
              world.debugAt(parseFloat(t))
              window.clearInterval(poll)
            }
          }, 50)
        }
      }
    }
    const timer = window.setTimeout(start, 40)

    return () => {
      dead = true
      window.clearTimeout(timer)
      registerWorld(null)
      worldRef.current?.destroy()
      worldRef.current = null
      delete root.dataset.world
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.place = PLACES[index].id
    worldRef.current?.setPlace(index)
  }, [index])

  return (
    <div className="world" aria-hidden="true">
      <div className="world-sticky">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
