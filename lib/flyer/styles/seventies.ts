import {
  type Box,
  type Ctx,
  type StackLine,
  type TypeSpec,
  clampParagraph,
  drawMark,
  drawMarkSilhouette,
  drawType,
  fitSize,
  fitStack,
  grain,
  inkTexture,
  measureType,
  newLayer,
  paper,
  printLayer,
  SITE_URL,
  textOnArc,
} from '../kit'
import type { StyleContext } from '../types'

/*
  GOLDEN STATE — the 1970s California of Steely Dan and Laurel Canyon
  sleeves: a striped setting sun, a band of rainbow stripes that sweeps
  across the sheet and bends around a corner or swells into a wave, and
  fat soft type with a stepped drop shadow in every stripe colour. Printed
  like a sun-faded tee: flat inks, a little starved, on sand stock.
*/

interface SeventiesPalette {
  paper: string
  stripes: string[]
  ink: string
  sun: string
}

const PALETTES: SeventiesPalette[] = [
  { paper: '#f3e6c8', stripes: ['#5b3520', '#a8441f', '#dc7a26', '#e9b949'], ink: '#3a2214', sun: '#e9b949' },
  { paper: '#efe3c9', stripes: ['#7a2230', '#c4552c', '#e39a3b', '#efc86a'], ink: '#3a1a1f', sun: '#efc86a' },
  { paper: '#ece5cf', stripes: ['#1d4030', '#4f7a4a', '#c9a13b', '#e3843a'], ink: '#1a2a20', sun: '#e3843a' },
  { paper: '#f1e7d0', stripes: ['#2b3f5c', '#3e8a8f', '#e0a33a', '#d4552f'], ink: '#1d2638', sun: '#e0a33a' },
  { paper: '#f4e9cf', stripes: ['#6b3f2a', '#b35a36', '#d98c4a', '#8fa06a'], ink: '#3a2418', sun: '#d98c4a' },
]

type Layout = 'sunset' | 'rainbow' | 'swoosh'

export default function seventies(sc: StyleContext) {
  const { ctx, w, h, rng, story, copy, fonts, logo } = sc
  const look = rng.fork('look')
  const pal = look.pick(PALETTES)
  const layout: Layout = look.pick(['sunset', 'rainbow', 'swoosh'] as const)
  paper(ctx, w, h, rng.fork('paper'), { color: pal.paper, tone: 0.55, fibers: 60, specks: 40, age: 0.45 })

  const art = newLayer(w, h)
  const a = art.ctx
  const stripeW = story ? 46 : 40
  const n = pal.stripes.length

  const titleTop = story ? 190 : 70
  const titleH = story ? 330 : 250
  const billTop = story ? h * 0.62 : h * 0.63

  if (layout === 'sunset') {
    // a striped half sun sitting on a horizon of stripes that run off both edges
    const horizon = billTop - (story ? 90 : 70)
    const sunR = w * (story ? 0.36 : 0.32)
    const cx = w / 2
    a.save()
    a.beginPath()
    a.rect(0, 0, w, horizon)
    a.clip()
    a.fillStyle = pal.sun
    a.beginPath()
    a.arc(cx, horizon, sunR, 0, Math.PI * 2)
    a.fill()
    // cut bars, thicker toward the horizon
    a.globalCompositeOperation = 'destination-out'
    let y = horizon - sunR * 0.08
    let bar = sunR * 0.08
    while (y > horizon - sunR * 0.75) {
      a.fillRect(cx - sunR - 4, y - bar, sunR * 2 + 8, bar)
      y -= bar + sunR * 0.075
      bar *= 0.72
    }
    a.restore()
    // stripes along the horizon
    pal.stripes.forEach((c, i) => {
      a.fillStyle = c
      a.fillRect(0, horizon + i * stripeW * 0.62, w, stripeW * 0.62 + 1)
    })
    // the mark stands in the sun
    if (logo) {
      const mh = sunR * 1.35
      const mw = mh * logo.markAspect
      drawMarkSilhouette(a, logo, cx - mw / 2, horizon - mh + 6, mh, pal.paper)
      drawMark(a, logo, cx - mw / 2, horizon - mh + 6, mh, pal.ink)
    }
  } else if (layout === 'rainbow') {
    // stacked rainbow arches with the mark sheltering underneath
    const cx = w / 2
    const baseY = billTop - (story ? 80 : 60)
    const outer = w * (story ? 0.46 : 0.42)
    pal.stripes.forEach((c, i) => {
      a.fillStyle = c
      a.beginPath()
      a.arc(cx, baseY, outer - i * stripeW, Math.PI, 0)
      a.arc(cx, baseY, outer - (i + 1) * stripeW, 0, Math.PI, true)
      a.closePath()
      a.fill()
      // legs drop straight down to the base line
    })
    // little clouds at the feet
    for (const side of [-1, 1]) {
      const fx = cx + side * (outer - (n * stripeW) / 2)
      a.fillStyle = pal.paper
      for (let k = 0; k < 4; k++) {
        a.beginPath()
        a.arc(fx + (k - 1.5) * stripeW * 0.9, baseY - (k % 2) * 8, stripeW * (0.9 + (k % 2) * 0.25), 0, Math.PI * 2)
        a.fill()
      }
      a.strokeStyle = pal.ink
      a.lineWidth = 4
      a.beginPath()
      for (let k = 0; k < 4; k++) a.arc(fx + (k - 1.5) * stripeW * 0.9, baseY - (k % 2) * 8, stripeW * (0.9 + (k % 2) * 0.25), Math.PI * 1.05, Math.PI * 1.95)
      a.stroke()
    }
    if (logo) {
      const inner = outer - n * stripeW
      const mh = Math.max(inner * 0.6, inner - 64)
      const mw = mh * logo.markAspect
      drawMark(a, logo, cx - mw / 2, baseY - mh + 10, mh, pal.ink)
    }
    // words round the inside of the arch
    a.fillStyle = pal.ink
    const spec: TypeSpec = { family: fonts.body, weight: 800, tracking: 0.32 }
    textOnArc(a, 'PSYCHEDELIC  AMERICANA', cx, baseY, outer - n * stripeW - 30, -Math.PI / 2, spec, 22, {})
  } else {
    // a band of stripes enters from the left, sweeps across, and curls up the right side
    const y0 = billTop - (story ? 120 : 96)
    const turnR = w * 0.2
    const x1 = w - turnR - 60
    pal.stripes.forEach((c, i) => {
      a.strokeStyle = c
      a.lineWidth = stripeW + 1
      a.lineCap = 'butt'
      a.beginPath()
      const off = (i - (n - 1) / 2) * stripeW
      a.moveTo(-20, y0 + off)
      a.lineTo(x1, y0 + off)
      a.arc(x1, y0 - turnR, turnR + off, Math.PI / 2, 0, true)
      a.lineTo(x1 + turnR + off, -20)
      a.stroke()
    })
    // a sun peeking over the stripes
    const sx = w * 0.3
    const sy = y0 - (n * stripeW) / 2 - 10
    const sr = w * 0.17
    a.save()
    a.beginPath()
    a.rect(0, 0, w, sy)
    a.clip()
    a.fillStyle = pal.sun
    a.beginPath()
    a.arc(sx, sy, sr, 0, Math.PI * 2)
    a.fill()
    a.restore()
    if (logo) {
      const mh = Math.min(sr * 2.2, sy - (titleTop + titleH) - 20 + sr * 0.15)
      const mw = mh * logo.markAspect
      drawMarkSilhouette(a, logo, sx - mw / 2, sy - mh + 4, mh, pal.paper)
      drawMark(a, logo, sx - mw / 2, sy - mh + 4, mh, pal.ink)
    }
  }

  // ---- the name, fat and soft with a stepped stripe shadow --------------
  const nameSpec: TypeSpec = { family: fonts.display, weight: 900, tracking: -0.01 }
  const name1 = 'Northern'
  const name2 = 'Disconnection'
  const size2 = fitSize(ctx, name2, nameSpec, w - 140, story ? 150 : 128)
  const size1 = Math.min(size2 * 1.12, fitSize(ctx, name1, nameSpec, w - 140, 170))
  const m1 = measureType(ctx, name1, nameSpec, size1)
  const m2 = measureType(ctx, name2, nameSpec, size2)
  const gap = size2 * 0.02
  const total = m1.ascent + m1.descent + gap + m2.ascent
  const nameY = titleTop + (titleH - total) / 2
  const base1 = nameY + m1.ascent
  const base2 = base1 + m1.descent + gap + m2.ascent
  const slant = layout === 'swoosh' ? -0.03 : 0
  const drawName = (c: Ctx, dx: number, dy: number) => {
    c.save()
    c.translate(w / 2 + dx, dy)
    c.transform(1, 0, slant, 1, 0, 0)
    drawType(c, name1, 0, base1, nameSpec, size1, 'center')
    drawType(c, name2, 0, base2, nameSpec, size2, 'center')
    c.restore()
  }
  // stepped rainbow shadow, darkest stripe nearest the letters
  const steps = pal.stripes.length
  const stepPx = story ? 7 : 6
  for (let i = steps; i >= 1; i--) {
    a.fillStyle = pal.stripes[steps - i]
    for (let sub = 0; sub < stepPx; sub += 2) drawName(a, (i - 1) * stepPx + sub + 2, (i - 1) * stepPx + sub + 2)
  }
  a.fillStyle = pal.ink
  drawName(a, 0, 0)
  // a hairline highlight inside the letters
  a.save()
  a.globalCompositeOperation = 'source-atop'
  a.fillStyle = pal.stripes[steps - 1]
  a.globalAlpha = 0.9
  drawName(a, -2, -2)
  a.globalAlpha = 1
  a.fillStyle = pal.ink
  drawName(a, 0, 0)
  a.restore()

  // ---- the bill ------------------------------------------------------------
  const bill: Box = { x: 80, y: billTop + (layout === 'sunset' ? pal.stripes.length * stripeW * 0.62 - 20 : 20), w: w - 160, h: 0 }
  bill.h = h - bill.y - (story ? 190 : 60)
  const lines: StackLine[] = [
    { text: copy.dateLine, spec: { family: fonts.display, weight: 800, tracking: 0 }, size: story ? 92 : 78, gap: 16, tag: 'date' },
    { text: copy.venue, spec: { family: fonts.display, weight: 600, tracking: 0 }, size: story ? 84 : 70, gap: 14 },
    { text: [copy.location, copy.time].filter(Boolean).join('  ·  ').toUpperCase(), spec: { family: fonts.body, weight: 800, tracking: 0.2 }, size: story ? 36 : 30, gap: 14, tag: 'accent' },
  ]
  clampParagraph(ctx, copy.description, { family: fonts.body, weight: 500, italic: true }, 25, bill.w * 0.9, 2).forEach((d) =>
    lines.push({ text: d, spec: { family: fonts.body, weight: 500, italic: true }, size: story ? 28 : 25, gap: 4 }),
  )
  lines[lines.length - 1].gap = 14
  lines.push({ text: SITE_URL.toUpperCase(), spec: { family: fonts.body, weight: 800, tracking: 0.36 }, size: 18, tag: 'accent' })
  const placed = fitStack(ctx, lines, bill, { align: 'center', valign: 'spread', maxSpreadGap: 22 })
  placed.forEach((p) => {
    const x = p.left + p.width / 2
    if (p.line.tag === 'date') {
      a.fillStyle = pal.stripes[1]
      drawType(a, p.line.text, x + 3, p.baseline + 3, p.line.spec, p.size, 'center')
    }
    a.fillStyle = p.line.tag === 'accent' ? pal.stripes[1] : pal.ink
    drawType(a, p.line.text, x, p.baseline, p.line.spec, p.size, 'center')
  })

  // a thin border like a record-sleeve proof
  a.strokeStyle = pal.ink
  a.lineWidth = 3
  a.strokeRect(28, 28, w - 56, h - 56)
  a.fillStyle = pal.ink
  drawType(a, `No. ${sc.printNo}`, w - 42, h - 40, { family: fonts.body, weight: 700, tracking: 0.2 }, 14, 'right')

  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.55, specks: 0.9, scratches: 0.2, scale: 1.4 })
  printLayer(ctx, art, { color: null, texture: tex, wear: 0.45, rng: rng.fork('wear'), blend: 'multiply' })
  grain(ctx, w, h, rng, 0.1)
}
