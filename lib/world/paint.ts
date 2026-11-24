/*
  The cut-outs: every prop in the forest painted by hand in Canvas2D.

  Each painting uses three "inks" — pure red, green and blue — which the
  sprite shader swaps for real colours at draw time (so the same fern can be
  dusk-green at the trailhead and moonlit violet in the grove). By
  convention red is the base ink, green the shade and blue the light.
  Shapes are flat with hard edges, like stencils for a screenprint.
*/

type Ctx = CanvasRenderingContext2D

const BASE = '#ff0000'
const SHADE = '#00ff00'
const LIGHT = '#0000ff'

export type Rand = () => number

export function mulberry(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const range = (r: Rand, a: number, b: number) => a + (b - a) * r()

/* ------------------------------ helpers ------------------------------ */

/** A serrated blade along a curved spine: fern fronds, redwood sprays, reeds. */
function frond(
  ctx: Ctx,
  x0: number,
  y0: number,
  angle: number,
  length: number,
  curl: number,
  width: number,
  teeth: number,
  ink: string,
  sweep = 0.035,
) {
  const left: [number, number][] = []
  const right: [number, number][] = []
  const n = teeth * 2
  const spine = (t: number): [number, number, number] => {
    // integrate a constant-curvature arc
    const a = angle + curl * t
    const steps = 12
    let x = x0
    let y = y0
    for (let i = 0; i < steps; i++) {
      const tt = (t * (i + 0.5)) / steps
      const aa = angle + curl * tt
      x += (Math.cos(aa) * length * t) / steps
      y += (Math.sin(aa) * length * t) / steps
    }
    return [x, y, a]
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const tip = i % 2 === 1
    const [x, y, a] = spine(Math.max(0, t - (tip ? sweep : 0)))
    const prof = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.85)
    const w = width * prof * (tip ? 1 : 0.34) + width * 0.05 * (1 - t)
    const nx = -Math.sin(a)
    const ny = Math.cos(a)
    left.push([x + nx * w, y + ny * w])
    right.push([x - nx * w, y - ny * w])
  }
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.moveTo(left[0][0], left[0][1])
  for (const p of left) ctx.lineTo(p[0], p[1])
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1])
  ctx.closePath()
  ctx.fill()
}

function blob(ctx: Ctx, pts: [number, number][], ink: string) {
  ctx.fillStyle = ink
  ctx.beginPath()
  const n = pts.length
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const m0 = mid(pts[n - 1], pts[0])
  ctx.moveTo(m0[0], m0[1])
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n])
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1])
  }
  ctx.closePath()
  ctx.fill()
}

function poly(ctx: Ctx, pts: number[], ink: string) {
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
  ctx.closePath()
  ctx.fill()
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, ink: string, cap: CanvasLineCap = 'round') {
  ctx.strokeStyle = ink
  ctx.lineWidth = w
  ctx.lineCap = cap
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, ink: string, rot = 0) {
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  ctx.fill()
}

/* ------------------------------ foliage ------------------------------ */

/** A drooping redwood bough: one long stem feathered with flat sprays. The
    stem starts at the left edge, mid-height. */
function bough(ctx: Ctx, w: number, h: number, r: Rand) {
  const L = w * 0.93
  const a0 = range(r, -0.22, -0.08)
  const curl = range(r, 0.34, 0.56)
  const pt = (t: number): [number, number, number] => {
    let x = w * 0.02
    let y = h * 0.47
    const steps = 24
    for (let i = 0; i < steps; i++) {
      const tt = (t * (i + 0.5)) / steps
      const a = a0 + curl * tt
      x += (Math.cos(a) * L * t) / steps
      y += (Math.sin(a) * L * t) / steps
    }
    return [x, y, a0 + curl * t]
  }
  const sprigs: { t: number; side: number; len: number }[] = []
  for (let t = 0.07; t < 0.97; t += range(r, 0.03, 0.05)) {
    sprigs.push({ t, side: sprigs.length % 2 ? 1 : -1, len: L * (0.33 - 0.2 * t) * range(r, 0.78, 1.15) })
  }
  // the underside first, in shade
  for (const s of sprigs) {
    if (s.side < 0) continue
    const [x, y, a] = pt(s.t)
    frond(ctx, x, y, a + range(r, 0.75, 1.05) - 0.4 * s.t, s.len * 0.92, range(r, -0.5, -0.2), s.len * 0.2, 9, r() < 0.55 ? SHADE : BASE)
  }
  // stem
  ctx.strokeStyle = SHADE
  ctx.lineCap = 'round'
  for (let i = 0; i < 40; i++) {
    const [x1, y1] = pt(i / 40)
    const [x2, y2] = pt((i + 1) / 40)
    ctx.lineWidth = h * 0.028 * (1 - (i / 40) * 0.8)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  // the top side, catching light here and there
  for (const s of sprigs) {
    if (s.side > 0) continue
    const [x, y, a] = pt(s.t)
    const ang = a - range(r, 0.7, 1.0) + 0.4 * s.t
    const cl = range(r, 0.2, 0.55)
    frond(ctx, x, y, ang, s.len, cl, s.len * 0.2, 9, BASE)
    if (r() < 0.5) frond(ctx, x, y, ang - 0.05, s.len * 0.82, cl, s.len * 0.09, 7, LIGHT)
  }
  const [tx, ty, ta] = pt(0.96)
  frond(ctx, tx, ty, ta, L * 0.16, 0.2, L * 0.03, 8, BASE)
}

/** A clump of sword fern, fronds arching out from the crown. */
function fern(ctx: Ctx, w: number, h: number, r: Rand) {
  const cx = w * 0.5
  const cy = h * 0.96
  const n = 9 + Math.floor(r() * 4)
  const fronds: { a: number; len: number; z: number }[] = []
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / n
    fronds.push({ a: (s - 0.5) * 2.5 + range(r, -0.12, 0.12), len: h * range(r, 0.5, 0.86), z: r() })
  }
  fronds.sort((p, q) => p.z - q.z)
  fronds.forEach((f, i) => {
    const dir = -Math.PI / 2 + f.a * 0.62
    const curl = f.a * range(r, 0.55, 0.95)
    const ink = i < n * 0.34 ? SHADE : i > n * 0.8 ? LIGHT : BASE
    frond(ctx, cx + f.a * w * 0.03, cy, dir, f.len * (1 - Math.abs(f.a) * 0.12), curl, f.len * 0.14, 13, ink, 0.05)
  })
}

/** A low hump of duff and sorrel with grass along its crest. */
function mound(ctx: Ctx, w: number, h: number, r: Rand) {
  const top = (x: number) => {
    const s = x / w
    return h - h * 0.78 * Math.pow(Math.sin(Math.PI * s), 0.55) * (0.82 + 0.18 * Math.sin(s * 9 + r() * 0.01))
  }
  const ph = r() * 10
  const crest = (x: number) => top(x) + Math.sin(x * 0.02 + ph) * h * 0.03
  ctx.fillStyle = BASE
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, crest(x))
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fill()
  // shaded belly
  ctx.fillStyle = SHADE
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, crest(x) + h * (0.32 + 0.1 * Math.sin(x * 0.011 + ph * 2)))
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fill()
  // grass blades
  for (let i = 0; i < 90; i++) {
    const x = range(r, w * 0.06, w * 0.94)
    const y = crest(x) + 4
    const len = h * range(r, 0.08, 0.26)
    const lean = range(r, -0.5, 0.5)
    frond(ctx, x, y, -Math.PI / 2 + lean, len, lean * 0.8, len * 0.09, 1, r() < 0.2 ? LIGHT : BASE, 0)
  }
  // sorrel: little three-leaf dots in the light
  for (let i = 0; i < 26; i++) {
    const x = range(r, w * 0.12, w * 0.88)
    const y = crest(x) + h * range(r, 0.06, 0.24)
    const s = h * range(r, 0.018, 0.034)
    for (let k = 0; k < 3; k++) ellipse(ctx, x + Math.cos(k * 2.09) * s, y + Math.sin(k * 2.09) * s * 0.6, s * 0.8, s * 0.5, LIGHT)
  }
}

function conifer(ctx: Ctx, x: number, base: number, height: number, ink: string, r: Rand, lean = 0) {
  const tiers = 5 + Math.floor(height / 60)
  const wMax = height * range(r, 0.15, 0.2)
  const pts: number[] = [x + lean * height, base - height]
  const rightSide: number[] = []
  for (let i = 1; i <= tiers; i++) {
    const t = i / tiers
    const y = base - height + height * t * 0.96
    const wOut = wMax * Math.pow(t, 0.8) * range(r, 0.85, 1.1)
    const wIn = wOut * 0.5
    const cxm = x + lean * height * (1 - t)
    pts.push(cxm - wOut, y, cxm - wIn, y - height * 0.012)
    rightSide.push(cxm + wOut, y, cxm + wIn, y - height * 0.012)
  }
  for (let i = rightSide.length - 4; i >= 0; i -= 4) pts.push(rightSide[i + 2], rightSide[i + 3], rightSide[i], rightSide[i + 1])
  poly(ctx, pts, ink)
  ctx.fillStyle = ink
  ctx.fillRect(x - height * 0.012, base - height * 0.06, height * 0.024, height * 0.06)
}

/** A far-off row of conifers, a few standing darker in front. */
function stand(ctx: Ctx, w: number, h: number, r: Rand) {
  let x = range(r, 6, 30)
  const back: [number, number][] = []
  const front: [number, number][] = []
  while (x < w - 10) {
    const big = r()
    const hh = h * (0.42 + 0.56 * Math.pow(big, 1.4))
    ;(r() < 0.3 ? front : back).push([x, hh])
    x += hh * range(r, 0.16, 0.34)
    if (r() < 0.1) x += range(r, 20, 90)
  }
  for (const [tx, th] of back) conifer(ctx, tx, h, th, BASE, r)
  for (const [tx, th] of front) conifer(ctx, tx, h, th * 0.8, SHADE, r)
}

/** One spire with its shaded side: mid-distance fir. */
function fir(ctx: Ctx, w: number, h: number, r: Rand) {
  const lean = range(r, -0.04, 0.04)
  conifer(ctx, w * 0.5, h * 0.99, h * 0.97, BASE, r, lean)
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = SHADE
  ctx.beginPath()
  ctx.moveTo(0, 0)
  for (let y = 0; y <= h; y += 16) ctx.lineTo(w * 0.46 + Math.sin(y * 0.09) * w * 0.05, y)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = LIGHT
  for (let i = 0; i < 9; i++) {
    const y = h * range(r, 0.2, 0.9)
    ctx.fillRect(w * 0.56 + (y / h) * w * 0.12, y, w * 0.2, h * 0.012)
  }
  ctx.restore()
}

/** A bare silver snag. */
function snag(ctx: Ctx, w: number, h: number, r: Rand) {
  poly(ctx, [w * 0.42, h, w * 0.46, h * 0.12, w * 0.5, h * 0.02, w * 0.54, h * 0.16, w * 0.6, h], BASE)
  poly(ctx, [w * 0.42, h, w * 0.46, h * 0.12, w * 0.49, h * 0.1, w * 0.49, h], SHADE)
  for (let i = 0; i < 7; i++) {
    const y = h * range(r, 0.18, 0.7)
    const dir = i % 2 ? 1 : -1
    const len = w * range(r, 0.12, 0.38)
    const x0 = w * 0.5
    const x1 = x0 + dir * len
    const y1 = y - len * range(r, 0.3, 0.8)
    poly(ctx, [x0, y - h * 0.012, x1, y1, x0, y + h * 0.014], BASE)
    if (r() < 0.6) poly(ctx, [x0 + dir * len * 0.55, y - len * 0.3, x0 + dir * len * 0.9, y - len * 0.2 + h * 0.03, x0 + dir * len * 0.6, y - len * 0.26], BASE)
  }
}

/* ------------------------------- light ------------------------------- */

function shaft(ctx: Ctx, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(255,0,0,0.95)')
  g.addColorStop(0.55, 'rgba(255,0,0,0.6)')
  g.addColorStop(1, 'rgba(255,0,0,0)')
  ctx.fillStyle = g
  // a few hard-edged slats rather than one soft beam
  ctx.fillRect(w * 0.1, 0, w * 0.34, h)
  ctx.fillRect(w * 0.52, 0, w * 0.12, h)
  ctx.fillRect(w * 0.72, 0, w * 0.2, h)
}

function glow(ctx: Ctx, w: number, h: number) {
  const steps: [number, number][] = [
    [1, 0.1],
    [0.74, 0.12],
    [0.5, 0.16],
    [0.28, 0.2],
  ]
  for (const [rad, a] of steps) {
    ctx.fillStyle = `rgba(255,0,0,${a})`
    ctx.beginPath()
    ctx.ellipse(w / 2, h / 2, (w / 2) * rad, (h / 2) * rad, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

/* ------------------------------ campfire ------------------------------ */

function firepit(ctx: Ctx, w: number, h: number, r: Rand) {
  const cx = w / 2
  const cy = h * 0.74
  // back stones
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI
    ellipse(ctx, cx + Math.cos(a) * w * 0.4, cy + Math.sin(a) * h * 0.2, w * range(r, 0.045, 0.06), h * range(r, 0.07, 0.09), SHADE)
  }
  // logs leaning together
  const logs: [number, number][] = [
    [-0.28, 0.08],
    [0.3, 0.1],
    [-0.12, -0.04],
    [0.14, -0.02],
  ]
  for (const [dx] of logs) {
    const x0 = cx + dx * w
    const x1 = cx - dx * w * 0.12
    const top = h * 0.2
    poly(ctx, [x0 - w * 0.035, cy, x0 + w * 0.035, cy, x1 + w * 0.022, top, x1 - w * 0.022, top], BASE)
    poly(ctx, [x0 - w * 0.035, cy, x0 - w * 0.008, cy, x1 - w * 0.004, top, x1 - w * 0.022, top], SHADE)
    ellipse(ctx, x0, cy, w * 0.035, h * 0.03, LIGHT)
  }
  // embers
  for (let i = 0; i < 10; i++) ellipse(ctx, cx + range(r, -0.2, 0.2) * w, cy + range(r, -0.03, 0.06) * h, w * 0.016, h * 0.018, LIGHT)
  // front stones
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI
    const big = range(r, 0.05, 0.068)
    const x = cx + Math.cos(a) * w * 0.42
    const y = cy + Math.sin(a) * h * 0.2
    ellipse(ctx, x, y, w * big, h * (big + 0.045), BASE)
    ellipse(ctx, x - w * 0.012, y + h * 0.03, w * big * 0.8, h * 0.05, SHADE)
  }
}

function flame(ctx: Ctx, w: number, h: number, r: Rand, k: number) {
  const tongue = (cx: number, base: number, width: number, height: number, lean: number, ink: string) => {
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.moveTo(cx - width, base)
    ctx.bezierCurveTo(cx - width * 1.35, base - height * 0.38, cx - width * 0.2 + lean * 0.3, base - height * 0.55, cx + lean, base - height)
    ctx.bezierCurveTo(cx + width * 0.5 + lean * 0.2, base - height * 0.62, cx + width * 1.4, base - height * 0.4, cx + width, base)
    ctx.closePath()
    ctx.fill()
  }
  const base = h * 0.97
  const sw = [-1, 1, 0][k] * w * 0.09
  tongue(w * 0.5, base, w * 0.3, h * (0.84 + 0.1 * r()), sw + w * range(r, -0.05, 0.05), SHADE)
  tongue(w * 0.33, base, w * 0.15, h * (0.5 + 0.12 * r()), -sw * 0.8, SHADE)
  tongue(w * 0.7, base, w * 0.14, h * (0.44 + 0.14 * r()), sw * 0.6 + w * 0.04, SHADE)
  tongue(w * 0.5, base, w * 0.21, h * (0.62 + 0.08 * r()), sw * 0.7, BASE)
  tongue(w * 0.37, base, w * 0.09, h * 0.34, -sw * 0.5, BASE)
  tongue(w * 0.66, base, w * 0.085, h * 0.3, sw * 0.4, BASE)
  tongue(w * 0.5, base, w * 0.12, h * (0.36 + 0.06 * r()), sw * 0.5, LIGHT)
  // a stray lick, torn free
  const lx = w * (0.5 + [-0.14, 0.12, 0.04][k])
  const ly = h * (0.16 + 0.05 * k)
  blob(ctx, [[lx, ly - h * 0.06], [lx + w * 0.035, ly], [lx, ly + h * 0.04], [lx - w * 0.03, ly]], SHADE)
}

function bench(ctx: Ctx, w: number, h: number) {
  // legs
  ctx.fillStyle = SHADE
  ctx.fillRect(w * 0.16, h * 0.5, w * 0.09, h * 0.48)
  ctx.fillRect(w * 0.72, h * 0.5, w * 0.09, h * 0.48)
  // half-log seat
  ctx.fillStyle = BASE
  ctx.beginPath()
  ctx.moveTo(w * 0.07, h * 0.3)
  ctx.lineTo(w * 0.93, h * 0.3)
  ctx.quadraticCurveTo(w * 0.97, h * 0.62, w * 0.9, h * 0.62)
  ctx.lineTo(w * 0.07, h * 0.62)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = LIGHT
  ctx.fillRect(w * 0.07, h * 0.24, w * 0.86, h * 0.09)
  ellipse(ctx, w * 0.07, h * 0.44, w * 0.04, h * 0.19, LIGHT)
  ctx.strokeStyle = SHADE
  ctx.lineWidth = h * 0.02
  ctx.beginPath()
  ctx.ellipse(w * 0.07, h * 0.44, w * 0.022, h * 0.1, 0, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = 0; i < 6; i++) line(ctx, w * (0.2 + i * 0.12), h * 0.47, w * (0.27 + i * 0.12), h * 0.47, h * 0.022, SHADE)
}

/** An acoustic guitar standing upright (the engine leans it). */
function guitar(ctx: Ctx, w: number, h: number) {
  const cx = w * 0.5
  // neck and head
  ctx.fillStyle = SHADE
  ctx.fillRect(cx - w * 0.045, h * 0.1, w * 0.09, h * 0.5)
  poly(ctx, [cx - w * 0.07, h * 0.02, cx + w * 0.07, h * 0.02, cx + w * 0.055, h * 0.12, cx - w * 0.055, h * 0.12], SHADE)
  // body
  ellipse(ctx, cx, h * 0.56, w * 0.27, h * 0.115, BASE)
  ellipse(ctx, cx, h * 0.79, w * 0.38, h * 0.185, BASE)
  ctx.fillStyle = BASE
  ctx.fillRect(cx - w * 0.22, h * 0.58, w * 0.44, h * 0.14)
  // binding, catching the light on one side
  ctx.save()
  ctx.beginPath()
  ctx.rect(cx + w * 0.1, 0, w, h)
  ctx.clip()
  ctx.strokeStyle = LIGHT
  ctx.lineWidth = w * 0.03
  ctx.beginPath()
  ctx.ellipse(cx, h * 0.79, w * 0.36, h * 0.175, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  ellipse(ctx, cx, h * 0.69, w * 0.105, h * 0.05, SHADE)
  ctx.fillStyle = SHADE
  ctx.fillRect(cx - w * 0.14, h * 0.865, w * 0.28, h * 0.022)
  for (let i = -1; i <= 1; i++) line(ctx, cx + i * w * 0.022, h * 0.1, cx + i * w * 0.03, h * 0.87, w * 0.008, LIGHT, 'butt')
}

/* ------------------------------- grove ------------------------------- */

/** A fallen giant, bark furrowed, its cut end showing rings. */
function fallenLog(ctx: Ctx, w: number, h: number, r: Rand) {
  const top = h * 0.2
  const bot = h * 0.94
  ctx.fillStyle = BASE
  ctx.beginPath()
  ctx.moveTo(w * 0.1, top)
  for (let x = w * 0.1; x <= w * 0.97; x += 24) ctx.lineTo(x, top + Math.sin(x * 0.013) * h * 0.035 + (x / w) * h * 0.1)
  ctx.lineTo(w * 0.99, bot)
  ctx.lineTo(w * 0.1, bot)
  ctx.closePath()
  ctx.fill()
  // shade along the belly
  ctx.fillStyle = SHADE
  ctx.beginPath()
  ctx.moveTo(w * 0.1, h * 0.66)
  for (let x = w * 0.1; x <= w; x += 24) ctx.lineTo(x, h * 0.66 + Math.sin(x * 0.02) * h * 0.04)
  ctx.lineTo(w, bot)
  ctx.lineTo(w * 0.1, bot)
  ctx.closePath()
  ctx.fill()
  for (let i = 0; i < 26; i++) {
    const x = range(r, w * 0.2, w * 0.92)
    const y = range(r, top + h * 0.16, h * 0.62)
    line(ctx, x, y, x + range(r, 30, 110), y + range(r, -4, 6), h * 0.022, SHADE)
  }
  for (let i = 0; i < 8; i++) {
    const x = range(r, w * 0.2, w * 0.9)
    line(ctx, x, top + h * 0.08 + (x / w) * h * 0.1, x + range(r, 40, 120), top + h * 0.09 + (x / w) * h * 0.1, h * 0.02, LIGHT)
  }
  // a snapped limb
  poly(ctx, [w * 0.62, top + h * 0.1, w * 0.66, h * 0.0, w * 0.7, h * 0.03, w * 0.69, top + h * 0.12], BASE)
  // the cut end
  ellipse(ctx, w * 0.1, (top + bot) / 2, w * 0.085, (bot - top) / 2, LIGHT)
  ctx.strokeStyle = SHADE
  ctx.lineWidth = h * 0.012
  for (let k = 1; k <= 5; k++) {
    ctx.beginPath()
    ctx.ellipse(w * 0.1 + k * 1.5, (top + bot) / 2 + k, w * 0.085 * (1 - k * 0.165), ((bot - top) / 2) * (1 - k * 0.165), 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/** A cluster of fly agaric. Red = cap, blue = stem and spots, green = gills. */
function mushrooms(ctx: Ctx, w: number, h: number, r: Rand) {
  const n = 3 + Math.floor(r() * 3)
  const caps: { x: number; s: number; lean: number }[] = []
  for (let i = 0; i < n; i++) caps.push({ x: w * (0.18 + (0.64 * (i + 0.5)) / n + range(r, -0.04, 0.04)), s: range(r, 0.45, 1) * (i === 1 ? 1.15 : 1), lean: range(r, -0.14, 0.14) })
  caps.sort((a, b) => a.s - b.s)
  for (const c of caps) {
    const capW = w * 0.2 * c.s
    const capH = capW * 0.62
    const stemH = h * 0.6 * c.s
    const topY = h * 0.97 - stemH
    const cx = c.x + c.lean * stemH
    poly(ctx, [c.x - capW * 0.17, h * 0.97, c.x + capW * 0.17, h * 0.97, cx + capW * 0.11, topY, cx - capW * 0.11, topY], LIGHT)
    ellipse(ctx, cx, topY + capH * 0.04, capW * 0.92, capH * 0.2, SHADE)
    ctx.fillStyle = BASE
    ctx.beginPath()
    ctx.ellipse(cx, topY, capW, capH, 0, Math.PI, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    for (let k = 0; k < 6; k++) {
      const a = Math.PI + range(r, 0.25, 2.9)
      const rr = range(r, 0.3, 0.8)
      ellipse(ctx, cx + Math.cos(a) * capW * rr, topY + Math.sin(a) * capH * rr * 0.9, capW * range(r, 0.06, 0.1), capH * range(r, 0.08, 0.12), LIGHT)
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = range(r, w * 0.08, w * 0.92)
    const len = h * range(r, 0.08, 0.18)
    frond(ctx, x, h * 0.99, -Math.PI / 2 + range(r, -0.4, 0.4), len, 0, len * 0.1, 1, SHADE, 0)
  }
}

function owl(ctx: Ctx, w: number, h: number) {
  const cx = w * 0.5
  // tufts
  poly(ctx, [cx - w * 0.3, h * 0.2, cx - w * 0.34, h * 0.02, cx - w * 0.1, h * 0.14], BASE)
  poly(ctx, [cx + w * 0.3, h * 0.2, cx + w * 0.34, h * 0.02, cx + w * 0.1, h * 0.14], BASE)
  ellipse(ctx, cx, h * 0.52, w * 0.36, h * 0.42, BASE)
  ellipse(ctx, cx - w * 0.2, h * 0.62, w * 0.14, h * 0.26, SHADE, 0.12)
  ellipse(ctx, cx + w * 0.2, h * 0.62, w * 0.14, h * 0.26, SHADE, -0.12)
  for (let i = 0; i < 4; i++) for (let k = -1; k <= 1; k++) ellipse(ctx, cx + k * w * 0.09 + (i % 2) * w * 0.04, h * (0.52 + i * 0.075), w * 0.03, h * 0.016, SHADE)
  ellipse(ctx, cx - w * 0.15, h * 0.3, w * 0.13, w * 0.13, LIGHT)
  ellipse(ctx, cx + w * 0.15, h * 0.3, w * 0.13, w * 0.13, LIGHT)
  ellipse(ctx, cx - w * 0.15, h * 0.3, w * 0.055, w * 0.055, SHADE)
  ellipse(ctx, cx + w * 0.15, h * 0.3, w * 0.055, w * 0.055, SHADE)
  poly(ctx, [cx - w * 0.04, h * 0.36, cx + w * 0.04, h * 0.36, cx, h * 0.45], LIGHT)
  // feet
  for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) line(ctx, cx + s * w * 0.12, h * 0.92, cx + s * w * 0.12 + k * w * 0.045, h * 0.99, w * 0.03, LIGHT)
}

/* -------------------------------- camp -------------------------------- */

function tent(ctx: Ctx, w: number, h: number) {
  const gy = h * 0.96
  // guy lines and stakes
  line(ctx, w * 0.13, h * 0.42, w * 0.015, gy, h * 0.008, SHADE)
  line(ctx, w * 0.86, h * 0.36, w * 0.985, gy, h * 0.008, SHADE)
  // the long roof and wall, in half shade
  poly(ctx, [w * 0.3, h * 0.08, w * 0.86, h * 0.14, w * 0.93, h * 0.52, w * 0.52, h * 0.5], BASE)
  poly(ctx, [w * 0.52, h * 0.5, w * 0.93, h * 0.52, w * 0.93, gy, w * 0.52, gy], BASE)
  poly(ctx, [w * 0.52, h * 0.5, w * 0.93, h * 0.52, w * 0.93, h * 0.56, w * 0.52, h * 0.545], SHADE)
  for (let i = 1; i < 4; i++) line(ctx, w * (0.52 + i * 0.105), h * 0.56, w * (0.52 + i * 0.105), gy, h * 0.006, SHADE, 'butt')
  // the lit gable end
  poly(ctx, [w * 0.08, h * 0.5, w * 0.3, h * 0.08, w * 0.52, h * 0.5, w * 0.52, gy, w * 0.08, gy], LIGHT)
  // door, flaps tied back
  poly(ctx, [w * 0.3, h * 0.3, w * 0.4, gy, w * 0.2, gy], SHADE)
  poly(ctx, [w * 0.3, h * 0.3, w * 0.245, h * 0.7, w * 0.2, gy, w * 0.17, gy], BASE)
  poly(ctx, [w * 0.3, h * 0.3, w * 0.355, h * 0.7, w * 0.4, gy, w * 0.43, gy], BASE)
  // ridge pole
  line(ctx, w * 0.3, h * 0.08, w * 0.3, h * 0.015, h * 0.012, SHADE, 'butt')
  line(ctx, w * 0.3, h * 0.085, w * 0.86, h * 0.145, h * 0.012, SHADE, 'butt')
  // lantern in the doorway
  ellipse(ctx, w * 0.3, h * 0.62, w * 0.018, h * 0.035, LIGHT)
}

function canoe(ctx: Ctx, w: number, h: number) {
  ctx.fillStyle = BASE
  ctx.beginPath()
  ctx.moveTo(w * 0.01, h * 0.2)
  ctx.quadraticCurveTo(w * 0.06, h * 0.45, w * 0.14, h * 0.5)
  ctx.lineTo(w * 0.86, h * 0.5)
  ctx.quadraticCurveTo(w * 0.94, h * 0.45, w * 0.99, h * 0.2)
  ctx.quadraticCurveTo(w * 0.93, h * 0.98, w * 0.8, h * 0.98)
  ctx.lineTo(w * 0.2, h * 0.98)
  ctx.quadraticCurveTo(w * 0.07, h * 0.98, w * 0.01, h * 0.2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = SHADE
  ctx.fillRect(w * 0.16, h * 0.74, w * 0.68, h * 0.24)
  ctx.fillStyle = LIGHT
  ctx.fillRect(w * 0.12, h * 0.46, w * 0.76, h * 0.1)
}

function reeds(ctx: Ctx, w: number, h: number, r: Rand) {
  for (let i = 0; i < 26; i++) {
    const x = range(r, w * 0.1, w * 0.9)
    const len = h * range(r, 0.45, 0.95)
    const lean = range(r, -0.28, 0.28)
    const ink = r() < 0.3 ? SHADE : r() < 0.25 ? LIGHT : BASE
    frond(ctx, x, h, -Math.PI / 2 + lean, len, lean * 0.9, len * 0.025 + 2, 1, ink, 0)
    if (r() < 0.3) ellipse(ctx, x + Math.sin(lean) * len * 0.8, h - Math.cos(lean) * len * 0.82, w * 0.014, h * 0.05, SHADE, lean)
  }
}

/* ------------------------------ lookout ------------------------------ */

function tower(ctx: Ctx, w: number, h: number) {
  const cabTop = h * 0.13
  const cabBot = h * 0.27
  const deck = h * 0.285
  const gy = h * 0.99
  const lx = [w * 0.2, w * 0.8] // feet
  const tx = [w * 0.3, w * 0.7] // legs at the deck
  const leg = (i: number, t: number) => tx[i] + (lx[i] - tx[i]) * t
  const ly = (t: number) => deck + (gy - deck) * t
  // cross bracing, three tiers
  for (let k = 0; k < 3; k++) {
    const t0 = k / 3
    const t1 = (k + 1) / 3
    line(ctx, leg(0, t0), ly(t0), leg(1, t1), ly(t1), w * 0.016, BASE, 'butt')
    line(ctx, leg(1, t0), ly(t0), leg(0, t1), ly(t1), w * 0.016, SHADE, 'butt')
    line(ctx, leg(0, t1), ly(t1), leg(1, t1), ly(t1), w * 0.018, BASE, 'butt')
  }
  // stairs zig-zag up the middle
  for (let k = 0; k < 6; k++) {
    const y0 = gy - ((gy - deck) * k) / 6
    const y1 = gy - ((gy - deck) * (k + 1)) / 6
    const a = k % 2 ? w * 0.62 : w * 0.4
    const b = k % 2 ? w * 0.4 : w * 0.62
    line(ctx, a, y0, b, y1, w * 0.012, SHADE, 'butt')
  }
  // legs
  line(ctx, lx[0], gy, tx[0], deck, w * 0.034, BASE, 'butt')
  line(ctx, lx[1], gy, tx[1], deck, w * 0.034, SHADE, 'butt')
  // catwalk and railing
  ctx.fillStyle = SHADE
  ctx.fillRect(w * 0.14, deck - h * 0.004, w * 0.72, h * 0.016)
  ctx.fillStyle = BASE
  ctx.fillRect(w * 0.14, deck - h * 0.05, w * 0.72, h * 0.008)
  for (let i = 0; i <= 8; i++) ctx.fillRect(w * (0.14 + i * 0.0885), deck - h * 0.05, w * 0.012, h * 0.05)
  // cab: lit windows all round under a broad hip roof
  ctx.fillStyle = BASE
  ctx.fillRect(w * 0.24, cabTop, w * 0.52, cabBot - cabTop)
  ctx.fillStyle = LIGHT
  ctx.fillRect(w * 0.27, cabTop + h * 0.02, w * 0.46, h * 0.07)
  ctx.fillStyle = BASE
  for (let i = 1; i < 5; i++) ctx.fillRect(w * (0.27 + i * 0.092) - w * 0.008, cabTop + h * 0.02, w * 0.016, h * 0.07)
  ctx.fillRect(w * 0.27, cabTop + h * 0.052, w * 0.46, h * 0.006)
  poly(ctx, [w * 0.12, cabTop + h * 0.006, w * 0.34, h * 0.055, w * 0.66, h * 0.055, w * 0.88, cabTop + h * 0.006], SHADE)
  poly(ctx, [w * 0.5, h * 0.055, w * 0.66, h * 0.055, w * 0.88, cabTop + h * 0.006, w * 0.6, cabTop + h * 0.006], BASE)
  // mast and a short antenna — nobody is answering
  line(ctx, w * 0.5, h * 0.055, w * 0.5, h * 0.005, w * 0.01, SHADE, 'butt')
  line(ctx, w * 0.5, h * 0.012, w * 0.58, h * 0.03, w * 0.008, SHADE, 'butt')
}

function rock(ctx: Ctx, w: number, h: number, r: Rand) {
  const pts: number[] = [0, h]
  const crest: [number, number][] = []
  let x = 0
  while (x < w) {
    const s = x / w
    const y = h - h * (0.3 + 0.62 * Math.pow(Math.sin(Math.PI * s), 0.7)) * range(r, 0.72, 1)
    crest.push([x, y])
    pts.push(x, y)
    x += range(r, w * 0.05, w * 0.11)
  }
  pts.push(w, h * 0.8, w, h)
  poly(ctx, pts, BASE)
  // facets: shade falls to the left of each crest, light to the right
  for (let i = 1; i < crest.length - 1; i++) {
    const [cx, cy] = crest[i]
    const [nx, ny] = crest[i + 1]
    const [px, py] = crest[i - 1]
    if (r() < 0.75) poly(ctx, [cx, cy, cx - (cx - px) * 0.5, cy + (py - cy) * 0.5 + h * 0.02, cx - w * 0.03, h, cx + w * 0.02, h], SHADE)
    if (r() < 0.6) poly(ctx, [cx, cy, (cx + nx) / 2, (cy + ny) / 2, cx + w * 0.035, cy + h * range(r, 0.16, 0.34)], LIGHT)
  }
  for (let i = 0; i < 40; i++) {
    const gx = range(r, w * 0.04, w * 0.96)
    const len = h * range(r, 0.04, 0.1)
    frond(ctx, gx, h, -Math.PI / 2 + range(r, -0.5, 0.5), len, 0, len * 0.1, 1, SHADE, 0)
  }
}

/* ------------------------------- beasts ------------------------------- */

function bird(ctx: Ctx, w: number, h: number, up: boolean) {
  ctx.strokeStyle = BASE
  ctx.lineWidth = h * 0.16
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (up) {
    ctx.moveTo(w * 0.06, h * 0.22)
    ctx.quadraticCurveTo(w * 0.32, h * 0.16, w * 0.5, h * 0.7)
    ctx.quadraticCurveTo(w * 0.68, h * 0.16, w * 0.94, h * 0.22)
  } else {
    ctx.moveTo(w * 0.04, h * 0.66)
    ctx.quadraticCurveTo(w * 0.3, h * 0.32, w * 0.5, h * 0.52)
    ctx.quadraticCurveTo(w * 0.7, h * 0.32, w * 0.96, h * 0.66)
  }
  ctx.stroke()
}

/** A black-tailed buck, standing broadside with its head up. */
function deer(ctx: Ctx, w: number, h: number) {
  const gy = h * 0.98
  // far legs
  poly(ctx, [w * 0.33, h * 0.56, w * 0.38, h * 0.56, w * 0.36, gy, w * 0.335, gy], SHADE)
  poly(ctx, [w * 0.63, h * 0.56, w * 0.69, h * 0.56, w * 0.7, gy, w * 0.675, gy], SHADE)
  // body
  blob(ctx, [[w * 0.2, h * 0.44], [w * 0.3, h * 0.36], [w * 0.55, h * 0.37], [w * 0.74, h * 0.38], [w * 0.8, h * 0.5], [w * 0.72, h * 0.64], [w * 0.5, h * 0.66], [w * 0.28, h * 0.64], [w * 0.2, h * 0.56]], BASE)
  // near legs
  poly(ctx, [w * 0.25, h * 0.58, w * 0.31, h * 0.6, w * 0.285, h * 0.8, w * 0.29, gy, w * 0.265, gy, w * 0.255, h * 0.8], BASE)
  poly(ctx, [w * 0.68, h * 0.56, w * 0.77, h * 0.52, w * 0.775, h * 0.76, w * 0.75, gy, w * 0.725, gy, w * 0.735, h * 0.78], BASE)
  // tail
  poly(ctx, [w * 0.78, h * 0.4, w * 0.84, h * 0.45, w * 0.8, h * 0.5], LIGHT)
  // neck and head
  poly(ctx, [w * 0.2, h * 0.56, w * 0.14, h * 0.26, w * 0.21, h * 0.2, w * 0.32, h * 0.4], BASE)
  blob(ctx, [[w * 0.22, h * 0.19], [w * 0.2, h * 0.27], [w * 0.1, h * 0.31], [w * 0.035, h * 0.3], [w * 0.05, h * 0.25], [w * 0.13, h * 0.18]], BASE)
  poly(ctx, [w * 0.19, h * 0.2, w * 0.25, h * 0.1, w * 0.235, h * 0.21], BASE)
  // antlers
  ctx.strokeStyle = BASE
  ctx.lineWidth = w * 0.013
  ctx.lineCap = 'round'
  const tine = (pts: number[]) => {
    ctx.beginPath()
    ctx.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
    ctx.stroke()
  }
  tine([w * 0.17, h * 0.19, w * 0.14, h * 0.08, w * 0.08, h * 0.02])
  tine([w * 0.14, h * 0.08, w * 0.17, h * 0.01])
  tine([w * 0.12, h * 0.06, w * 0.06, h * 0.07])
  tine([w * 0.19, h * 0.19, w * 0.22, h * 0.07, w * 0.27, h * 0.02])
  tine([w * 0.22, h * 0.07, w * 0.19, h * 0.0])
}

/* ------------------------------ the sheet ------------------------------ */

export type TexName =
  | 'bough0' | 'bough1' | 'bough2'
  | 'fern0' | 'fern1' | 'fern2'
  | 'mound0' | 'mound1'
  | 'stand0' | 'stand1'
  | 'fir0' | 'fir1'
  | 'snag'
  | 'shaft' | 'glow'
  | 'firepit' | 'flame0' | 'flame1' | 'flame2'
  | 'bench' | 'guitar'
  | 'log' | 'shroom0' | 'shroom1' | 'owl'
  | 'tent' | 'canoe' | 'reeds'
  | 'tower' | 'rock0' | 'rock1'
  | 'birdUp' | 'birdDown' | 'deer'

interface Sheet {
  name: TexName
  w: number
  h: number
  /** Alpha is real coverage, not a stencil (light and glows). */
  soft?: boolean
  paint: (ctx: Ctx, w: number, h: number, r: Rand) => void
}

export const SHEETS: Sheet[] = [
  { name: 'bough0', w: 1024, h: 512, paint: bough },
  { name: 'bough1', w: 1024, h: 512, paint: bough },
  { name: 'bough2', w: 1024, h: 512, paint: bough },
  { name: 'fern0', w: 512, h: 512, paint: fern },
  { name: 'fern1', w: 512, h: 512, paint: fern },
  { name: 'fern2', w: 512, h: 512, paint: fern },
  { name: 'mound0', w: 1024, h: 256, paint: mound },
  { name: 'mound1', w: 1024, h: 256, paint: mound },
  { name: 'stand0', w: 1024, h: 128, paint: stand },
  { name: 'stand1', w: 1024, h: 128, paint: stand },
  { name: 'fir0', w: 256, h: 512, paint: fir },
  { name: 'fir1', w: 256, h: 512, paint: fir },
  { name: 'snag', w: 256, h: 512, paint: snag },
  { name: 'shaft', w: 128, h: 512, soft: true, paint: shaft },
  { name: 'glow', w: 256, h: 256, soft: true, paint: glow },
  { name: 'firepit', w: 512, h: 256, paint: firepit },
  { name: 'flame0', w: 256, h: 384, paint: (c, w, h, r) => flame(c, w, h, r, 0) },
  { name: 'flame1', w: 256, h: 384, paint: (c, w, h, r) => flame(c, w, h, r, 1) },
  { name: 'flame2', w: 256, h: 384, paint: (c, w, h, r) => flame(c, w, h, r, 2) },
  { name: 'bench', w: 512, h: 192, paint: bench },
  { name: 'guitar', w: 256, h: 512, paint: guitar },
  { name: 'log', w: 1024, h: 256, paint: fallenLog },
  { name: 'shroom0', w: 256, h: 256, paint: mushrooms },
  { name: 'shroom1', w: 256, h: 256, paint: mushrooms },
  { name: 'owl', w: 128, h: 192, paint: owl },
  { name: 'tent', w: 768, h: 512, paint: tent },
  { name: 'canoe', w: 512, h: 96, paint: canoe },
  { name: 'reeds', w: 256, h: 256, paint: reeds },
  { name: 'tower', w: 512, h: 1024, paint: tower },
  { name: 'rock0', w: 1024, h: 384, paint: rock },
  { name: 'rock1', w: 1024, h: 384, paint: rock },
  { name: 'birdUp', w: 64, h: 32, paint: (c, w, h) => bird(c, w, h, true) },
  { name: 'birdDown', w: 64, h: 32, paint: (c, w, h) => bird(c, w, h, false) },
  { name: 'deer', w: 256, h: 256, paint: deer },
]

/** Paint one sheet at `scale` (0.5 on small screens) and return its canvas. */
export function paintSheet(sheet: Sheet, scale: number, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(16, Math.round(sheet.w * scale))
  canvas.height = Math.max(16, Math.round(sheet.h * scale))
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  sheet.paint(ctx, sheet.w, sheet.h, mulberry(seed))
  return canvas
}
