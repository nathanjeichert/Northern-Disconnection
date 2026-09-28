import {
  type Box,
  type Ctx,
  type Layer,
  type PlacedLine,
  type Rng,
  type StackLine,
  type TypeSpec,
  apMonth,
  clampParagraph,
  drawMark,
  drawMarkSilhouette,
  drawType,
  drawWordmark,
  fitLines,
  fitSize,
  fitStack,
  measureStack,
  grain,
  inkTexture,
  knockOut,
  measureType,
  misregister,
  newLayer,
  paper,
  printLayer,
  shortTime,
  SITE_URL,
  starPath,
  textWidth,
  tint,
  useType,
  woodGrain,
  fillTracked,
  mixHex,
} from '../kit'
import type { StyleContext } from '../types'

/*
  HATCH SHOW — a Nashville-style letterpress show bill. Stacked wood type
  where every line is set to fill the measure, two or three inks on
  manila or coloured stock, stars and rules, the guitar-tree mark cut as
  the "woodcut", wood grain starving the big solids, and each ink laid
  down slightly out of register.
*/

interface Stock {
  color: string
  colored?: boolean
}

const STOCKS: Stock[] = [
  { color: '#f1e6cb' }, // cream
  { color: '#e8d4a6' }, // manila
  { color: '#ece6d4' }, // newsprint
  { color: '#e9b847', colored: true }, // goldenrod
  { color: '#eec4a2', colored: true }, // salmon
]

interface InkSet {
  key: string
  accent: string
  third?: string
}

const INK_SETS: InkSet[] = [
  { key: '#1e2b47', accent: '#c4382b', third: '#e9b949' }, // navy / hatch red / marigold
  { key: '#132a1e', accent: '#b8402b', third: '#e9b949' }, // pine / brick / marigold
  { key: '#1c1a17', accent: '#8a2331' }, // black / burgundy
  { key: '#5a1822', accent: '#2d5c3c', third: '#e9b949' }, // burgundy / forest / marigold
  { key: '#1c1a17', accent: '#c4382b' }, // black / red
  { key: '#1e2b47', accent: '#2f8a86' }, // navy / turquoise
]

type LayoutKind = 'bill' | 'fountain' | 'cut'

const TOPLINES = ['LIVE MUSIC', 'LIVE & IN PERSON', 'IN CONCERT', 'LIVE ON STAGE']
const TAGLINES = [
  'PSYCHEDELIC AMERICANA',
  'PSYCHEDELIC AMERICANA',
  'FROM THE REDWOODS OF SONOMA COUNTY',
  'DEAD · CSNY · STEELY DAN & ORIGINALS',
]

export default function hatch(sc: StyleContext) {
  const { ctx, w, h, rng, story, copy, fonts } = sc
  const look = rng.fork('look')

  const stock = look.pick(STOCKS)
  const inkChoices = INK_SETS.filter((s) => !(stock.colored && s.third))
  const inks = look.pick(inkChoices)
  const layout: LayoutKind = look.weighted([
    ['bill', 1],
    ['fountain', 1],
    ['cut', 1],
  ])

  // Wood-type faces: gothic, slab, Tuscan, fat face, Caslon roman.
  const F = {
    gothic: (weight = 700, tracking = 0.02): TypeSpec => ({ family: fonts.gothic, weight, tracking }),
    slab: (tracking = 0.01): TypeSpec => ({ family: fonts.slab, tracking }),
    rye: (tracking = 0.02): TypeSpec => ({ family: fonts.rye, tracking }),
    fat: (tracking = 0): TypeSpec => ({ family: fonts.display, weight: 900, tracking }),
    roman: (tracking = 0.12): TypeSpec => ({ family: fonts.caslon, tracking }),
    body: (weight = 700, tracking = 0.2, italic = false): TypeSpec => ({ family: fonts.body, weight, tracking, italic }),
  }
  const faceSet = look.pick([
    { weekday: F.rye(0.04), date: F.slab(0.01), venue: F.gothic(700, 0.03), band: F.slab(0.01) },
    { weekday: F.gothic(600, 0.18), date: F.fat(0), venue: F.slab(0.01), band: F.gothic(700, 0.02) },
    { weekday: F.roman(0.2), date: F.rye(0.02), venue: F.gothic(700, 0.03), band: F.fat(0) },
    { weekday: F.slab(0.1), date: F.gothic(700, 0.01), venue: F.rye(0.02), band: F.slab(0) },
  ])

  paper(ctx, w, h, rng.fork('paper'), { color: stock.color, tone: 0.7, fibers: 110, specks: 70, age: 0.55 })

  const key = newLayer(w, h)
  const accent = newLayer(w, h)
  const third = inks.third ? newLayer(w, h) : null
  const fountain = newLayer(w, h)
  // layers hold coverage only; each is colourised with its ink when printed
  for (const L of [key, accent, third]) {
    if (!L) continue
    L.ctx.fillStyle = '#000'
    L.ctx.strokeStyle = '#000'
  }

  // ---- frame ----------------------------------------------------------
  const frameInset = 30
  const frameOuter = 12
  drawFrame(key.ctx, w, h, frameInset, frameOuter, look)

  const safeTop = story ? 150 : 0
  const safeBottom = story ? 170 : 0
  const pad = 30
  const inner: Box = {
    x: frameInset + frameOuter + pad + 12,
    y: frameInset + frameOuter + pad + 8 + safeTop * 0.55,
    w: w - 2 * (frameInset + frameOuter + pad + 12),
    h: 0,
  }
  // footer sits in the bottom of the frame
  const footerH = 46
  inner.h = h - inner.y - (frameInset + frameOuter + pad + footerH) - safeBottom * 0.55

  const topline = look.pick(TOPLINES)
  const tagline = look.pick(TAGLINES)
  const month = apMonth(copy)
  const rawDate = (month && copy.day ? `${month} ${copy.day}` : copy.monthDay).toUpperCase()
  // Rye's ornamental full stop reads like an eye at poster sizes
  const dateText = faceSet.date.family === fonts.rye ? rawDate.replace('.', '') : rawDate
  const weekdayText = (copy.weekday ?? '').toUpperCase()
  const venueText = copy.venue.toUpperCase()
  const whereParts = [copy.location.toUpperCase(), copy.time ? shortTime(copy.time).toUpperCase() : ''].filter(Boolean)
  const lay = rng.fork('layout')

  // Venue: one line if it fits big enough, otherwise two balanced lines.
  const venueLines = (measure: number, maxSize: number): string[] => {
    const one = fitSize(ctx, venueText, faceSet.venue, measure, maxSize)
    if (one >= maxSize * 0.55 || !venueText.includes(' ')) return [venueText]
    return fitLines(ctx, venueText, faceSet.venue, measure, 2, maxSize, 20).lines
  }

  const descSpec = F.body(500, 0, true)
  const descLines = (measure: number, size: number) =>
    clampParagraph(ctx, copy.description, descSpec, size, measure, 2)

  // ---- compose --------------------------------------------------------
  const G = (n: number) => n * (story ? 1.15 : 1)
  const topSpec = F.gothic(600, 0.3)
  const whereLine = (tag: string): StackLine => ({
    text: whereParts.join('  •  '),
    spec: F.gothic(500, 0.12),
    size: 46,
    measure: inner.w * 0.92,
    gap: G(16),
    tag: `${tag} where`,
  })
  const descStack = (measure: number): StackLine[] =>
    descLines(measure, 28).map((d) => ({ text: d, spec: descSpec, size: 28, gap: 8, tag: 'key desc' }))
  const venueStack = (maxSize: number, tag: string): StackLine[] => {
    const vl = venueLines(inner.w, maxSize).map((v) => ({ text: v, spec: faceSet.venue, size: maxSize, gap: G(10), tag }))
    vl[vl.length - 1].gap = G(18)
    return vl
  }

  const lines: StackLine[] = []
  let stackBox: Box = inner
  let panel: Box | null = null
  let cutBlock: Box | null = null
  let topBox: Box | null = null

  if (layout === 'bill') {
    lines.push({ text: tagline, spec: F.body(800, 0.32), size: 34, gap: G(34), tag: 'accent rule-after' })
    if (weekdayText) lines.push({ text: weekdayText, spec: faceSet.weekday, size: 116, measure: inner.w * 0.78, gap: G(14), tag: 'accent' })
    lines.push({ text: dateText, spec: faceSet.date, size: 250, gap: G(20), tag: 'key' })
    lines.push(...venueStack(132, 'key'), whereLine('accent'), ...descStack(inner.w * 0.86))
    lines[lines.length - 1].gap = 0
    const topH = 34
    const gapA = G(24)
    const gapB = G(40)
    const natural = measureStack(ctx, lines, inner.w)
    const room = inner.h - topH - gapA - gapB - natural
    const panelH = Math.max(inner.h * 0.2, Math.min(room, inner.h * (story ? 0.34 : 0.3)))
    topBox = { x: inner.x, y: inner.y, w: inner.w, h: topH }
    panel = { x: inner.x - 6, y: inner.y + topH + gapA, w: inner.w + 12, h: panelH }
    const sy = panel.y + panel.h + gapB
    stackBox = { x: inner.x, y: sy, w: inner.w, h: inner.y + inner.h - sy }
  } else if (layout === 'fountain') {
    lines.push({ text: topline, spec: topSpec, size: 46, gap: G(24), tag: 'stars-accent' })
    if (weekdayText) lines.push({ text: weekdayText, spec: faceSet.weekday, size: 104, measure: inner.w * 0.7, gap: G(12), tag: 'key' })
    lines.push({ text: dateText, spec: faceSet.date, size: 220, gap: G(18), tag: 'accent' })
    lines.push(...venueStack(120, 'key'), whereLine('accent'), ...descStack(inner.w * 0.86))
    lines[lines.length - 1].gap = 0
    const natural = measureStack(ctx, lines, inner.w)
    const top = frameInset + frameOuter + 16 + safeTop * 0.35
    const gapB = G(40)
    const room = inner.y + inner.h - top - gapB - natural
    const panelH = Math.max(inner.h * 0.3, Math.min(room, inner.h * (story ? 0.5 : 0.46)))
    panel = { x: frameInset + frameOuter + 16, y: top, w: w - 2 * (frameInset + frameOuter + 16), h: panelH }
    const sy = panel.y + panel.h + gapB
    stackBox = { x: inner.x, y: sy, w: inner.w, h: inner.y + inner.h - sy }
  } else {
    lines.push({ text: 'NORTHERN', spec: faceSet.band, size: 170, gap: G(10), tag: 'key' })
    lines.push({ text: 'DISCONNECTION', spec: faceSet.band, size: 170, gap: G(34), tag: 'key rule-after' })
    lines.push(...venueStack(110, 'accent'))
    lines.push({ ...whereLine('key'), text: copy.location.toUpperCase() })
    lines.push(...descStack(inner.w * 0.86))
    lines[lines.length - 1].gap = 0
    const natural = measureStack(ctx, lines, inner.w)
    const gapB = G(40)
    const room = inner.h - gapB - natural
    const cutH = Math.max(inner.h * 0.36, Math.min(room, inner.h * (story ? 0.56 : 0.5)))
    cutBlock = { x: inner.x, y: inner.y, w: inner.w, h: cutH }
    const sy = inner.y + cutH + gapB
    stackBox = { x: inner.x, y: sy, w: inner.w, h: inner.y + inner.h - sy }
  }

  if (panel && layout === 'bill') {
    drawBillPanel(sc, panel, key, third, faceSet.band, look)
    if (topBox) {
      fitStack(ctx, [{ text: topline, spec: topSpec, size: 44 }], topBox, { valign: 'center' }).forEach((p) => {
        drawLine(accent.ctx, p, lay)
        flankStars(accent.ctx, p, lay)
      })
    }
    if (copy.time && look.chance(0.55)) {
      const r = Math.min(96, panel.h * 0.36)
      const sx = look.chance(0.5) ? panel.x + panel.w - r * 0.5 : panel.x + r * 0.5
      const sy = panel.y + panel.h - r * 0.15
      // the seal sits on top of the panel: clear the key ink beneath it
      key.ctx.save()
      key.ctx.globalCompositeOperation = 'destination-out'
      key.ctx.beginPath()
      starPath(key.ctx, sx, sy, r + 5, (r + 5) * 0.84, 22, 0)
      key.ctx.fill()
      key.ctx.restore()
      seal(accent.ctx, sx, sy, r, shortTime(copy.time).toUpperCase(), fonts.gothic, look)
    }
  }
  if (panel && layout === 'fountain') drawFountainPanel(sc, panel, key, fountain, inks, look)
  if (cutBlock) drawCutBlock(sc, cutBlock, key, accent, third, faceSet, weekdayText, month, lay)

  // ---- the type stack ----------------------------------------------------
  const placed = fitStack(ctx, lines, stackBox, { valign: 'spread', align: 'center', maxSpreadGap: G(26) })
  placed.forEach((p, i) => {
    const tag = p.line.tag ?? 'key'
    const target = tag.includes('accent') ? accent.ctx : key.ctx
    if (tag.includes('where')) drawWhere(target, key.ctx, p, lay)
    else drawLine(target, p, lay)
    if (tag.includes('stars')) flankStars(target, p, lay)
    if (tag.includes('rule-after')) {
      const next = placed[i + 1]
      const y = next ? (p.bottom + next.top) / 2 : p.bottom + 12
      doubleRule(target, stackBox.x + stackBox.w * 0.1, stackBox.x + stackBox.w * 0.9, y, lay)
    }
  })

  // ---- footer ----------------------------------------------------------
  const footY = h - frameInset - frameOuter - pad - 6 - safeBottom * 0.55
  const footSpec = F.body(800, 0.24)
  useType(ctx, footSpec, 22)
  key.ctx.fillStyle = '#000'
  drawType(key.ctx, SITE_URL.toUpperCase(), w / 2, footY, footSpec, 22, 'center')
  const urlW = measureType(ctx, SITE_URL.toUpperCase(), footSpec, 22).width
  starPath(accent.ctx, w / 2 - urlW / 2 - 26, footY - 8, 9, 3.8)
  starPath(accent.ctx, w / 2 + urlW / 2 + 26, footY - 8, 9, 3.8)
  accent.ctx.fill()
  // printer's imprint, tiny, in the frame margin
  drawType(key.ctx, `NORTHERN DISCONNECTION SHOW PRINT  ·  No. ${sc.printNo}`, w / 2, h - frameInset + 20 - 2, F.body(700, 0.2), 13, 'center')

  // ---- print ----------------------------------------------------------
  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.42, specks: 1.1, scratches: 0.5 })
  const grainMask = woodGrain(w, h, rng.fork('grain'), { density: 1, strength: 0.9 })
  knockOut(key, grainMask, 0.55)
  knockOut(accent, grainMask, 0.4, rng.range(-300, 0), 0)
  const reg = rng.fork('register')
  if (layout === 'fountain') printLayer(ctx, fountain, { color: null, offset: misregister(reg, 3), texture: tex, wear: 0.7, rng: reg })
  if (third && inks.third) printLayer(ctx, third, { color: inks.third, offset: misregister(reg, 4), texture: tex, wear: 0.6, rng: reg })
  printLayer(ctx, accent, { color: inks.accent, offset: misregister(reg, 3.5), texture: tex, wear: 0.75, rng: reg })
  printLayer(ctx, key, { color: inks.key, offset: misregister(reg, 1.5), texture: tex, wear: 0.8, rng: reg })
  grain(ctx, w, h, rng, 0.1)
}

/* ---------------------------------------------------------------------- */

function drawFrame(ctx: Ctx, w: number, h: number, inset: number, outer: number, rng: Rng) {
  ctx.save()
  ctx.lineJoin = 'miter'
  ctx.lineWidth = outer
  ctx.strokeRect(inset + outer / 2, inset + outer / 2, w - 2 * inset - outer, h - 2 * inset - outer)
  ctx.lineWidth = 3
  const i2 = inset + outer + 9
  ctx.strokeRect(i2, i2, w - 2 * i2, h - 2 * i2)
  // corner stars
  if (rng.chance(0.6)) {
    const c = inset + outer / 2
    for (const [x, y] of [
      [c, c],
      [w - c, c],
      [c, h - c],
      [w - c, h - c],
    ] as const) {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(x, y, 17, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.beginPath()
      starPath(ctx, x, y, 15, 6)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawLine(ctx: Ctx, p: PlacedLine, rng: Rng) {
  const tilt = rng.range(-0.0045, 0.0045)
  const dx = rng.range(-3, 3)
  const cx = p.left + p.width / 2
  const cy = (p.top + p.bottom) / 2
  ctx.save()
  ctx.translate(cx + dx, cy)
  ctx.rotate(tilt)
  ctx.translate(-cx, -cy)
  drawType(ctx, p.line.text, cx, p.baseline, p.line.spec, p.size, 'center')
  ctx.restore()
}

/** Draw "CITY, ST • 8 PM" with the bullets swapped for little stars. */
function drawWhere(ctx: Ctx, starCtx: Ctx, p: PlacedLine, rng: Rng) {
  const parts = p.line.text.split('  •  ')
  if (parts.length < 2) {
    drawLine(ctx, p, rng)
    return
  }
  const tracking = useType(ctx, p.line.spec, p.size)
  const sep = '  •  '
  let x = p.left
  const baseline = p.baseline
  parts.forEach((part, i) => {
    useType(ctx, p.line.spec, p.size)
    fillTracked(ctx, part, x, baseline, tracking, 'left')
    x += textWidth(ctx, part, tracking) + tracking
    if (i < parts.length - 1) {
      const sw = textWidth(ctx, sep, tracking)
      const r = p.size * 0.26
      starCtx.beginPath()
      starPath(starCtx, x + sw / 2 - tracking / 2, baseline - p.size * 0.36, r, r * 0.42)
      starCtx.fill()
      x += sw + tracking
    }
  })
}

function flankStars(ctx: Ctx, p: PlacedLine, rng: Rng) {
  const r = p.size * 0.36
  const cy = p.baseline - p.size * 0.36
  const gap = p.size * 0.55
  ctx.beginPath()
  starPath(ctx, p.left - gap - r, cy, r, r * 0.42, 5, -Math.PI / 2 + rng.range(-0.05, 0.05))
  starPath(ctx, p.right + gap + r, cy, r, r * 0.42, 5, -Math.PI / 2 + rng.range(-0.05, 0.05))
  ctx.fill()
}

/** A starburst seal with reversed-out text (e.g. the door time). */
function seal(ctx: Ctx, cx: number, cy: number, r: number, text: string, family: string, rng: Rng) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rng.range(-0.28, -0.12))
  ctx.beginPath()
  starPath(ctx, 0, 0, r, r * 0.84, 22, 0)
  ctx.fill()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2)
  ctx.stroke()
  const spec: TypeSpec = { family, weight: 700, tracking: 0.02 }
  const size = fitSize(ctx, text, spec, r * 1.18, r * 0.62)
  const m = measureType(ctx, text, spec, size)
  drawType(ctx, text, 0, m.ascent / 2, spec, size, 'center')
  ctx.restore()
}

function doubleRule(ctx: Ctx, x1: number, x2: number, y: number, rng: Rng) {
  const tilt = rng.range(-0.6, 0.6)
  ctx.fillRect(x1, y - 4 + tilt, x2 - x1, 4)
  ctx.fillRect(x1, y + 3 - tilt, x2 - x1, 1.6)
}

/** A solid key-ink panel with the mark cut in and the band name reversed out. */
function drawBillPanel(sc: StyleContext, box: Box, key: Layer, third: Layer | null, bandSpec: TypeSpec, rng: Rng) {
  const { ctx, logo } = sc
  key.ctx.fillStyle = '#000'
  key.ctx.fillRect(box.x, box.y, box.w, box.h)
  const pad = Math.min(34, box.h * 0.11)
  let textX = box.x + pad * 1.4
  const markLeft = rng.chance(0.75)
  if (logo) {
    const mh = box.h - pad * 1.2
    const mw = mh * logo.markAspect
    const mx = markLeft ? box.x + pad * 1.6 : box.x + box.w - pad * 1.6 - mw
    const my = box.y + (box.h - mh) / 2
    // cut the silhouette out of the solid, then print the lines back in
    key.ctx.save()
    key.ctx.globalCompositeOperation = 'destination-out'
    drawMarkSilhouette(key.ctx, logo, mx, my, mh, '#000')
    key.ctx.restore()
    drawMark(key.ctx, logo, mx, my, mh, '#000')
    if (third) drawMarkFill(third.ctx, sc, mx, my, mh)
    if (markLeft) textX = mx + mw + pad * 1.2
  }
  const textW = markLeft && logo ? box.x + box.w - pad * 1.4 - textX : box.w - pad * 2.8 - (logo ? box.h * 0.36 + pad : 0)
  const lines: StackLine[] = [
    { text: 'NORTHERN', spec: bandSpec, size: box.h * 0.46, gap: box.h * 0.05 },
    { text: 'DISCONNECTION', spec: bandSpec, size: box.h * 0.46 },
  ]
  const placed = fitStack(ctx, lines, { x: textX, y: box.y + pad, w: textW, h: box.h - pad * 2 }, { align: 'center', valign: 'center' })
  key.ctx.save()
  key.ctx.globalCompositeOperation = 'destination-out'
  placed.forEach((p) => drawType(key.ctx, p.line.text, p.left + p.width / 2, p.baseline, p.line.spec, p.size, 'center'))
  key.ctx.restore()
}

function drawMarkFill(ctx: Ctx, sc: StyleContext, x: number, y: number, h: number) {
  if (!sc.logo) return
  const w = h * sc.logo.markAspect
  ctx.drawImage(tint(sc.logo.markFill, '#000'), x, y, w, h)
}

/** Split-fountain panel: two inks blended on the roller, logo reversed out. */
function drawFountainPanel(
  sc: StyleContext,
  box: Box,
  key: Layer,
  fountain: Layer,
  inks: InkSet,
  rng: Rng,
) {
  const { logo, story } = sc
  const f = fountain.ctx
  const a = inks.accent
  const b = inks.third ?? mixHex(inks.accent, '#f2c94c', 0.75)
  const g = f.createLinearGradient(box.x, 0, box.x + box.w, 0)
  const flip = rng.chance(0.5)
  const c0 = flip ? b : a
  const c1 = flip ? a : b
  g.addColorStop(0, c0)
  g.addColorStop(rng.range(0.2, 0.35), c0)
  g.addColorStop(rng.range(0.65, 0.8), c1)
  g.addColorStop(1, c1)
  f.fillStyle = g
  f.fillRect(box.x, box.y, box.w, box.h)
  // roller streaks
  for (let i = 0; i < 26; i++) {
    const x = box.x + rng.next() * box.w
    f.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
    f.fillRect(x, box.y, rng.range(2, 14), box.h)
  }
  // Mark and wordmark reversed out of the fountain.
  if (!logo) return
  const pad = box.h * 0.12
  const mh = box.h - pad * 2
  const mw = mh * logo.markAspect
  const wordW = Math.min(box.w - mw - pad * 4, (box.h - pad * 2) * 2.4)
  const wordH = wordW / logo.wordAspect
  const groupW = mw + pad * 0.9 + wordW
  const gx = box.x + (box.w - groupW) / 2
  const my = box.y + pad
  f.save()
  f.globalCompositeOperation = 'destination-out'
  drawMarkSilhouette(f, logo, gx, my, mh, '#000')
  drawWordmark(f, logo, gx + mw + pad * 0.9, box.y + (box.h - wordH) / 2 + (story ? 0 : 4), wordW, '#000')
  f.restore()
  drawMark(key.ctx, logo, gx, my, mh, '#000')
}

/** Tall woodcut mark at left with a column of date type at right. */
function drawCutBlock(
  sc: StyleContext,
  box: Box,
  key: Layer,
  accent: Layer,
  third: Layer | null,
  faceSet: { weekday: TypeSpec; date: TypeSpec; venue: TypeSpec; band: TypeSpec },
  weekdayText: string,
  month: string | null,
  lay: Rng,
) {
  const { ctx, logo, copy, fonts } = sc
  const markH = box.h
  const markW = logo ? markH * logo.markAspect : 0
  const markX = box.x + 10
  if (logo) {
    if (third) drawMarkFill(third.ctx, sc, markX, box.y, markH)
    else {
      // hatch the interior in the accent ink instead
      accent.ctx.save()
      accent.ctx.drawImage(tint(logo.markFill, '#000'), markX, box.y, markW, markH)
      accent.ctx.globalCompositeOperation = 'destination-out'
      for (let y = box.y; y < box.y + markH; y += 7) accent.ctx.fillRect(markX, y, markW, 3.2)
      accent.ctx.restore()
    }
    drawMark(key.ctx, logo, markX, box.y, markH, '#000')
  }
  const colX = markX + markW + 36
  const col: Box = { x: colX, y: box.y, w: box.x + box.w - colX, h: box.h }
  const lines: StackLine[] = [
    { text: 'LIVE!', spec: { family: fonts.rye, tracking: 0.06 }, size: 120, gap: 18, tag: 'accent' },
  ]
  if (weekdayText) lines.push({ text: weekdayText, spec: { family: fonts.gothic, weight: 600, tracking: 0.16 }, size: 70, gap: 12, tag: 'key' })
  if (month && copy.day) {
    const monthText = faceSet.venue.family === fonts.rye ? month.toUpperCase().replace('.', '') : month.toUpperCase()
    lines.push({ text: monthText, spec: faceSet.venue, size: 150, gap: 14, tag: 'key' })
    lines.push({ text: String(copy.day), spec: faceSet.date, size: 520, gap: 18, tag: 'accent' })
  } else {
    // no readable date ("TBA", "Fall 2026"): stack the words as written, big,
    // where the day number would stand
    const words = copy.monthDay.toUpperCase().split(/\s+/).filter(Boolean)
    const per = Math.ceil(words.length / Math.min(3, Math.max(1, words.length)))
    for (let i = 0; i < words.length; i += per) {
      lines.push({ text: words.slice(i, i + per).join(' '), spec: faceSet.date, size: 260, gap: 10, tag: 'accent' })
    }
  }
  if (copy.time) lines.push({ text: shortTime(copy.time).toUpperCase(), spec: { family: fonts.gothic, weight: 700, tracking: 0.08 }, size: 80, tag: 'key' })
  lines[lines.length - 1].gap = 0
  const placed = fitStack(ctx, lines, col, { align: 'center', valign: month && copy.day ? 'spread' : 'center' })
  placed.forEach((p) => drawLine(p.line.tag === 'accent' ? accent.ctx : key.ctx, p, lay))
  // a rule between each group
  placed.slice(0, -1).forEach((p, i) => {
    const next = placed[i + 1]
    if (next.top - p.bottom > 26) {
      const y = (p.bottom + next.top) / 2
      key.ctx.fillRect(col.x + col.w * 0.2, y - 1.5, col.w * 0.6, 3)
    }
  })
}
