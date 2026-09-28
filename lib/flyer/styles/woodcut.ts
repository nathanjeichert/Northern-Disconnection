import {
  type Box,
  type Ctx,
  type Layer,
  type Pt,
  type Rng,
  type StackLine,
  type TypeSpec,
  Noise2D,
  clamp,
  clampParagraph,
  drawMark,
  drawMarkSilhouette,
  drawType,
  fitSize,
  fitStack,
  grain,
  inkTexture,
  lerp,
  measureType,
  newLayer,
  paper,
  polyPath,
  printLayer,
  redwoodPath,
  ridgeLine,
  sampleRidge,
  SITE_URL,
  textOnArc,
  woodGrain,
  knockOut,
} from '../kit'
import type { StyleContext } from '../types'

/*
  WOODCUT — a relief print cut from a single block (sometimes with a
  second colour block under it). Tone comes only from carving: the sky
  gets lighter where the gouges crowd together around the sun, rays are
  long tapering cuts, ridges are parted by a carved outline and shaded
  with rows of gouges that follow the land, redwood trunks carry bark
  cuts and their tiers are notched. The name rides a carved ribbon and the
  bill is cut out of a solid panel; letter edges are nudged by a noise
  field so they look knife-cut rather than typeset.
*/

interface WoodPalette {
  paper: string
  ink: string
  accent: string | null
}

const PALETTES: WoodPalette[] = [
  { paper: '#f1e7cf', ink: '#1a1712', accent: '#c0392b' },
  { paper: '#efe4c8', ink: '#0f2a1d', accent: '#e0a33a' },
  { paper: '#f3ead6', ink: '#5a1822', accent: null },
  { paper: '#ece6d6', ink: '#1c2a45', accent: '#d9822b' },
  { paper: '#e9dcbf', ink: '#1a1712', accent: null },
  { paper: '#f2e9d4', ink: '#2b1d14', accent: '#7d8f4e' },
]

type Variant = 'sunrise' | 'emblem'

export default function woodcut(sc: StyleContext) {
  const { ctx, w, h, rng, story, copy, fonts, logo } = sc
  const look = rng.fork('look')
  const pal = look.pick(PALETTES)
  const variant: Variant = look.chance(0.6) ? 'sunrise' : 'emblem'
  paper(ctx, w, h, rng.fork('paper'), { color: pal.paper, tone: 0.55, fibers: 110, specks: 60, age: 0.5 })

  const key = newLayer(w, h)
  const acc = newLayer(w, h)
  const k = key.ctx
  const a = acc.ctx
  k.fillStyle = '#000'
  k.strokeStyle = '#000'
  a.fillStyle = '#000'

  // ---- the block -----------------------------------------------------------
  const m = 42
  const blockEdge = roughRect(m, m, w - 2 * m, h - 2 * m, rng.fork('edge'))
  const panelH = story ? 560 : 420
  const scene: Box = { x: m + 20, y: m + 20, w: w - 2 * m - 40, h: h - 2 * m - 40 - panelH - 22 }
  const panel: Box = { x: m + 20, y: scene.y + scene.h + 22, w: scene.w, h: panelH }
  // outer black frame of the block with an inner carved line
  k.save()
  k.fill(blockEdge)
  k.globalCompositeOperation = 'destination-out'
  k.fillRect(scene.x, scene.y, scene.w, scene.h)
  k.fillRect(panel.x, panel.y, panel.w, panel.h)
  k.restore()

  const cut = (draw: (c: Ctx) => void) => {
    k.save()
    k.globalCompositeOperation = 'destination-out'
    draw(k)
    k.restore()
  }
  const clipScene = (c: Ctx) => {
    c.beginPath()
    c.rect(scene.x, scene.y, scene.w, scene.h)
    c.clip()
  }

  const g$ = rng.fork('gouges')
  const horizonY = scene.y + scene.h * (variant === 'sunrise' ? look.range(0.5, 0.58) : 0.72)
  const sunX = scene.x + scene.w * look.range(0.35, 0.65)
  const sunR = scene.w * (variant === 'sunrise' ? look.range(0.12, 0.16) : 0.3)
  const sunY = variant === 'sunrise' ? horizonY - sunR * look.range(0.1, 0.5) : scene.y + scene.h * 0.44

  // ---- sky: engraved lines, heavier away from the sun ------------------------
  // Rays read as alternating line weights; the sun sits in a clearing.
  const rays = look.int(14, 22) * 2
  const rayA0 = look.range(0, Math.PI)
  const diag = Math.hypot(scene.w, scene.h)
  const skyNoise = new Noise2D(g$.fork('sky'))
  k.save()
  clipScene(k)
  k.beginPath()
  const step = 8
  for (let y = scene.y + 2; y < horizonY + 12; y += step) {
    let seg: Array<[number, number]> = []
    const flush = () => {
      if (seg.length > 1) {
        k.moveTo(seg[0][0], y - seg[0][1] / 2 + skyNoise.noise(seg[0][0] / 90, y / 40) * 1.6)
        for (const [x, th] of seg) k.lineTo(x, y - th / 2 + skyNoise.noise(x / 90, y / 40) * 1.6)
        for (let i = seg.length - 1; i >= 0; i--) {
          const [x, th] = seg[i]
          k.lineTo(x, y + th / 2 + skyNoise.noise(x / 90, y / 40) * 1.6)
        }
        k.closePath()
      }
      seg = []
    }
    for (let x = scene.x - 6; x <= scene.x + scene.w + 6; x += 5) {
      const dx = x - sunX
      const dy = y - sunY
      const dist = Math.hypot(dx, dy)
      const ang = Math.atan2(dy, dx) - rayA0
      const inRay = Math.floor(((ang % (Math.PI * 2)) + Math.PI * 2) / ((Math.PI * 2) / rays)) % 2 === 0
      const far = clamp((dist - sunR * 1.3) / (diag * 0.55))
      let th = (0.4 + 5.2 * far) * (inRay ? 1.45 : 0.5)
      th *= 0.85 + 0.3 * skyNoise.noise(x / 40, y / 13)
      if (dist < sunR * 1.3 || th < 0.45) flush()
      else seg.push([x, Math.min(step - 1.2, th)])
    }
    flush()
  }
  k.fill()
  k.restore()
  // the sun: a clean disc with cut rings
  k.save()
  k.lineWidth = 3
  k.beginPath()
  k.arc(sunX, sunY, sunR, 0, Math.PI * 2)
  k.stroke()
  k.beginPath()
  k.arc(sunX, sunY, sunR, 0, Math.PI * 2)
  k.clip()
  k.lineWidth = 2.4
  for (let r = sunR * 0.3; r < sunR; r += sunR * 0.2) {
    k.beginPath()
    k.arc(sunX, sunY, r, 0, Math.PI * 2)
    k.stroke()
  }
  k.restore()
  if (pal.accent) {
    a.beginPath()
    a.arc(sunX, sunY, sunR * 0.98, 0, Math.PI * 2)
    a.fill()
  }
  // a few birds cut in quick strokes
  k.save()
  clipScene(k)
  k.lineWidth = 3
  k.lineCap = 'round'
  for (let i = 0; i < look.int(0, 5); i++) {
    const bx = scene.x + scene.w * look.range(0.15, 0.85)
    const by = scene.y + (horizonY - scene.y) * look.range(0.3, 0.6)
    const bs = look.range(9, 15)
    k.beginPath()
    k.moveTo(bx - bs, by - bs * 0.3)
    k.quadraticCurveTo(bx - bs * 0.4, by - bs * 0.6, bx, by)
    k.quadraticCurveTo(bx + bs * 0.4, by - bs * 0.6, bx + bs, by - bs * 0.3)
    k.stroke()
  }
  k.restore()

  // ---- ridges -----------------------------------------------------------------
  const ridges: Pt[][] = []
  const ridgeCount = variant === 'sunrise' ? 3 : 2
  for (let i = 0; i < ridgeCount; i++) {
    const base = horizonY + (scene.y + scene.h - horizonY) * (i * 0.2) - scene.h * 0.02
    ridges.push(ridgeLine(w, base, scene.h * (0.06 - i * 0.012), rng.fork(`ridge${i}`), { roughness: 0.45 }))
  }
  ridges.forEach((ridge, i) => {
    const shape = new Path2D()
    polyPath(shape, [...ridge, [w + 20, scene.y + scene.h + 20], [-20, scene.y + scene.h + 20]], true)
    // carved outline so the ridge parts from what's behind it
    k.save()
    clipScene(k)
    k.globalCompositeOperation = 'destination-out'
    k.lineWidth = 9
    k.stroke(outline(ridge))
    k.globalCompositeOperation = 'source-over'
    k.fill(shape)
    k.restore()
    a.save()
    a.globalCompositeOperation = 'destination-out'
    a.fill(shape)
    a.restore()
    // rows of gouges following the ridge, lighter near its crest
    cut((c) => {
      clipScene(c)
      c.save()
      c.clip(shape)
      c.beginPath()
      const rows = 14
      for (let r = 1; r < rows; r++) {
        const off = r * (7 + r * 1.6)
        const widthK = clamp(1 - r / rows) * (i === ridges.length - 1 ? 0.7 : 1)
        let x = scene.x - 10 + g$.range(0, 20)
        while (x < scene.x + scene.w + 10) {
          const len = g$.range(18, 46) * (1 - r / rows) + 6
          const y1 = sampleRidge(ridge, x) + off
          const y2 = sampleRidge(ridge, x + len) + off
          if (g$.chance(0.82)) gouge(c, x + len / 2, (y1 + y2) / 2, Math.atan2(y2 - y1, len), len, 1 + widthK * 4.5)
          x += len + g$.range(3, 12) + r * 1.5
        }
      }
      c.fill()
      c.restore()
    })
  })

  // ---- foreground ------------------------------------------------------------
  const ribbonY = scene.y + (story ? 150 : 34)
  const ribbonH = story ? 124 : 104
  if (variant === 'sunrise') {
    const trees = rng.fork('trees')
    const n = trees.int(2, 4)
    const slots = trees.shuffle([0.06, 0.16, 0.84, 0.94, 0.26, 0.74]).slice(0, n)
    for (const t of slots) {
      const x = scene.x + scene.w * t
      const maxTh = scene.y + scene.h + 8 - (ribbonY + ribbonH + 40)
      const th = Math.min(maxTh, scene.h * trees.range(0.72, 1.02))
      const tw = th * trees.range(0.2, 0.26)
      carvedRedwood(k, x, scene.y + scene.h + 8, th, tw, trees, clipScene)
    }
  } else if (logo) {
    // emblem: the mark stands in the sun, printed as a cut block
    const mh = scene.h * 0.84
    const mw = mh * logo.markAspect
    const mx = sunX - mw / 2
    const my = scene.y + scene.h * 0.08
    k.save()
    clipScene(k)
    k.globalCompositeOperation = 'destination-out'
    // a paper halo around the silhouette
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2
      drawMarkSilhouette(k, logo, mx + Math.cos(t) * 10, my + Math.sin(t) * 10, mh, '#000')
    }
    k.globalCompositeOperation = 'source-over'
    drawMark(k, logo, mx, my, mh, '#000')
    k.restore()
    if (pal.accent) {
      a.save()
      a.globalCompositeOperation = 'destination-out'
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2
        drawMarkSilhouette(a, logo, mx + Math.cos(t) * 10, my + Math.sin(t) * 10, mh, '#000')
      }
      a.restore()
    }
  }

  // ---- ribbon banner with the band's name ------------------------------------
  const ribbon = drawRibbon(k, a, !!pal.accent, scene, ribbonY, ribbonH, look)
  const nameSpec: TypeSpec = { family: look.chance(0.6) ? fonts.rye : fonts.slab, tracking: 0.04 }
  const arcR = ribbon.radius
  const nameSize = fitSize(k, 'NORTHERN DISCONNECTION', nameSpec, ribbon.innerW, ribbonH * 0.56)
  const nm = measureType(k, 'NORTHERN DISCONNECTION', nameSpec, nameSize)
  textOnArc(k, 'NORTHERN DISCONNECTION', ribbon.cx, ribbon.cy, arcR - nm.ascent / 2 + (ribbonH * 0.02), -Math.PI / 2, nameSpec, nameSize)

  // ---- the bill ------------------------------------------------------------
  // separate the scene and the panel with a cut line through the frame
  cut((c) => c.fillRect(panel.x - 4, panel.y - 13, panel.w + 8, 4))
  const reversed = look.chance(0.5)
  if (reversed) k.fillRect(panel.x, panel.y, panel.w, panel.h)
  else {
    k.lineWidth = 3
    k.strokeRect(panel.x + 14, panel.y + 14, panel.w - 28, panel.h - 28)
  }
  let inner: Box = { x: panel.x + 50, y: panel.y + 40, w: panel.w - 100, h: panel.h - 80 - (story ? 90 : 0) }
  if (variant === 'sunrise' && logo) {
    // the guitar-tree cut small at the left of the bill
    const mh = inner.h * 0.96
    const mw = mh * logo.markAspect
    const mx = inner.x - 6
    const my = inner.y + (inner.h - mh) / 2
    if (reversed) {
      k.save()
      k.globalCompositeOperation = 'destination-out'
      drawMarkSilhouette(k, logo, mx, my, mh, '#000')
      k.globalCompositeOperation = 'source-over'
      drawMark(k, logo, mx, my, mh, '#000')
      k.restore()
    } else {
      drawMark(k, logo, mx, my, mh, '#000')
      if (pal.accent) drawMarkSilhouette(a, logo, mx, my, mh, '#000')
    }
    inner = { ...inner, x: mx + mw + 34, w: inner.x + inner.w - (mx + mw + 34) }
  }
  const faceA: TypeSpec = { family: look.pick([fonts.rye, fonts.slab]), tracking: 0.03 }
  const lines: StackLine[] = [
    { text: copy.weekday ? `LIVE  ·  ${copy.weekday.toUpperCase()}` : 'LIVE', spec: { family: fonts.gothic, weight: 600, tracking: 0.4 }, size: 30, gap: 14 },
    { text: copy.monthDay.toUpperCase(), spec: faceA, size: story ? 118 : 96, gap: 16 },
    { text: copy.venue.toUpperCase(), spec: { family: fonts.gothic, weight: 700, tracking: 0.04 }, size: story ? 84 : 70, gap: 12 },
    { text: [copy.location, copy.time].filter(Boolean).join('   ·   ').toUpperCase(), spec: { family: fonts.gothic, weight: 500, tracking: 0.16 }, size: story ? 36 : 30, gap: 12 },
  ]
  clampParagraph(k, copy.description, { family: fonts.body, weight: 500, italic: true }, 24, inner.w * 0.94, 2).forEach((d) =>
    lines.push({ text: d, spec: { family: fonts.body, weight: 500, italic: true }, size: story ? 28 : 24, gap: 4 }),
  )
  lines[lines.length - 1].gap = 12
  lines.push({ text: SITE_URL.toUpperCase(), spec: { family: fonts.gothic, weight: 500, tracking: 0.3 }, size: 18 })
  const textLayer = newLayer(w, h)
  const placed = fitStack(k, lines, inner, { align: 'center', valign: 'center' })
  placed.forEach((p) => drawType(textLayer.ctx, p.line.text, p.left + p.width / 2, p.baseline, p.line.spec, p.size, 'center'))
  // rough the letters so they look knife-cut, then cut or print them
  roughen(textLayer, panel, rng.fork('rough'), 1.6)
  k.save()
  k.globalCompositeOperation = reversed ? 'destination-out' : 'source-over'
  k.drawImage(textLayer.canvas, 0, 0)
  k.restore()
  if (!reversed && pal.accent) {
    // the date gets the second colour block
    const date = placed[1]
    if (date) {
      a.save()
      a.globalCompositeOperation = 'source-over'
      drawType(a, date.line.text, date.left + date.width / 2 + 3, date.baseline + 3, date.line.spec, date.size, 'center')
      a.restore()
    }
  }
  // small cut flourishes at the panel corners
  cut((c) => {
    c.beginPath()
    for (const [x, y] of [
      [panel.x + 22, panel.y + 22],
      [panel.x + panel.w - 22, panel.y + 22],
      [panel.x + 22, panel.y + panel.h - 22],
      [panel.x + panel.w - 22, panel.y + panel.h - 22],
    ] as const) {
      for (let i = 0; i < 4; i++) {
        const t = (i * Math.PI) / 2 + Math.PI / 4
        gouge(c, x + Math.cos(t) * 7, y + Math.sin(t) * 7, t, 14, 3.4)
      }
    }
    c.fill()
  })
  // the printer's edition number cut into the frame
  cut((c) => drawType(c, `No. ${sc.printNo}`, w - m - 26, h - m - 5, { family: fonts.gothic, weight: 500, tracking: 0.2 }, 13, 'right'))

  // ---- print ------------------------------------------------------------------
  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.28, specks: 1.1, scratches: 0.5 })
  knockOut(key, woodGrain(w, h, rng.fork('grain'), { density: 0.8, strength: 0.7 }), 0.4)
  const reg = rng.fork('reg')
  if (pal.accent) printLayer(ctx, acc, { color: pal.accent, offset: [reg.range(-4, 4), reg.range(-4, 4)], texture: tex, wear: 0.6, rng: reg })
  printLayer(ctx, key, { color: pal.ink, offset: [0, 0], texture: tex, wear: 0.6, rng: reg })
  grain(ctx, w, h, rng, 0.1)
}

/* ---------------------------------------------------------------------- */

/** A lens-shaped gouge cut centred at (x, y). */
function gouge(p: CanvasPath, x: number, y: number, angle: number, len: number, width: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const L = len / 2
  const ax = x - c * L
  const ay = y - s * L
  const bx = x + c * L
  const by = y + s * L
  p.moveTo(ax, ay)
  p.quadraticCurveTo(x - s * width, y + c * width, bx, by)
  p.quadraticCurveTo(x + s * width * 0.6, y - c * width * 0.6, ax, ay)
  p.closePath()
}

function outline(ridge: Pt[]): Path2D {
  const p = new Path2D()
  ridge.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)))
  return p
}

/** The inked area of the block: a rectangle with slightly irregular edges. */
function roughRect(x: number, y: number, w: number, h: number, rng: Rng): Path2D {
  const noise = new Noise2D(rng)
  const p = new Path2D()
  const pts: Pt[] = []
  const edge = (x0: number, y0: number, x1: number, y1: number, seed: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.ceil(len / 12)
    const nx = -(y1 - y0) / len
    const ny = (x1 - x0) / len
    for (let i = 0; i < n; i++) {
      const t = i / n
      const d = noise.noise(t * 14 + seed, seed) * 2.2
      pts.push([lerp(x0, x1, t) + nx * d, lerp(y0, y1, t) + ny * d])
    }
  }
  edge(x, y, x + w, y, 1)
  edge(x + w, y, x + w, y + h, 7)
  edge(x + w, y + h, x, y + h, 13)
  edge(x, y + h, x, y, 19)
  polyPath(p, pts, true)
  return p
}

/** A redwood cut as a relief: carved halo, bark cuts, notched tiers. */
function carvedRedwood(k: Ctx, x: number, baseY: number, th: number, tw: number, rng: Rng, clip: (c: Ctx) => void) {
  const shape = new Path2D()
  const tiers = Math.round(th / (tw * 0.42))
  redwoodPath(shape, x, baseY, th, tw, rng, { tiers, trunk: tw * 0.13, droop: 0.5 })
  k.save()
  clip(k)
  k.globalCompositeOperation = 'destination-out'
  k.lineWidth = 12
  k.lineJoin = 'round'
  k.stroke(shape)
  k.globalCompositeOperation = 'source-over'
  k.fill(shape)
  // cuts
  k.globalCompositeOperation = 'destination-out'
  k.beginPath()
  const trunkTop = baseY - th * 0.25
  for (let i = 0; i < 5; i++) {
    const gx = x - tw * 0.08 + (i / 4) * tw * 0.16
    for (let y = baseY; y > trunkTop; y -= rng.range(20, 36)) {
      gouge(k, gx + rng.range(-1, 1), y - 12, Math.PI / 2 + rng.range(-0.05, 0.05), rng.range(16, 30), 1.4)
    }
  }
  // chevron notches along each tier: short cuts angled down and out
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers
    const y = lerp(trunkTop, baseY - th, t) + 4
    const half = (tw / 2) * Math.pow(1 - t, 0.85)
    const count = Math.max(2, Math.round(half / 7))
    for (let j = 1; j <= count; j++) {
      const off = (j / (count + 1)) * half
      for (const s of [-1, 1]) {
        const cx = x + s * off
        gouge(k, cx, y - 2 + (off / half) * 6, Math.PI / 2 - s * 0.9, 12 + (1 - off / half) * 8, 1.6)
      }
    }
  }
  k.fill()
  k.restore()
}

/** A carved ribbon banner with folded tails. Returns geometry for the lettering. */
function drawRibbon(k: Ctx, a: Ctx, accent: boolean, scene: Box, y: number, hgt: number, rng: Rng) {
  const cx = scene.x + scene.w / 2
  const span = scene.w * 0.86
  const sag = rng.range(18, 40)
  // the band follows a gentle arc: centre of a large circle below
  const radius = (span * span) / (8 * sag) + sag / 2
  const cy = y + radius
  const a0 = -Math.PI / 2 - Math.asin(span / 2 / radius)
  const a1 = -Math.PI / 2 + Math.asin(span / 2 / radius)
  const band = new Path2D()
  band.arc(cx, cy, radius, a0, a1)
  band.arc(cx, cy, radius - hgt, a1, a0, true)
  band.closePath()
  // tails: tucked behind and cut in a swallowtail
  const tail = (side: number) => {
    const ang = side < 0 ? a0 : a1
    const ox = cx + Math.cos(ang) * (radius - hgt / 2)
    const oy = cy + Math.sin(ang) * (radius - hgt / 2)
    const p = new Path2D()
    const dx = side * hgt * 1.1
    p.moveTo(ox - side * 10, oy - hgt / 2 + 14)
    p.lineTo(ox + dx, oy - hgt / 2 + 26)
    p.lineTo(ox + dx - side * hgt * 0.35, oy + 18)
    p.lineTo(ox + dx, oy + hgt / 2 + 22)
    p.lineTo(ox - side * 10, oy + hgt / 2 + 12)
    p.closePath()
    return p
  }
  for (const side of [-1, 1]) {
    const t = tail(side)
    k.save()
    k.globalCompositeOperation = 'destination-out'
    k.lineWidth = 10
    k.stroke(t)
    k.globalCompositeOperation = 'source-over'
    k.fill(t)
    k.restore()
    // a few cut lines along the tail
    k.save()
    k.clip(t)
    k.globalCompositeOperation = 'destination-out'
    k.lineWidth = 2.5
    for (let i = 1; i < 4; i++) {
      k.beginPath()
      const ang = side < 0 ? a0 : a1
      const ox = cx + Math.cos(ang) * (radius - hgt / 2)
      const oy = cy + Math.sin(ang) * (radius - hgt / 2)
      k.moveTo(ox, oy - hgt / 2 + 14 + i * (hgt / 4))
      k.lineTo(ox + side * hgt * 1.2, oy - hgt / 2 + 24 + i * (hgt / 4))
      k.stroke()
    }
    k.restore()
  }
  // the band itself: cleared to paper with a heavy carved border
  k.save()
  k.globalCompositeOperation = 'destination-out'
  k.lineWidth = 16
  k.stroke(band)
  k.fill(band)
  k.globalCompositeOperation = 'source-over'
  k.lineWidth = 5
  k.stroke(band)
  k.restore()
  if (accent) {
    a.save()
    a.globalAlpha = 0.9
    a.fill(band)
    a.restore()
  }
  return { cx, cy, radius: radius - hgt / 2, innerW: span * 0.86 }
}

/** Nudge a layer's pixels by a noise field so edges look knife-cut. */
function roughen(layer: Layer, box: Box, rng: Rng, amount: number) {
  const noise = new Noise2D(rng)
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const bw = Math.min(layer.canvas.width - x0, Math.ceil(box.w))
  const bh = Math.min(layer.canvas.height - y0, Math.ceil(box.h))
  const src = layer.ctx.getImageData(x0, y0, bw, bh)
  const out = layer.ctx.createImageData(bw, bh)
  const s = src.data
  const d = out.data
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const dx = noise.noise(x / 9, y / 9) * amount + noise.noise(x / 2.5 + 50, y / 2.5) * amount * 0.35
      const dy = noise.noise(x / 9 + 100, y / 9) * amount + noise.noise(x / 2.5, y / 2.5 + 50) * amount * 0.35
      const sx = Math.min(bw - 1, Math.max(0, Math.round(x + dx)))
      const sy = Math.min(bh - 1, Math.max(0, Math.round(y + dy)))
      d[(y * bw + x) * 4 + 3] = s[(sy * bw + sx) * 4 + 3]
    }
  }
  layer.ctx.putImageData(out, x0, y0)
}
