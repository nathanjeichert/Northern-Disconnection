/*
  Plumbing for the stump renderer: a render loop that sleeps when the
  stump is offscreen or the tab is hidden (and renders one still frame
  under prefers-reduced-motion), and canvas sizing with a DPR cap.
*/

const MAX_DPR = 2
/** Clock value used for still (reduced-motion) frames. */
const STILL_T = 21

export interface LoopHandle {
  stop: () => void
  /** Draw one frame now (used for still mode and after resizes while asleep). */
  redraw: () => void
}

/**
 * Runs `draw(t, dt)` every animation frame while `target` is on screen and
 * the document is visible. In `still` mode it only draws on demand.
 */
export function startLoop(target: Element, draw: (t: number, dt: number) => void, still: boolean): LoopHandle {
  let raf = 0
  let running = false
  let onscreen = true
  let visible = typeof document === 'undefined' ? true : !document.hidden
  let last = 0
  let clock = still ? STILL_T : 0
  let stopped = false

  const tick = (now: number) => {
    raf = 0
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
    last = now
    clock += dt
    draw(clock, dt)
    if (running && !stopped) raf = requestAnimationFrame(tick)
  }

  const update = () => {
    const should = !still && !stopped && visible && onscreen
    if (should && !running) {
      running = true
      last = 0
      raf = requestAnimationFrame(tick)
    } else if (!should && running) {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
  }

  let io: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) onscreen = e.isIntersecting
        update()
      },
      { rootMargin: '120px' }
    )
    io.observe(target)
  }
  const onVis = () => {
    visible = !document.hidden
    update()
  }
  document.addEventListener('visibilitychange', onVis)

  if (still) draw(clock, 0)
  update()

  return {
    stop() {
      stopped = true
      running = false
      if (raf) cancelAnimationFrame(raf)
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    },
    redraw() {
      if (!running && !stopped) draw(clock, 0)
    },
  }
}

/** Keeps a canvas's backing store matched to its CSS size (DPR capped). */
export function fitCanvas(canvas: HTMLCanvasElement, onResize: (w: number, h: number, dpr: number) => void) {
  const apply = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(2, Math.round(rect.width * dpr))
    const h = Math.max(2, Math.round(rect.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    onResize(w, h, dpr)
  }
  apply()
  const ro = new ResizeObserver(apply)
  ro.observe(canvas)
  return () => ro.disconnect()
}
