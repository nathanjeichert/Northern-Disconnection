import {
  type Box,
  type Pt,
  type Rng,
  type StackLine,
  type TypeSpec,
  Noise2D,
  Separation,
  clampParagraph,
  drawType,
  fitStack,
  grain,
  halftone,
  inkTexture,
  lerp,
  measureStack,
  moonLitPath,
  moonPhase,
  paper,
  path,
  polyPath,
  redwoodPath,
  ridgeLine,
  sampleRidge,
  shortTime,
  SITE_URL,
  smoothPath,
  sparklePath,
  tint,
} from '../kit'
import type { StyleContext } from '../types'

/*
  NATIONAL PARK — a WPA-era screenprinted travel poster. A flat-colour
  landscape of the redwood coast built from cut stencils (each ink its own
  plate, slightly out of register): banded sky with halftone transitions,
  a big sun or moon, receding ridges with fog pooled between them, a river
  winding to the horizon, stands of redwoods, and the bill set in a solid
  colour band in condensed gothic caps.
*/

interface ParkPalette {
  paper: string
  sky: [string, string, string]
  sun: string
  glow: [string, string]
  cloud: string | null
  far: [string, string]
  fog: string | null
  mid: string
  meadow: string
  forest: [string, string, string]
  trunk: string
  shade: string
  river: string
  band: string
  /** Main text colour on the band; null = reversed out to paper. */
  bandText: string | null
  bandAccent: string
  bird: string | null
  night?: boolean
}

const PALETTES: ParkPalette[] = [
  {
    // golden hour
    paper: '#f2e7cf',
    sky: ['#e3874a', '#eca957', '#f3cb78'],
    sun: '#f8e6b0',
    glow: ['#efb863', '#f5d58c'],
    cloud: '#f0bd6a',
    far: ['#cf8e69', '#ab705b'],
    fog: '#f3d9a4',
    mid: '#6e5f4b',
    meadow: '#8d8549',
    forest: ['#56613c', '#34503a', '#1f3b2b'],
    trunk: '#8a3b27',
    shade: '#142a1f',
    river: '#f3cb78',
    band: '#142a1f',
    bandText: null,
    bandAccent: '#e9b949',
    bird: '#6c4638',
  },
  {
    // coastal fog at dawn
    paper: '#efebe0',
    sky: ['#aebfbe', '#d6d6c9', '#ece0cf'],
    sun: '#e7866a',
    glow: ['#efbea4', '#f4d4bf'],
    cloud: null,
    far: ['#a7b3ae', '#889792'],
    fog: null,
    mid: '#5f716a',
    meadow: '#7d8e73',
    forest: ['#4c6257', '#33493f', '#1f332b'],
    trunk: '#8e4a38',
    shade: '#15251f',
    river: '#c8d5d0',
    band: '#7a2230',
    bandText: null,
    bandAccent: '#f0c2a8',
    bird: '#4c6257',
  },
  {
    // violet dusk
    paper: '#f0e4cf',
    sky: ['#3d3663', '#7a4e77', '#d77f68'],
    sun: '#f1c04f',
    glow: ['#e39761', '#ecb45a'],
    cloud: '#684570',
    far: ['#6b4a6d', '#4e3a5b'],
    fog: '#c3777a',
    mid: '#342a47',
    meadow: '#2e2a3d',
    forest: ['#29223a', '#1c1829', '#120f1b'],
    trunk: '#5e2b2b',
    shade: '#0d0b14',
    river: '#e39761',
    band: '#e9b949',
    bandText: '#1c1829',
    bandAccent: '#7a2230',
    bird: '#342a47',
  },
  {
    // moonlight
    paper: '#ece5d2',
    sky: ['#0f1b2f', '#182a44', '#2a405e'],
    sun: '#f2e9cc',
    glow: ['#33486a', '#40597b'],
    cloud: '#22354f',
    far: ['#2c4161', '#213451'],
    fog: '#4a6182',
    mid: '#16263e',
    meadow: '#152438',
    forest: ['#112032', '#0c1727', '#07101b'],
    trunk: '#3d2a2a',
    shade: '#050b13',
    river: '#c8c1a4',
    band: '#0f1b2f',
    bandText: null,
    bandAccent: '#e9b949',
    bird: null,
    night: true,
  },
  {
    // high summer — the classic WPA blue and green
    paper: '#f1ead5',
    sky: ['#6aa0ae', '#98c1c2', '#cde0d1'],
    sun: '#f7e3a0',
    glow: ['#b4d3cb', '#dbe8d4'],
    cloud: '#eaeee1',
    far: ['#8eaea2', '#6d9386'],
    fog: '#e1e9d7',
    mid: '#4e795d',
    meadow: '#8aa663',
    forest: ['#4b794b', '#355e3b', '#1d4030'],
    trunk: '#8b3f2b',
    shade: '#10261a',
    river: '#4e8e9f',
    band: '#8b3f2b',
    bandText: null,
    bandAccent: '#f7e3a0',
    bird: '#2e4a4a',
  },
  {
    // ember — burgundy sunset
    paper: '#f2e5cc',
    sky: ['#7a2230', '#b6452f', '#e6ad48'],
    sun: '#f6e2a0',
    glow: ['#d9763e', '#e99a44'],
    cloud: '#963238',
    far: ['#8e3a3b', '#6a2b31'],
    fog: '#d88a58',
    mid: '#3b1f27',
    meadow: '#4a2a2b',
    forest: ['#3a2026', '#2a161c', '#1c0e12'],
    trunk: '#5a2020',
    shade: '#12080b',
    river: '#e6ad48',
    band: '#0c2318',
    bandText: null,
    bandAccent: '#e9b949',
    bird: '#3b1f27',
  },
]

type Scene = 'grove' | 'valley' | 'ridges'
type Ground = 'forest' | 'vineyard' | 'oaks'

export default function park(sc: StyleContext) {
  const { ctx, w, h, rng, story, copy, fonts, logo } = sc
  const look = rng.fork('look')
  const pal = look.pick(PALETTES)
  const scene: Scene = look.pick(['grove', 'valley', 'ridges'] as const)
  const split = look.chance(0.5)
  const sunKind = pal.night ? 'moon' : look.pick(['rings', 'rays', 'stripes', 'disk'] as const)
  const art$ = rng.fork('art')

  paper(ctx, w, h, rng.fork('paper'), { color: pal.paper, tone: 0.45, fibers: 70, specks: 40, age: 0.3 })
  const sep = new Separation(w, h)

  // ---- geometry --------------------------------------------------------
  const m = 28
  const gapBand = 10
  const topBandH = split ? (story ? 300 : 178) : 0
  const bandSpec = (weight: number, tracking: number): TypeSpec => ({ family: fonts.gothic, weight, tracking })
  const venueU = copy.venue.toUpperCase()
  const dateU = copy.dateLine.toUpperCase()
  const whereU = [copy.location.toUpperCase(), copy.time ? shortTime(copy.time).toUpperCase() : ''].filter(Boolean).join('   ·   ')
  const descSpec: TypeSpec = { family: fonts.body, weight: 500, italic: true }

  // Story: the bottom band is sized to hug its (larger) type, and a paper
  // footer beneath it carries the URL, clear of the story UI. Post keeps its
  // fixed bands.
  const footerH = story ? 150 : 0
  const storyPadX = 46
  const storyPadY = 44
  const storyMarkCol = split || !logo ? 0 : 170
  let storyLines: StackLine[] = []
  let botBandH = split ? 300 : 360
  if (story) {
    const tw = w - 2 * m - 2 * storyPadX - storyMarkCol
    const descLines = clampParagraph(ctx, copy.description, descSpec, 28, tw * 0.94, 2).map(
      (d): StackLine => ({ text: d, spec: descSpec, size: 28, gap: 6 }),
    )
    storyLines = split
      ? [
          { text: dateU, spec: bandSpec(600, 0.1), size: 84, gap: 18, tag: 'accent' },
          { text: venueU, spec: bandSpec(700, 0.04), size: 104, gap: 16 },
          { text: whereU, spec: bandSpec(400, 0.2), size: 38, gap: 18, tag: 'accent' },
          ...descLines,
        ]
      : [
          { text: 'NORTHERN DISCONNECTION', spec: bandSpec(700, 0.05), size: 100, gap: 18 },
          { text: dateU, spec: bandSpec(600, 0.1), size: 66, gap: 14, tag: 'accent' },
          { text: venueU, spec: bandSpec(600, 0.05), size: 76, gap: 14 },
          { text: whereU, spec: bandSpec(400, 0.2), size: 34, gap: 16, tag: 'accent' },
          ...descLines,
        ]
    storyLines[storyLines.length - 1].gap = 0
    const natural = measureStack(ctx, storyLines, tw)
    botBandH = Math.round(Math.min(760, Math.max(340, natural + 2 * storyPadY)))
  }
  const art: Box = {
    x: m,
    y: m + (split ? topBandH + gapBand : 0),
    w: w - 2 * m,
    h: h - 2 * m - footerH - botBandH - gapBand - (split ? topBandH + gapBand : 0),
  }
  const artClip = path((p) => p.rect(art.x, art.y, art.w, art.h))
  const artBottom = art.y + art.h
  const horizonY = art.y + art.h * look.range(0.56, 0.66)
  const paint = (color: string | null, shape: Path2D | ((c: CanvasRenderingContext2D) => void), overprint = false) =>
    sep.paint(color, shape, { clip: artClip, overprint })

  // ---- sky ---------------------------------------------------------------
  const skyH = horizonY - art.y
  const b1 = art.y + skyH * look.range(0.36, 0.48)
  const b2 = art.y + skyH * look.range(0.68, 0.8)
  paint(pal.sky[0], path((p) => p.rect(art.x, art.y, art.w, b1 - art.y + 1)))
  paint(pal.sky[1], path((p) => p.rect(art.x, b1, art.w, b2 - b1 + 1)))
  paint(pal.sky[2], path((p) => p.rect(art.x, b2, art.w, horizonY - b2 + 40)))
  // halftone fades between the bands
  const fadeH = skyH * 0.16
  paint(pal.sky[0], (c) => halftone(c, { x: art.x, y: b1, w: art.w, h: fadeH }, (_x, y) => 0.9 * (1 - (y - b1) / fadeH), { cell: 11, angle: 0.3 }))
  paint(pal.sky[1], (c) => halftone(c, { x: art.x, y: b2, w: art.w, h: fadeH }, (_x, y) => 0.9 * (1 - (y - b2) / fadeH), { cell: 11, angle: 0.3 }))

  // ---- sun / moon -----------------------------------------------------
  const sunX = art.x + art.w * look.range(0.28, 0.72)
  const sunR = art.w * look.range(0.085, 0.13) * (story ? 1.1 : 1)
  const sunY = horizonY - skyH * look.range(0.22, 0.42)
  if (pal.night) {
    // stars pricked out of the sky, plus a few bright sparkles
    const stars = art$.fork('stars')
    paint(null, (c) => {
      c.beginPath()
      for (let i = 0; i < 260; i++) {
        const x = art.x + stars.next() * art.w
        const y = art.y + Math.pow(stars.next(), 1.3) * skyH * 0.9
        const r = stars.chance(0.9) ? stars.range(0.8, 1.8) : stars.range(1.8, 2.8)
        c.moveTo(x + r, y)
        c.arc(x, y, r, 0, Math.PI * 2)
      }
      for (let i = 0; i < 7; i++) {
        const x = art.x + stars.next() * art.w
        const y = art.y + stars.next() * skyH * 0.6
        sparklePath(c, x, y, stars.range(8, 15), 0.16)
      }
      c.fill()
    })
    paint(pal.glow[1], path((p) => p.arc(sunX, sunY, sunR * 1.9, 0, Math.PI * 2)))
    paint(pal.glow[0], (c) => {
      c.beginPath()
      c.arc(sunX, sunY, sunR * 1.9, 0, Math.PI * 2)
      c.arc(sunX, sunY, sunR * 1.45, 0, Math.PI * 2, true)
      c.fill()
    })
    const phase = copy.date ? moonPhase(copy.date) : 0.5
    // a full-ish moon reads best; nudge thin phases toward gibbous
    const shown = phase < 0.3 || phase > 0.7 ? 0.5 + (phase < 0.5 ? -0.12 : 0.12) : phase
    paint(pal.sky[2], path((p) => p.arc(sunX, sunY, sunR, 0, Math.PI * 2)))
    paint(pal.sun, path((p) => moonLitPath(p, sunX, sunY, sunR, shown)))
  } else {
    if (sunKind === 'rings') {
      paint(pal.glow[0], path((p) => p.arc(sunX, sunY, sunR * 2.3, 0, Math.PI * 2)))
      paint(pal.glow[1], path((p) => p.arc(sunX, sunY, sunR * 1.6, 0, Math.PI * 2)))
    } else if (sunKind === 'rays') {
      const rays = look.int(14, 22) * 2
      const reach = Math.hypot(art.w, art.h)
      const a0 = look.range(0, Math.PI)
      paint(pal.glow[0], (c) => {
        c.beginPath()
        for (let i = 0; i < rays; i += 2) {
          const t0 = a0 + (i / rays) * Math.PI * 2
          const t1 = a0 + ((i + 1) / rays) * Math.PI * 2
          c.moveTo(sunX, sunY)
          c.lineTo(sunX + Math.cos(t0) * reach, sunY + Math.sin(t0) * reach)
          c.lineTo(sunX + Math.cos(t1) * reach, sunY + Math.sin(t1) * reach)
          c.closePath()
        }
        c.fill()
      })
    }
    paint(pal.sun, path((p) => p.arc(sunX, sunY, sunR, 0, Math.PI * 2)))
    if (sunKind === 'stripes') {
      // cut bars across the lower half of the sun
      paint(pal.sky[2], (c) => {
        c.save()
        c.beginPath()
        c.arc(sunX, sunY, sunR + 2, 0, Math.PI * 2)
        c.clip()
        let y = sunY + sunR * 0.1
        let bar = sunR * 0.06
        c.beginPath()
        while (y < sunY + sunR) {
          c.rect(sunX - sunR - 4, y, sunR * 2 + 8, bar)
          y += bar * 2.3
          bar *= 1.3
        }
        c.fill()
        c.restore()
      })
    }
  }

  // ---- clouds and birds ------------------------------------------------
  if (pal.cloud && look.chance(0.75)) {
    const clouds = art$.fork('clouds')
    const n = clouds.int(2, 4)
    for (let i = 0; i < n; i++) {
      const cx = art.x + clouds.range(0.05, 0.95) * art.w
      const cy = art.y + skyH * clouds.range(0.14, 0.6)
      const cw = art.w * clouds.range(0.3, 0.55)
      paint(pal.cloud, cloudPath(cx, cy, cw, clouds))
    }
  }
  if (pal.bird) {
    const birds = art$.fork('birds')
    const n = birds.int(3, 7)
    const fx = art.x + art.w * birds.range(0.15, 0.85)
    const fy = art.y + skyH * birds.range(0.18, 0.5)
    paint(pal.bird, (c) => {
      c.lineWidth = 3.2
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.beginPath()
      for (let i = 0; i < n; i++) {
        const x = fx + birds.gaussian(0, art.w * 0.07)
        const y = fy + birds.gaussian(0, skyH * 0.06)
        const s = birds.range(7, 14)
        c.moveTo(x - s, y - s * 0.25)
        c.quadraticCurveTo(x - s * 0.45, y - s * 0.55, x, y + s * 0.05)
        c.quadraticCurveTo(x + s * 0.45, y - s * 0.55, x + s, y - s * 0.25)
      }
      c.stroke()
    })
  }

  // ---- ridges and fog ---------------------------------------------------
  const ridge$ = art$.fork('ridges')
  const farA = ridgeLine(w, horizonY - art.h * 0.13, art.h * 0.07, ridge$.fork(1), { roughness: 0.5 })
  paint(pal.far[0], ridgeShape(farA, horizonY + 6))
  if (pal.fog !== undefined) {
    paint(pal.fog, fogShape(art, horizonY - art.h * 0.045, art.h * 0.02, ridge$.fork(2)))
  }
  const farB = ridgeLine(w, horizonY - art.h * 0.07, art.h * 0.05, ridge$.fork(3), { roughness: 0.45 })
  paint(pal.far[1], ridgeShape(farB, horizonY + 6))
  if (pal.fog !== undefined && look.chance(0.6)) {
    paint(pal.fog, fogShape(art, horizonY - art.h * 0.012, art.h * 0.012, ridge$.fork(4)))
  }
  const mid = ridgeLine(w, horizonY - art.h * 0.018, art.h * 0.022, ridge$.fork(5), { roughness: 0.3 })
  paint(pal.mid, (c) => {
    c.beginPath()
    polyPath(c, [...mid, [w + 30, horizonY + 8], [-30, horizonY + 8]], true)
    // a treeline of little spires riding the ridge
    const t = ridge$.fork(6)
    for (let x = art.x - 10; x < art.x + art.w + 10; x += t.range(5, 12)) {
      const y = sampleRidge(mid, x) + 2
      const th = t.range(10, 26) * (art.h / 1000)
      const hw = th * t.range(0.16, 0.26)
      c.moveTo(x - hw, y)
      c.lineTo(x, y - th)
      c.lineTo(x + hw, y)
      c.closePath()
    }
    c.fill()
  })

  // ---- valley floor, river, stands of trees ---------------------------
  paint(pal.meadow, path((p) => p.rect(art.x, horizonY, art.w, artBottom - horizonY + 2)))
  const river = makeRiver(art, horizonY, sunX, look.fork('river'))
  paint(pal.river, path((p) => polyPath(p, river.polygon, true)))
  // shimmer on the water: short reversed-out strokes, densest under the sun
  paint(null, (c) => {
    const s = art$.fork('shimmer')
    c.beginPath()
    for (let i = 0; i < 90; i++) {
      const t = Math.pow(s.next(), 0.8)
      const { x, y, width } = river.at(t)
      if (width < 6) continue
      const nearSun = Math.exp(-Math.pow((x - sunX) / (art.w * 0.2), 2))
      if (!s.chance(0.35 + nearSun * 0.6)) continue
      const len = width * s.range(0.1, 0.4)
      const off = s.range(-0.35, 0.35) * width
      const th = Math.max(1.2, width * 0.018)
      c.rect(x + off - len / 2, y, len, th)
    }
    c.fill()
  })

  // oaks read as rocks in the dark palettes, so they only grow in daylight
  const daylight = !pal.night && PALETTES.indexOf(pal) !== 2 && PALETTES.indexOf(pal) !== 5
  const ground: Ground = pal.night
    ? 'forest'
    : look.weighted([
        ['forest', 2],
        ['vineyard', 1],
        ['oaks', daylight ? 1 : 0],
      ])
  const standNoise = new Noise2D(art$.fork('stands'))
  const rows = story ? 5 : 4
  const depthT = [0.08, 0.22, 0.42, 0.7, 0.98]
  if (ground === 'vineyard') drawVineyard(paint, art, horizonY, river, pal, art$.fork('vines'))
  for (let k = 0; k < rows; k++) {
    if (ground !== 'forest' && k >= 2) break
    const t = depthT[k]
    const y = horizonY + (artBottom - horizonY) * Math.pow(t, 1.35)
    const scale = 0.18 + t * 1.25
    const light = pal.forest[Math.min(2, k)]
    const dark = k >= 2 ? pal.shade : pal.forest[Math.min(2, k + 1)]
    const rowRng = art$.fork(`row${k}`)
    const lit = new Path2D()
    const shadow = new Path2D()
    let any = false
    const threshold = -0.02 - k * 0.04
    // walk across the row, growing stands where the noise says forest
    let x = art.x - 30
    let standStart: number | null = null
    let standTop = 0
    const closeStand = (endX: number) => {
      if (standStart === null) return
      const x0 = standStart
      const x1 = endX
      const hh = standTop * 0.16
      const ease = Math.min(50, (x1 - x0) * 0.3)
      lit.moveTo(x0 - 8, y + 3)
      lit.quadraticCurveTo(x0 + ease * 0.4, y - hh, x0 + ease, y - hh)
      lit.lineTo(x1 - ease, y - hh)
      lit.quadraticCurveTo(x1 - ease * 0.4, y - hh, x1 + 8, y + 3)
      lit.closePath()
      standStart = null
      standTop = 0
    }
    while (x < art.x + art.w + 30) {
      const dens = standNoise.noise(x / (260 * (0.6 + t)), k * 2.7 + 0.5)
      const r = river.nearest(y)
      const inRiver = Math.abs(x - r.x) < r.width * 0.5 + 10 * scale
      if (dens < threshold || inRiver) {
        closeStand(x)
        x += 14 * scale + 4
        continue
      }
      // trees shrink toward the edge of a stand, so stands read as rounded groves
      const taper = 0.45 + 0.55 * Math.min(1, (dens - threshold) / 0.22)
      const th = rowRng.range(60, 120) * scale * (art.h / 950) * taper * (rowRng.chance(0.1) ? 1.45 : 1)
      const tw = th * rowRng.range(0.26, 0.36)
      const yb = y + rowRng.range(-2, 2) * scale
      if (standStart === null) standStart = x - tw / 2
      standTop = Math.max(standTop, th)
      conifer(lit, x, yb, th, tw, rowRng)
      coniferShadow(shadow, x, yb, th, tw)
      any = true
      x += tw * rowRng.range(0.45, 0.8)
    }
    closeStand(x)
    if (any) {
      paint(light, lit)
      paint(dark, shadow)
    }
  }
  if (ground === 'oaks') drawOaks(paint, art, horizonY, river, pal, art$.fork('oaks'))

  // ---- foreground ------------------------------------------------------
  const fg = art$.fork('foreground')
  if (scene === 'grove') drawGrove(paint, art, pal, fg)
  else if (scene === 'valley') drawValleyForeground(paint, art, horizonY, pal, fg)
  drawFerns(paint, art, pal, fg.fork('ferns'), scene === 'ridges' ? 0.6 : 1)

  // ---- text bands -----------------------------------------------------
  const textInk = pal.bandText
  const botBand: Box = { x: m, y: h - m - footerH - botBandH, w: w - 2 * m, h: botBandH }
  sep.paint(pal.band, path((p) => p.rect(botBand.x, botBand.y, botBand.w, botBand.h)))
  const inner = (b: Box, px: number, py: number): Box => ({ x: b.x + px, y: b.y + py, w: b.w - 2 * px, h: b.h - 2 * py })

  const kicker = look.pick(['LIVE IN CONCERT', 'LIVE MUSIC', 'PSYCHEDELIC AMERICANA', 'AN EVENING OF LIVE MUSIC'])

  const drawStack = (lines: StackLine[], box: Box, valign: 'center' | 'spread' = 'center') => {
    const placed = fitStack(ctx, lines, box, { align: 'center', valign, maxSpreadGap: 26 })
    placed.forEach((p) => {
      const color = p.line.tag === 'accent' ? pal.bandAccent : textInk
      sep.paint(color, (c) => drawType(c, p.line.text, p.left + p.width / 2, p.baseline, p.line.spec, p.size, 'center'))
    })
  }

  const markInBand = (box: Box, side: 'left' | 'right') => {
    if (!logo) return box
    const mh = box.h * 0.96
    const mw = mh * logo.markAspect
    const mx = side === 'left' ? box.x : box.x + box.w - mw
    const my = box.y + (box.h - mh) / 2
    sep.paint(textInk, (c) => c.drawImage(tint(logo.markInk, '#000'), mx, my, mw, mh))
    return side === 'left' ? { ...box, x: box.x + mw + 30, w: box.w - mw - 30 } : { ...box, w: box.w - mw - 30 }
  }

  const desc = (measure: number) =>
    clampParagraph(ctx, copy.description, { family: fonts.body, weight: 500, italic: true }, 26, measure, 2).map(
      (d): StackLine => ({ text: d, spec: { family: fonts.body, weight: 500, italic: true }, size: 26, gap: 6 }),
    )
  const urlLine: StackLine = { text: SITE_URL.toUpperCase(), spec: bandSpec(500, 0.3), size: 19, tag: 'accent' }

  if (split) {
    const topBand: Box = { x: m, y: m, w: w - 2 * m, h: topBandH }
    sep.paint(pal.band, path((p) => p.rect(topBand.x, topBand.y, topBand.w, topBand.h)))
    const tb = inner(topBand, 44, story ? 34 : 26)
    const tbox = markInBand(tb, 'left')
    drawStack(
      [
        { text: kicker, spec: bandSpec(500, 0.36), size: 26, gap: 14, tag: 'accent' },
        { text: 'NORTHERN DISCONNECTION', spec: bandSpec(700, 0.05), size: 120 },
      ],
      story ? { ...tbox, y: tbox.y + 40, h: tbox.h - 40 } : tbox,
    )
    if (story) drawStack(storyLines, inner(botBand, storyPadX, storyPadY), 'center')
    else {
    const bb = inner(botBand, 46, 28)
    const lines: StackLine[] = [
      { text: dateU, spec: bandSpec(600, 0.1), size: 74, gap: 16, tag: 'accent' },
      { text: venueU, spec: bandSpec(700, 0.04), size: 92, gap: 14 },
      { text: whereU, spec: bandSpec(400, 0.2), size: 34, gap: 18, tag: 'accent' },
      ...desc(bb.w * 0.9),
      urlLine,
    ]
    lines[lines.length - 2].gap = 20
    drawStack(lines, bb, measureStack(ctx, lines, bb.w) < bb.h * 0.8 ? 'center' : 'spread')
    }
  } else if (story) {
    // the mark stands in its own column, as tall as the type stack (capped)
    const bb = inner(botBand, storyPadX, storyPadY)
    const side = look.chance(0.5) ? 'left' : 'right'
    let box = bb
    if (logo) {
      const mh = Math.min(bb.h, 420)
      box = markInBand({ ...bb, y: bb.y + (bb.h - mh) / 2, h: mh }, side)
      box = { ...box, y: bb.y, h: bb.h }
    }
    drawStack(storyLines, box, 'center')
  } else {
    const bb = inner(botBand, 44, 30)
    const box = bb
    const withMark = markInBand({ ...box, h: Math.min(box.h, 300) }, look.chance(0.5) ? 'left' : 'right')
    const lines: StackLine[] = [
      { text: 'NORTHERN DISCONNECTION', spec: bandSpec(700, 0.05), size: 92, gap: 16 },
      { text: dateU, spec: bandSpec(600, 0.1), size: 58, gap: 12, tag: 'accent' },
      { text: venueU, spec: bandSpec(600, 0.05), size: 64, gap: 12 },
      { text: whereU, spec: bandSpec(400, 0.2), size: 30, gap: 14, tag: 'accent' },
      ...desc(withMark.w),
      urlLine,
    ]
    drawStack(lines, withMark, 'center')
  }

  if (story) {
    // the URL set in the paper footer, in the band's ink (or its text ink on light bands)
    const footInk = pal.bandText ?? pal.band
    const fy = h - m - footerH / 2
    sep.paint(footInk, (c) => {
      drawType(c, SITE_URL.toUpperCase(), w / 2, fy + 10, bandSpec(500, 0.34), 28, 'center')
      c.fillRect(w / 2 - 60, fy - 30, 120, 2)
    })
  }

  // tiny imprint in the paper margin
  sep.paint(pal.band, (c) =>
    drawType(c, `NORTHERN DISCONNECTION  ·  WORKS PROGRESS PRINT No. ${sc.printNo}`, w / 2, h - 10, { family: fonts.gothic, weight: 500, tracking: 0.25 }, 12, 'center'),
  )

  // ---- pull the prints ------------------------------------------------
  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.35, specks: 0.8, scratches: 0.2 })
  sep.print(ctx, rng.fork('register'), { texture: tex, wear: 0.55, maxOffset: 2.2 })
  grain(ctx, w, h, rng, 0.08)
}

/* ---------------------------------------------------------------------- */

function ridgeShape(pts: Pt[], bottom: number): Path2D {
  return path((p) => polyPath(p, [...pts, [pts[pts.length - 1][0], bottom], [pts[0][0], bottom]], true))
}

function fogShape(art: Box, top: number, amp: number, rng: Rng): Path2D {
  const noise = new Noise2D(rng)
  const pts: Pt[] = []
  for (let x = art.x - 20; x <= art.x + art.w + 20; x += 10) {
    pts.push([x, top + noise.fbm(x / 260, 3.3, 3) * amp * 3])
  }
  const bottom = top + amp * 6
  return path((p) => {
    smoothPath(p, pts)
    p.lineTo(art.x + art.w + 20, bottom)
    p.lineTo(art.x - 20, bottom)
    p.closePath()
  })
}

/** Long, flat, stacked streamer clouds — the stylised WPA kind. */
function cloudPath(cx: number, cy: number, cw: number, rng: Rng): Path2D {
  return path((p) => {
    const layers = rng.int(2, 3)
    for (let i = 0; i < layers; i++) {
      const lw = cw * (1 - i * 0.28) * rng.range(0.85, 1.1)
      const lh = cw * rng.range(0.045, 0.07)
      const lx = cx + rng.range(-0.18, 0.18) * cw - lw / 2
      const ly = cy - i * lh * 1.25
      // a flat lozenge with rounded ends
      p.moveTo(lx + lh, ly)
      p.lineTo(lx + lw - lh, ly)
      p.arc(lx + lw - lh, ly - lh / 2, lh / 2, Math.PI / 2, -Math.PI / 2, true)
      p.lineTo(lx + lh, ly - lh)
      p.arc(lx + lh, ly - lh / 2, lh / 2, -Math.PI / 2, Math.PI / 2, true)
      p.closePath()
    }
  })
}

interface River {
  polygon: Pt[]
  at: (t: number) => { x: number; y: number; width: number }
  nearest: (y: number) => { x: number; width: number }
}

function makeRiver(art: Box, horizonY: number, sunX: number, rng: Rng): River {
  const bottom = art.y + art.h
  const vpX = lerp(art.x + art.w * rng.range(0.3, 0.7), sunX, 0.5)
  const x0 = art.x + art.w * rng.range(0.25, 0.75)
  const w0 = art.w * rng.range(0.28, 0.42)
  const amp = art.w * rng.range(0.14, 0.26)
  const freq = rng.range(1.1, 1.9)
  const phase = rng.range(0, Math.PI * 2)
  const at = (t: number) => {
    const k = Math.pow(1 - t, 1.9)
    const y = horizonY + (bottom - horizonY) * k
    const x = vpX + (x0 - vpX) * k + Math.sin(t * freq * Math.PI * 2 + phase) * amp * Math.pow(1 - t, 1.4)
    return { x, y, width: w0 * k + 2 }
  }
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = -4; i <= 120; i++) {
    const t = i / 120
    const { x, y, width } = at(Math.min(t, 0.995))
    left.push([x - width / 2, y + (i < 0 ? -i * 12 : 0)])
    right.push([x + width / 2, y + (i < 0 ? -i * 12 : 0)])
  }
  const polygon = [...left, ...right.reverse()]
  const nearest = (y: number) => {
    const k = (y - horizonY) / (bottom - horizonY)
    const t = 1 - Math.pow(Math.max(0, k), 1 / 1.9)
    const r = at(Math.min(Math.max(t, 0), 0.995))
    return { x: r.x, width: r.width }
  }
  return { polygon, at, nearest }
}

type Paint = (color: string | null, shape: Path2D | ((c: CanvasRenderingContext2D) => void), overprint?: boolean) => void

/** Giant redwood trunks framing the view, with foliage sprays hanging from above. */
function drawGrove(paint: Paint, art: Box, pal: ParkPalette, rng: Rng) {
  const bottom = art.y + art.h
  const sides: Array<'left' | 'right'> = rng.chance(0.55) ? ['left', 'right'] : [rng.pick(['left', 'right'] as const)]
  const trunks: Array<{ x0: number; x1: number; lean: number }> = []
  for (const side of sides) {
    const tw = art.w * rng.range(0.1, 0.16)
    const cx = side === 'left' ? art.x + tw * rng.range(0.15, 0.6) : art.x + art.w - tw * rng.range(0.15, 0.6)
    const lean = rng.range(-0.025, 0.025)
    trunks.push({ x0: cx - tw / 2, x1: cx + tw / 2, lean })
    const flare = tw * 0.35
    const trunkPath = path((p) => {
      p.moveTo(cx - tw / 2 - flare, bottom + 4)
      p.quadraticCurveTo(cx - tw / 2, bottom - art.h * 0.06, cx - tw / 2 + lean * art.h * 0.3, art.y + art.h * 0.6)
      p.lineTo(cx - tw * 0.42 + lean * art.h, art.y - 10)
      p.lineTo(cx + tw * 0.42 + lean * art.h, art.y - 10)
      p.lineTo(cx + tw / 2 + lean * art.h * 0.3, art.y + art.h * 0.6)
      p.quadraticCurveTo(cx + tw / 2, bottom - art.h * 0.06, cx + tw / 2 + flare, bottom + 4)
      p.closePath()
    })
    paint(pal.trunk, trunkPath)
    // bark: long wavy grooves overprinted in the shade ink
    paint(
      pal.shade,
      (c) => {
        c.save()
        c.clip(trunkPath)
        c.lineCap = 'round'
        const grooves = Math.round(tw / 11)
        for (let i = 0; i < grooves; i++) {
          const gx = cx - tw / 2 + (i + rng.range(0.2, 0.8)) * (tw / grooves)
          c.lineWidth = rng.range(1.5, 4.5)
          c.beginPath()
          let x = gx
          for (let y = bottom + 10; y > art.y - 20; y -= 26) {
            x += rng.range(-2.5, 2.5)
            const lx = x + lean * (bottom - y)
            if (y === bottom + 10) c.moveTo(lx, y)
            else c.lineTo(lx, y)
          }
          c.stroke()
        }
        // the shadow side
        c.globalAlpha = 1
        c.beginPath()
        c.globalAlpha = 0.9
        c.rect(side === 'left' ? cx + tw * 0.3 : cx - tw * 0.72, art.y - 20, tw * 0.42, art.h + 40)
        c.fill()
        c.restore()
      },
      true,
    )
  }
  // drooping boughs reaching in from the trunks, and a canopy along the top
  const boughs = new Path2D()
  canopyEdge(boughs, art, rng)
  for (const tr of trunks) {
    const fromLeft = (tr.x0 + tr.x1) / 2 < art.x + art.w / 2
    const dir = fromLeft ? 1 : -1
    const n = rng.int(3, 5)
    for (let b = 0; b < n; b++) {
      const y0 = art.y + art.h * (0.04 + b * rng.range(0.06, 0.1))
      const x0 = fromLeft ? tr.x1 - 6 : tr.x0 + 6
      bough(boughs, x0 + tr.lean * (art.y + art.h - y0), y0, dir, art.w * rng.range(0.16, 0.34) * (1 - b * 0.12), rng)
    }
  }
  paint(pal.shade, boughs)
}

/** Scalloped canopy along the top edge, fringed with hanging needles. */
function canopyEdge(p: Path2D, art: Box, rng: Rng) {
  const top = art.y - 10
  const pts: Pt[] = []
  for (let x = art.x - 20; x <= art.x + art.w + 20; x += 26) {
    pts.push([x, art.y + rng.range(8, 34)])
  }
  p.moveTo(art.x - 20, top)
  for (const [x, y] of pts) {
    p.lineTo(x - 13, y - 6)
    // a little hanging tuft
    for (let k = 0; k < 4; k++) {
      const nx = x - 10 + k * 6
      p.lineTo(nx, y + rng.range(6, 18))
      p.lineTo(nx + 3, y)
    }
  }
  p.lineTo(art.x + art.w + 20, top)
  p.closePath()
}

/** A redwood bough: an arcing limb with a fringe of drooping needle sprays. */
function bough(p: Path2D, x0: number, y0: number, dir: number, len: number, rng: Rng) {
  const droop = len * rng.range(0.12, 0.28)
  const cx = x0 + dir * len * 0.5
  const cy = y0 - droop * 0.4
  const ex = x0 + dir * len
  const ey = y0 + droop
  const at = (t: number): Pt => {
    const u = 1 - t
    return [u * u * x0 + 2 * u * t * cx + t * t * ex, u * u * y0 + 2 * u * t * cy + t * t * ey]
  }
  // limb
  const steps = 18
  for (let i = 0; i < steps; i++) {
    const [ax, ay] = at(i / steps)
    const [bx, by] = at((i + 1) / steps)
    const th = lerp(7, 1.5, i / steps)
    p.moveTo(ax, ay - th / 2)
    p.lineTo(bx, by - th / 2)
    p.lineTo(bx, by + th / 2)
    p.lineTo(ax, ay + th / 2)
    p.closePath()
  }
  // dense short needles fringing the limb, drooping, with clumps along it
  const sprays = Math.round(len / 3.2)
  for (let i = 1; i < sprays; i++) {
    const t = i / sprays
    const [sx, sy] = at(t)
    const L = (7 + Math.sin(t * Math.PI) * 16) * rng.range(0.6, 1.25)
    for (const up of [false, true]) {
      if (up && !rng.chance(0.55)) continue
      const a = up ? -Math.PI / 2 + dir * rng.range(0.4, 1.0) : Math.PI / 2 + dir * rng.range(-0.25, 0.55)
      const len2 = up ? L * 0.55 : L
      const tipx = sx + Math.cos(a) * len2
      const tipy = sy + Math.sin(a) * len2
      p.moveTo(sx - 2.2, sy)
      p.lineTo(tipx, tipy)
      p.lineTo(sx + 2.2, sy)
      p.closePath()
    }
  }
  const clumps = rng.int(2, 4)
  for (let i = 0; i < clumps; i++) {
    const t = rng.range(0.35, 0.95)
    const [sx, sy] = at(t)
    const rx = len * rng.range(0.07, 0.12)
    const ry = rx * rng.range(0.45, 0.7)
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      const r2 = 1 + rng.range(0, 0.45)
      const px = sx + Math.cos(a) * rx
      const py = sy + ry * 0.4 + Math.sin(a) * ry
      p.moveTo(sx, sy + ry * 0.4)
      p.lineTo(px + Math.cos(a - 0.2) * rx * 0.2, py + Math.sin(a - 0.2) * ry * 0.2)
      p.lineTo(sx + Math.cos(a) * rx * r2, sy + ry * 0.4 + Math.sin(a) * ry * r2 + (Math.sin(a) > 0 ? ry * 0.4 : 0))
      p.lineTo(px + Math.cos(a + 0.2) * rx * 0.2, py + Math.sin(a + 0.2) * ry * 0.2)
      p.closePath()
    }
    p.moveTo(sx + rx, sy + ry * 0.4)
    p.ellipse(sx, sy + ry * 0.4, rx, ry, 0, 0, Math.PI * 2)
  }
}

/** A dark foreground slope on one side carrying a few full-height redwoods. */
function drawValleyForeground(paint: Paint, art: Box, horizonY: number, pal: ParkPalette, rng: Rng) {
  const bottom = art.y + art.h
  const leftSide = rng.chance(0.5)
  const slope = path((p) => {
    const x0 = leftSide ? art.x - 20 : art.x + art.w + 20
    const x1 = leftSide ? art.x + art.w * rng.range(0.45, 0.62) : art.x + art.w * rng.range(0.38, 0.55)
    const topY = horizonY + (bottom - horizonY) * rng.range(0.15, 0.35)
    p.moveTo(x0, bottom + 10)
    p.lineTo(x0, topY)
    p.quadraticCurveTo(lerp(x0, x1, 0.5), topY - 10, x1, bottom + 10)
    p.closePath()
  })
  paint(pal.forest[2], slope)
  const trees = new Path2D()
  const count = rng.int(2, 4)
  for (let i = 0; i < count; i++) {
    const x = leftSide ? art.x + art.w * rng.range(0.02, 0.3) : art.x + art.w * rng.range(0.7, 0.98)
    const baseY = bottom - rng.range(0, 40)
    const th = art.h * rng.range(0.7, 0.98)
    redwoodPath(trees, x, baseY, th, th * rng.range(0.16, 0.22), rng, { tiers: rng.int(9, 14), trunk: th * 0.012 })
  }
  paint(pal.shade, trees)
}

/** Sword ferns along the bottom edge. */
function drawFerns(paint: Paint, art: Box, pal: ParkPalette, rng: Rng, density: number) {
  const bottom = art.y + art.h
  const ferns = new Path2D()
  const n = Math.round(9 * density)
  for (let i = 0; i < n; i++) {
    const x = art.x + rng.next() * art.w
    const fronds = rng.int(4, 7)
    for (let f = 0; f < fronds; f++) {
      const a = -Math.PI / 2 + rng.range(-1.1, 1.1)
      const len = rng.range(50, 110)
      const bend = rng.range(0.2, 0.5) * Math.sign(Math.cos(a) || 1)
      frond(ferns, x, bottom + 6, a, len, bend)
    }
  }
  ferns.rect(art.x, bottom - 10, art.w, 14)
  paint(pal.shade, ferns)
}

function frond(p: Path2D, x: number, y: number, angle: number, len: number, bend: number) {
  const steps = 12
  let px = x
  let py = y
  let a = angle
  for (let i = 0; i < steps; i++) {
    const t = i / steps
    const seg = len / steps
    const nx = px + Math.cos(a) * seg
    const ny = py + Math.sin(a) * seg
    const leaf = (1 - t) * len * 0.16 + 2
    for (const s of [-1, 1]) {
      const la = a + s * 1.1
      p.moveTo(px, py)
      p.lineTo(px + Math.cos(la) * leaf + Math.cos(a) * leaf * 0.5, py + Math.sin(la) * leaf + Math.sin(a) * leaf * 0.5)
      p.lineTo(nx, ny)
      p.closePath()
    }
    px = nx
    py = ny
    a += bend / steps
  }
}

/** A slim conifer spire with a slightly ragged, tiered outline. */
function conifer(p: Path2D, x: number, baseY: number, th: number, tw: number, rng: Rng) {
  const tiers = Math.max(3, Math.round(th / 16))
  const top = baseY - th
  p.moveTo(x, top)
  for (let i = 1; i <= tiers; i++) {
    const t = i / tiers
    const y = lerp(top, baseY, t)
    const half = (tw / 2) * t * rng.range(0.9, 1.05)
    p.lineTo(x + half, y)
    if (i < tiers) p.lineTo(x + half * 0.72, y - 1)
  }
  for (let i = tiers; i >= 1; i--) {
    const t = i / tiers
    const y = lerp(top, baseY, t)
    const half = (tw / 2) * t
    if (i < tiers) p.lineTo(x - half * 0.72, y - 1)
    p.lineTo(x - half, y)
  }
  p.closePath()
}

/** The shadow side of a conifer: a slim wedge on its right. */
function coniferShadow(p: Path2D, x: number, baseY: number, th: number, tw: number) {
  p.moveTo(x + tw * 0.04, baseY - th * 0.96)
  p.lineTo(x + tw * 0.46, baseY)
  p.lineTo(x + tw * 0.08, baseY)
  p.closePath()
}

/** Vineyard rows running to the horizon on one side of the river. */
function drawVineyard(paint: Paint, art: Box, horizonY: number, river: River, pal: ParkPalette, rng: Rng) {
  const bottom = art.y + art.h
  const leftSide = rng.chance(0.5)
  const vpX = art.x + art.w * (leftSide ? rng.range(-0.3, 0.2) : rng.range(0.8, 1.3))
  const fieldTop = horizonY + (bottom - horizonY) * rng.range(0.12, 0.22)
  // the field: from the art edge to the near bank of the river
  const field = new Path2D()
  const edge: Pt[] = []
  for (let i = 0; i <= 40; i++) {
    const y = lerp(fieldTop, bottom + 10, i / 40)
    const r = river.nearest(y)
    edge.push([leftSide ? r.x - r.width / 2 - 14 : r.x + r.width / 2 + 14, y])
  }
  const outer = leftSide ? art.x - 20 : art.x + art.w + 20
  field.moveTo(outer, fieldTop)
  for (const [x, y] of edge) field.lineTo(x, y)
  field.lineTo(outer, bottom + 10)
  field.closePath()
  paint(pal.forest[0], field)
  // rows of vines: stripes converging on a point on the horizon
  paint(
    pal.forest[2],
    (c) => {
      c.save()
      c.clip(field)
      c.beginPath()
      const n = 26
      for (let i = -n; i <= n * 2; i++) {
        const bx = art.x + (i / n) * art.w * 1.4
        const spread = 9
        c.moveTo(vpX, horizonY - 2)
        c.lineTo(bx - spread, bottom + 20)
        c.lineTo(bx + spread, bottom + 20)
        c.closePath()
      }
      c.fill()
      c.restore()
    },
  )
}

/** Round-topped valley oaks scattered over the near slopes. */
function drawOaks(paint: Paint, art: Box, horizonY: number, river: River, pal: ParkPalette, rng: Rng) {
  const bottom = art.y + art.h
  const lit = new Path2D()
  const shade = new Path2D()
  const n = rng.int(7, 13)
  const oaks: Array<{ x: number; y: number; s: number }> = []
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rng.next(), 0.8) * 0.9 + 0.08
    const y = horizonY + (bottom - horizonY) * t
    const x = art.x + rng.next() * art.w
    const r = river.nearest(y)
    if (Math.abs(x - r.x) < r.width * 0.5 + 40) continue
    oaks.push({ x, y, s: 0.25 + t * 1.1 })
  }
  oaks.sort((a, b) => a.y - b.y)
  for (const o of oaks) {
    const cr = 30 * o.s
    const top = o.y - cr * 1.35
    // trunk forking into two limbs
    lit.moveTo(o.x - cr * 0.1, o.y)
    lit.lineTo(o.x - cr * 0.05, top + cr * 0.5)
    lit.lineTo(o.x - cr * 0.45, top + cr * 0.15)
    lit.lineTo(o.x - cr * 0.35, top + cr * 0.1)
    lit.lineTo(o.x, top + cr * 0.35)
    lit.lineTo(o.x + cr * 0.4, top + cr * 0.05)
    lit.lineTo(o.x + cr * 0.48, top + cr * 0.12)
    lit.lineTo(o.x + cr * 0.07, top + cr * 0.5)
    lit.lineTo(o.x + cr * 0.12, o.y)
    lit.closePath()
    // broad dome of lobes
    const lobes = 6
    for (let k = 0; k < lobes; k++) {
      const a = Math.PI * (1.05 + (k / (lobes - 1)) * 0.9)
      const lx = o.x + Math.cos(a) * cr * 0.95
      const ly = top + Math.sin(a) * cr * 0.55
      const lr = cr * rng.range(0.42, 0.56)
      lit.moveTo(lx + lr, ly)
      lit.arc(lx, ly, lr, 0, Math.PI * 2)
    }
    lit.moveTo(o.x + cr * 0.6, top - cr * 0.35)
    lit.arc(o.x, top - cr * 0.35, cr * 0.6, 0, Math.PI * 2)
    // the shadowed underside
    for (let k = 0; k < 3; k++) {
      const lx = o.x + (k - 0.6) * cr * 0.62
      const ly = top + cr * 0.12
      const lr = cr * rng.range(0.3, 0.38)
      shade.moveTo(lx + lr, ly)
      shade.arc(lx, ly, lr, 0, Math.PI)
      shade.closePath()
    }
    // cast shadow on the grass
    shade.moveTo(o.x + cr * 1.7, o.y + 1)
    shade.ellipse(o.x + cr * 0.6, o.y + 1, cr * 1.1, cr * 0.14, 0, 0, Math.PI * 2)
  }
  paint(pal.forest[1], lit)
  paint(pal.forest[2], shade)
}
