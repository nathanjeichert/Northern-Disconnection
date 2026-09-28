import {
  type Box,
  type Ctx,
  type Rng,
  type StackLine,
  type TypeSpec,
  apMonth,
  clampParagraph,
  drawMark,
  drawType,
  drawWordmark,
  fitStack,
  getCtx,
  grain,
  inkTexture,
  makeCanvas,
  mixHex,
  newLayer,
  paper,
  printLayer,
  rgba,
  SITE_URL,
  woodGrain,
  jSafe,
} from '../kit'
import type { StyleContext } from '../types'

/*
  TICKET STUB — an engraved ticket lying on a table: tinted security stock
  covered in guilloché (spirograph rosettes built from superimposed
  sinusoids, wavy line bands, a fine banknote ground), a medallion holding
  the guitar-tree mark, the bill in condensed gothic, a red numbering-machine
  serial from the print number, a perforated keep-this-coupon stub, and
  punched corner notches. Photographed slightly askew with a soft shadow.
*/

interface TicketPalette {
  stock: string
  guilloche: string
  ink: string
  red: string
  surface: 'wood' | 'felt'
  surfaceColor: string
}

const PALETTES: TicketPalette[] = [
  { stock: '#e7efe0', guilloche: '#6f9a86', ink: '#1d2b25', red: '#c23a2b', surface: 'wood', surfaceColor: '#4a2f1d' },
  { stock: '#f4ddd3', guilloche: '#c07a78', ink: '#3a1a22', red: '#8a2331', surface: 'felt', surfaceColor: '#12281c' },
  { stock: '#f3ead2', guilloche: '#c49a4f', ink: '#1f2533', red: '#b8322a', surface: 'wood', surfaceColor: '#3a2618' },
  { stock: '#dde8ee', guilloche: '#6b8fae', ink: '#14213d', red: '#c23a2b', surface: 'felt', surfaceColor: '#5a1a22' },
  { stock: '#f1dc93', guilloche: '#b0873a', ink: '#2a1e12', red: '#a8321f', surface: 'felt', surfaceColor: '#1b2a3a' },
]

export default function ticket(sc: StyleContext) {
  const { ctx, w, h, rng, story } = sc
  const look = rng.fork('look')
  const pal = look.pick(PALETTES)

  // ---- the table ---------------------------------------------------------------
  paper(ctx, w, h, rng.fork('surface'), { color: pal.surfaceColor, tone: 0.8, fibers: pal.surface === 'felt' ? 260 : 20, specks: 20, age: 0.9, dark: true })
  if (pal.surface === 'wood') {
    const g = woodGrain(w, h, rng.fork('wood'), { density: 1.6, strength: 1.4, vertical: look.chance(0.5) })
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(g, 0, 0)
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.12
    ctx.drawImage(g, 7, 3)
    ctx.restore()
  }

  // ---- the ticket, drawn flat then laid on the table ----------------------------
  const tw = story ? 820 : 760
  const th = story ? 1540 : 1170
  const t = drawTicket(sc, tw, th, pal, look)
  const angle = look.range(-0.045, 0.045)
  ctx.save()
  ctx.translate(w / 2 + look.range(-10, 10), h / 2 + (story ? 0 : 4))
  ctx.rotate(angle)
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 38
  ctx.shadowOffsetX = 10
  ctx.shadowOffsetY = 18
  ctx.drawImage(t, -tw / 2, -th / 2)
  ctx.restore()
  grain(ctx, w, h, rng, 0.09)
}

function notchedTicket(p: Path2D, w: number, h: number, r: number, perfY: number, pr: number) {
  // corner notches (concave quarter circles) and half-round notches at the perforation
  p.moveTo(r, 0)
  p.lineTo(w - r, 0)
  p.arc(w, 0, r, Math.PI, Math.PI / 2, true)
  p.lineTo(w, perfY - pr)
  p.arc(w, perfY, pr, -Math.PI / 2, Math.PI / 2, true)
  p.lineTo(w, h - r)
  p.arc(w, h, r, -Math.PI / 2, Math.PI, true)
  p.lineTo(r, h)
  p.arc(0, h, r, 0, -Math.PI / 2, true)
  p.lineTo(0, perfY + pr)
  p.arc(0, perfY, pr, Math.PI / 2, -Math.PI / 2, true)
  p.lineTo(0, r)
  p.arc(0, 0, r, Math.PI / 2, 0, true)
  p.closePath()
}

function drawTicket(sc: StyleContext, W: number, H: number, pal: TicketPalette, rng: Rng) {
  const { copy, fonts, logo, story, printNo } = sc
  const canvas = makeCanvas(W, H)
  const c = getCtx(canvas)
  const stubH = story ? 360 : 290
  const perfY = H - stubH
  const shape = new Path2D()
  notchedTicket(shape, W, H, 30, perfY, 22)

  // stock
  c.save()
  c.clip(shape)
  paper(c, W, H, rng.fork('stock'), { color: pal.stock, tone: 0.5, fibers: 80, specks: 30, age: 0.35 })

  const pattern = newLayer(W, H)
  const key = newLayer(W, H)
  const red = newLayer(W, H)
  const p = pattern.ctx
  const k = key.ctx
  const r = red.ctx
  p.strokeStyle = '#000'
  k.fillStyle = '#000'
  k.strokeStyle = '#000'
  r.fillStyle = '#000'

  // fine banknote ground: stacked wavy lines
  p.lineWidth = 0.7
  p.globalAlpha = 0.45
  const f1 = rng.range(0.018, 0.03)
  for (let y = -10; y < H + 10; y += 5.5) {
    p.beginPath()
    for (let x = 0; x <= W; x += 6) {
      const yy = y + Math.sin(x * f1 + y * 0.05) * 3 + Math.sin(x * f1 * 2.7 - y * 0.02) * 1.2
      if (x === 0) p.moveTo(x, yy)
      else p.lineTo(x, yy)
    }
    p.stroke()
  }
  p.globalAlpha = 1

  const m = 34
  // guilloché bands top and bottom of the main body
  const band = (y0: number, bh: number) => {
    k.lineWidth = 2
    k.strokeRect(m, y0, W - 2 * m, bh)
    p.save()
    p.beginPath()
    p.rect(m, y0, W - 2 * m, bh)
    p.clip()
    p.lineWidth = 0.9
    const waves = 9
    for (let i = 0; i < waves; i++) {
      const ph = (i / waves) * Math.PI * 2
      p.beginPath()
      for (let x = m; x <= W - m; x += 2) {
        const tt = (x - m) / 26
        const yy = y0 + bh / 2 + Math.sin(tt + ph) * (bh * 0.42) * Math.cos(tt * 0.18 + ph * 0.5)
        if (x === m) p.moveTo(x, yy)
        else p.lineTo(x, yy)
      }
      p.stroke()
    }
    p.restore()
  }
  const bandH = story ? 50 : 42
  band(m, bandH)
  band(perfY - m - bandH + 8, bandH)
  // side rules
  k.lineWidth = 1.2
  k.strokeRect(m + 10, m + bandH + 10, W - 2 * m - 20, perfY - 2 * m - 2 * bandH - 12)

  // medallion: a guilloché rosette around the mark
  const medCy = m + bandH + (story ? 214 : 146)
  const medR = story ? 150 : 106
  rosette(p, W / 2, medCy, medR, rng.fork('rosette'))
  c.save()
  k.save()
  k.lineWidth = 3
  k.beginPath()
  k.arc(W / 2, medCy, medR * 0.62, 0, Math.PI * 2)
  k.stroke()
  k.lineWidth = 1
  k.beginPath()
  k.arc(W / 2, medCy, medR * 0.62 - 7, 0, Math.PI * 2)
  k.stroke()
  k.restore()
  // clear the pattern inside the medallion so the mark reads
  p.save()
  p.globalCompositeOperation = 'destination-out'
  p.beginPath()
  p.arc(W / 2, medCy, medR * 0.62 - 2, 0, Math.PI * 2)
  p.fill()
  p.restore()
  c.restore()
  if (logo) {
    const mh = medR * 1.08
    const mw = mh * logo.markAspect
    drawMark(k, logo, W / 2 - mw / 2, medCy - mh / 2, mh, '#000')
  }

  // header: live in concert, serial
  const smallCaps: TypeSpec = { family: fonts.gothic, weight: 500, tracking: 0.32 }
  drawType(k, 'LIVE IN CONCERT', m + 26, m + bandH + 44, smallCaps, 20, 'left')
  drawType(r, `No ${printNo}`, W - m - 26, m + bandH + 46, { family: fonts.gothic, weight: 400, tracking: 0.12 }, 28, 'right')

  // the bill
  const top = medCy + medR * 1.08 + (story ? 34 : 18)
  const box: Box = { x: m + 40, y: top, w: W - 2 * m - 80, h: perfY - m - bandH - 24 - top }
  const wordW = Math.min(box.w * 0.86, story ? 560 : 430)
  const wordH = logo ? wordW / logo.wordAspect : 0
  if (logo) drawWordmark(k, logo, W / 2 - wordW / 2, box.y, wordW, '#000')
  const month = apMonth(copy)
  const dateText = copy.weekday && month && copy.day ? `${copy.weekday.toUpperCase()} · ${copy.month?.toUpperCase()} ${copy.day}` : copy.dateLine.toUpperCase()
  const lines: StackLine[] = [
    { text: 'GOOD FOR ONE EVENING OF PSYCHEDELIC AMERICANA', spec: { family: fonts.body, weight: 500, italic: true, tracking: 0.04 }, size: story ? 26 : 22, gap: story ? 22 : 16 },
    { text: dateText, spec: { family: fonts.gothic, weight: 600, tracking: 0.05 }, size: story ? 84 : 66, gap: 12, tag: 'red' },
    { text: copy.venue.toUpperCase(), spec: { family: fonts.gothic, weight: 700, tracking: 0.03 }, size: story ? 84 : 66, gap: 10 },
    { text: [copy.location, copy.time].filter(Boolean).join('   ·   ').toUpperCase(), spec: { family: fonts.gothic, weight: 400, tracking: 0.2 }, size: story ? 32 : 27, gap: 0 },
  ]
  const stackBox: Box = { x: box.x, y: box.y + wordH + (story ? 26 : 14), w: box.w, h: box.h - wordH - (story ? 26 : 14) }
  fitStack(k, lines, stackBox, { align: 'center', valign: 'spread', maxSpreadGap: story ? 26 : 12 }).forEach((pl) =>
    drawType(pl.line.tag === 'red' ? r : k, pl.line.text, pl.left + pl.width / 2, pl.baseline, pl.line.spec, pl.size, 'center'),
  )

  // perforation: a dashed rule of punched holes
  c.restore()
  const holes = new Path2D()
  for (let x = 40; x < W - 30; x += 15) {
    holes.moveTo(x + 3.2, perfY)
    holes.arc(x, perfY, 3.2, 0, Math.PI * 2)
  }

  // ---- stub ----------------------------------------------------------------
  const stub: Box = { x: m + 124, y: perfY + 30, w: W - 2 * m - 248, h: stubH - 60 }
  k.lineWidth = 1.2
  k.setLineDash([6, 5])
  k.strokeRect(m, perfY + 18, W - 2 * m, stubH - 18 - m + 6)
  k.setLineDash([])
  const shortDate = copy.date ? `${copy.monthShort?.toUpperCase()} ${copy.day} · ${copy.year}` : copy.monthDay.toUpperCase()
  const stubLines: StackLine[] = [
    { text: 'KEEP THIS COUPON', spec: { family: fonts.gothic, weight: 600, tracking: 0.4 }, size: story ? 26 : 22, gap: 12 },
    { text: `No ${printNo}`, spec: { family: fonts.gothic, weight: 400, tracking: 0.14 }, size: story ? 64 : 52, gap: 10, tag: 'red' },
    { text: `${shortDate}  ·  ${copy.city.toUpperCase()}`, spec: jSafe(fonts, shortDate, { family: fonts.gothic, weight: 500, tracking: 0.2 }), size: story ? 26 : 22, gap: 10 },
  ]
  clampParagraph(k, copy.description, { family: fonts.body, weight: 500, italic: true }, story ? 22 : 19, stub.w * 0.92, 2).forEach((d) =>
    stubLines.push({ text: d, spec: { family: fonts.body, weight: 500, italic: true }, size: story ? 22 : 19, gap: 3 }),
  )
  stubLines[stubLines.length - 1].gap = 10
  stubLines.push({ text: SITE_URL.toUpperCase(), spec: { family: fonts.gothic, weight: 500, tracking: 0.3 }, size: story ? 20 : 17 })
  fitStack(k, stubLines, stub, { align: 'center', valign: 'spread', maxSpreadGap: story ? 22 : 10 }).forEach((pl) =>
    drawType(pl.line.tag === 'red' ? r : k, pl.line.text, pl.left + pl.width / 2, pl.baseline, pl.line.spec, pl.size, 'center'),
  )
  // a small rosette seal on the stub
  rosette(p, m + 70, perfY + stubH / 2, 46, rng.fork('seal'), 10)
  rosette(p, W - m - 70, perfY + stubH / 2, 46, rng.fork('seal2'), 10)

  // ---- print --------------------------------------------------------------------
  const tex = inkTexture(W, H, rng.fork('ink'), { mottle: 0.25, specks: 0.5, scratches: 0.1 })
  c.save()
  c.clip(shape)
  printLayer(c, pattern, { color: pal.guilloche, offset: [rng.range(-1.5, 1.5), rng.range(-1.5, 1.5)], texture: tex, wear: 0.15, rng })
  printLayer(c, key, { color: pal.ink, texture: tex, wear: 0.3, rng })
  printLayer(c, red, { color: pal.red, offset: [rng.range(-3, 3), rng.range(-2, 2)], texture: tex, wear: 0.35, rng })
  c.restore()
  // punch the holes and notches through to the table
  c.save()
  c.globalCompositeOperation = 'destination-out'
  c.fill(holes)
  c.restore()
  c.save()
  c.globalCompositeOperation = 'destination-in'
  c.fill(shape)
  c.restore()
  // a faint edge so the card reads against the table
  c.save()
  c.strokeStyle = rgba(mixHex(pal.stock, '#000000', 0.4), 0.5)
  c.lineWidth = 1.5
  c.stroke(shape)
  c.restore()
  return canvas
}

/**
 * Guilloché rosette: two families of closed curves, each a circle modulated
 * by a sine, with radius and phase stepped curve to curve so the families
 * cross into a woven ring of fine lines.
 */
function rosette(p: Ctx, cx: number, cy: number, R: number, rng: Rng, curves = 22) {
  const lobes = rng.int(7, 13)
  const amp = R * rng.range(0.14, 0.2)
  const spread = R * 0.22
  p.save()
  p.lineWidth = R > 60 ? 0.75 : 0.6
  for (const dir of [1, -1]) {
    for (let i = 0; i < curves; i++) {
      const k = i / (curves - 1)
      const base = R * 0.78 - spread / 2 + k * spread
      const ph = dir * k * Math.PI * 0.9
      p.beginPath()
      for (let s = 0; s <= 900; s++) {
        const t = (s / 900) * Math.PI * 2
        const rr = base + amp * Math.sin(lobes * t + ph) * (0.75 + 0.25 * Math.cos(2 * lobes * t))
        const x = cx + Math.cos(t) * rr
        const y = cy + Math.sin(t) * rr
        if (s === 0) p.moveTo(x, y)
        else p.lineTo(x, y)
      }
      p.closePath()
      p.stroke()
    }
  }
  p.restore()
}
