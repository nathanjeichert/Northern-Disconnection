/*
  The world canvas: a WPA poster you can walk into.

  One WebGL2 canvas sits behind every page. It paints a flat-ink landscape
  (sky, sun, ridges and a perspective ground plane — one fragment shader),
  then a forest of billboards over it: procedural redwood trunks and
  hand-painted cut-outs (lib/world/paint.ts), sorted far to near and tinted
  by distance so the nearest things are darkest, the way a screenprint
  stacks its inks. The camera follows a trail; each page is a place on it
  (lib/world/places.ts) and changing route walks the camera there while the
  palette shifts from one time of day to the next.

  The canvas is taller than the viewport and scrolls with the page for its
  first LOCK screen-heights (see .world-sticky in global.css), so anything
  laid out over the first screen stays registered with the painting.
*/

import { PLACES } from './places'
import { paintAt, paintOf, hex, type Mixed, type RGB } from './palette'
import * as GLSL from './shaders'
import { SHEETS, paintSheet, mulberry, type TexName } from './paint'
import { worldInput } from './bus'

/** World units between places. */
export const SPACING = 80
/** Extra canvas below the fold, in screen heights. */
export const LOCK = 0.6
const CAM_H = 1.7
const HY0 = -0.08
const NEAR = 0.75
const TRUNK_TOP = 70


export function pathX(z: number) {
  return 2.4 * Math.sin(z * 0.043 + 1.3) + 1.1 * Math.sin(z * 0.097 + 0.4)
}

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/* ------------------------------ the scene ------------------------------ */

const TRUNK = 0
const SPRITE = 1
const SKY = 2

const TONE_TRUNK = 0
const TONE_LEAF = 1
const TONE_CUSTOM = 2
const TONE_SHAFT = 3
const TONE_GLOW = 4

const ANIM_FLAME = 1 // + frame
const ANIM_BIRD = 4
const ANIM_SHAFT = 5
const ANIM_FLICKER = 6
const ANIM_PULSE = 7
const ANIM_CRAWL = 8

interface Item {
  kind: number
  z: number
  /** Lateral offset from the trail's centre line. */
  off: number
  /** Whether the offset narrows with the viewport. */
  scaled: boolean
  /** Pinned to the edge of the first screen at this place. */
  frame?: { side: number; d: number; place: number; inward: number }
  attach?: Item
  x: number
  y: number
  w: number
  h: number
  w0: number
  h0: number
  /** How much the cut-out shrinks on narrow screens (0 none … 1 fully). */
  shrink: number
  r: number
  r0: number
  ax: number
  ay: number
  tex: number
  tone: number
  col?: RGB[]
  flip: number
  rot: number
  sway: number
  phase: number
  seed: number
  soft: number
  alpha: number
  anim: number
  far: number
  /** Distance inside which the cut-out has faded away (0 = only when it
      reaches the lens). Far-off scenery uses this so it is never walked
      through at the wrong scale. */
  vanish: number
}

/** How open the forest is at z: 0 in thick woods, 1 in a clearing, plus the
    clearing's half-width. */
const CLEAR = [
  { a: -8, b: 52, off: 10.5, keep: 0.07 },
  { a: -4, b: 20, off: 5.4, keep: 0.6 },
  { a: -4, b: 16, off: 5.0, keep: 0.62 },
  { a: -5, b: 42, off: 7.0, keep: 0.4 },
  { a: -10, b: 76, off: 9.0, keep: 0.14 },
]

/** Ground kept clear of the random undergrowth: set pieces and the river.
    [place, z from, z to, offset from, offset to] */
const KEEP_CLEAR: [number, number, number, number, number][] = [
  [1, 6.5, 15, -0.5, 9.5],
  [3, 7.5, 16.5, -10, -0.8],
  [3, -6, 48, 3.6, 11.6],
  [4, 9, 22, 2, 12],
]

function isClear(z: number, off: number) {
  for (const [place, a, b, o0, o1] of KEEP_CLEAR) {
    const d = z - place * SPACING
    if (d >= a && d <= b && off >= o0 && off <= o1) return true
  }
  return false
}

function clearing(z: number) {
  let c = 0
  let off = 2.5
  let place = 0
  let keep = 0.92
  for (let i = 0; i < CLEAR.length; i++) {
    const zi = i * SPACING
    const { a, b } = CLEAR[i]
    const d = z < zi + a ? zi + a - z : z > zi + b ? z - (zi + b) : 0
    const ci = 1 - clamp(d / 10)
    if (ci > c) {
      c = ci
      off = lerp(2.5, CLEAR[i].off, ci)
      keep = lerp(0.92, CLEAR[i].keep, ci)
      place = i
    }
  }
  return { c, off, place, keep }
}

const FIRE = { d: 10.5, off: 3.4 }

function buildScene(tex: Record<TexName, number>, dense: boolean) {
  const r = mulberry(0x0d15c0)
  const R = (a: number, b: number) => a + (b - a) * r()
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]
  const items: Item[] = []

  const add = (o: Partial<Item> & { kind: number; z: number }): Item => {
    const it: Item = {
      off: 0,
      scaled: true,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      w0: 0,
      h0: 0,
      shrink: 0,
      r: 1,
      r0: 1,
      ax: 0.5,
      ay: 0,
      tex: 0,
      tone: TONE_LEAF,
      flip: 1,
      rot: 0,
      sway: 0,
      phase: r() * 6.283,
      seed: r(),
      soft: 0,
      alpha: 1,
      anim: 0,
      far: 1,
      vanish: 0,
      ...o,
    }
    it.w0 = it.w
    it.h0 = it.h
    items.push(it)
    return it
  }

  const boughs = ['bough0', 'bough1', 'bough2'] as TexName[]
  const ferns = ['fern0', 'fern1', 'fern2'] as TexName[]

  const boughOn = (trunk: Item, side: number, y: number, size: number) => {
    add({
      kind: SPRITE,
      z: trunk.z - 0.04 - r() * 0.05,
      attach: trunk,
      off: -side,
      y,
      w: size,
      h: size * 0.5,
      ax: 0.02,
      ay: 0.53,
      tex: tex[pick(boughs)],
      flip: -side,
      rot: -R(0.08, 0.42),
      sway: R(0.012, 0.03),
      shrink: 1,
    })
  }

  const zEnd = (PLACES.length - 1) * SPACING + 90

  // ---- the redwoods ----
  for (let z = -30; z < zEnd; z += R(1.4, 2.8)) {
    const { c, off, keep } = clearing(z)
    if (r() > keep) continue
    const side = r() < 0.5 ? -1 : 1
    const lateral = off + Math.pow(r(), 1.6) * lerp(8, 13, c)
    const rad = (c > 0.5 ? 0.45 : 0.3) + Math.pow(r(), 2.3) * 1.25
    if (isClear(z, side * lateral) || isClear(z, side * (lateral + rad * 2))) continue
    const trunk = add({ kind: TRUNK, z, off: side * (lateral + rad), r0: rad, tone: TONE_TRUNK })
    if (rad > 0.45 && lateral < off + 6) {
      const n = 1 + Math.floor(r() * 2.2)
      for (let k = 0; k < n; k++) boughOn(trunk, side, R(3.2, 7.5), R(2.0, 3.9))
    }
    if (r() < 0.7) {
      const s = R(0.9, 1.6)
      add({ kind: SPRITE, z: z - 0.1, off: side * (lateral + R(-0.5, 0.4)), y: 0, w: s, h: s, ay: 0.05, tex: tex[pick(ferns)], sway: 0.02, shrink: 0.6 })
    }
  }

  // ---- the two trunks that frame each place, heavy with boughs ----
  for (let i = 0; i < PLACES.length; i++) {
    const zi = i * SPACING
    for (const [side, d, rad] of [
      [-1, 4.4, 1.05],
      [1, 5.3, 0.95],
    ] as const) {
      const trunk = add({ kind: TRUNK, z: zi + d, r0: rad, tone: TONE_TRUNK, frame: { side, d, place: i, inward: 0 } })
      for (const y of [3.3, 3.8, 4.4]) boughOn(trunk, side, y + R(-0.12, 0.12), R(1.7, 2.5))
      // the owl's perch in the grove
      if (i === 2 && side < 0) {
        boughOn(trunk, side, 2.5, 1.9)
        items[items.length - 1].rot = -0.06
      }
      add({ kind: SPRITE, z: zi + d - 0.12, frame: { side, d: d - 0.12, place: i, inward: 0.2 }, w: 1.5, h: 1.5, ay: 0.05, tex: tex[pick(ferns)], sway: 0.02, shrink: 1 })
      add({ kind: SPRITE, z: zi + d - 0.3, frame: { side, d: d - 0.3, place: i, inward: 0.95 }, w: 1.1, h: 1.1, ay: 0.05, tex: tex[pick(ferns)], sway: 0.025, shrink: 1 })
    }
  }

  // ---- sprays hanging in from the canopy ----
  for (let z = -10; z < zEnd; z += R(1.8, 3.6)) {
    const { c } = clearing(z)
    if (c > 0.15) continue
    const side = r() < 0.5 ? -1 : 1
    const size = R(2.4, 4.2)
    add({
      kind: SPRITE,
      z,
      off: side * R(0.2, 6.5),
      y: R(4.9, 6.6),
      w: size,
      h: size * 0.5,
      ax: 0.02,
      ay: 0.53,
      tex: tex[pick(boughs)],
      flip: -side,
      rot: -R(0.7, 1.25),
      sway: R(0.015, 0.035),
      shrink: 1,
    })
  }

  // ---- ferns and duff along the trail ----
  const fernStep = dense ? 0.62 : 1.05
  for (let z = -6; z < zEnd; z += R(fernStep, fernStep * 2)) {
    const { c, place } = clearing(z)
    if (place === 4 && c > 0.4) continue
    const side = r() < 0.5 ? -1 : 1
    const s = R(0.7, 1.45)
    const off = side * (1.3 + Math.pow(r(), 1.6) * 7)
    if (isClear(z, off)) continue
    add({ kind: SPRITE, z, off, w: s, h: s, ay: 0.05, tex: tex[pick(ferns)], sway: 0.022, shrink: 0.6 })
  }
  for (let z = -8; z < zEnd; z += R(2.2, 4.4)) {
    const { c, place } = clearing(z)
    if (place === 4 && c > 0.4) continue
    const side = r() < 0.5 ? -1 : 1
    const w = R(4.5, 8)
    const off = side * R(4.4, 12)
    if (isClear(z, off) || isClear(z, off - side * w * 0.4)) continue
    add({ kind: SPRITE, z, off, w, h: w * R(0.11, 0.17), ay: 0.02, tex: tex[r() < 0.5 ? 'mound0' : 'mound1'], shrink: 0.6 })
  }
  // a few toadstools anywhere along the way
  for (let z = 30; z < zEnd; z += R(9, 22)) {
    const side = r() < 0.5 ? -1 : 1
    const s = R(0.5, 0.85)
    if (isClear(z, side * 2.3) || clearing(z).place === 4) continue
    add({
      kind: SPRITE,
      z,
      off: side * R(1.4, 3.2),
      w: s,
      h: s,
      ay: 0.03,
      tex: tex[r() < 0.5 ? 'shroom0' : 'shroom1'],
      tone: TONE_CUSTOM,
      col: [hex('#b53a2c'), hex('#3a1512'), hex('#f1e6c8')],
    })
  }

  const at = (i: number) => i * SPACING

  // ---- 0: the trailhead ----
  {
    const z0 = at(0)
    for (let k = 0; k < 14; k++) {
      const w = R(13, 20)
      const side = k % 2 ? 1 : -1
      add({ kind: SPRITE, z: z0 + R(24, 50), off: side * R(5, 24), w, h: w / 8, ay: 0.03, tex: tex[k % 3 ? 'stand0' : 'stand1'], vanish: 9 })
    }
    for (let k = 0; k < 9; k++) {
      const h = R(4.5, 8.5)
      const side = k % 2 ? 1 : -1
      add({ kind: SPRITE, z: z0 + R(17, 40), off: side * R(7.5, 19), w: h / 2, h, ay: 0.01, tex: tex[k % 2 ? 'fir0' : 'fir1'], sway: 0.006 })
    }
    add({ kind: SPRITE, z: z0 + 21, off: -6.2, w: 1.9, h: 1.9, ay: 0.02, tex: tex.deer, flip: -1 })
    for (let k = 0; k < 3; k++) {
      add({ kind: SPRITE, z: z0 + R(6, 14), off: R(-4, 4), y: -0.2, w: R(1.6, 2.6), h: 12, ay: 0, tex: tex.shaft, tone: TONE_SHAFT, soft: 1, alpha: 0.2, rot: R(-0.12, 0.12), anim: ANIM_SHAFT, scaled: false })
    }
    for (let k = 0; k < 5; k++) add({ kind: SKY, z: 0, off: R(-0.6, 0.6), y: R(0.2, 0.42), w: R(0.016, 0.026), h: 0, tex: tex.birdUp, anim: ANIM_BIRD, seed: 0 + r() * 0.5 })
  }

  // ---- 1: campfire circle ----
  {
    const z1 = at(1)
    const fz = z1 + FIRE.d
    add({ kind: SPRITE, z: fz + 0.3, off: FIRE.off, y: -0.1, w: 15, h: 4.2, ay: 0.5, tex: tex.glow, tone: TONE_GLOW, soft: 1, alpha: 0.75, anim: ANIM_FLICKER })
    add({ kind: SPRITE, z: fz, off: FIRE.off, y: 0, w: 2.7, h: 1.35, ay: 0.12, tex: tex.firepit, tone: TONE_CUSTOM, col: [hex('#4c3a33'), hex('#170f10'), hex('#f6a84a')] })
    for (let k = 0; k < 3; k++) {
      add({ kind: SPRITE, z: fz - 0.02, off: FIRE.off, y: 0.32, w: 1.55, h: 2.3, ay: 0.02, tex: tex[('flame' + k) as TexName], tone: TONE_CUSTOM, col: [hex('#f28b2d'), hex('#c5402a'), hex('#fbe08a')], anim: ANIM_FLAME + k })
    }
    const wood = [hex('#5d3625'), hex('#1e1110'), hex('#e0904c')]
    add({ kind: SPRITE, z: z1 + 8.4, off: 1.0, w: 3.2, h: 1.2, ay: 0.02, tex: tex.bench, tone: TONE_CUSTOM, col: wood })
    add({ kind: SPRITE, z: z1 + 12.3, off: 6.9, w: 3.0, h: 1.12, ay: 0.02, tex: tex.bench, tone: TONE_CUSTOM, col: wood, flip: -1 })
    add({ kind: SPRITE, z: z1 + 13.4, off: 2.4, w: 2.7, h: 1.0, ay: 0.02, tex: tex.bench, tone: TONE_CUSTOM, col: wood })
    add({ kind: SPRITE, z: z1 + 8.35, off: 2.25, y: 0.05, w: 0.66, h: 1.32, ay: 0.02, tex: tex.guitar, tone: TONE_CUSTOM, col: [hex('#c9853f'), hex('#2a1612'), hex('#f6dc9a')], rot: -0.2 })
  }

  // ---- 2: the old grove ----
  {
    const z2 = at(2)
    add({ kind: SPRITE, z: z2 + 11.5, off: -6.4, w: 9.5, h: 2.4, ay: 0.03, tex: tex.log, tone: TONE_TRUNK })
    add({ kind: SPRITE, z: z2 + 15.5, off: 7.5, w: 8, h: 2.0, ay: 0.03, tex: tex.log, tone: TONE_TRUNK, flip: -1 })
    const caps = [hex('#ee5d86'), hex('#431a52'), hex('#f8f1da')]
    const caps2 = [hex('#f2a13c'), hex('#4a1f3c'), hex('#f8f1da')]
    for (let k = 0; k < 14; k++) {
      const side = k % 2 ? 1 : -1
      const s = R(0.7, 1.5)
      add({
        kind: SPRITE,
        z: z2 + R(2.6, 14),
        off: side * R(1.3, 5.4),
        w: s,
        h: s,
        ay: 0.03,
        tex: tex[k % 3 ? 'shroom0' : 'shroom1'],
        tone: TONE_CUSTOM,
        col: k % 4 === 0 ? caps2 : caps,
        anim: ANIM_PULSE,
      })
    }
    // a banana slug, taking the whole night to cross the trail
    add({ kind: SPRITE, z: z2 + 5.6, off: 0, w: 0.42, h: 0.16, ay: 0.08, tex: tex.slug, tone: TONE_CUSTOM, col: [hex('#eccb3f'), hex('#8a6a16'), hex('#fff6c2')], anim: ANIM_CRAWL, scaled: false })
    add({ kind: SPRITE, z: z2 + 4.3, frame: { side: -1, d: 4.3, place: 2, inward: 0.3 }, y: 2.56, w: 0.46, h: 0.69, shrink: 0.6, ay: 0.03, tex: tex.owl, tone: TONE_CUSTOM, col: [hex('#5a4a7a'), hex('#231a3c'), hex('#f6e9a8')] })
    for (let k = 0; k < 5; k++) {
      add({ kind: SPRITE, z: z2 + R(5, 15), off: R(-5, 3), y: -0.2, w: R(1.2, 2.4), h: 13, ay: 0, tex: tex.shaft, tone: TONE_SHAFT, soft: 1, alpha: 0.2, rot: R(0.16, 0.3), anim: ANIM_SHAFT, scaled: false })
    }
  }

  // ---- 3: base camp ----
  {
    const z3 = at(3)
    add({ kind: SPRITE, z: z3 + 13.5, off: -6.0, w: 5.6, h: 3.73, ay: 0.03, tex: tex.tent, tone: TONE_CUSTOM, col: [hex('#cdb686'), hex('#3b2a1c'), hex('#f8eecb')] })
    const wood = [hex('#6b3d28'), hex('#2a1610'), hex('#e5a86a')]
    add({ kind: SPRITE, z: z3 + 9.2, off: -3.1, w: 3.0, h: 1.12, ay: 0.02, tex: tex.bench, tone: TONE_CUSTOM, col: wood })
    add({ kind: SPRITE, z: z3 + 9.15, off: -2.3, y: 0.05, w: 0.66, h: 1.32, ay: 0.02, tex: tex.guitar, tone: TONE_CUSTOM, col: [hex('#c9853f'), hex('#2a1612'), hex('#fbe7b0')], rot: -0.2 })
    add({ kind: SPRITE, z: z3 + 12.5, off: 5.3, y: 0.02, w: 4.2, h: 0.79, ay: 0.05, tex: tex.canoe, tone: TONE_CUSTOM, col: [hex('#a43a26'), hex('#4d1710'), hex('#f0cd88')], rot: 0.03 })
    for (let k = 0; k < 18; k++) {
      const far = k % 2 === 0
      const s = R(1.2, 2.0)
      add({ kind: SPRITE, z: z3 + R(4.5, 30), off: far ? R(9.6, 11.2) : R(4.2, 5.0), w: s, h: s, ay: 0.03, tex: tex.reeds, sway: 0.03 })
    }
    for (let k = 0; k < 12; k++) {
      const w = R(13, 19)
      add({ kind: SPRITE, z: z3 + R(24, 46), off: (k % 2 ? 1 : -1) * R(6, 24), w, h: w / 8, ay: 0.03, tex: tex[k % 2 ? 'stand0' : 'stand1'], vanish: 9 })
    }
    for (let k = 0; k < 9; k++) {
      const h = R(4.5, 8)
      add({ kind: SPRITE, z: z3 + R(15, 32), off: -R(6, 16), w: h / 2, h, ay: 0.01, tex: tex[k % 2 ? 'fir0' : 'fir1'], sway: 0.006 })
    }
    for (let k = 0; k < 6; k++) {
      add({ kind: SPRITE, z: z3 + R(5, 16), off: R(-6, 5), y: -0.2, w: R(1.4, 2.8), h: 13, ay: 0, tex: tex.shaft, tone: TONE_SHAFT, soft: 1, alpha: 0.22, rot: -R(0.18, 0.34), anim: ANIM_SHAFT, scaled: false })
    }
    for (let k = 0; k < 4; k++) add({ kind: SKY, z: 3, off: R(-0.7, 0.2), y: R(0.22, 0.4), w: R(0.016, 0.024), h: 0, tex: tex.birdUp, anim: ANIM_BIRD, seed: 3 + r() * 0.5 })
  }

  // ---- 4: the lookout ----
  {
    const z4 = at(4)
    const stone = [hex('#748a80'), hex('#3b4f4a'), hex('#bccbbd')]
    for (let k = 0; k < 8; k++) {
      const w = R(5.5, 8)
      add({ kind: SPRITE, z: z4 + R(3.2, 5.2), off: -10.5 + k * 3 + R(-0.8, 0.8), y: -0.3, w, h: w * R(0.17, 0.23), ay: 0.04, tex: tex[k % 2 ? 'rock0' : 'rock1'], tone: TONE_CUSTOM, col: stone, flip: k % 3 ? 1 : -1, scaled: false })
    }
    add({ kind: SPRITE, z: z4 + 15.2, off: 6.4, y: -0.3, w: 12, h: 3.0, ay: 0.04, tex: tex.rock0, tone: TONE_CUSTOM, col: stone, far: 1.4 })
    add({ kind: SPRITE, z: z4 + 15.0, off: 6.4, y: 1.9, w: 3.9, h: 7.8, ay: 0.01, tex: tex.tower, tone: TONE_CUSTOM, col: [hex('#6a3a25'), hex('#2a160f'), hex('#f6e9bd')], far: 1.4 })
    add({ kind: SPRITE, z: z4 + 11, off: -7.5, y: -0.3, w: 8, h: 2.1, ay: 0.04, tex: tex.rock1, tone: TONE_CUSTOM, col: stone })
    add({ kind: SPRITE, z: z4 + 10.8, off: -7.0, y: 1.3, w: 2.1, h: 4.2, ay: 0.02, tex: tex.snag, tone: TONE_CUSTOM, col: [hex('#d5d8c8'), hex('#6f7f78'), hex('#ffffff')] })
    for (let k = 0; k < 9; k++) {
      const h = R(3.2, 6)
      const side = k % 2 ? 1 : -1
      const off = side * R(9, 19)
      const z = z4 + R(9, 28)
      if (isClear(z, off)) continue
      add({ kind: SPRITE, z, off, w: h / 2, h, ay: 0.01, tex: tex[k % 2 ? 'fir0' : 'fir1'], rot: R(-0.08, 0.02), sway: 0.012 })
    }
    for (let k = 0; k < 4; k++) add({ kind: SKY, z: 4, off: R(-0.4, 0.8), y: R(0.16, 0.4), w: R(0.018, 0.03), h: 0, tex: tex.birdUp, anim: ANIM_BIRD, seed: 4 + r() * 0.5 })
  }

  items.sort((a, b) => b.z - a.z)

  // ---- fireflies, sparks, motes ----
  const pts: number[] = []
  const point = (x: number, y: number, z: number, kind: number, size: number) => pts.push(x, y, z, r(), kind, size)
  const z2 = at(2)
  for (let k = 0; k < (dense ? 90 : 55); k++) {
    const z = z2 + R(2, 26)
    point(pathX(z) + R(-9, 9), R(0.3, 3.4), z, 0, R(0.045, 0.075))
  }
  const z1 = at(1)
  for (let k = 0; k < 24; k++) {
    const z = z1 + R(12, 26)
    point(pathX(z) + R(-10, 6), R(0.3, 2.6), z, 0, R(0.04, 0.06))
  }
  for (const i of [0, 3, 4]) {
    for (let k = 0; k < (dense ? 46 : 28); k++) {
      const z = at(i) + R(2.5, 20)
      point(pathX(z) + R(-8, 8), R(0.4, 5.5), z, 2, R(0.022, 0.04))
    }
  }
  const sparks: number[] = []
  for (let k = 0; k < 46; k++) sparks.push(R(-0.35, 0.35), R(0.4, 1.4), R(-0.2, 0.2), r(), 1, R(0.03, 0.055))

  return { items, pts, sparks }
}

/* ------------------------------ GL helpers ------------------------------ */

type GL = WebGL2RenderingContext
interface Prog {
  p: WebGLProgram
  u: Record<string, WebGLUniformLocation | null>
}

function program(gl: GL, vs: string, fs: string, uniforms: string[], attribs: string[]): Prog | null {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[world] shader', gl.getShaderInfoLog(s))
      return null
    }
    return s
  }
  const v = sh(gl.VERTEX_SHADER, vs)
  const f = sh(gl.FRAGMENT_SHADER, fs)
  if (!v || !f) return null
  const p = gl.createProgram()!
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('[world] link', gl.getProgramInfoLog(p))
    return null
  }
  const u: Prog['u'] = {}
  for (const name of uniforms) u[name] = gl.getUniformLocation(p, name)
  return { p, u }
}

/* -------------------------------- engine -------------------------------- */

export interface WorldOptions {
  place: number
  reducedMotion: boolean
  onReady?: () => void
}

export interface World {
  setPlace: (index: number, immediate?: boolean) => void
  /** Dev: park the camera at a fractional place. */
  debugAt: (t: number) => void
  destroy: () => void
}

export function createWorld(canvas: HTMLCanvasElement, opts: WorldOptions): World | null {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false }) as GL | null
  if (!gl) return null

  const common = ['u_res', 'u_vh']
  const backdrop = program(
    gl,
    GLSL.FULLSCREEN_VERT,
    GLSL.BACKDROP_FRAG,
    [...common, 'u_t', 'u_hy', 'u_hy0', 'u_cam', 'u_sky', 'u_bands', 'u_sun', 'u_fx', 'u_sunCol', 'u_ring1', 'u_ring2', 'u_cloud', 'u_ridge', 'u_rBase', 'u_rAmp', 'u_rSerr', 'u_seed', 'u_blend', 'u_mist', 'u_mistAmt', 'u_ground', 'u_path', 'u_dapple', 'u_water', 'u_gfx', 'u_pathK', 'u_audio'],
    ['a_pos'],
  )
  const trunkP = program(gl, GLSL.TRUNK_VERT, GLSL.TRUNK_FRAG, [...common, 'u_rect', 'u_dim', 'u_c0', 'u_c1', 'u_c2', 'u_alpha', 'u_seed', 'u_light', 'u_px'], ['a_pos'])
  const spriteP = program(gl, GLSL.SPRITE_VERT, GLSL.SPRITE_FRAG, [...common, 'u_rect', 'u_anchor', 'u_rot', 'u_flip', 'u_tex', 'u_c0', 'u_c1', 'u_c2', 'u_alpha', 'u_soft'], ['a_pos'])
  const pointP = program(gl, GLSL.POINT_VERT, GLSL.POINT_FRAG, [...common, 'u_t', 'u_hy', 'u_cam', 'u_amt', 'u_range', 'u_audio', 'u_col'], ['a_p', 'a_k'])
  const grainP = program(gl, GLSL.FULLSCREEN_VERT, GLSL.GRAIN_FRAG, ['u_vh', 'u_paper'], ['a_pos'])
  if (!backdrop || !trunkP || !spriteP || !pointP || !grainP) return null

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)

  const coarse = window.matchMedia('(pointer: coarse)').matches
  const small = coarse || window.innerWidth < 760
  const texScale = small ? 0.5 : 1

  // ---- state ----
  let destroyed = false
  let ready = false
  let cur = opts.place
  let from = cur
  let to = cur
  let travelStart = 0
  let travelDur = 0
  let intro = opts.reducedMotion ? 1 : 0
  let introStart = 0
  let aspect = 1.6
  let vhPx = 800
  let scale = 1
  let cssW = 0
  let cssH = 0
  let swayX = 0
  let swayY = 0
  let targetSwayX = 0
  let targetSwayY = 0
  let lastPointer = -1e9
  let lastZ = cur * SPACING
  let speed = 0
  let raf = 0
  let lastFrame = 0
  let prevNow = 0
  let time = opts.reducedMotion ? 20 : 0
  let slow = 0
  let frames = 0
  let lastSwayCss = 1e9
  let swayCount = 0
  const swayTargets = document.getElementsByClassName('world-sway')
  let audioSm = 0
  /** Extra distance walked by scrolling past the first screen. */
  let stroll = 0
  let strollTarget = 0
  const scratch = {} as Mixed

  const textures: WebGLTexture[] = []
  const texIndex = {} as Record<TexName, number>
  let scene: ReturnType<typeof buildScene> | null = null
  let pointBuf: WebGLBuffer | null = null
  let sparkBuf: WebGLBuffer | null = null
  let pointCount = 0
  let sparkCount = 0

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    // ignore the small height changes of mobile URL bars sliding away
    if (cssW && Math.abs(rect.width - cssW) < 2 && Math.abs(rect.height - cssH) < 140) return
    cssW = rect.width
    cssH = rect.height
    applySize()
  }

  const applySize = () => {
    const budget = small ? 1.7e6 : 3.4e6
    let s = Math.min(window.devicePixelRatio || 1, small ? 2 : 1.5) * scaleTrim
    while (cssW * cssH * s * s > budget && s > 0.5) s *= 0.94
    scale = s
    canvas.width = Math.max(2, Math.round(cssW * s))
    canvas.height = Math.max(2, Math.round(cssH * s))
    vhPx = canvas.height / (1 + LOCK)
    aspect = canvas.width / vhPx
    layout()
  }
  let scaleTrim = 1

  const layout = () => {
    if (!scene) return
    const k = clamp(aspect / 1.6, 0.5, 1.15)
    const inset = clamp(0.115 * aspect, 0.05, 0.19)
    const girth = clamp(aspect / 1.2, 0.58, 1)
    const leaf = clamp(aspect / 1.15, 0.5, 1)
    for (const it of scene.items) {
      if (it.shrink) {
        const sc = lerp(1, leaf, it.shrink)
        it.w = it.w0 * sc
        it.h = it.h0 * sc
      }
      if (it.kind === SKY || it.attach) continue
      if (it.kind === TRUNK) it.r = it.r0 * (it.frame ? girth : lerp(girth, 1, 0.4))
      if (it.frame) {
        const f = it.frame
        const edge = (aspect / 2 - inset) * f.d
        it.x = pathX(f.place * SPACING) + f.side * (it.kind === TRUNK ? edge + it.r : edge - f.inward * girth)
      } else {
        it.x = pathX(it.z) + it.off * (it.scaled ? k : 1)
      }
    }
    for (const it of scene.items) {
      if (it.attach) it.x = it.attach.x + it.off * it.attach.r * 0.72
    }
  }

  // ---- drawing ----
  const c0 = new Float32Array(3)
  const c1 = new Float32Array(3)
  const c2 = new Float32Array(3)
  const mix3 = (out: Float32Array, a: RGB, b: RGB, t: number) => {
    out[0] = a[0] + (b[0] - a[0]) * t
    out[1] = a[1] + (b[1] - a[1]) * t
    out[2] = a[2] + (b[2] - a[2]) * t
  }
  const flat = (cols: RGB[]) => new Float32Array(cols.flat())

  const bindQuad = () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.disableVertexAttribArray(1)
  }

  const draw = () => {
    if (!scene) return
    const camT = cur
    const introEase = 1 - Math.pow(1 - intro, 3)
    const camZ = camT * SPACING - (1 - introEase) * 9 + stroll
    const bob = Math.sin(camZ * 1.5) * 0.045 * clamp(speed / 28)
    const camX = pathX(camZ) + swayX
    const camY = CAM_H + bob
    const hy = HY0 + swayY
    const pt = paintAt(camT, scratch)
    const i0 = Math.min(PLACES.length - 2, Math.max(0, Math.floor(camT)))
    const f = clamp(camT - i0)
    const blend = f * f * (3 - 2 * f)
    const k = clamp(aspect / 1.6, 0.5, 1.15)
    // the level goes stale when the player stops reporting (paused, offscreen)
    const heard = performance.now() - worldInput.audioAt < 300 ? worldInput.audio : 0
    audioSm += (heard - audioSm) * 0.18
    const audio = audioSm
    const half = aspect / 2
    // tall screens get their own sun placement
    const tall = clamp((1.15 - aspect) / 0.45)
    const sunXp = lerp(pt.sunX, pt.sunTall[0], tall) * half * 0.88
    const sunY = lerp(pt.sunY, pt.sunTall[1], tall)
    const sunR = lerp(pt.sunR, pt.sunTall[2], tall)
    const lightXp = lerp(pt.lightX, pt.sunTall[0], tall) * half * 0.88

    gl.viewport(0, 0, canvas.width, canvas.height)

    // --- backdrop ---
    gl.disable(gl.BLEND)
    gl.useProgram(backdrop.p)
    bindQuad()
    let u = backdrop.u
    gl.uniform2f(u.u_res, canvas.width, canvas.height)
    gl.uniform1f(u.u_vh, vhPx)
    gl.uniform1f(u.u_t, time)
    gl.uniform1f(u.u_hy, hy)
    gl.uniform1f(u.u_hy0, HY0)
    gl.uniform3f(u.u_cam, camX, camY, camZ)
    gl.uniform3fv(u.u_sky, flat(pt.sky))
    gl.uniform3f(u.u_bands, pt.bands[0], pt.bands[1], pt.bands[2])
    gl.uniform4f(u.u_sun, sunXp, sunY, sunR, pt.rays)
    gl.uniform4f(u.u_fx, pt.rings, pt.stars, pt.moon, pt.clouds)
    gl.uniform3fv(u.u_sunCol, pt.sun)
    gl.uniform3fv(u.u_ring1, pt.ring1)
    gl.uniform3fv(u.u_ring2, pt.ring2)
    gl.uniform3fv(u.u_cloud, pt.cloud)
    gl.uniform3fv(u.u_ridge, flat(pt.ridge))
    gl.uniform4fv(u.u_rBase, pt.ridgeBase)
    gl.uniform4fv(u.u_rAmp, pt.ridgeAmp)
    gl.uniform4fv(u.u_rSerr, pt.ridgeSerr)
    gl.uniform2f(u.u_seed, paintOf(i0).seed, paintOf(i0 + 1).seed)
    gl.uniform1f(u.u_blend, blend)
    gl.uniform3fv(u.u_mist, pt.mist)
    gl.uniform1f(u.u_mistAmt, pt.mistAmt)
    gl.uniform3fv(u.u_ground, flat(pt.ground))
    gl.uniform3fv(u.u_path, pt.path)
    gl.uniform3fv(u.u_dapple, pt.dapple)
    gl.uniform3fv(u.u_water, pt.water)
    gl.uniform4f(u.u_gfx, pt.pathAmt, pt.riverAmt, pt.fogSea, pt.dappleAmt)
    gl.uniform1f(u.u_pathK, k)
    gl.uniform1f(u.u_audio, audio)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // --- the forest, far to near ---
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    let bound = -1 // 0 trunk, 1 sprite
    let boundTex = -1
    const flameFrame = [0, 1, 2, 0, 2, 1][Math.floor(time * 9) % 6]
    const useTrunk = () => {
      if (bound === 0) return
      bound = 0
      gl.useProgram(trunkP.p)
      gl.uniform2f(trunkP.u.u_res, canvas.width, canvas.height)
      gl.uniform1f(trunkP.u.u_vh, vhPx)
    }
    const useSprite = () => {
      if (bound === 1) return
      bound = 1
      gl.useProgram(spriteP.p)
      gl.uniform2f(spriteP.u.u_res, canvas.width, canvas.height)
      gl.uniform1f(spriteP.u.u_vh, vhPx)
      gl.uniform1i(spriteP.u.u_tex, 0)
      boundTex = -1
    }
    const day = 1 - pt.stars

    const items = scene.items
    for (let n = 0; n < items.length; n++) {
      const it = items[n]
      if (it.kind === SKY) continue
      const dz = it.z - camZ
      const fogEnd = pt.fogEnd * it.far
      if (dz < NEAR || dz > fogEnd) continue
      let sx = (it.x - camX) / dz
      if (it.anim === ANIM_CRAWL) sx += ((((time * 0.012 + it.phase) % 2.4) + 2.4) % 2.4 - 1.2) / dz
      const fog = Math.pow(smooth(pt.fogStart, fogEnd, dz), 0.85)
      let alpha = it.alpha * (1 - smooth(fogEnd * 0.8, fogEnd, dz)) * smooth(NEAR, NEAR + 0.85, dz)
      if (it.vanish) alpha *= smooth(it.vanish, it.vanish * 1.7, dz)
      if (alpha < 0.01) continue

      if (it.kind === TRUNK) {
        const halfW = (2.0 * it.r) / dz
        if (sx + halfW < -half || sx - halfW > half) continue
        useTrunk()
        mix3(c0, pt.trunk[0], pt.trunkFar[0], fog)
        mix3(c1, pt.trunk[1], pt.trunkFar[1], fog)
        mix3(c2, pt.trunk[2], pt.trunkFar[2], fog)
        u = trunkP.u
        gl.uniform4f(u.u_rect, sx, hy + (-0.5 * it.r - camY) / dz, halfW, hy + (TRUNK_TOP - camY) / dz)
        gl.uniform3f(u.u_dim, 2.0, -0.5, TRUNK_TOP / it.r)
        gl.uniform3fv(u.u_c0, c0)
        gl.uniform3fv(u.u_c1, c1)
        gl.uniform3fv(u.u_c2, c2)
        gl.uniform1f(u.u_alpha, alpha)
        gl.uniform1f(u.u_seed, it.seed)
        gl.uniform1f(u.u_light, lightXp >= sx ? 1 : -1)
        gl.uniform1f(u.u_px, (it.r / dz) * vhPx)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        continue
      }

      let w = it.w / dz
      let h = it.h / dz
      if (sx + w * 1.2 < -half || sx - w * 1.2 > half) continue
      const anim = it.anim
      if (anim >= ANIM_FLAME && anim < ANIM_FLAME + 3 && anim - ANIM_FLAME !== flameFrame) continue
      if (it.tone === TONE_TRUNK) {
        mix3(c0, pt.trunk[0], pt.trunkFar[0], fog)
        mix3(c1, pt.trunk[1], pt.trunkFar[1], fog)
        mix3(c2, pt.trunk[2], pt.trunkFar[2], fog)
      } else if (it.tone === TONE_LEAF) {
        mix3(c0, pt.leaf[0], pt.leafFar[0], fog)
        mix3(c1, pt.leaf[1], pt.leafFar[1], fog)
        mix3(c2, pt.leaf[2], pt.leafFar[2], fog)
      } else if (it.tone === TONE_CUSTOM) {
        const col = it.col!
        const haze = fog * 0.75
        mix3(c0, col[0], pt.leafFar[0], haze)
        mix3(c1, col[1], pt.leafFar[1], haze)
        mix3(c2, col[2], pt.leafFar[2], haze)
      } else if (it.tone === TONE_SHAFT) {
        c0.set(pt.shaft)
        alpha *= pt.shafts * (0.72 + 0.28 * Math.sin(time * 0.31 + it.phase))
      } else {
        c0.set(pt.glow)
        alpha *= pt.sparks
      }
      if (anim === ANIM_FLICKER) alpha *= 0.82 + 0.18 * Math.sin(time * 11) * Math.sin(time * 6.7 + 1)
      if (anim === ANIM_PULSE) {
        const s = 1 + audio * 0.3 * (0.5 + 0.5 * Math.sin(time * 5 + it.phase))
        w *= s
        h *= s
      }
      if (alpha < 0.01) continue
      useSprite()
      if (boundTex !== it.tex) {
        boundTex = it.tex
        gl.bindTexture(gl.TEXTURE_2D, textures[it.tex])
      }
      u = spriteP.u
      gl.uniform4f(u.u_rect, sx, hy + (it.y - camY) / dz, w, h)
      gl.uniform2f(u.u_anchor, it.ax, it.ay)
      gl.uniform1f(u.u_rot, it.rot + it.sway * Math.sin(time * 0.7 + it.phase))
      gl.uniform1f(u.u_flip, it.flip)
      gl.uniform3fv(u.u_c0, c0)
      gl.uniform3fv(u.u_c1, c1)
      gl.uniform3fv(u.u_c2, c2)
      gl.uniform1f(u.u_alpha, alpha)
      gl.uniform1f(u.u_soft, it.soft)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    // --- birds, pinned to the sky ---
    if (day > 0.05) {
      useSprite()
      const up = Math.floor(time * 3.2) % 2 === 0
      const birdTex = up ? texIndex.birdUp : texIndex.birdDown
      gl.bindTexture(gl.TEXTURE_2D, textures[birdTex])
      boundTex = birdTex
      u = spriteP.u
      c0.set(pt.leaf[1])
      gl.uniform3fv(u.u_c0, c0)
      gl.uniform3fv(u.u_c1, c0)
      gl.uniform3fv(u.u_c2, c0)
      gl.uniform2f(u.u_anchor, 0.5, 0.5)
      gl.uniform1f(u.u_rot, 0)
      gl.uniform1f(u.u_flip, 1)
      gl.uniform1f(u.u_soft, 0)
      for (const it of items) {
        if (it.kind !== SKY) continue
        const near = 1 - clamp(Math.abs(camT - it.z) * 2.2)
        if (near <= 0.01) continue
        const span = aspect + 0.3
        const x = ((((it.off * half + time * 0.006 * (0.6 + it.seed)) % span) + span) % span) - span / 2
        const y = hy + it.y + Math.sin(time * 0.4 + it.phase) * 0.008
        gl.uniform4f(u.u_rect, x, y, it.w, it.w * 0.5)
        gl.uniform1f(u.u_alpha, near * day)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
    }

    // --- fireflies, sparks, motes ---
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    gl.useProgram(pointP.p)
    u = pointP.u
    gl.uniform2f(u.u_res, canvas.width, canvas.height)
    gl.uniform1f(u.u_vh, vhPx)
    gl.uniform1f(u.u_t, time)
    gl.uniform1f(u.u_hy, hy)
    gl.uniform3f(u.u_amt, pt.fireflies, pt.sparks, pt.motes)
    gl.uniform2f(u.u_range, NEAR, pt.fogEnd)
    gl.uniform1f(u.u_audio, audio)
    gl.uniform3fv(u.u_col, pt.glow)
    const drawPoints = (buf: WebGLBuffer | null, count: number, ox: number, oz: number) => {
      if (!buf || !count) return
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.enableVertexAttribArray(0)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0)
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16)
      gl.uniform3f(u.u_cam, camX - ox, camY, camZ - oz)
      gl.drawArrays(gl.POINTS, 0, count)
    }
    drawPoints(pointBuf, pointCount, 0, 0)
    if (pt.sparks > 0.01) {
      const fz = SPACING + FIRE.d
      drawPoints(sparkBuf, sparkCount, pathX(fz) + FIRE.off * k, fz)
    }

    // --- paper ---
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(grainP.p)
    bindQuad()
    gl.uniform1f(grainP.u.u_vh, vhPx)
    gl.uniform3f(grainP.u.u_paper, 0.95, 0.92, 0.84)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // let things standing in the scene (the signpost, the notice) lean with
    // the camera; only they carry the variable, so nothing else restyles
    const css = -swayX * (vhPx / scale)
    if (Math.abs(css - lastSwayCss) > 0.05 || swayTargets.length !== swayCount) {
      lastSwayCss = css
      swayCount = swayTargets.length
      for (let i = 0; i < swayTargets.length; i++) (swayTargets[i] as HTMLElement).style.setProperty('--world-sway', css.toFixed(2) + 'px')
    }
  }

  // ---- the loop ----
  const frame = (now: number) => {
    raf = 0
    if (destroyed) return
    const dt = Math.min(0.1, (now - prevNow) / 1000)
    prevNow = now
    const travelling = travelDur > 0
    // past the first screen the canvas holds still on the page, and reading
    // on down the page walks the camera slowly up the trail
    strollTarget = travelling ? 0 : Math.min(7, Math.max(0, window.scrollY / Math.max(1, window.innerHeight) - LOCK) * 0.75)
    const active = travelling || intro < 1 || now - lastPointer < 1600 || Math.abs(targetSwayX - swayX) > 0.002 || Math.abs(strollTarget - stroll) > 0.002
    // a scene nobody is steering ticks along at about 24 frames a second
    if (!active && now - lastFrame < 38) {
      schedule()
      return
    }
    const step = Math.min(0.1, (now - lastFrame) / 1000)
    lastFrame = now
    time += step

    if (intro < 1) {
      if (!introStart) introStart = now
      intro = clamp((now - introStart) / 2600)
    }
    if (travelling) {
      const uT = clamp((now - travelStart) / travelDur)
      const e = uT < 0.5 ? 4 * uT * uT * uT : 1 - Math.pow(-2 * uT + 2, 3) / 2
      cur = from + (to - from) * e
      if (uT >= 1) {
        cur = to
        travelDur = 0
      }
    }
    if (coarse) {
      targetSwayX = Math.sin(time * 0.17) * 0.22
      targetSwayY = 0
    }
    const ease = 1 - Math.exp(-step * 2.6)
    swayX += (targetSwayX - swayX) * ease
    swayY += (targetSwayY - swayY) * ease
    stroll += (strollTarget - stroll) * (1 - Math.exp(-step * 4.5))
    const z = cur * SPACING + stroll
    speed = lerp(speed, Math.abs(z - lastZ) / Math.max(step, 0.001), 0.3)
    lastZ = z

    const t0 = performance.now()
    draw()
    // if the GPU can't keep up, trade resolution for smoothness
    if (active) {
      const cost = performance.now() - t0
      frames++
      if (dt > 0.034 || cost > 14) slow++
      if (frames >= 50) {
        if (slow > 30 && scaleTrim > 0.55) {
          scaleTrim *= 0.82
          applySize()
          // resizing clears the canvas — repaint before the browser shows it
          draw()
        }
        frames = 0
        slow = 0
      }
    }
    schedule()
  }

  const schedule = () => {
    if (raf || destroyed || !ready || opts.reducedMotion || document.hidden || worldInput.paused) return
    raf = requestAnimationFrame(frame)
  }

  const still = () => {
    if (ready && opts.reducedMotion && !destroyed) draw()
  }

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    targetSwayX = (e.clientX / window.innerWidth - 0.5) * 1.0
    targetSwayY = (e.clientY / window.innerHeight - 0.5) * -0.012
    lastPointer = performance.now()
  }
  const onVisibility = () => {
    if (!document.hidden) {
      prevNow = lastFrame = performance.now()
      schedule()
    }
  }
  const onResize = () => {
    const w = canvas.width
    const h = canvas.height
    resize()
    // resizing clears the canvas — repaint before the browser shows it
    if (ready && !destroyed && (canvas.width !== w || canvas.height !== h || opts.reducedMotion)) draw()
  }
  const onLost = (e: Event) => {
    e.preventDefault()
    destroyed = true
    cancelAnimationFrame(raf)
    canvas.dataset.lost = ''
  }
  const wake = window.setInterval(schedule, 400)

  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.addEventListener('webglcontextlost', onLost)

  // ---- paint the cut-outs a few at a time, then open the curtain ----
  ;(async () => {
    let t0 = performance.now()
    for (let i = 0; i < SHEETS.length; i++) {
      if (destroyed) return
      const sheet = SHEETS[i]
      const art = paintSheet(sheet, texScale, 0xa11ce + i * 7919)
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, art)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      textures.push(tex)
      texIndex[sheet.name] = i
      art.width = art.height = 0
      if (performance.now() - t0 > 10) {
        await new Promise((res) => setTimeout(res, 0))
        t0 = performance.now()
      }
    }
    if (destroyed) return
    scene = buildScene(texIndex, !small)
    pointBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(scene.pts), gl.STATIC_DRAW)
    pointCount = scene.pts.length / 6
    sparkBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(scene.sparks), gl.STATIC_DRAW)
    sparkCount = scene.sparks.length / 6
    resize()
    ready = true
    prevNow = lastFrame = performance.now()
    draw()
    opts.onReady?.()
    schedule()
  })()

  return {
    setPlace(index, immediate) {
      const target = clamp(index, 0, PLACES.length - 1)
      if (target === to && !immediate) return
      if (immediate || opts.reducedMotion || !ready) {
        cur = from = to = target
        travelDur = 0
        lastZ = cur * SPACING
        still()
      } else {
        from = cur
        to = target
        travelStart = performance.now()
        travelDur = 1900 + 480 * Math.min(3, Math.abs(target - cur))
        schedule()
      }
    },
    debugAt(t) {
      cur = from = to = t
      travelDur = 0
      intro = 1
      if (ready) draw()
    },
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      window.clearInterval(wake)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      for (const t of textures) gl.deleteTexture(t)
    },
  }
}
