import {
  type Box,
  type Ctx,
  type Pt,
  type Rng,
  type StackLine,
  type TypeSpec,
  clampParagraph,
  drawMark,
  drawType,
  drawWordmark,
  fitStack,
  grain,
  inkTexture,
  measureStack,
  mixHex,
  newLayer,
  paper,
  printLayer,
  SITE_URL,
  jSafe,
} from '../kit'
import type { StyleContext } from '../types'

/*
  MARBLED — bookbinder's endpaper, both Victorian and psychedelic. The
  pattern is real mathematical marbling (after Aubrey Jaffer): every ink
  drop pushes all the ink already on the bath outward, tines drag it into
  combed stripes, and a stylus swirls it — applied to adaptively resampled
  polygons so veins stay crisp however far they're stretched. Classic
  patterns (stone, gel-git, nonpareil, chevron, bouquet, ebru swirl) are
  built from the same few moves. The bill is set on an engraved label pasted
  onto the sheet, or gilt on a leather quarter-binding.
*/

type Blob = { color: string; pts: Pt[] }

class Bath {
  blobs: Blob[] = []
  constructor(private readonly maxLen = 6) {}

  private transform(fn: (p: Pt) => Pt) {
    const maxLen2 = this.maxLen * this.maxLen
    for (const blob of this.blobs) {
      const src = blob.pts
      const out: Pt[] = []
      const n = src.length
      let prevT = fn(src[0])
      for (let i = 0; i < n; i++) {
        const a = src[i]
        const b = src[(i + 1) % n]
        const A = i === 0 ? prevT : prevT
        const B = fn(b)
        out.push(A)
        this.subdivide(a, b, A, B, fn, out, maxLen2, 0)
        prevT = B
      }
      blob.pts = out
    }
  }

  private subdivide(a: Pt, b: Pt, A: Pt, B: Pt, fn: (p: Pt) => Pt, out: Pt[], maxLen2: number, depth: number) {
    const dx = B[0] - A[0]
    const dy = B[1] - A[1]
    if (dx * dx + dy * dy <= maxLen2 || depth > 7) return
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const M = fn(m)
    this.subdivide(a, m, A, M, fn, out, maxLen2, depth + 1)
    out.push(M)
    this.subdivide(m, b, M, B, fn, out, maxLen2, depth + 1)
  }

  drop(cx: number, cy: number, r: number, color: string) {
    const r2 = r * r
    if (this.blobs.length) {
      this.transform(([x, y]) => {
        const dx = x - cx
        const dy = y - cy
        const d2 = dx * dx + dy * dy || 1e-6
        const f = Math.sqrt(1 + r2 / d2)
        return [cx + dx * f, cy + dy * f]
      })
    }
    const n = Math.max(24, Math.round((Math.PI * 2 * r) / this.maxLen))
    const pts: Pt[] = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
    this.blobs.push({ color, pts })
  }

  /** A single tine line through (lx, ly) along unit (mx, my): shift z, falloff c. */
  tine(lx: number, ly: number, mx: number, my: number, z: number, c: number) {
    const nx = -my
    const ny = mx
    this.transform(([x, y]) => {
      const d = Math.abs((x - lx) * nx + (y - ly) * ny)
      const k = (z * c) / (d + c)
      return [x + mx * k, y + my * k]
    })
  }

  /** A comb: parallel tines every `spacing`, alternately shifted when `alternate`. */
  comb(w: number, h: number, angle: number, spacing: number, z: number, c: number, alternate = false, phase = 0) {
    const mx = Math.cos(angle)
    const my = Math.sin(angle)
    const nx = -my
    const ny = mx
    const reach = Math.hypot(w, h)
    const cx = w / 2
    const cy = h / 2
    this.transform(([x, y]) => {
      // signed distance across the tines, folded to the nearest tine
      const s = (x - cx) * nx + (y - cy) * ny + reach + phase
      const idx = Math.round(s / spacing)
      const d = Math.abs(s - idx * spacing)
      const sign = alternate && idx % 2 ? -1 : 1
      const k = (sign * z * c) / (d + c)
      return [x + mx * k, y + my * k]
    })
  }

  /** Sinuous stylus pass: every point shifts along the stroke by a sine of its offset. */
  wave(angle: number, amplitude: number, wavelength: number, phase: number) {
    const mx = Math.cos(angle)
    const my = Math.sin(angle)
    this.transform(([x, y]) => {
      const across = x * -my + y * mx
      const k = amplitude * Math.sin((across / wavelength) * Math.PI * 2 + phase)
      return [x + mx * k, y + my * k]
    })
  }

  /** A stylus swirl around (cx, cy). */
  swirl(cx: number, cy: number, strength: number, radius: number) {
    this.transform(([x, y]) => {
      const dx = x - cx
      const dy = y - cy
      const d = Math.hypot(dx, dy)
      const a = strength * Math.exp(-d / radius)
      const c = Math.cos(a)
      const s = Math.sin(a)
      return [cx + dx * c - dy * s, cy + dx * s + dy * c]
    })
  }

  render(ctx: Ctx) {
    for (const blob of this.blobs) {
      ctx.fillStyle = blob.color
      ctx.beginPath()
      const pts = blob.pts
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.closePath()
      ctx.fill()
    }
  }
}

interface MarblePalette {
  bath: string
  inks: string[]
  vein: string
  label: string
  labelInk: string
  accent: string
  leather: string
  gilt: string
}

const PALETTES: MarblePalette[] = [
  {
    // Victorian: indigo, oxblood, ochre, black veins
    bath: '#e9dfc6',
    inks: ['#22305a', '#8a2331', '#c9a24a', '#2f5f63', '#1b2238'],
    vein: '#f1e8d0',
    label: '#f3ecd9',
    labelInk: '#1f2533',
    accent: '#8a2331',
    leather: '#5a1a22',
    gilt: '#e0b04e',
  },
  {
    // the band's own: pine, gold, burgundy, sage
    bath: '#efe6cf',
    inks: ['#0c2318', '#e9b949', '#7a2230', '#355e3b', '#7d8471'],
    vein: '#f7f2e5',
    label: '#f7f2e5',
    labelInk: '#0c2318',
    accent: '#7a2230',
    leather: '#0f2a1d',
    gilt: '#e9b949',
  },
  {
    // psychedelic
    bath: '#f4ead2',
    inks: ['#e0457b', '#f39a2e', '#23a79c', '#5a3ea0', '#f2d43e'],
    vein: '#fbf4e0',
    label: '#fbf5e4',
    labelInk: '#2a1740',
    accent: '#d8365f',
    leather: '#2a1740',
    gilt: '#f2c14e',
  },
  {
    // river stone: slate, teal, sand, rust
    bath: '#e6dccb',
    inks: ['#2d3e4a', '#3f7f86', '#d8b98a', '#a4502e', '#12202a'],
    vein: '#f0e8d8',
    label: '#f4eee2',
    labelInk: '#12202a',
    accent: '#a4502e',
    leather: '#1d2d38',
    gilt: '#d9b27a',
  },
  {
    // ember: burgundy, rust, gold, cream, charcoal
    bath: '#efe0c2',
    inks: ['#5e1620', '#b8452f', '#e3a843', '#2a2224', '#8f6a4c'],
    vein: '#f7ecd4',
    label: '#f6ecd6',
    labelInk: '#2a1418',
    accent: '#b8452f',
    leather: '#3a1016',
    gilt: '#e3a843',
  },
]

type Pattern = 'stone' | 'gelgit' | 'nonpareil' | 'chevron' | 'bouquet' | 'ebru'
type Label = 'plate' | 'oval' | 'spine'

export default function marbled(sc: StyleContext) {
  const { ctx, w, h, rng, story } = sc
  const look = rng.fork('look')
  const pal = look.pick(PALETTES)
  const pattern: Pattern = look.pick(['stone', 'gelgit', 'nonpareil', 'chevron', 'bouquet', 'ebru'] as const)
  const label: Label = look.weighted([
    ['plate', 3],
    ['oval', 2],
    ['spine', 2],
  ])

  paper(ctx, w, h, rng.fork('paper'), { color: pal.bath, tone: 0.3, fibers: 40, specks: 20, age: 0.2 })

  // ---- marble the sheet ------------------------------------------------
  const layer = newLayer(w, h)
  const bath = new Bath(story ? 6 : 5.5)
  buildPattern(bath, pattern, pal, w, h, rng.fork('marble'))
  bath.render(layer.ctx)
  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.35, specks: 0.5, scratches: 0 })
  printLayer(ctx, layer, { color: null, texture: tex, wear: 0.25, rng: rng.fork('wear'), blend: 'multiply' })
  // the faint sheen/grain of the size bath
  grain(ctx, w, h, rng, 0.08)

  if (label === 'spine') drawSpine(sc, pal, look)
  else drawLabel(sc, pal, look, label)
  grain(ctx, w, h, rng.fork('grain2'), 0.05)
}

function buildPattern(bath: Bath, pattern: Pattern, pal: MarblePalette, w: number, h: number, rng: Rng) {
  const inks = rng.shuffle(pal.inks)
  const drops = pattern === 'stone' || pattern === 'ebru' ? 70 : 46
  const pick = (i: number) => (i % 7 === 6 ? pal.vein : inks[i % inks.length])
  if (pattern === 'stone' || pattern === 'ebru') {
    // random drops, big first then smaller, so older colours become veins
    for (let i = 0; i < drops; i++) {
      const t = i / drops
      const r = Math.max(w, h) * (0.16 - t * 0.12) * rng.range(0.6, 1.2)
      bath.drop(rng.range(-0.1, 1.1) * w, rng.range(-0.1, 1.1) * h, r, pick(i))
    }
    // a final sprinkle of small drops (the lacy "stormont" holes)
    for (let i = 0; i < 90; i++) bath.drop(rng.next() * w, rng.next() * h, rng.range(3, 11), rng.chance(0.7) ? pal.vein : inks[0])
    if (pattern === 'ebru') {
      const swirls = rng.int(2, 4)
      for (let i = 0; i < swirls; i++) bath.swirl(rng.range(0.15, 0.85) * w, rng.range(0.15, 0.85) * h, rng.range(2.5, 5) * rng.sign(), rng.range(80, 170))
    }
    return
  }
  // combed patterns start from rows of drops laid across the whole bath
  const rows = 7
  const cols = 6
  let k = 0
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = ((i + 0.5 + (j % 2) * 0.5) / cols) * w + rng.range(-20, 20)
      const y = ((j + 0.5) / rows) * h + rng.range(-20, 20)
      bath.drop(x, y, Math.max(w, h) * rng.range(0.06, 0.09), pick(k++))
    }
  }
  for (let i = 0; i < 26; i++) bath.drop(rng.next() * w, rng.next() * h, rng.range(20, 60), pick(k++))
  const vertical = rng.chance(0.5)
  const a0 = vertical ? Math.PI / 2 : 0
  const spacing = rng.range(60, 110)
  // gel-git: comb one way, then back offset by half a tine
  bath.comb(w, h, a0, spacing, rng.range(70, 120), 6)
  bath.comb(w, h, a0 + Math.PI, spacing, rng.range(70, 120), 6, false, spacing / 2)
  if (pattern === 'nonpareil') {
    bath.comb(w, h, a0 + Math.PI / 2, rng.range(14, 22), rng.range(18, 30), 3)
  } else if (pattern === 'chevron') {
    bath.comb(w, h, a0 + Math.PI / 2, rng.range(90, 150), rng.range(60, 110), 12, true)
  } else if (pattern === 'bouquet') {
    bath.comb(w, h, a0 + Math.PI / 2, rng.range(18, 28), rng.range(16, 26), 3)
    bath.wave(a0 + Math.PI / 2, rng.range(26, 44), rng.range(120, 200), rng.range(0, 6))
  }
}

/** An engraved bookplate label pasted on the marbled sheet. */
function drawLabel(sc: StyleContext, pal: MarblePalette, look: Rng, kind: 'plate' | 'oval') {
  const { ctx, w, h, story, copy, fonts, logo } = sc
  const lw = w * (kind === 'oval' ? (story ? 0.9 : 0.8) : story ? 0.8 : 0.74)
  const lh = story ? h * 0.52 : h * (kind === 'oval' ? 0.66 : 0.64)
  const box: Box = { x: (w - lw) / 2, y: (h - lh) / 2 + (story ? -20 : 0), w: lw, h: lh }
  const shape = new Path2D()
  if (kind === 'oval') shape.ellipse(w / 2, box.y + lh / 2, lw / 2, lh / 2, 0, 0, Math.PI * 2)
  else notchedRect(shape, box.x, box.y, lw, lh, 34)

  // paste shadow and the label paper
  ctx.save()
  ctx.shadowColor = 'rgba(30, 20, 10, 0.35)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetX = 3
  ctx.shadowOffsetY = 6
  ctx.fillStyle = pal.label
  ctx.fill(shape)
  ctx.restore()
  // engraved border: thick-thin rules following the label shape
  const ink = newLayer(w, h)
  const acc = newLayer(w, h)
  const k = ink.ctx
  const a = acc.ctx
  const inset = (d: number) => {
    const p = new Path2D()
    if (kind === 'oval') p.ellipse(w / 2, box.y + lh / 2, lw / 2 - d, lh / 2 - d, 0, 0, Math.PI * 2)
    else notchedRect(p, box.x + d, box.y + d, lw - 2 * d, lh - 2 * d, Math.max(8, 34 - d * 0.7))
    return p
  }
  k.lineWidth = 3.5
  k.stroke(inset(16))
  k.lineWidth = 1.2
  k.stroke(inset(24))
  a.lineWidth = 1
  a.setLineDash([2, 5])
  a.stroke(inset(31))
  a.setLineDash([])

  // corner fleurons
  if (kind === 'plate') {
    for (const [cx, cy, rot] of [
      [box.x + 46, box.y + 46, 0],
      [box.x + lw - 46, box.y + 46, Math.PI / 2],
      [box.x + lw - 46, box.y + lh - 46, Math.PI],
      [box.x + 46, box.y + lh - 46, -Math.PI / 2],
    ] as const) {
      fleuron(a, cx, cy, 16, rot)
    }
  }

  // ---- text ----------------------------------------------------------------
  const padX = kind === 'oval' ? lw * (story ? 0.12 : 0.17) : 70
  const padY = kind === 'oval' ? lh * 0.12 : 64
  const inner: Box = { x: box.x + padX, y: box.y + padY, w: lw - 2 * padX, h: lh - 2 * padY }
  const kicker = look.pick(['LIVE IN CONCERT', 'LIVE MUSIC', 'AN EVENING WITH', 'LIVE'])
  const wordW = Math.min(inner.w * 0.94, story ? 640 : 560)
  const wordH = logo ? wordW / logo.wordAspect : 0
  const markH = logo && look.chance(0.5) ? Math.min(story ? 190 : 150, inner.h * 0.2) : 0
  const lines: StackLine[] = [
    { text: copy.dateLine.toUpperCase(), spec: jSafe(fonts, copy.dateLine.toUpperCase(), { family: fonts.caslon, tracking: 0.05 }), size: story ? 70 : 60, gap: 16, tag: 'accent' },
    { text: copy.venue, spec: { family: fonts.display, weight: 600 }, size: story ? 66 : 58, gap: 12 },
    { text: [copy.location, copy.time].filter(Boolean).join('  ·  '), spec: { family: fonts.body, weight: 500, tracking: 0.06 }, size: 30, gap: 16 },
  ]
  clampParagraph(ctx, copy.description, { family: fonts.body, weight: 500, italic: true }, 25, inner.w * 0.92, 2).forEach((d) =>
    lines.push({ text: d, spec: { family: fonts.body, weight: 500, italic: true }, size: 25, gap: 4 }),
  )
  lines[lines.length - 1].gap = 18
  lines.push({ text: SITE_URL.toUpperCase(), spec: { family: fonts.body, weight: 700, tracking: 0.32 }, size: 18, tag: 'accent' })

  const kickerSpec: TypeSpec = { family: fonts.body, weight: 800, tracking: 0.45 }
  let y = inner.y
  if (markH && logo) {
    drawMark(k, logo, w / 2 - (markH * logo.markAspect) / 2, y, markH, '#000')
    y += markH + 14
  }
  drawType(a, kicker, w / 2, y + 18, kickerSpec, 20, 'center')
  y += 40
  if (logo) {
    drawWordmark(k, logo, w / 2 - wordW / 2, y, wordW, '#000')
    y += wordH + 16
  }
  // fleuron divider
  a.fillRect(w / 2 - 140, y + 10, 100, 1.4)
  a.fillRect(w / 2 + 40, y + 10, 100, 1.4)
  fleuron(a, w / 2, y + 10, 12, 0)
  y += 36
  const stackBox: Box = { x: inner.x, y, w: inner.w, h: inner.y + inner.h - y }
  const valign = measureStack(ctx, lines, inner.w) < stackBox.h * 0.8 ? 'center' : 'spread'
  fitStack(ctx, lines, stackBox, { align: 'center', valign, maxSpreadGap: 12 }).forEach((p) =>
    drawType(p.line.tag === 'accent' ? a : k, p.line.text, p.left + p.width / 2, p.baseline, p.line.spec, p.size, 'center'),
  )
  // a tiny edition line tucked into the bottom border
  drawType(a, `No. ${sc.printNo}`, w / 2, box.y + lh - (kind === 'oval' ? 50 : 42), { family: fonts.caslon, tracking: 0.1 }, 15, 'center')

  const reg = look.fork('reg')
  printLayer(ctx, acc, { color: pal.accent, offset: [reg.range(-1, 1), reg.range(-1, 1)], blend: 'multiply' })
  printLayer(ctx, ink, { color: pal.labelInk, blend: 'multiply' })
}

/** Leather quarter-binding across the sheet with gilt tooling and lettering. */
function drawSpine(sc: StyleContext, pal: MarblePalette, look: Rng) {
  const { ctx, w, h, story, copy, fonts, logo } = sc
  const bandH = story ? h * 0.52 : h * 0.6
  const top = (h - bandH) / 2
  // leather with its grain and a soft edge shadow on the marbling
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 22
  ctx.shadowOffsetY = 4
  ctx.fillStyle = pal.leather
  ctx.fillRect(-10, top, w + 20, bandH)
  ctx.restore()
  const grainL = newLayer(w, h)
  const g = grainL.ctx
  for (let i = 0; i < 2600; i++) {
    const x = look.next() * w
    const y = top + look.next() * bandH
    g.fillStyle = look.chance(0.5) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)'
    g.beginPath()
    g.ellipse(x, y, look.range(1, 4), look.range(0.6, 2), look.range(0, Math.PI), 0, Math.PI * 2)
    g.fill()
  }
  ctx.drawImage(grainL.canvas, 0, 0)
  // raised bands and gilt fillets
  const gilt = newLayer(w, h)
  const G = gilt.ctx
  for (const y of [top + 22, top + bandH - 22]) {
    G.fillRect(0, y - 3, w, 2)
    G.fillRect(0, y + 3, w, 0.9)
    // a dotted roll between
    G.setLineDash([1.5, 6])
    G.lineWidth = 2
    G.beginPath()
    G.moveTo(0, y + (y < h / 2 ? 12 : -12))
    G.lineTo(w, y + (y < h / 2 ? 12 : -12))
    G.stroke()
    G.setLineDash([])
  }
  // the guitar-tree is blind-stamped (debossed) in a column at one end of the band
  const markH = bandH * 0.66
  const markW = logo ? markH * logo.markAspect : 0
  const markLeft = look.chance(0.5)
  const reserve = logo ? markW + 70 : 0
  const inner: Box = {
    x: markLeft ? 40 + reserve : 70,
    y: top + 64,
    w: w - 110 - reserve,
    h: bandH - 128,
  }
  const tcx = inner.x + inner.w / 2
  if (logo) {
    const mx = markLeft ? 50 : w - 50 - markW
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.globalCompositeOperation = 'multiply'
    drawMark(ctx, logo, mx, top + (bandH - markH) / 2, markH, mixHex(pal.leather, '#000000', 0.6))
    ctx.restore()
    // a gilt fillet boxing the stamp
    G.lineWidth = 1.4
    G.strokeRect(mx - 18, top + (bandH - markH) / 2 - 16, markW + 36, markH + 32)
  }
  const wordW = Math.min(inner.w * 0.86, story ? 680 : 600)
  const wordH = logo ? wordW / logo.wordAspect : 0
  let y = inner.y
  if (logo) {
    drawWordmark(G, logo, tcx - wordW / 2, y, wordW, '#000')
    y += wordH + 18
  }
  G.fillRect(tcx - 150, y + 6, 110, 1.4)
  G.fillRect(tcx + 40, y + 6, 110, 1.4)
  fleuron(G, tcx, y + 6, 12, 0)
  y += 34
  const lines: StackLine[] = [
    { text: 'LIVE', spec: { family: fonts.body, weight: 800, tracking: 0.5 }, size: story ? 24 : 20, gap: story ? 16 : 12 },
    { text: copy.dateLine.toUpperCase(), spec: jSafe(fonts, copy.dateLine.toUpperCase(), { family: fonts.caslon, tracking: 0.05 }), size: story ? 72 : 60, gap: 14 },
    { text: copy.venue, spec: { family: fonts.display, weight: 600 }, size: story ? 84 : 68, gap: 12 },
    { text: [copy.location, copy.time].filter(Boolean).join('  ·  '), spec: { family: fonts.body, weight: 500, tracking: 0.1 }, size: story ? 34 : 30, gap: 12 },
  ]
  clampParagraph(ctx, copy.description, { family: fonts.body, weight: 500, italic: true }, story ? 27 : 24, inner.w * 0.94, 2).forEach((d) =>
    lines.push({ text: d, spec: { family: fonts.body, weight: 500, italic: true }, size: story ? 27 : 24, gap: 4 }),
  )
  lines[lines.length - 1].gap = 14
  lines.push({ text: SITE_URL.toUpperCase(), spec: { family: fonts.body, weight: 700, tracking: 0.32 }, size: story ? 20 : 18 })
  const stackBox: Box = { x: inner.x, y, w: inner.w, h: inner.y + inner.h - y }
  fitStack(ctx, lines, stackBox, { align: 'center', valign: 'spread', maxSpreadGap: story ? 30 : 16 }).forEach((p) =>
    drawType(G, p.line.text, p.left + p.width / 2, p.baseline, p.line.spec, p.size, 'center'),
  )
  // gold leaf: a little uneven
  const tex = inkTexture(w, h, look.fork('gilt'), { mottle: 0.45, specks: 0.8, scratches: 0.3 })
  printLayer(ctx, gilt, { color: pal.gilt, texture: tex, wear: 0.45, rng: look, blend: 'source-over' })
  // a faint highlight catching the edge of the leaf
  printLayer(ctx, gilt, { color: '#fff6d8', offset: [-0.8, -0.8], blend: 'soft-light', alpha: 0.5 })
}

/** Rectangle with concave quarter-round notched corners (a bookplate). */
function notchedRect(p: Path2D, x: number, y: number, w: number, h: number, r: number) {
  p.moveTo(x + r, y)
  p.lineTo(x + w - r, y)
  p.arc(x + w, y, r, Math.PI, Math.PI / 2, true)
  p.lineTo(x + w, y + h - r)
  p.arc(x + w, y + h, r, -Math.PI / 2, Math.PI, true)
  p.lineTo(x + r, y + h)
  p.arc(x, y + h, r, 0, -Math.PI / 2, true)
  p.lineTo(x, y + r)
  p.arc(x, y, r, Math.PI / 2, 0, true)
  p.closePath()
}

/** A small four-petal printer's flower. */
function fleuron(ctx: Ctx, cx: number, cy: number, r: number, rot: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    const tx = Math.cos(a) * r
    const ty = Math.sin(a) * r
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(Math.cos(a - 0.6) * r * 0.9, Math.sin(a - 0.6) * r * 0.9, tx, ty)
    ctx.quadraticCurveTo(Math.cos(a + 0.6) * r * 0.9, Math.sin(a + 0.6) * r * 0.9, 0, 0)
  }
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
