// Shared helpers for the /lab demos. Everything is deterministic (seeded)
// so server and client render identical markup — no hydration mismatches.

export const PALETTE = {
  pine: '#0c2318',
  moss: '#1d4030',
  forest: '#355e3b',
  cream: '#f7f2e5',
  parchment: '#efe6cf',
  rust: '#d7b48a',
  sand: '#e8dcc6',
  gold: '#e9b949',
  burgundy: '#7a2230',
  sage: '#7d8471',
} as const

/** Tiny deterministic PRNG (mulberry32). */
export function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pre-rendered radial glow sprite; far cheaper than canvas shadowBlur. */
export function makeGlowSprite(color: string, size = 32): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, color)
  g.addColorStop(0.25, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.globalAlpha = 0.9
  ctx.fillRect(0, 0, size, size)
  return c
}

/** Clamp device pixel ratio so full-bleed canvases stay cheap. */
export function cappedDpr(max = 1.5) {
  if (typeof window === 'undefined') return 1
  return Math.min(window.devicePixelRatio || 1, max)
}
