import {
  type Box,
  type Ctx,
  type Pt,
  type Rng,
  type StackLine,
  type TypeSpec,
  Noise2D,
  clamp,
  clampParagraph,
  drawMark,
  drawType,
  drawWordmark,
  fitSize,
  fitStack,
  grain,
  inkTexture,
  lerp,
  measureStack,
  measureType,
  misregister,
  newLayer,
  paper,
  printLayer,
  rgba,
  SITE_URL,
  textOnArc,
  fitArcSize,
  jSafe,
} from '../kit'
import type { StyleContext } from '../types'

/*
  TREE RINGS — a redwood cross-section drawn from a simulated growth
  history: juvenile rings wide, mature rings tight, drought years pinched
  thin, the pith off-centre, coherent wobble ring to ring, drying checks
  split in from the bark, shaggy fibrous bark and chainsaw kerf marks.

  Three treatments:
  - museum:  an engraved specimen plate on cream stock, with numbered pins
             marking the rings where the band's musical lineage began and a
             placard below (this show is the outermost ring)
  - print:   a two-tone colour print of the cookie, band name set on an arc
  - rising:  the rings as a half-disc sunrise on dark stock, in gold
*/

type Variant = 'museum' | 'print' | 'rising'

interface Ring {
  /** Boundary radius as a fraction of the bark-inner radius. */
  f: number
  /** Latewood darkness 0–1. */
  late: number
  /** Width of the ring as a fraction. */
  width: number
}

interface Cookie {
  cx: number
  cy: number
  R: number
  pith: Pt
  rings: Ring[]
  /** Point on a ring boundary of fraction f at angle a. */
  at: (f: number, a: number) => Pt
  /** Outer bark edge radius at angle a. */
  barkAt: (a: number) => number
  barkWidth: number
}

function growTree(cx: number, cy: number, R: number, rng: Rng): Cookie {
  const noise = new Noise2D(rng.fork('wobble'))
  const climate = new Noise2D(rng.fork('climate'))
  const n = rng.int(95, 190)
  const widths: number[] = []
  const lates: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / n
    const juvenile = lerp(2.1, 0.75, Math.pow(t, 0.6))
    const weather = 1 + 0.5 * climate.noise(i * 0.13, 1.7)
    const drought = rng.chance(0.06) ? rng.range(0.25, 0.45) : 1
    widths.push(Math.max(0.12, juvenile * weather * drought * rng.range(0.82, 1.18)))
    lates.push(drought < 1 ? rng.range(0.75, 1) : rng.range(0.3, 0.85))
  }
  const total = widths.reduce((a, b) => a + b, 0)
  let acc = 0
  const rings: Ring[] = widths.map((wd, i) => {
    acc += wd
    return { f: acc / total, late: lates[i], width: wd / total }
  })
  const pa = rng.range(0, Math.PI * 2)
  const pd = R * rng.range(0.06, 0.2)
  const pith: Pt = [cx + Math.cos(pa) * pd, cy + Math.sin(pa) * pd]
  const amp = rng.range(0.035, 0.07)
  const at = (f: number, a: number): Pt => {
    const ox = lerp(pith[0], cx, f)
    const oy = lerp(pith[1], cy, f)
    const wob =
      amp * noise.noise(Math.cos(a) * 1.2 + 11, Math.sin(a) * 1.2 + f * 1.4) +
      amp * 0.35 * f * noise.noise(Math.cos(a) * 3.5 - 4, Math.sin(a) * 3.5 + f * 3)
    const r = f * R * (1 + wob)
    return [ox + Math.cos(a) * r, oy + Math.sin(a) * r]
  }
  const barkWidth = R * rng.range(0.055, 0.09)
  const barkAt = (a: number) => {
    const [x, y] = at(1, a)
    const base = Math.hypot(x - cx, y - cy)
    const shag = barkWidth * (0.75 + 0.5 * (0.5 + 0.5 * noise.noise(Math.cos(a) * 9 + 3, Math.sin(a) * 9 - 2)) + 0.2 * noise.noise(Math.cos(a) * 30, Math.sin(a) * 30))
    return base + shag
  }
  return { cx, cy, R, pith, rings, at, barkAt, barkWidth }
}

function ringPath(c: Cookie, f: number, steps = 220, from = 0, to = Math.PI * 2): Path2D {
  const p = new Path2D()
  for (let i = 0; i <= steps; i++) {
    const a = lerp(from, to, i / steps)
    const [x, y] = c.at(f, a)
    if (i === 0) p.moveTo(x, y)
    else p.lineTo(x, y)
  }
  if (to - from >= Math.PI * 2 - 1e-6) p.closePath()
  return p
}

function barkPath(c: Cookie, steps = 360): Path2D {
  const p = new Path2D()
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const r = c.barkAt(a)
    const x = c.cx + Math.cos(a) * r
    const y = c.cy + Math.sin(a) * r
    if (i === 0) p.moveTo(x, y)
    else p.lineTo(x, y)
  }
  p.closePath()
  return p
}

interface Check {
  a: number
  depth: number
  width: number
}

function makeChecks(rng: Rng): Check[] {
  const n = rng.int(2, 5)
  return Array.from({ length: n }, () => ({
    a: rng.range(0, Math.PI * 2),
    depth: rng.range(0.18, 0.6),
    width: rng.range(0.012, 0.03),
  }))
}

/** Drying checks: jagged V-wedges split in from the bark. */
function checkPath(c: Cookie, checks: Check[], rng: Rng): Path2D {
  const p = new Path2D()
  for (const ck of checks) {
    const steps = 22
    const left: Pt[] = []
    const right: Pt[] = []
    let jitter = 0
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const f = 1.02 - ck.depth * t
      jitter += rng.range(-0.006, 0.006)
      const half = ck.width * Math.pow(1 - t, 1.3) + 0.0015
      left.push(c.at(Math.max(0.02, f), ck.a + jitter - half))
      right.push(c.at(Math.max(0.02, f), ck.a + jitter + half))
    }
    const outer = c.barkAt(ck.a) + 4
    p.moveTo(c.cx + Math.cos(ck.a - ck.width * 1.2) * outer, c.cy + Math.sin(ck.a - ck.width * 1.2) * outer)
    left.forEach(([x, y]) => p.lineTo(x, y))
    right.reverse().forEach(([x, y]) => p.lineTo(x, y))
    p.lineTo(c.cx + Math.cos(ck.a + ck.width * 1.2) * outer, c.cy + Math.sin(ck.a + ck.width * 1.2) * outer)
    p.closePath()
  }
  // hairline radial splits around the pith
  for (let i = 0; i < rng.int(2, 5); i++) {
    const a = rng.range(0, Math.PI * 2)
    const len = rng.range(0.05, 0.16)
    const [x0, y0] = c.at(0.005, a)
    const [x1, y1] = c.at(len, a + rng.range(-0.1, 0.1))
    p.moveTo(x0 - 1, y0)
    p.lineTo(x1, y1)
    p.lineTo(x0 + 1, y0 + 1)
    p.closePath()
  }
  return p
}

/** Ring index (from the pith) for a calendar year, counting the show year as the bark ring. */
function ringForYear(c: Cookie, showYear: number, year: number): number {
  return c.rings.length - 1 - (showYear - year)
}

/* ---------------------------------------------------------------------- */

export default function rings(sc: StyleContext) {
  const { rng } = sc
  const look = rng.fork('look')
  const variant: Variant = look.pick(['museum', 'print', 'rising'] as const)
  if (variant === 'museum') museum(sc, look)
  else if (variant === 'print') printed(sc, look)
  else rising(sc, look)
}

/* ---- museum specimen plate -------------------------------------------- */

const LINEAGE: Array<{ year: number; label: string }> = [
  { year: 1965, label: 'The Grateful Dead' },
  { year: 1969, label: 'Crosby, Stills, Nash & Young' },
  { year: 1972, label: 'Steely Dan' },
]

function museum(sc: StyleContext, look: Rng) {
  const { ctx, w, h, rng, story, copy, fonts, logo } = sc
  const stock = look.pick(['#f1e8d2', '#ece3cc', '#f3ecdc'])
  const ink = look.pick(['#2b2118', '#1d3325', '#3a1a20'])
  const tintInk = look.pick(['#d9b688', '#d7a47c', '#cdb58c'])
  paper(ctx, w, h, rng.fork('paper'), { color: stock, tone: 0.5, fibers: 90, specks: 50, age: 0.45 })

  const key = newLayer(w, h)
  const tint = newLayer(w, h)
  const k = key.ctx
  k.fillStyle = '#000'
  k.strokeStyle = '#000'

  const m = 70
  const top = story ? 170 : 58
  const bottom = h - (story ? 170 : 56)
  const eyebrowSpec: TypeSpec = { family: fonts.body, weight: 700, tracking: 0.32 }

  // exhibit title: the wordmark
  const wordW = story ? 600 : 470
  const wordH = logo ? wordW / logo.wordAspect : 0
  if (logo) drawWordmark(k, logo, w / 2 - wordW / 2, top, wordW, '#000')
  const labelY = top + wordH + 40
  drawType(k, `SPECIMEN No. ${sc.printNo}  ·  SEQUOIA SEMPERVIRENS`, w / 2, labelY, eyebrowSpec, 19, 'center')
  k.fillRect(w / 2 - 190, labelY + 16, 380, 1.5)

  // placard lines (measured first so the cookie takes what's left)
  const showYear = copy.date ? copy.date.getFullYear() : 2026
  const legendSpec: TypeSpec = { family: fonts.body, weight: 500, italic: true, tracking: 0.01 }
  const infoLines: StackLine[] = [
    { text: copy.dateLine.toUpperCase(), spec: jSafe(fonts, copy.dateLine.toUpperCase(), { family: fonts.caslon, tracking: 0.05 }), size: story ? 70 : 60, gap: 14, tag: 'date' },
    { text: copy.venue, spec: { family: fonts.display, weight: 600, tracking: 0 }, size: story ? 64 : 56, gap: 12 },
    { text: [copy.location, copy.time].filter(Boolean).join('  ·  '), spec: { family: fonts.body, weight: 500, tracking: 0.06 }, size: 30, gap: 18 },
  ]
  clampParagraph(ctx, copy.description, legendSpec, 25, (w - 2 * m) * 0.86, 2).forEach((d) =>
    infoLines.push({ text: d, spec: legendSpec, size: 25, gap: 6, tag: 'desc' }),
  )
  infoLines[infoLines.length - 1].gap = 26

  // a provisional cookie to find which lineage rings exist
  const legendRows = 2
  const legendH = legendRows * 30 + 10
  const urlH = 18
  const infoH = measureStack(ctx, infoLines, w - 2 * m) + legendH + urlH + 24
  const cookieTop = labelY + 40
  const avail = bottom - infoH - 34 - cookieTop
  const R = clamp(avail / 2 / 1.1, w * 0.2, w * (story ? 0.37 : 0.33))
  const cx = w / 2
  const cy = cookieTop + R * 1.1
  const cookie = growTree(cx, cy, R, rng.fork('tree'))

  // hand tint of the wood (second ink), heartwood darker
  const wood = ringPath(cookie, 1)
  tint.ctx.fillStyle = '#000'
  tint.ctx.globalAlpha = 0.55
  tint.ctx.fill(wood)
  tint.ctx.globalAlpha = 0.35
  tint.ctx.fill(ringPath(cookie, look.range(0.72, 0.86)))
  tint.ctx.globalAlpha = 0.9
  tint.ctx.fill(barkPath(cookie))
  tint.ctx.globalAlpha = 1

  engraveCookie(k, cookie, rng.fork('engrave'), 1)

  // numbered pins on the lineage rings; this show is the bark ring
  const pins: Array<{ n: number; year: number; label: string }> = []
  LINEAGE.forEach((l) => {
    if (ringForYear(cookie, showYear, l.year) > 4) pins.push({ n: pins.length + 1, ...l })
  })
  pins.push({ n: pins.length + 1, year: showYear, label: 'this show' })
  const pinRng = rng.fork('pins')
  // tags fan around the top and sides only, clear of the placard below
  const arcFrom = Math.PI * 0.82
  const arcTo = Math.PI * 2.18
  const order = pinRng.shuffle(pins.map((_, i) => i))
  pins.forEach((pin, i) => {
    const idx = Math.max(0, ringForYear(cookie, showYear, pin.year))
    const f = cookie.rings[idx].f
    const slot = order[i]
    const a = lerp(arcFrom, arcTo, (slot + 0.5) / pins.length) + pinRng.range(-0.18, 0.18)
    const [px, py] = cookie.at(f, a)
    const tagR = cookie.barkAt(a) + 30
    const tx = cookie.cx + Math.cos(a) * tagR
    const ty = cookie.cy + Math.sin(a) * tagR
    k.lineWidth = 1.6
    k.beginPath()
    k.moveTo(px, py)
    k.lineTo(tx, ty)
    k.stroke()
    k.beginPath()
    k.arc(px, py, 4.5, 0, Math.PI * 2)
    k.fill()
    k.beginPath()
    k.arc(tx, ty, 17, 0, Math.PI * 2)
    k.fill()
    k.save()
    k.globalCompositeOperation = 'destination-out'
    const numSpec: TypeSpec = { family: fonts.caslon }
    const mm = measureType(k, String(pin.n), numSpec, 22)
    drawType(k, String(pin.n), tx, ty + mm.ascent / 2, numSpec, 22, 'center')
    k.restore()
  })

  // ---- placard ---------------------------------------------------------
  const plTop = cy + R * 1.1 + 34
  const infoBox: Box = { x: m, y: plTop, w: w - 2 * m, h: bottom - plTop - legendH - urlH - 24 }
  const placed = fitStack(ctx, infoLines, infoBox, { align: 'center', valign: 'top' })
  placed.forEach((p) => drawType(k, p.line.text, p.left + p.width / 2, p.baseline, p.line.spec, p.size, 'center'))
  let y = (placed.length ? placed[placed.length - 1].bottom : plTop) + 30
  k.fillRect(w / 2 - 60, y - 14, 120, 1.2)
  // legend: two columns of numbered entries
  const entries = pins.map((p) => `${p.n}  ${p.year} — ${p.label}`)
  const colW = (w - 2 * m) / 2
  const half = Math.ceil(entries.length / 2)
  const legendSize = fitSize(ctx, entries.reduce((a, b) => (a.length > b.length ? a : b)), legendSpec, colW - 30, 22)
  entries.forEach((e, i) => {
    const col = i < half ? 0 : 1
    const row = i < half ? i : i - half
    drawType(k, e, m + colW * col + colW / 2, y + 16 + row * 30, legendSpec, legendSize, 'center')
  })
  y += 16 + half * 30 + 12
  drawType(k, SITE_URL.toUpperCase(), w / 2, Math.min(bottom, y + 14), { family: fonts.body, weight: 700, tracking: 0.3 }, 18, 'center')

  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.25, specks: 0.5, scratches: 0.1 })
  const reg = rng.fork('reg')
  printLayer(ctx, tint, { color: tintInk, offset: misregister(reg, 5), texture: tex, wear: 0.6, rng: reg })
  printLayer(ctx, key, { color: ink, offset: [0, 0], texture: tex, wear: 0.35, rng: reg })
  grain(ctx, w, h, rng, 0.08)
}

/** Line-engrave the cookie: rings, bark fibres, checks, kerf marks, pith. */
function engraveCookie(k: Ctx, c: Cookie, rng: Rng, weight: number) {
  const wood = ringPath(c, 1)
  // kerf marks from the saw, faint sweeping arcs
  k.save()
  k.clip(wood)
  k.globalAlpha = 0.18
  k.lineWidth = 1
  const kx = c.cx + c.R * rng.range(-3, 3)
  const ky = c.cy + c.R * rng.range(2.5, 4) * rng.sign()
  for (let r = Math.hypot(kx - c.cx, ky - c.cy) - c.R * 1.1; r < Math.hypot(kx - c.cx, ky - c.cy) + c.R * 1.1; r += rng.range(9, 20)) {
    k.beginPath()
    k.arc(kx, ky, r, 0, Math.PI * 2)
    k.stroke()
  }
  k.restore()
  // the rings
  c.rings.forEach((ring, i) => {
    const px = ring.width * c.R
    k.lineWidth = clamp(px * 0.38 * (0.4 + ring.late), 0.55, 3.4) * weight
    k.globalAlpha = 0.55 + 0.45 * ring.late
    k.stroke(ringPath(c, ring.f, i < 20 ? 90 : 200))
  })
  k.globalAlpha = 1
  // pith
  k.beginPath()
  k.arc(c.pith[0], c.pith[1], 3.5, 0, Math.PI * 2)
  k.fill()
  // bark: fibrous radial strokes
  const bark = barkPath(c)
  k.save()
  k.clip(bark)
  k.lineWidth = 1.3 * weight
  k.lineWidth = 2.4 * weight
  k.stroke(wood)
  k.lineWidth = 1.1 * weight
  const fibres = 900
  for (let i = 0; i < fibres; i++) {
    const a = rng.next() * Math.PI * 2
    const inner = Math.hypot(...(c.at(1, a).map((v, j) => v - (j === 0 ? c.cx : c.cy)) as Pt))
    const outer = c.barkAt(a)
    const r0 = lerp(inner, outer, rng.range(0, 0.4))
    const r1 = lerp(inner, outer, rng.range(0.6, 1.1))
    const bend = rng.range(-0.02, 0.02)
    k.globalAlpha = rng.range(0.35, 0.9)
    k.beginPath()
    k.moveTo(c.cx + Math.cos(a) * r0, c.cy + Math.sin(a) * r0)
    k.lineTo(c.cx + Math.cos(a + bend) * r1, c.cy + Math.sin(a + bend) * r1)
    k.stroke()
  }
  k.restore()
  k.globalAlpha = 1
  k.lineWidth = 2.2 * weight
  k.stroke(bark)
  // drying checks
  k.fill(checkPath(c, makeChecks(rng.fork('checks')), rng.fork('check-jitter')))
}

/* ---- colour print with the name on an arc -------------------------------- */

interface PrintPalette {
  paper: string
  sap: string
  heart: string
  late: string
  bark: string
  text: string
  accent: string
}

const PRINT_PALETTES: PrintPalette[] = [
  { paper: '#efe6cf', sap: '#e3c08e', heart: '#c9824f', late: '#8a4527', bark: '#4a2418', text: '#1d3325', accent: '#7a2230' },
  { paper: '#e9dfc6', sap: '#dcb682', heart: '#b86a43', late: '#6f3320', bark: '#3b1c14', text: '#3b1c14', accent: '#355e3b' },
  { paper: '#dfe3d3', sap: '#e1c39a', heart: '#c07d56', late: '#7d3f28', bark: '#40221a', text: '#1d4030', accent: '#8a3b27' },
  { paper: '#f3e5c0', sap: '#e8c48a', heart: '#d08a4a', late: '#8f4a22', bark: '#50261a', text: '#0c2318', accent: '#b8452f' },
]

function printed(sc: StyleContext, look: Rng) {
  const { ctx, w, h, rng, story, copy, fonts, logo } = sc
  const pal = look.pick(PRINT_PALETTES)
  paper(ctx, w, h, rng.fork('paper'), { color: pal.paper, tone: 0.5, fibers: 80, specks: 40, age: 0.4 })

  const R = story ? w * 0.335 : w * 0.3
  const cx = w / 2
  const cy = (story ? 300 : 112) + R * 1.28
  const cookie = growTree(cx, cy, R, rng.fork('tree'))

  const woodL = newLayer(w, h)
  const heartL = newLayer(w, h)
  const lateL = newLayer(w, h)
  const barkL = newLayer(w, h)
  const textL = newLayer(w, h)
  const accentL = newLayer(w, h)
  const wood = ringPath(cookie, 1)
  woodL.ctx.fill(wood)
  heartL.ctx.fill(ringPath(cookie, look.range(0.62, 0.8)))
  // heartwood feathered edge: a few extra partial rings
  heartL.ctx.globalAlpha = 0.5
  heartL.ctx.fill(ringPath(cookie, look.range(0.8, 0.86)))
  heartL.ctx.globalAlpha = 1

  const l = lateL.ctx
  cookie.rings.forEach((ring, i) => {
    const px = ring.width * R
    l.lineWidth = clamp(px * 0.45 * (0.35 + ring.late), 0.7, 4.5)
    l.globalAlpha = 0.45 + 0.55 * ring.late
    l.stroke(ringPath(cookie, ring.f, i < 20 ? 90 : 200))
  })
  l.globalAlpha = 1
  l.beginPath()
  l.arc(cookie.pith[0], cookie.pith[1], 4, 0, Math.PI * 2)
  l.fill()
  // saw kerfs lightly knocked out of the wood tones
  const kerf = new Path2D()
  const kx = cx + R * look.range(-3, 3)
  const ky = cy - R * look.range(2.5, 4)
  const d = Math.hypot(kx - cx, ky - cy)
  for (let r = d - R * 1.1; r < d + R * 1.1; r += look.range(10, 24)) {
    kerf.moveTo(kx + r, ky)
    kerf.arc(kx, ky, r, 0, Math.PI * 2)
  }
  for (const L of [woodL, heartL]) {
    L.ctx.save()
    L.ctx.globalCompositeOperation = 'destination-out'
    L.ctx.globalAlpha = 0.14
    L.ctx.lineWidth = 3
    L.ctx.stroke(kerf)
    L.ctx.restore()
  }

  // bark and checks
  const bark = barkPath(cookie)
  const b = barkL.ctx
  b.save()
  b.fill(bark)
  b.globalCompositeOperation = 'destination-out'
  b.fill(wood)
  b.restore()
  // fibres reversed into the bark
  b.save()
  b.globalCompositeOperation = 'destination-out'
  b.lineWidth = 1.4
  const fr = rng.fork('fibres')
  for (let i = 0; i < 700; i++) {
    const a = fr.next() * Math.PI * 2
    const [ix, iy] = cookie.at(1, a)
    const inner = Math.hypot(ix - cx, iy - cy)
    const outer = cookie.barkAt(a)
    const r0 = lerp(inner, outer, fr.range(0.1, 0.5))
    const r1 = lerp(inner, outer, fr.range(0.6, 0.95))
    b.globalAlpha = fr.range(0.2, 0.6)
    b.beginPath()
    b.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
    b.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
    b.stroke()
  }
  b.restore()
  b.fill(checkPath(cookie, makeChecks(rng.fork('checks')), rng.fork('check-jitter')))

  // ---- type --------------------------------------------------------------
  const t = textL.ctx
  const a = accentL.ctx
  const arcR = cookie.R + cookie.barkWidth * 1.6 + 28
  const bandSpec: TypeSpec = { family: fonts.display, weight: 800, tracking: 0.08 }
  const bandSize = fitArcSize(t, 'NORTHERN DISCONNECTION', bandSpec, arcR, Math.PI * 0.86, 84)
  textOnArc(t, 'NORTHERN DISCONNECTION', cx, cy, arcR, -Math.PI / 2, bandSpec, bandSize)
  const liveSpec: TypeSpec = { family: fonts.body, weight: 800, tracking: 0.5 }
  // small ornaments at the arc ends
  const span = (measureType(t, 'NORTHERN DISCONNECTION', bandSpec, bandSize).width / (arcR + 0)) / 2
  for (const s of [-1, 1]) {
    const ang = -Math.PI / 2 + s * (span + 0.08)
    const ox = cx + Math.cos(ang) * (arcR + bandSize * 0.3)
    const oy = cy + Math.sin(ang) * (arcR + bandSize * 0.3)
    a.save()
    a.translate(ox, oy)
    a.rotate(ang + Math.PI / 4)
    a.fillRect(-7, -7, 14, 14)
    a.restore()
  }
  // the mark as a small emblem hanging beneath the cookie, flanked by rules
  const emblemTop = cy + cookie.R + cookie.barkWidth * 1.5 + (story ? 50 : 26)
  const emblemH = story ? 150 : 104
  if (logo) {
    const ew = emblemH * logo.markAspect
    drawMark(a, logo, cx - ew / 2, emblemTop, emblemH, '#000')
    const ry = emblemTop + emblemH * 0.62
    a.fillRect(cx - ew / 2 - 150, ry, 120, 2)
    a.fillRect(cx + ew / 2 + 30, ry, 120, 2)
  }

  const infoTop = emblemTop + (logo ? emblemH + (story ? 40 : 22) : 0)
  const box: Box = { x: 80, y: infoTop, w: w - 160, h: h - infoTop - (story ? 200 : 60) }
  const lines: StackLine[] = [
    { text: `LIVE${copy.weekday ? '' : ''}`, spec: liveSpec, size: 24, gap: 16, tag: 'accent' },
    { text: copy.dateLine.toUpperCase(), spec: jSafe(fonts, copy.dateLine.toUpperCase(), { family: fonts.caslon, tracking: 0.04 }), size: 70, gap: 16 },
    { text: copy.venue, spec: { family: fonts.display, weight: 700 }, size: 62, gap: 14, tag: 'accent' },
    { text: [copy.location, copy.time].filter(Boolean).join('  ·  '), spec: { family: fonts.body, weight: 500, tracking: 0.06 }, size: 32, gap: 18 },
  ]
  clampParagraph(ctx, copy.description, { family: fonts.body, weight: 500, italic: true }, 26, box.w * 0.86, 2).forEach((dsc) =>
    lines.push({ text: dsc, spec: { family: fonts.body, weight: 500, italic: true }, size: 26, gap: 6 }),
  )
  lines[lines.length - 1].gap = 20
  lines.push({ text: SITE_URL.toUpperCase(), spec: { family: fonts.body, weight: 700, tracking: 0.3 }, size: 19, tag: 'accent' })
  const placed = fitStack(ctx, lines, box, { align: 'center', valign: 'spread', maxSpreadGap: 16 })
  placed.forEach((p) => {
    const target = p.line.tag === 'accent' ? a : t
    drawType(target, p.line.text, p.left + p.width / 2, p.baseline, p.line.spec, p.size, 'center')
  })

  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.45, specks: 0.9, scratches: 0.3 })
  const reg = rng.fork('reg')
  printLayer(ctx, woodL, { color: pal.sap, offset: misregister(reg, 3), texture: tex, wear: 0.5, rng: reg })
  printLayer(ctx, heartL, { color: pal.heart, offset: misregister(reg, 3), texture: tex, wear: 0.6, rng: reg })
  printLayer(ctx, lateL, { color: pal.late, offset: misregister(reg, 2), texture: tex, wear: 0.5, rng: reg })
  printLayer(ctx, barkL, { color: pal.bark, offset: misregister(reg, 2), texture: tex, wear: 0.5, rng: reg })
  printLayer(ctx, accentL, { color: pal.accent, offset: misregister(reg, 2), texture: tex, wear: 0.4, rng: reg })
  printLayer(ctx, textL, { color: pal.text, offset: [0, 0], texture: tex, wear: 0.35, rng: reg })
  grain(ctx, w, h, rng, 0.08)
}

/* ---- rising rings on dark stock ----------------------------------------- */

const DARK_STOCKS = [
  { paper: '#0f2a1d', ring: '#e9b949', bark: '#7a2230', text: '#f4ecd8', accent: '#e9b949' },
  { paper: '#2a1418', ring: '#e2a24a', bark: '#0f2a1d', text: '#f4ecd8', accent: '#e2a24a' },
  { paper: '#14202b', ring: '#d9b27a', bark: '#7a2230', text: '#f1e8d2', accent: '#d9b27a' },
]

function rising(sc: StyleContext, look: Rng) {
  const { ctx, w, h, rng, story, copy, fonts, logo } = sc
  const pal = look.pick(DARK_STOCKS)
  paper(ctx, w, h, rng.fork('paper'), { color: pal.paper, tone: 0.6, fibers: 60, specks: 30, age: 0.5, dark: true })

  const R = w * (story ? 0.86 : 0.7)
  const cx = w / 2 + look.range(-40, 40)
  const cy = h + R * (story ? 0.0 : 0.24)
  const cookie = growTree(cx, cy, R, rng.fork('tree'))

  const ringL = newLayer(w, h)
  const barkL = newLayer(w, h)
  const textL = newLayer(w, h)
  const accentL = newLayer(w, h)
  const r = ringL.ctx
  cookie.rings.forEach((ring, i) => {
    const px = ring.width * R
    r.lineWidth = clamp(px * 0.42 * (0.4 + ring.late), 1, 4.6)
    r.globalAlpha = 0.5 + 0.5 * ring.late
    r.stroke(ringPath(cookie, ring.f, i < 20 ? 90 : 260, Math.PI, Math.PI * 2))
  })
  r.globalAlpha = 1
  const bark = barkPath(cookie)
  const b = barkL.ctx
  b.fill(bark)
  b.globalCompositeOperation = 'destination-out'
  b.fill(ringPath(cookie, 1))
  b.globalCompositeOperation = 'source-over'
  // drying checks split the rings and bark down to the dark stock
  const checks = checkPath(cookie, makeChecks(rng.fork('checks')), rng.fork('check-jitter'))
  for (const L of [r, b]) {
    L.save()
    L.globalCompositeOperation = 'destination-out'
    L.fill(checks)
    L.restore()
  }

  // ---- type above the rising disc ---------------------------------------
  const topY = story ? 210 : 80
  const discTop = cy - cookie.R - cookie.barkWidth * 1.4
  const box: Box = { x: 90, y: topY, w: w - 180, h: discTop - topY - (story ? 90 : 60) }
  const t = textL.ctx
  const a = accentL.ctx
  const wordW = Math.min(box.w, story ? 760 : 700)
  const wordH = logo ? wordW / logo.wordAspect : 0
  const markH = logo ? wordH * 1.35 : 0
  const lines: StackLine[] = [
    { text: 'LIVE', spec: { family: fonts.body, weight: 800, tracking: 0.55 }, size: 26, gap: 22, tag: 'accent' },
    { text: copy.dateLine.toUpperCase(), spec: jSafe(fonts, copy.dateLine.toUpperCase(), { family: fonts.caslon, tracking: 0.04 }), size: 76, gap: 16 },
    { text: copy.venue, spec: { family: fonts.display, weight: 600 }, size: 64, gap: 14, tag: 'accent' },
    { text: [copy.location, copy.time].filter(Boolean).join('  ·  '), spec: { family: fonts.body, weight: 500, tracking: 0.08 }, size: 32, gap: 18 },
  ]
  clampParagraph(ctx, copy.description, { family: fonts.body, weight: 400, italic: true }, 26, box.w * 0.9, 2).forEach((dsc) =>
    lines.push({ text: dsc, spec: { family: fonts.body, weight: 400, italic: true }, size: 26, gap: 6 }),
  )
  lines[lines.length - 1].gap = 0
  const identityH = Math.max(wordH, 0)
  const stackBox: Box = { x: box.x, y: box.y + identityH + 40, w: box.w, h: box.h - identityH - 40 }
  if (logo) {
    const groupW = markH * logo.markAspect + 26 + wordW * 0.86
    const gx = w / 2 - groupW / 2
    drawMark(t, logo, gx, box.y - (markH - wordH) / 2, markH, '#000')
    drawWordmark(t, logo, gx + markH * logo.markAspect + 26, box.y + wordH * 0.07, wordW * 0.86, '#000')
  }
  const placed = fitStack(ctx, lines, stackBox, { align: 'center', valign: 'center' })
  placed.forEach((p) => {
    drawType(p.line.tag === 'accent' ? a : t, p.line.text, p.left + p.width / 2, p.baseline, p.line.spec, p.size, 'center')
  })
  // url set along the top ring
  const urlSpec: TypeSpec = { family: fonts.body, weight: 700, tracking: 0.42 }
  textOnArc(a, SITE_URL.toUpperCase(), cx, cy, cookie.R + cookie.barkWidth * 1.7 + 16, -Math.PI / 2, urlSpec, 20)

  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.4, specks: 0.7, scratches: 0.2 })
  const reg = rng.fork('reg')
  // opaque inks on dark stock: print with source-over
  printLayer(ctx, barkL, { color: pal.bark, offset: misregister(reg, 2), texture: tex, wear: 0.5, rng: reg, blend: 'source-over' })
  printLayer(ctx, ringL, { color: pal.ring, offset: misregister(reg, 2), texture: tex, wear: 0.45, rng: reg, blend: 'source-over' })
  printLayer(ctx, accentL, { color: pal.accent, offset: misregister(reg, 2), texture: tex, wear: 0.35, rng: reg, blend: 'source-over' })
  printLayer(ctx, textL, { color: pal.text, offset: [0, 0], texture: tex, wear: 0.3, rng: reg, blend: 'source-over' })
  // a faint glow of the rings on the stock
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.3)
  glow.addColorStop(0, rgba(pal.ring, 0.1))
  glow.addColorStop(1, rgba(pal.ring, 0))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
  grain(ctx, w, h, rng, 0.1)
}
