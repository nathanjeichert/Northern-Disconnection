// Procedural canvas textures for the three.js concept scenes. Everything
// is generated at runtime (client only — these run behind dynamic imports
// with ssr disabled), so there are zero texture downloads.

import * as THREE from 'three'

export const SCENE_BG = '#0b2016'
export const TREE_INK = '#04100a'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Same silhouette recipe as the lab's flora generator, kept local so the
// concept scene is self-contained.
function coniferPath(cx: number, baseY: number, h: number, w: number, rng: () => number): string {
  const tiers = 18
  const crownH = h * 0.9
  const tipX = cx + (rng() - 0.5) * w * 0.14
  const trunkW = Math.max(4, w * 0.045)
  const side = (dir: 1 | -1) => {
    const pts: string[] = []
    for (let i = 1; i <= tiers; i++) {
      const t = i / tiers
      const y = baseY - h + t * crownH
      const tierH = crownH / tiers
      const reach = (w / 2) * Math.pow(t, 0.8) * (0.66 + rng() * 0.55)
      const droop = tierH * (0.4 + rng() * 0.45)
      pts.push(`L ${(cx + dir * reach).toFixed(1)} ${(y + droop).toFixed(1)}`)
      pts.push(`L ${(cx + dir * Math.max(trunkW, reach * 0.32)).toFixed(1)} ${(y + tierH * 0.6).toFixed(1)}`)
    }
    return pts
  }
  const right = side(1)
  const leftUp = side(-1).reverse()
  return [
    `M ${tipX.toFixed(1)} ${(baseY - h).toFixed(1)}`,
    ...right,
    `L ${cx + trunkW} ${baseY}`,
    `L ${cx - trunkW} ${baseY}`,
    ...leftUp,
    'Z',
  ].join(' ')
}

/** A single redwood silhouette on a transparent 512x1024 canvas. */
export function makeTreeTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 1024
  const ctx = c.getContext('2d')!
  const rng = mulberry32(seed * 7919 + 13)
  ctx.fillStyle = TREE_INK
  ctx.fill(new Path2D(coniferPath(256, 1024, 1010, 260, rng)))
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}

/** A whole distant ridge line of small conifers on one wide canvas. */
export function makeRidgeTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 256
  const ctx = c.getContext('2d')!
  const rng = mulberry32(seed * 104729 + 7)
  ctx.fillStyle = TREE_INK
  let x = 10
  while (x < 2038) {
    const h = 110 + rng() * 130
    ctx.fill(new Path2D(coniferPath(x, 258, h, h * 0.34, rng)))
    x += 30 + rng() * 42
  }
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}

/** Soft fog puff — pure radial falloff, no hard edges. */
export function makeWispTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 64, 2, 128, 64, 62)
  g.addColorStop(0, 'rgba(232, 220, 198, 0.75)')
  g.addColorStop(0.45, 'rgba(232, 220, 198, 0.28)')
  g.addColorStop(1, 'rgba(232, 220, 198, 0)')
  ctx.fillStyle = g
  // squash vertically so the puff is a lens shape with fully soft borders
  ctx.setTransform(1, 0, 0, 0.55, 0, 28)
  ctx.fillRect(0, 0, 256, 233)
  return new THREE.CanvasTexture(c)
}

/** Round soft glow (moon halo, firefly sprite). */
export function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62)
  g.addColorStop(0, 'rgba(247, 242, 229, 1)')
  g.addColorStop(0.35, 'rgba(247, 242, 229, 0.35)')
  g.addColorStop(1, 'rgba(247, 242, 229, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/** Tall light shaft: vertical fade crossed with a soft horizontal mask, so
    the beam has no hard edges anywhere. */
export function makeRayTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 512
  const ctx = c.getContext('2d')!
  const vert = ctx.createLinearGradient(0, 0, 0, 512)
  vert.addColorStop(0, 'rgba(233, 185, 73, 0.85)')
  vert.addColorStop(0.6, 'rgba(233, 185, 73, 0.3)')
  vert.addColorStop(1, 'rgba(233, 185, 73, 0)')
  ctx.fillStyle = vert
  ctx.fillRect(0, 0, 256, 512)
  const horiz = ctx.createLinearGradient(0, 0, 256, 0)
  horiz.addColorStop(0, 'rgba(255, 255, 255, 0)')
  horiz.addColorStop(0.5, 'rgba(255, 255, 255, 1)')
  horiz.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = horiz
  ctx.fillRect(0, 0, 256, 512)
  return new THREE.CanvasTexture(c)
}

export { mulberry32 }
