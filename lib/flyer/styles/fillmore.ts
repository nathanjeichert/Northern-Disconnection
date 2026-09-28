import {
  type Box,
  type Canvas,
  type Ctx,
  type Pt,
  type Rng,
  type StackLine,
  type TypeSpec,
  Noise2D,
  clampParagraph,
  drawMark,
  drawMarkSilhouette,
  drawType,
  fitSize,
  fitStack,
  getCtx,
  grain,
  inkTexture,
  makeCanvas,
  measureType,
  newLayer,
  paper,
  printLayer,
  SITE_URL,
  starPath,
  textOnArc,
  useType,
  fillTracked,
  textWidth,
} from '../kit'
import type { StyleContext } from '../types'

/*
  FILLMORE — a 1966–70 San Francisco ballroom poster. Flat vibrating
  complementary inks, an op-art field (wavy concentric rings, twisting
  rays, or two ring sets XOR'd into moiré) radiating from a beaded
  medallion that holds the guitar-tree mark, melting drip edges, and the
  band's name hand-"lettered" to fill an envelope: a justified block of
  type inverse-mapped pixel by pixel into an arch, pillow or flag shape.
  The date and venue sit on a calm field in chunky 70s faces so they
  still read from across the room.
*/

interface FillPalette {
  a: string
  b: string
  field: string
  text: string
  dark: string
  cream: string
}

const PALETTES: FillPalette[] = [
  { a: '#e5402f', b: '#1f8f5f', field: '#1f8f5f', text: '#e5402f', dark: '#1d1330', cream: '#f6e6c4' },
  { a: '#ff7b1c', b: '#2c4fd6', field: '#2c4fd6', text: '#ff9a2e', dark: '#15142b', cream: '#f8e9c8' },
  { a: '#e8368f', b: '#2bbd72', field: '#2a1740', text: '#f2d43e', dark: '#2a1740', cream: '#fff1c9' },
  { a: '#f2c318', b: '#7b2fd0', field: '#7b2fd0', text: '#f2c318', dark: '#1e1033', cream: '#fff3d0' },
  { a: '#e9b949', b: '#7a2230', field: '#0c2318', text: '#e9b949', dark: '#0c2318', cream: '#f7f2e5' },
  { a: '#ff5164', b: '#18b3c6', field: '#18b3c6', text: '#ff5164', dark: '#14213d', cream: '#fdf0d5' },
  { a: '#f08a24', b: '#355e3b', field: '#7a2230', text: '#f5c542', dark: '#1d0f14', cream: '#f7ead0' },
]

type Motif = 'rings' | 'rays' | 'moire'
type Envelope = 'arch' | 'pillow' | 'flag' | 'valley'

export default function fillmore(sc: StyleContext) {
  const { ctx, w, h, rng, story, copy, fonts, logo } = sc
  const look = rng.fork('look')
  const pal = look.pick(PALETTES)
  const motif: Motif = look.pick(['rings', 'rays', 'moire'] as const)
  const envelope: Envelope = look.pick(['arch', 'pillow', 'flag', 'valley'] as const)
  const face = look.pick([
    { family: fonts.display, weight: 900 },
    { family: fonts.slab, weight: 400 },
    { family: fonts.rye, weight: 400 },
  ])

  paper(ctx, w, h, rng.fork('paper'), { color: pal.cream, tone: 0.35, fibers: 40, specks: 30, age: 0.25 })
  const art = newLayer(w, h)
  const a = art.ctx
  const key = newLayer(w, h)
  const k = key.ctx

  const layout = look.weighted<'medallion' | 'marquee' | 'sunrise'>([
    ['medallion', 1],
    ['marquee', 1],
    ['sunrise', 1],
  ])

  // ---- zones --------------------------------------------------------------
  const topEdge = layout === 'marquee' ? 0 : story ? h * 0.25 : h * 0.26
  const botEdge = story ? h * 0.66 : h * 0.68
  const cx = w / 2 + look.range(-20, 20)
  const field$ = rng.fork('field')
  const drip$ = rng.fork('drips')
  const nameLines = [
    { text: 'NORTHERN', spec: { ...face, tracking: 0.02 } },
    { text: 'DISCONNECTION', spec: { ...face, tracking: 0.0 } },
  ]
  const nameColor = pal.text === pal.field ? pal.a : pal.text

  if (layout === 'medallion') {
    const cy = (topEdge + botEdge) / 2 + (story ? -10 : 10)
    const medR = Math.min(w * 0.3, (botEdge - topEdge) * 0.5) * (story ? 1.1 : 1)
    opArt(a, motif, cx, cy, w, h, pal, field$)
    melt(a, w, h, topEdge, botEdge, pal, drip$, true)
    drawMedallion(a, k, sc, cx, cy, medR, pal, look)
    const nameBox: Box = { x: 56, y: story ? 150 : 44, w: w - 112, h: topEdge - (story ? 150 : 44) - (story ? 60 : 56) }
    const m = warpBlock(nameLines, makeEnvelope(envelope, nameBox, look), nameBox)
    stampLetters(a, m, pal.dark, nameColor, 0)
  } else if (layout === 'marquee') {
    // op-art everywhere; the name huge, outlined so it holds over the pattern
    const nameTop = story ? 170 : 50
    const nameBox: Box = { x: 44, y: nameTop, w: w - 88, h: (story ? h * 0.36 : h * 0.4) - nameTop }
    const medR = story ? 170 : 128
    const cy = nameBox.y + nameBox.h + medR + (story ? 90 : 56)
    opArt(a, motif, cx, cy, w, h, pal, field$)
    melt(a, w, h, 0, botEdge, pal, drip$, false)
    const m = warpBlock(nameLines, makeEnvelope(look.pick(['pillow', 'flag', 'arch'] as const), nameBox, look), nameBox)
    stampLetters(a, m, pal.dark, nameColor, 14, pal.cream)
    drawMedallion(a, k, sc, cx, cy, medR, pal, look)
  } else {
    // sunrise: rays from a half sun on the horizon, the mark rising from it
    const horizon = botEdge
    const sunR = story ? w * 0.34 : w * 0.3
    opArt(a, look.chance(0.6) ? 'rays' : 'rings', cx, horizon, w, h, pal, field$)
    melt(a, w, h, topEdge, botEdge, pal, drip$, true)
    // the sun: bands of the two inks and cream, cut by the horizon
    a.save()
    a.beginPath()
    a.rect(0, 0, w, horizon)
    a.clip()
    const bands = [pal.dark, pal.cream, pal.a, pal.cream, pal.b, pal.cream]
    bands.forEach((c, i) => {
      a.fillStyle = c
      a.beginPath()
      a.arc(cx, horizon, sunR * (1 - i * 0.075), 0, Math.PI * 2)
      a.fill()
    })
    // stripes cut across the sun's face
    a.beginPath()
    a.arc(cx, horizon, sunR * 0.625, 0, Math.PI * 2)
    a.clip()
    a.fillStyle = pal.a
    for (let i = 0; i < 6; i++) {
      const y = horizon - sunR * 0.12 - i * sunR * 0.13
      a.fillRect(cx - sunR, y, sunR * 2, sunR * (0.05 - i * 0.006))
    }
    a.restore()
    if (logo) {
      const mh = (horizon - topEdge) * 0.92
      const mw = mh * logo.markAspect
      drawMarkSilhouette(a, logo, cx - mw / 2, horizon - mh * 0.96, mh, pal.cream)
      drawMark(k, logo, cx - mw / 2, horizon - mh * 0.96, mh, '#000')
    }
    const nameBox: Box = { x: 56, y: story ? 150 : 44, w: w - 112, h: topEdge - (story ? 150 : 44) - (story ? 60 : 56) }
    const m = warpBlock(nameLines, makeEnvelope(envelope, nameBox, look), nameBox)
    stampLetters(a, m, pal.dark, nameColor, 0)
    // a cream pinline on the horizon
    a.fillStyle = pal.cream
  }

  // ---- the bill -----------------------------------------------------------
  const bill: Box = { x: 70, y: botEdge + (story ? 70 : 60), w: w - 140, h: h - botEdge - (story ? 70 : 60) - (story ? 190 : 56) }
  const dateWords = copy.weekday && copy.month && copy.ordinal ? [copy.weekday.toUpperCase(), `${copy.month.toUpperCase()} ${copy.ordinal.toUpperCase()}`] : [copy.dateLine.toUpperCase()]
  const dateFace: TypeSpec = { family: fonts.display, weight: 900, tracking: 0.02 }
  const lines: StackLine[] = [
    { text: dateWords.join(' · '), spec: dateFace, size: story ? 88 : 72, gap: story ? 20 : 14, tag: 'date' },
    { text: copy.venue, spec: { family: fonts.display, weight: 800, tracking: 0.01 }, size: story ? 78 : 64, gap: 12, tag: 'venue' },
    { text: [copy.location, copy.time].filter(Boolean).join('  •  ').toUpperCase(), spec: { family: fonts.body, weight: 800, tracking: 0.18 }, size: story ? 34 : 28, gap: 12, tag: 'where' },
  ]
  clampParagraph(ctx, copy.description, { family: fonts.body, weight: 500, italic: true }, 24, bill.w * 0.9, 2).forEach((d) =>
    lines.push({ text: d, spec: { family: fonts.body, weight: 500, italic: true }, size: story ? 28 : 24, gap: 4, tag: 'desc' }),
  )
  lines[lines.length - 1].gap = 14
  lines.push({ text: SITE_URL.toUpperCase(), spec: { family: fonts.body, weight: 800, tracking: 0.36 }, size: 18, tag: 'url' })
  const placed = fitStack(ctx, lines, bill, { align: 'center', valign: 'center' })
  placed.forEach((p) => {
    const x = p.left + p.width / 2
    if (p.line.tag === 'date' || p.line.tag === 'venue') {
      // chunky 70s type with a hard offset shadow
      a.fillStyle = p.line.tag === 'date' ? pal.b === pal.field ? pal.a : pal.b : pal.a
      drawType(a, p.line.text, x + 4, p.baseline + 4, p.line.spec, p.size, 'center')
      a.fillStyle = pal.cream
      drawType(a, p.line.text, x, p.baseline, p.line.spec, p.size, 'center')
    } else {
      a.fillStyle = p.line.tag === 'url' ? pal.a : pal.cream
      a.globalAlpha = p.line.tag === 'desc' ? 0.85 : 1
      if (p.line.tag === 'where') drawWhere(a, p, pal.a)
      else drawType(a, p.line.text, x, p.baseline, p.line.spec, p.size, 'center')
      a.globalAlpha = 1
    }
  })
  // "LIVE" set on the arc of the medallion's lower rim
  k.fillStyle = '#000'

  // ---- print --------------------------------------------------------------
  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.35, specks: 0.6, scratches: 0.15 })
  printLayer(ctx, art, { color: null, texture: tex, wear: 0.35, rng: rng.fork('wear'), blend: 'source-over' })
  printLayer(ctx, key, { color: pal.dark, offset: [look.range(-2.5, 2.5), look.range(-2.5, 2.5)], texture: tex, wear: 0.3, rng: rng.fork('wear2'), blend: 'source-over' })
  grain(ctx, w, h, rng, 0.1)
}

/* ---------------------------------------------------------------------- */

/** Draw "CITY, ST ✦ 8 PM" with the ✦ drawn as a small star in accent. */
function drawWhere(a: Ctx, p: { line: StackLine; left: number; baseline: number; size: number }, accent: string) {
  const parts = p.line.text.split('  •  ')
  const tr = useType(a, p.line.spec, p.size)
  const sepW = textWidth(a, '  •  ', tr)
  let x = p.left
  const fill = a.fillStyle
  parts.forEach((part, i) => {
    useType(a, p.line.spec, p.size)
    a.fillStyle = fill
    fillTracked(a, part, x, p.baseline, tr, 'left')
    x += textWidth(a, part, tr) + tr
    if (i < parts.length - 1) {
      a.fillStyle = accent
      a.beginPath()
      starPath(a, x + sepW / 2 - tr / 2, p.baseline - p.size * 0.36, p.size * 0.32, p.size * 0.13, 4, 0)
      a.fill()
      x += sepW + tr
    }
  })
  a.fillStyle = fill
}

function opArt(a: Ctx, motif: Motif, cx: number, cy: number, w: number, h: number, pal: FillPalette, rng: Rng) {
  if (motif === 'rings') wavyRings(a, cx, cy, Math.hypot(w, h), pal, rng)
  else if (motif === 'rays') twistRays(a, cx, cy, Math.hypot(w, h), pal, rng)
  else moire(a, w, h, cx, cy, pal, rng)
}

/** Melting flat fields: a hanging one at the top (optional) and a rising one below. */
function melt(a: Ctx, w: number, h: number, topEdge: number, botEdge: number, pal: FillPalette, rng: Rng, top: boolean) {
  if (top && topEdge > 0) {
    a.fillStyle = pal.field
    a.fill(meltEdge(w, 0, topEdge, 1, rng.fork(1)))
  }
  a.fillStyle = pal.dark
  a.fill(meltEdge(w, h, botEdge, -1, rng.fork(2)))
  a.save()
  a.strokeStyle = pal.cream
  a.lineWidth = 5
  if (top && topEdge > 0) a.stroke(meltEdge(w, 0, topEdge, 1, rng.fork(1), true))
  a.stroke(meltEdge(w, h, botEdge, -1, rng.fork(2), true))
  a.restore()
}

/** Print warped lettering: optional thick outline, a hard drop shadow, then the letters. */
function stampLetters(
  a: Ctx,
  m: { canvas: Canvas; x: number; y: number },
  shadow: string,
  fill: string,
  outline: number,
  outlineColor?: string,
) {
  if (outline > 0) {
    const dark = tintMask(m.canvas, shadow)
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2
      a.drawImage(dark, m.x + Math.cos(t) * outline + 7, m.y + Math.sin(t) * outline + 9)
      a.drawImage(dark, m.x + Math.cos(t) * outline, m.y + Math.sin(t) * outline)
    }
    if (outlineColor) {
      const inner = tintMask(m.canvas, outlineColor)
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2
        a.drawImage(inner, m.x + Math.cos(t) * outline * 0.45, m.y + Math.sin(t) * outline * 0.45)
      }
    }
  } else {
    a.drawImage(tintMask(m.canvas, shadow), m.x + 6, m.y + 6)
  }
  a.drawImage(tintMask(m.canvas, fill), m.x, m.y)
}

/** Concentric rings whose radii wobble with angle — alternating two inks. */
function wavyRings(a: Ctx, cx: number, cy: number, reach: number, pal: FillPalette, rng: Rng) {
  const step = rng.range(20, 30)
  const lobes = rng.int(5, 9)
  const twist = rng.range(0, 0.02)
  const n = Math.ceil(reach / step) + 2
  for (let i = n; i >= 1; i--) {
    const r = i * step
    const amp = Math.min(r * 0.12, 10 + r * 0.06)
    a.fillStyle = i % 2 ? pal.a : pal.b
    a.beginPath()
    for (let s = 0; s <= 240; s++) {
      const t = (s / 240) * Math.PI * 2
      const rr = r + amp * Math.sin(lobes * t + r * twist)
      const x = cx + Math.cos(t) * rr
      const y = cy + Math.sin(t) * rr
      if (s === 0) a.moveTo(x, y)
      else a.lineTo(x, y)
    }
    a.closePath()
    a.fill()
  }
}

/** Alternating rays that twist as they leave the centre. */
function twistRays(a: Ctx, cx: number, cy: number, reach: number, pal: FillPalette, rng: Rng) {
  const rays = rng.int(18, 30) * 2
  const twist = rng.range(0.0008, 0.0022) * rng.sign()
  a.fillStyle = pal.b
  a.fillRect(0, 0, a.canvas.width, a.canvas.height)
  a.fillStyle = pal.a
  for (let i = 0; i < rays; i += 2) {
    const t0 = (i / rays) * Math.PI * 2
    const t1 = ((i + 1) / rays) * Math.PI * 2
    a.beginPath()
    a.moveTo(cx, cy)
    for (let r = 0; r <= reach; r += 20) a.lineTo(cx + Math.cos(t0 + r * twist) * r, cy + Math.sin(t0 + r * twist) * r)
    for (let r = reach; r >= 0; r -= 20) a.lineTo(cx + Math.cos(t1 + r * twist) * r, cy + Math.sin(t1 + r * twist) * r)
    a.closePath()
    a.fill()
  }
}

/** Two sets of concentric rings XOR'd into op-art interference. */
function moire(a: Ctx, w: number, h: number, cx: number, cy: number, pal: FillPalette, rng: Rng) {
  const layer = makeCanvas(w, h)
  const l = getCtx(layer)
  const step = rng.range(16, 24)
  const c2: Pt = [cx + rng.range(-160, 160), cy + rng.range(120, 260) * rng.sign()]
  for (const [ox, oy] of [
    [cx, cy],
    c2,
  ] as const) {
    l.globalCompositeOperation = 'xor'
    const n = Math.ceil(Math.hypot(w, h) / step) + 2
    l.beginPath()
    for (let i = 0; i < n; i += 2) {
      l.moveTo(ox + (i + 1) * step, oy)
      l.arc(ox, oy, (i + 1) * step, 0, Math.PI * 2)
      l.moveTo(ox + i * step, oy)
      l.arc(ox, oy, i * step, 0, Math.PI * 2, true)
    }
    l.fillStyle = '#000'
    l.fill()
  }
  a.fillStyle = pal.b
  a.fillRect(0, 0, w, h)
  l.globalCompositeOperation = 'source-in'
  l.fillStyle = pal.a
  l.fillRect(0, 0, w, h)
  a.drawImage(layer, 0, 0)
}

/**
 * A wavy "melting" edge with drips. dir = 1: field hangs from the top edge
 * down to `edge`; dir = -1: field rises from the bottom.
 */
function meltEdge(w: number, base: number, edge: number, dir: 1 | -1, rng: Rng, strokeOnly = false): Path2D {
  const p = new Path2D()
  const noise = new Noise2D(rng)
  const amp = rng.range(14, 30)
  const freq = rng.range(2, 4)
  const phase = rng.range(0, 6)
  const drips = Array.from({ length: rng.int(3, 6) }, () => ({ x: rng.range(0.05, 0.95) * w, len: rng.range(26, 70), wd: rng.range(16, 30) }))
  const pts: Pt[] = []
  for (let x = -20; x <= w + 20; x += 6) {
    let y = edge + dir * (amp * Math.sin((x / w) * Math.PI * freq + phase) + noise.noise(x / 140, 2) * amp * 0.5)
    for (const d of drips) {
      const u = (x - d.x) / d.wd
      if (Math.abs(u) < 1.4) y += dir * d.len * Math.exp(-u * u * 2.2) * (dir === 1 ? 1 : 0.6)
    }
    pts.push([x, y])
  }
  if (strokeOnly) {
    pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)))
    return p
  }
  p.moveTo(-20, base)
  pts.forEach(([x, y]) => p.lineTo(x, y))
  p.lineTo(w + 20, base)
  p.closePath()
  return p
}

/** The medallion: beaded rims, a sunburst, the mark, and words round the rim. */
function drawMedallion(a: Ctx, k: Ctx, sc: StyleContext, cx: number, cy: number, r: number, pal: FillPalette, rng: Rng) {
  const { logo, fonts } = sc
  // outer halo ring in dark with cream beads
  a.fillStyle = pal.dark
  a.beginPath()
  a.arc(cx, cy, r * 1.16, 0, Math.PI * 2)
  a.fill()
  a.fillStyle = pal.cream
  const beads = 40
  for (let i = 0; i < beads; i++) {
    const t = (i / beads) * Math.PI * 2
    a.beginPath()
    a.arc(cx + Math.cos(t) * r * 1.08, cy + Math.sin(t) * r * 1.08, r * 0.028, 0, Math.PI * 2)
    a.fill()
  }
  // inner disc: sunburst of thin rays in the first ink over cream
  a.fillStyle = pal.cream
  a.beginPath()
  a.arc(cx, cy, r, 0, Math.PI * 2)
  a.fill()
  a.save()
  a.beginPath()
  a.arc(cx, cy, r, 0, Math.PI * 2)
  a.clip()
  a.fillStyle = pal.a
  const rays = rng.int(24, 40) * 2
  for (let i = 0; i < rays; i += 2) {
    const t0 = (i / rays) * Math.PI * 2 + rng.range(-0.01, 0.01)
    const t1 = ((i + 0.7) / rays) * Math.PI * 2
    a.beginPath()
    a.moveTo(cx, cy)
    a.lineTo(cx + Math.cos(t0) * r * 1.2, cy + Math.sin(t0) * r * 1.2)
    a.lineTo(cx + Math.cos(t1) * r * 1.2, cy + Math.sin(t1) * r * 1.2)
    a.closePath()
    a.fill()
  }
  // a calm cream centre so the mark reads
  a.fillStyle = pal.cream
  a.beginPath()
  a.arc(cx, cy, r * 0.62, 0, Math.PI * 2)
  a.fill()
  a.restore()
  // rims in the key ink
  k.lineWidth = 6
  k.beginPath()
  k.arc(cx, cy, r, 0, Math.PI * 2)
  k.stroke()
  k.lineWidth = 2.5
  k.beginPath()
  k.arc(cx, cy, r * 0.62, 0, Math.PI * 2)
  k.stroke()
  // the mark, larger than the inner disc so it breaks the frame
  if (logo) {
    const mh = r * 1.72
    const mw = mh * logo.markAspect
    // cream silhouette first so the rays don't show through
    drawMarkSilhouette(a, logo, cx - mw / 2, cy - mh / 2, mh, pal.cream)
    drawMark(k, logo, cx - mw / 2, cy - mh / 2, mh, '#000')
  }
  // words around the rim band
  const arcSpec: TypeSpec = { family: fonts.body, weight: 800, tracking: 0.3 }
  a.fillStyle = pal.cream
  const size = Math.min(26, r * 0.075)
  textOnArc(a, 'PSYCHEDELIC AMERICANA', cx, cy, r * 1.23 + size * 0.9, Math.PI / 2, arcSpec, size, { bottom: true })
}

interface Env {
  x0: number
  x1: number
  top: (t: number) => number
  bottom: (t: number) => number
}

function makeEnvelope(kind: Envelope, box: Box, rng: Rng): Env {
  const x0 = box.x
  const x1 = box.x + box.w
  const y0 = box.y
  const y1 = box.y + box.h
  const H = box.h
  const s = (t: number) => Math.sin(t * Math.PI)
  switch (kind) {
    case 'arch':
      return { x0, x1, top: (t) => y0 + H * 0.3 * (1 - s(t)), bottom: (t) => y1 - H * 0.08 * (1 - s(t)) }
    case 'pillow':
      return { x0, x1, top: (t) => y0 + H * 0.2 * (1 - s(t)), bottom: (t) => y1 - H * 0.2 * (1 - s(t)) }
    case 'valley':
      return { x0, x1, top: (t) => y0 + H * 0.26 * s(t), bottom: (t) => y1 - H * 0.02 * s(t) }
    default: {
      const ph = rng.range(0, Math.PI)
      return {
        x0,
        x1,
        top: (t) => y0 + H * 0.12 * (1 + Math.sin(t * Math.PI * 2 + ph)),
        bottom: (t) => y1 - H * 0.12 * (1 - Math.sin(t * Math.PI * 2 + ph)),
      }
    }
  }
}

/**
 * Typeset lines as a justified block (each line fitted to the same width,
 * packed on their cap heights) and inverse-map it into the envelope.
 */
function warpBlock(lines: Array<{ text: string; spec: TypeSpec }>, env: Env, box: Box): { canvas: Canvas; x: number; y: number } {
  const SW = 1800
  const probe = getCtx(makeCanvas(4, 4))
  const sized = lines.map((l) => {
    const size = fitSize(probe, l.text, l.spec, SW, 1400)
    const m = measureType(probe, l.text, l.spec, size)
    return { ...l, size, ascent: m.ascent, descent: Math.min(m.descent, size * 0.05), width: m.width }
  })
  const gap = sized[0].size * 0.06
  const SH = Math.ceil(sized.reduce((s, l) => s + l.ascent + l.descent, 0) + gap * (sized.length - 1))
  const src = makeCanvas(SW, SH)
  const sctx = getCtx(src)
  sctx.fillStyle = '#000'
  let y = 0
  for (const l of sized) {
    // stretch each line horizontally to exactly fill the measure
    const tr = useType(sctx, l.spec, l.size)
    const natural = textWidth(sctx, l.text, tr)
    sctx.save()
    sctx.translate(0, y + l.ascent)
    sctx.scale(SW / natural, 1)
    sctx.textBaseline = 'alphabetic'
    fillTracked(sctx, l.text, 0, 0, tr, 'left')
    sctx.restore()
    y += l.ascent + l.descent + gap
  }
  const srcData = sctx.getImageData(0, 0, SW, SH).data
  const W = Math.ceil(box.w)
  let minTop = Infinity
  let maxBot = -Infinity
  for (let i = 0; i <= 50; i++) {
    const t = i / 50
    minTop = Math.min(minTop, env.top(t))
    maxBot = Math.max(maxBot, env.bottom(t))
  }
  const H = Math.ceil(maxBot - minTop)
  const out = makeCanvas(W, H)
  const octx = getCtx(out)
  const img = octx.createImageData(W, H)
  const d = img.data
  for (let px = 0; px < W; px++) {
    const t = px / (W - 1)
    const top = env.top(t) - minTop
    const bot = env.bottom(t) - minTop
    const span = bot - top
    const sx = t * (SW - 1)
    const ix = Math.min(SW - 2, Math.floor(sx))
    const fx = sx - ix
    for (let py = Math.max(0, Math.floor(top)); py < Math.min(H, Math.ceil(bot)); py++) {
      const v = (py - top) / span
      if (v < 0 || v > 1) continue
      const sy = v * (SH - 1)
      const iy = Math.min(SH - 2, Math.floor(sy))
      const fy = sy - iy
      const i00 = (iy * SW + ix) * 4 + 3
      const a00 = srcData[i00]
      const a10 = srcData[i00 + 4]
      const a01 = srcData[i00 + SW * 4]
      const a11 = srcData[i00 + SW * 4 + 4]
      const alpha = (a00 * (1 - fx) + a10 * fx) * (1 - fy) + (a01 * (1 - fx) + a11 * fx) * fy
      const o = (py * W + px) * 4
      d[o + 3] = alpha
    }
  }
  octx.putImageData(img, 0, 0)
  return { canvas: out, x: box.x, y: minTop }
}

function tintMask(mask: Canvas, color: string): Canvas {
  const out = makeCanvas(mask.width, mask.height)
  const o = getCtx(out)
  o.drawImage(mask, 0, 0)
  o.globalCompositeOperation = 'source-in'
  o.fillStyle = color
  o.fillRect(0, 0, out.width, out.height)
  return out
}

