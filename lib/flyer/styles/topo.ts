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
  fitLines,
  fitSize,
  fitStack,
  getCtx,
  grain,
  hashSeed,
  hexToRgb,
  inkTexture,
  lerp,
  makeCanvas,
  measureType,
  misregister,
  newLayer,
  paper,
  printLayer,
  smoothstep,
  SITE_URL,
  textWidth,
  useType,
  fillTracked,
  jSafe,
} from '../kit'
import type { StyleContext } from '../types'

/*
  TOPO — a 7.5-minute quadrangle of an imaginary patch of the venue's own
  hills. A simulated heightfield (ridged fractal hills, a river valley
  carved through them, a tilt so water runs downhill) is contoured with
  marching squares: brown intermediate lines, heavier index contours with
  elevations set into the line. Streams are traced by steepest descent so
  they sit in the real valleys. Woodland tint, hillshade or hypsometric
  bands, a valley road, a survey grid, spot heights, corner coordinates and
  a pin on the venue; the bill is set in the map collar.
*/

interface TopoPalette {
  paper: string
  dark: boolean
  contour: string
  water: string
  waterFill: string
  wood: string | null
  red: string
  black: string
  hypso: string[] | null
  shade: number
}

const PALETTES: TopoPalette[] = [
  {
    // classic quad
    paper: '#f4f0e3',
    dark: false,
    contour: '#a8653a',
    water: '#2f78b4',
    waterFill: '#a8cfe8',
    wood: '#cfe2b0',
    red: '#cf3f2c',
    black: '#1d1b18',
    hypso: null,
    shade: 0.12,
  },
  {
    // shaded relief with hypsometric tints
    paper: '#f3eee0',
    dark: false,
    contour: '#8e5634',
    water: '#2f6f9e',
    waterFill: '#9fc6dc',
    wood: null,
    red: '#b8352a',
    black: '#1d1b18',
    hypso: ['#dde8c9', '#e8ebca', '#f0e7c6', '#ecdab5', '#e3c9a3', '#d8b995'],
    shade: 0.22,
  },
  {
    // sepia field copy
    paper: '#efe2c4',
    dark: false,
    contour: '#8a4f2a',
    water: '#4d7788',
    waterFill: '#b4c9c4',
    wood: '#d8d5a6',
    red: '#7a2230',
    black: '#2b2118',
    hypso: null,
    shade: 0.18,
  },
  {
    // blueprint
    paper: '#1f3d66',
    dark: true,
    contour: '#dce8f3',
    water: '#9fd0f0',
    waterFill: '#2c5585',
    wood: null,
    red: '#f2c14e',
    black: '#f4f1e6',
    hypso: null,
    shade: 0.25,
  },
  {
    // night map on pine stock
    paper: '#0f2a1d',
    dark: true,
    contour: '#e9b949',
    water: '#9fd2d6',
    waterFill: '#1c4535',
    wood: null,
    red: '#f08a5d',
    black: '#f4ecd8',
    hypso: null,
    shade: 0.3,
  },
]

const PLACES: Record<string, { lat: number; lon: number; river: string }> = {
  forestville: { lat: 38.4735, lon: -122.8903, river: 'Russian River' },
  guerneville: { lat: 38.5019, lon: -122.9961, river: 'Russian River' },
  'monte rio': { lat: 38.4655, lon: -123.0089, river: 'Russian River' },
  healdsburg: { lat: 38.6105, lon: -122.8692, river: 'Russian River' },
  jenner: { lat: 38.4502, lon: -123.1147, river: 'Russian River' },
  sebastopol: { lat: 38.4021, lon: -122.8239, river: 'Laguna de Santa Rosa' },
  cotati: { lat: 38.3266, lon: -122.7094, river: 'Laguna de Santa Rosa' },
  petaluma: { lat: 38.2324, lon: -122.6367, river: 'Petaluma River' },
  'santa rosa': { lat: 38.4405, lon: -122.7144, river: 'Santa Rosa Creek' },
  sonoma: { lat: 38.2919, lon: -122.458, river: 'Sonoma Creek' },
  'glen ellen': { lat: 38.3641, lon: -122.5244, river: 'Sonoma Creek' },
  occidental: { lat: 38.4077, lon: -122.9486, river: 'Dutch Bill Creek' },
  windsor: { lat: 38.5471, lon: -122.8164, river: 'Windsor Creek' },
  'bodega bay': { lat: 38.3333, lon: -123.0481, river: 'Salmon Creek' },
  nicasio: { lat: 38.0619, lon: -122.6983, river: 'Nicasio Creek' },
  napa: { lat: 38.2975, lon: -122.2869, river: 'Napa River' },
}

// Easter eggs for the lesser features.
const CREEKS = ['Dark Star Creek', 'Ripple Creek', 'Box of Rain Creek', 'Deja Vu Gulch', 'Aja Creek', 'Cumberland Creek']
const RIDGES = ['Dark Star Ridge', 'Terrapin Ridge', 'Sugar Magnolia Ridge', 'Brokedown Ridge', 'Cassidy Ridge']
const FLATS = ['Scarlet Begonia Flat', 'Tennessee Jed Flat', 'Peggy-O Meadow', 'Morning Dew Flat']

export default function topo(sc: StyleContext) {
  const { ctx, w, h, rng, story, copy, fonts } = sc
  const look = rng.fork('look')
  const pal = look.weighted<TopoPalette>([
    [PALETTES[0], 3],
    [PALETTES[1], 3],
    [PALETTES[2], 2],
    [PALETTES[3], 1.5],
    [PALETTES[4], 1.5],
  ])
  const place = PLACES[copy.city.toLowerCase()] ?? {
    lat: 38.3 + (hashSeed(copy.city) % 400) / 1000,
    lon: -122.6 - (hashSeed(copy.location) % 500) / 1000,
    river: look.pick(CREEKS),
  }

  paper(ctx, w, h, rng.fork('paper'), { color: pal.paper, tone: 0.45, fibers: 60, specks: 40, age: pal.dark ? 0.5 : 0.35, dark: pal.dark })

  // ---- sheet geometry ---------------------------------------------------
  const margin = 64
  const collarH = story ? 560 : 400
  const topSafe = story ? 150 : 0
  const bottomSafe = story ? 150 : 0
  const map: Box = { x: margin, y: margin + topSafe, w: w - 2 * margin, h: h - 2 * margin - collarH - topSafe - bottomSafe }
  const collar: Box = { x: margin, y: map.y + map.h + 22, w: map.w, h: collarH - 22 }

  // ---- terrain ----------------------------------------------------------
  const cell = 4
  const gw = Math.ceil(map.w / cell) + 1
  const gh = Math.ceil(map.h / cell) + 1
  const H = new Float32Array(gw * gh)
  const terrain$ = rng.fork('terrain')
  const noise = new Noise2D(terrain$.fork('n'))
  const detail = new Noise2D(terrain$.fork('d'))
  const scale = terrain$.range(260, 380)

  // the river: a meander entering one side and leaving another
  const river = makeRiverLine(map, terrain$.fork('river'))
  const riverDist = new Float32Array(gw * gh)
  const riverAlong = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = map.x + i * cell
      const y = map.y + j * cell
      const { d, s } = distToPolyline(river, x, y)
      riverDist[j * gw + i] = d
      riverAlong[j * gw + i] = s
    }
  }
  const valleyW = terrain$.range(90, 150)
  const relief = terrain$.range(0.85, 1.15)
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i
      const x = i * cell
      const y = j * cell
      const n1 = noise.fbm(x / scale, y / scale, 4, 2.0, 0.42)
      const ridged = 1 - Math.abs(detail.fbm(x / (scale * 0.9) + 9, y / (scale * 0.9) - 4, 3, 2.0, 0.45))
      let e = 0.55 + 0.55 * n1 + 0.35 * (ridged - 0.6)
      // carve the valley and let the river run downhill
      const d = riverDist[k]
      const carve = Math.exp(-Math.pow(d / valleyW, 2))
      e = e * (1 - 0.75 * carve) + 0.08 * carve
      e += smoothstep(0, valleyW * 2.5, d) * 0.15
      e += (1 - riverAlong[k]) * 0.1
      H[k] = e * relief
    }
  }
  // normalise to feet
  let minE = Infinity
  let maxE = -Infinity
  for (let k = 0; k < H.length; k++) {
    if (H[k] < minE) minE = H[k]
    if (H[k] > maxE) maxE = H[k]
  }
  const lowFt = terrain$.range(40, 200)
  const highFt = lowFt + terrain$.range(1100, 1700)
  for (let k = 0; k < H.length; k++) H[k] = lowFt + ((H[k] - minE) / (maxE - minE)) * (highFt - lowFt)
  const interval = 40
  const indexEvery = 5

  // ---- base raster: tints, woodland, hillshade -------------------------------
  const base = makeCanvas(map.w, map.h)
  const bctx = getCtx(base)
  const img = bctx.createImageData(map.w, map.h)
  const woodNoise = new Noise2D(terrain$.fork('wood'))
  const woodField = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      woodField[j * gw + i] = woodNoise.fbm((i * cell) / 180, (j * cell) / 180, 4) + (H[j * gw + i] > highFt - 250 ? -0.4 : 0)
    }
  }
  // hillshade from the gradient, light from the north-west
  const shadeField = new Float32Array(gw * gh)
  const zf = 1 / 14
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const hx = H[j * gw + Math.min(gw - 1, i + 1)] - H[j * gw + Math.max(0, i - 1)]
      const hy = H[Math.min(gh - 1, j + 1) * gw + i] - H[Math.max(0, j - 1) * gw + i]
      const nx = -hx * zf
      const ny = -hy * zf
      const nz = 1
      const len = Math.hypot(nx, ny, nz)
      const lx = -0.6
      const ly = -0.6
      const lz = 0.53
      shadeField[j * gw + i] = (nx * lx + ny * ly + nz * lz) / len
    }
  }
  const sample = (f: Float32Array, px: number, py: number) => {
    const gx = px / cell
    const gy = py / cell
    const i = Math.min(gw - 2, Math.floor(gx))
    const j = Math.min(gh - 2, Math.floor(gy))
    const tx = gx - i
    const ty = gy - j
    const a = f[j * gw + i]
    const b = f[j * gw + i + 1]
    const c = f[(j + 1) * gw + i]
    const d = f[(j + 1) * gw + i + 1]
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty
  }
  const hyp = pal.hypso?.map(hexToRgb) ?? null
  const woodRgb = pal.wood ? hexToRgb(pal.wood) : null
  const flat = 0.53 / Math.hypot(0.6, 0.6, 0.53)
  for (let py = 0; py < map.h; py++) {
    for (let px = 0; px < map.w; px++) {
      const o = (py * map.w + px) * 4
      let r = 255
      let g = 255
      let b = 255
      if (hyp) {
        const e = sample(H, px, py)
        const t = clamp((e - lowFt) / (highFt - lowFt)) * (hyp.length - 1)
        const band = Math.min(hyp.length - 1, Math.floor(t))
        const c = hyp[band]
        r = c[0]
        g = c[1]
        b = c[2]
      }
      if (woodRgb && sample(woodField, px, py) > 0.02) {
        r = (r * woodRgb[0]) / 255
        g = (g * woodRgb[1]) / 255
        b = (b * woodRgb[2]) / 255
      }
      if (pal.shade > 0) {
        const s = sample(shadeField, px, py) - flat
        const k = 1 + clamp(s * 1.4, -1, 0.6) * pal.shade
        r *= k
        g *= k
        b *= k
      }
      img.data[o] = r
      img.data[o + 1] = g
      img.data[o + 2] = b
      img.data[o + 3] = 255
    }
  }
  bctx.putImageData(img, 0, 0)
  ctx.save()
  ctx.globalCompositeOperation = pal.dark ? 'soft-light' : 'multiply'
  ctx.drawImage(base, map.x, map.y)
  ctx.restore()

  // ---- plates --------------------------------------------------------
  const brown = newLayer(w, h)
  const blue = newLayer(w, h)
  const blueFill = newLayer(w, h)
  const red = newLayer(w, h)
  const black = newLayer(w, h)
  const clipMap = (c: Ctx) => {
    c.beginPath()
    c.rect(map.x, map.y, map.w, map.h)
    c.clip()
  }
  for (const L of [brown, blue, blueFill, red]) {
    L.ctx.save()
    clipMap(L.ctx)
  }

  // contours
  const levels: number[] = []
  for (let e = Math.ceil(lowFt / interval) * interval; e < highFt; e += interval) levels.push(e)
  const indexLines: Array<{ pts: Pt[]; level: number }> = []
  const b = brown.ctx
  b.lineJoin = 'round'
  b.lineCap = 'round'
  for (const level of levels) {
    const isIndex = Math.round(level / interval) % indexEvery === 0
    const polys = contourLines(H, gw, gh, level, cell, map.x, map.y)
    b.lineWidth = isIndex ? 2.3 : 1.05
    b.globalAlpha = isIndex ? 1 : 0.85
    b.beginPath()
    for (const poly of polys) {
      const sm = chaikin(poly, 1)
      b.moveTo(sm[0][0], sm[0][1])
      for (let i = 1; i < sm.length; i++) b.lineTo(sm[i][0], sm[i][1])
      if (isIndex) indexLines.push({ pts: sm, level })
    }
    b.stroke()
  }
  b.globalAlpha = 1

  // woodland/stream/road features
  const streams = traceStreams(H, gw, gh, cell, map, riverDist, terrain$.fork('streams'))
  const bl = blue.ctx
  bl.lineJoin = 'round'
  bl.lineCap = 'round'
  streams.forEach((s, i) => {
    const major = i < streams.length * 0.3
    bl.lineWidth = major ? 1.8 : 1.2
    bl.setLineDash(major ? [] : [12, 4, 2, 4])
    bl.beginPath()
    const sm = chaikin(s, 2)
    sm.forEach(([x, y], k) => (k === 0 ? bl.moveTo(x, y) : bl.lineTo(x, y)))
    bl.stroke()
  })
  bl.setLineDash([])
  // the river: filled channel with a double bank line
  const riverPoly = riverChannel(river, terrain$.fork('channel'))
  blueFill.ctx.fill(riverPoly)
  bl.lineWidth = 1.6
  bl.stroke(riverPoly)

  // road along the valley, offset from the river, and the venue on it
  const road = offsetLine(river, terrain$.range(55, 85) * terrain$.sign())
  const roadPath = new Path2D()
  chaikin(road, 2).forEach(([x, y], i) => (i === 0 ? roadPath.moveTo(x, y) : roadPath.lineTo(x, y)))
  const k = black.ctx
  k.save()
  clipMap(k)
  k.lineJoin = 'round'
  k.lineCap = 'round'
  k.lineWidth = 8
  k.stroke(roadPath)
  k.restore()
  red.ctx.lineWidth = 4.5
  red.ctx.lineJoin = 'round'
  red.ctx.stroke(roadPath)
  // cut the road's centre out of the black casing so it reads as a double line
  k.save()
  clipMap(k)
  k.globalCompositeOperation = 'destination-out'
  k.lineWidth = 4.5
  k.stroke(roadPath)
  k.restore()

  // survey grid (sections) in red
  const r = red.ctx
  if (!pal.dark || look.chance(0.5)) {
    const secs = look.int(6, 8)
    const step = map.w / secs
    const ox = map.x + look.range(0, step)
    r.save()
    r.globalAlpha = 0.55
    r.lineWidth = 1
    r.setLineDash([22, 6])
    r.beginPath()
    for (let x = ox; x < map.x + map.w; x += step) {
      r.moveTo(x, map.y)
      r.lineTo(x + look.range(-6, 6), map.y + map.h)
    }
    for (let y = map.y + look.range(0, step); y < map.y + map.h; y += step) {
      r.moveTo(map.x, y)
      r.lineTo(map.x + map.w, y + look.range(-6, 6))
    }
    r.stroke()
    r.setLineDash([])
    r.globalAlpha = 0.75
    const secSpec: TypeSpec = { family: fonts.gothic, weight: 500 }
    let n = look.int(1, 20)
    for (let y = map.y + step * 0.5; y < map.y + map.h; y += step) {
      for (let x = ox - step * 0.5; x < map.x + map.w; x += step) {
        // section numbers only inside the neatline
        const inside = x > map.x + 14 && x < map.x + map.w - 14 && y > map.y + 14 && y < map.y + map.h - 14
        if (look.chance(0.45) && inside) drawType(r, String(n), x, y + 7, secSpec, 20, 'center')
        n = (n % 36) + 1
      }
    }
    r.restore()
  }

  // ---- labels on the map -------------------------------------------------
  const labelSpec: TypeSpec = { family: fonts.gothic, weight: 500, tracking: 0.02 }
  const brownText = (c: Ctx, text: string, x: number, y: number, angle: number, size: number) => {
    c.save()
    c.translate(x, y)
    c.rotate(angle)
    const tr = useType(c, labelSpec, size)
    const tw = textWidth(c, text, tr)
    c.globalCompositeOperation = 'destination-out'
    c.fillRect(-tw / 2 - 5, -size * 0.55, tw + 10, size * 1.1)
    c.globalCompositeOperation = 'source-over'
    c.textBaseline = 'middle'
    fillTracked(c, text, -tw / 2, 1, tr, 'left')
    c.textBaseline = 'alphabetic'
    c.restore()
  }
  // venue point first, so labels avoid it
  // put the venue on the road somewhere comfortably inside the map, with room for its label above
  const inside = (t: number) => {
    const [x, y] = pointAlong(road, t)
    return x > map.x + 70 && x < map.x + map.w - 70 && y > map.y + 120 && y < map.y + map.h - 70
  }
  let venueT = look.range(0.35, 0.65)
  for (let i = 0; i < 24 && !inside(venueT); i++) venueT = look.range(0.12, 0.88)
  const venue = pointAlong(road, venueT)
  const pr = 17
  const vlSpec: TypeSpec = { family: fonts.gothic, weight: 600, tracking: 0.08 }
  const vl = copy.venue.toUpperCase()
  const vlSize = Math.min(24, fitSize(k, vl, vlSpec, map.w * 0.42, 24))
  const vlW = measureType(k, vl, vlSpec, vlSize).width
  const leftSide = venue[0] + 30 + vlW > map.x + map.w - 20
  const lx = leftSide ? venue[0] - 30 - vlW : venue[0] + 30
  const ly = venue[1] - pr * 2.2
  const avoid: Box[] = [
    { x: venue[0] - 40, y: venue[1] - 90, w: 80, h: 110 },
    { x: lx - 20, y: ly - vlSize - 14, w: vlW + 40, h: vlSize + 30 },
  ]
  const clear = (x: number, y: number, pad = 40) =>
    x > map.x + pad && x < map.x + map.w - pad && y > map.y + pad && y < map.y + map.h - pad && !avoid.some((a) => x > a.x && x < a.x + a.w && y > a.y && y < a.y + a.h)

  // knock the colour plates out behind a label so it sits on clean paper
  const halo = (x: number, y: number, bw: number, bh: number) => {
    for (const L of [brown, blue, blueFill, red]) {
      L.ctx.save()
      L.ctx.globalCompositeOperation = 'destination-out'
      L.ctx.fillRect(x, y, bw, bh)
      L.ctx.restore()
    }
  }
  const overlaps = (bx: Box) => avoid.some((a) => bx.x < a.x + a.w && bx.x + bx.w > a.x && bx.y < a.y + a.h && bx.y + bx.h > a.y)

  // index contour elevations
  let placedLabels = 0
  const labelRng = rng.fork('labels')
  for (const line of labelRng.shuffle(indexLines)) {
    if (placedLabels > (story ? 12 : 9)) break
    if (line.pts.length < 40) continue
    const idx = Math.floor(line.pts.length * labelRng.range(0.3, 0.7))
    const [x, y] = line.pts[idx]
    const [x2, y2] = line.pts[Math.min(line.pts.length - 1, idx + 4)]
    let a = Math.atan2(y2 - y, x2 - x)
    if (a > Math.PI / 2) a -= Math.PI
    if (a < -Math.PI / 2) a += Math.PI
    if (Math.abs(a) > 1.1 || !clear(x, y)) continue
    brownText(b, String(line.level), x, y, a, 17)
    avoid.push({ x: x - 40, y: y - 20, w: 80, h: 40 })
    placedLabels++
  }

  // spot heights at local summits
  const summits = findSummits(H, gw, gh, cell, map, 8)
  const peakNames = labelRng.shuffle(RIDGES)
  summits.slice(0, story ? 4 : 3).forEach(([x, y, e], i) => {
    if (!clear(x, y, 50)) return
    k.save()
    k.lineWidth = 2
    k.beginPath()
    k.moveTo(x - 5, y - 5)
    k.lineTo(x + 5, y + 5)
    k.moveTo(x + 5, y - 5)
    k.lineTo(x - 5, y + 5)
    k.stroke()
    k.restore()
    drawType(k, String(Math.round(e)), x + 10, y + 6, { family: fonts.gothic, weight: 400 }, 17, 'left')
    if (i === 0) {
      const pn = peakNames[0].toUpperCase()
      const pw = measureType(k, pn, { family: fonts.gothic, weight: 500, tracking: 0.25 }, 15).width
      halo(x - pw / 2 - 6, y - 31, pw + 12, 21)
      drawType(k, pn, x, y - 16, { family: fonts.gothic, weight: 500, tracking: 0.25 }, 15, 'center')
    }
    avoid.push({ x: x - 60, y: y - 34, w: 150, h: 50 })
  })

  // river name along the channel, italic blue
  const riverLabelT = venueT > 0.5 ? 0.22 : 0.78
  const [rx, ry] = pointAlong(river, riverLabelT)
  const [rx2, ry2] = pointAlong(river, riverLabelT + 0.02)
  let ra = Math.atan2(ry2 - ry, rx2 - rx)
  if (ra > Math.PI / 2) ra -= Math.PI
  if (ra < -Math.PI / 2) ra += Math.PI
  bl.save()
  bl.translate(rx, ry)
  bl.rotate(ra)
  drawType(bl, place.river, 0, -18, { family: fonts.body, weight: 700, italic: true, tracking: 0.12 }, 22, 'center')
  bl.restore()
  // a creek name and a flat
  if (streams[0] && streams[0].length > 30) {
    const s0 = streams[0]
    const [cx0, cy0] = s0[Math.floor(s0.length * 0.4)]
    if (clear(cx0, cy0)) drawType(bl, labelRng.pick(CREEKS.filter((c) => c !== place.river)), cx0 + 10, cy0, { family: fonts.body, weight: 500, italic: true }, 17, 'left')
  }
  const flatName = labelRng.pick(FLATS)
  const fx = map.x + map.w * labelRng.range(0.2, 0.8)
  const fy = map.y + map.h * labelRng.range(0.2, 0.8)
  if (clear(fx, fy, 90)) {
    const fw = measureType(k, flatName.toUpperCase(), { family: fonts.gothic, weight: 400, tracking: 0.3 }, 14).width
    halo(fx - fw / 2 - 6, fy - 15, fw + 12, 20)
    drawType(k, flatName.toUpperCase(), fx, fy, { family: fonts.gothic, weight: 400, tracking: 0.3 }, 14, 'center')
  }

  // buildings clustered along the road near the venue, the town name
  const town = labelRng.fork('town')
  for (let i = 0; i < 26; i++) {
    const t = venueT + town.gaussian(0, 0.05)
    const [bx, by] = pointAlong(road, clamp(t, 0.02, 0.98))
    const off = town.range(14, 40) * town.sign()
    const [nx, ny] = normalAlong(road, clamp(t, 0.02, 0.98))
    const x = bx + nx * off
    const y = by + ny * off
    if (Math.hypot(x - venue[0], y - venue[1]) < 26) continue
    const s = town.range(5, 9)
    k.save()
    k.translate(x, y)
    k.rotate(Math.atan2(ny, nx))
    k.fillRect(-s / 2, -s / 2, s, s * town.range(0.8, 1.4))
    k.restore()
  }
  // town name: first spot along the road that doesn't collide with the pin label
  const townSpec: TypeSpec = { family: fonts.gothic, weight: 600, tracking: 0.35 }
  const townText = copy.city.toUpperCase()
  const townW = measureType(k, townText, townSpec, 22).width
  const vlBox: Box = { x: 0, y: 0, w: 0, h: 0 }
  for (const dt of [-0.18, 0.18, -0.28, 0.28, -0.1, 0.1]) {
    const t = clamp(venueT + dt, 0.1, 0.9)
    const [tx, ty] = pointAlong(road, t)
    const [nx, ny] = normalAlong(road, t)
    for (const side of [-1, 1]) {
      const cxT = tx + nx * 40 * side
      const cyT = ty + ny * 40 * side
      const box: Box = { x: cxT - townW / 2 - 8, y: cyT - 20, w: townW + 16, h: 28 }
      if (box.x < map.x + 10 || box.x + box.w > map.x + map.w - 10 || box.y < map.y + 10 || box.y + box.h > map.y + map.h - 10) continue
      if (overlaps(box)) continue
      vlBox.x = box.x
      vlBox.y = box.y
      vlBox.w = box.w
      vlBox.h = box.h
      break
    }
    if (vlBox.w) break
  }
  if (vlBox.w) {
    halo(vlBox.x, vlBox.y, vlBox.w, vlBox.h)
    drawType(k, townText, vlBox.x + vlBox.w / 2, vlBox.y + 22, townSpec, 22, 'center')
    avoid.push(vlBox)
  }

  // route shield on the road
  const shieldAt = pointAlong(road, venueT > 0.5 ? 0.12 : 0.88)
  const routeNo = String(look.pick([1, 12, 116, 128, 101, 121]))
  k.save()
  k.beginPath()
  k.arc(shieldAt[0], shieldAt[1], 19, 0, Math.PI * 2)
  k.fill()
  k.globalCompositeOperation = 'destination-out'
  k.beginPath()
  k.arc(shieldAt[0], shieldAt[1], 15.5, 0, Math.PI * 2)
  k.fill()
  k.globalCompositeOperation = 'source-over'
  const rs: TypeSpec = { family: fonts.gothic, weight: 600 }
  const rsize = fitSize(k, routeNo, rs, 24, 18)
  drawType(k, routeNo, shieldAt[0], shieldAt[1] + rsize * 0.36, rs, rsize, 'center')
  k.restore()

  // ---- the pin ---------------------------------------------------------
  const [vx, vy] = venue
  r.save()
  r.beginPath()
  r.moveTo(vx, vy)
  r.bezierCurveTo(vx - pr * 0.4, vy - pr * 1.2, vx - pr * 1.3, vy - pr * 1.6, vx - pr * 1.3, vy - pr * 2.5)
  r.arc(vx, vy - pr * 2.5, pr * 1.3, Math.PI, 0)
  r.bezierCurveTo(vx + pr * 1.3, vy - pr * 1.6, vx + pr * 0.4, vy - pr * 1.2, vx, vy)
  r.fill()
  r.globalCompositeOperation = 'destination-out'
  r.beginPath()
  r.arc(vx, vy - pr * 2.5, pr * 0.5, 0, Math.PI * 2)
  r.fill()
  r.restore()
  // halo'd venue label beside the pin
  for (const L of [brown, blue, blueFill, red]) {
    L.ctx.save()
    L.ctx.globalCompositeOperation = 'destination-out'
    L.ctx.fillRect(lx - 8, ly - vlSize * 0.95, vlW + 16, vlSize * 1.35)
    L.ctx.restore()
  }
  drawType(k, vl, lx, ly, vlSpec, vlSize, 'left')
  for (const L of [brown, blue, blueFill, red]) L.ctx.restore()

  // ---- neatline, ticks and corner coordinates ------------------------------
  k.lineWidth = 2
  k.strokeRect(map.x, map.y, map.w, map.h)
  k.lineWidth = 1
  k.strokeRect(map.x - 8, map.y - 8, map.w + 16, map.h + 16)
  const coordSpec: TypeSpec = { family: fonts.gothic, weight: 400, tracking: 0.02 }
  // a 7.5-minute cell containing the town
  const latTop = Math.ceil(place.lat * 8) / 8
  const lonLeft = Math.floor(place.lon * 8) / 8
  const fmt = (v: number, full: boolean) => {
    const a = Math.abs(v)
    const d = Math.floor(a + 1e-9)
    const totalSec = Math.round((a - d) * 3600)
    const m = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    const ms = `${String(m).padStart(2, '0')}'${sec ? `${String(sec).padStart(2, '0')}"` : ''}`
    return full ? `${d}°${ms}` : ms
  }
  // longitude along the top, latitude up the left side
  drawType(k, fmt(lonLeft, true), map.x, map.y - 16, coordSpec, 15, 'left')
  drawType(k, fmt(lonLeft + 0.125, true), map.x + map.w, map.y - 16, coordSpec, 15, 'right')
  for (const [yy, v] of [
    [map.y + 4, latTop],
    [map.y + map.h - 4, latTop - 0.125],
  ] as const) {
    k.save()
    k.translate(map.x - 16, yy)
    k.rotate(-Math.PI / 2)
    drawType(k, fmt(v, true), 0, 0, coordSpec, 15, yy < map.y + 10 ? 'right' : 'left')
    k.restore()
  }
  for (let i = 1; i < 3; i++) {
    const x = map.x + (map.w * i) / 3
    k.fillRect(x - 0.75, map.y - 8, 1.5, 14)
    k.fillRect(x - 0.75, map.y + map.h - 6, 1.5, 14)
    drawType(k, fmt(lonLeft + (0.125 * i) / 3, false), x, map.y - 16, coordSpec, 14, 'center')
    const y = map.y + (map.h * i) / 3
    k.fillRect(map.x - 8, y - 0.75, 14, 1.5)
    k.fillRect(map.x + map.w - 6, y - 0.75, 14, 1.5)
    k.save()
    k.translate(map.x - 16, y)
    k.rotate(-Math.PI / 2)
    drawType(k, fmt(latTop - (0.125 * i) / 3, false), 0, 0, coordSpec, 14, 'center')
    k.restore()
  }

  // ---- collar: the bill ------------------------------------------------
  drawCollar(sc, k, r, collar)

  // ---- print --------------------------------------------------------------
  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.22, specks: 0.45, scratches: 0.1 })
  const reg = rng.fork('reg')
  const blend: GlobalCompositeOperation = pal.dark ? 'source-over' : 'multiply'
  printLayer(ctx, blueFill, { color: pal.waterFill, offset: misregister(reg, 1.5), texture: tex, wear: 0.3, rng: reg, blend })
  printLayer(ctx, brown, { color: pal.contour, offset: misregister(reg, 1.5), texture: tex, wear: 0.3, rng: reg, blend })
  printLayer(ctx, blue, { color: pal.water, offset: misregister(reg, 1.5), texture: tex, wear: 0.3, rng: reg, blend })
  printLayer(ctx, red, { color: pal.red, offset: misregister(reg, 1.5), texture: tex, wear: 0.3, rng: reg, blend })
  printLayer(ctx, black, { color: pal.black, offset: [0, 0], texture: tex, wear: 0.25, rng: reg, blend })
  grain(ctx, w, h, rng, 0.07)
}

/* ---------------------------------------------------------------------- */

function drawCollar(
  sc: StyleContext,
  k: Ctx,
  r: Ctx,
  box: Box,
) {
  const { ctx, copy, fonts, logo, story } = sc
  // left: the quad title and the show; right: legend (wordmark, scale, north)
  const splitX = box.x + box.w * 0.6
  const left: Box = { x: box.x, y: box.y, w: splitX - box.x - 30, h: box.h }
  const right: Box = { x: splitX + 30, y: box.y, w: box.x + box.w - splitX - 30, h: box.h }
  k.fillRect(splitX, box.y + 14, 1.2, box.h - 28)

  const quad = `${copy.city.toUpperCase()} QUADRANGLE`
  const stateName = /^ca/i.test(copy.region) ? 'CALIFORNIA' : copy.region.toUpperCase()
  const lines: StackLine[] = [
    { text: quad, spec: jSafe(fonts, quad, { family: fonts.caslon, tracking: 0.12 }), size: story ? 48 : 40, gap: 8 },
    { text: `${stateName}  ·  7.5 MINUTE SERIES  ·  PSYCHEDELIC AMERICANA`, spec: { family: fonts.gothic, weight: 400, tracking: 0.16 }, size: 15, gap: 26 },
    { text: 'LIVE', spec: { family: fonts.gothic, weight: 600, tracking: 0.5 }, size: 22, gap: 12, tag: 'red' },
    { text: copy.dateLine.toUpperCase(), spec: { family: fonts.gothic, weight: 600, tracking: 0.04 }, size: story ? 80 : 64, gap: 14 },
  ]
  const venueFit = fitLines(ctx, copy.venue.toUpperCase(), { family: fonts.gothic, weight: 700, tracking: 0.02 }, left.w, story ? 3 : 2, story ? 96 : 72, 30)
  venueFit.lines.forEach((l) => lines.push({ text: l, spec: { family: fonts.gothic, weight: 700, tracking: 0.02 }, size: venueFit.size, gap: 8 }))
  lines[lines.length - 1].gap = 14
  lines.push({ text: [copy.location, copy.time].filter(Boolean).join('  ·  ').toUpperCase(), spec: { family: fonts.gothic, weight: 400, tracking: 0.14 }, size: 26, gap: 14, tag: 'red' })
  clampParagraph(ctx, copy.description, { family: fonts.body, weight: 500, italic: true }, 22, left.w, story ? 3 : 2).forEach((d) =>
    lines.push({ text: d, spec: { family: fonts.body, weight: 500, italic: true }, size: 22, gap: 4 }),
  )
  lines[lines.length - 1].gap = 0
  const placed = fitStack(ctx, lines, { ...left, y: left.y + 6, h: left.h - 6 }, { align: 'left', valign: story ? 'spread' : 'top', maxSpreadGap: 22 })
  placed.forEach((p) => drawType(p.line.tag === 'red' ? r : k, p.line.text, p.left, p.baseline, p.line.spec, p.size, 'left'))

  // right column: wordmark, then the mark as a north arrow beside the scale
  let y = right.y + 10
  if (logo) {
    const ww = right.w * (story ? 0.92 : 0.8)
    drawWordmark(k, logo, right.x + (right.w - ww) / 2, y, ww, '#000')
    y += ww / logo.wordAspect + (story ? 40 : 24)
  }
  const small: TypeSpec = { family: fonts.gothic, weight: 400, tracking: 0.12 }
  const footerTop = right.y + right.h - 44
  const blockH = Math.min(footerTop - y - 10, story ? 300 : 150)
  const arrowH = logo ? blockH : 0
  const arrowW = logo ? arrowH * logo.markAspect * 0.9 : 0
  if (logo) {
    drawType(k, 'N', right.x + arrowW / 2 + 6, y + 18, { family: fonts.caslon }, 22, 'center')
    drawMark(k, logo, right.x + 6, y + 26, arrowH - 26, '#000')
  }
  const sx = right.x + arrowW + 30
  const sw = right.x + right.w - sx
  const barW = sw * 0.9
  const bx = sx + (sw - barW) / 2
  let sy = y + Math.max(10, (blockH - 110) / 2)
  const segs = 4
  k.lineWidth = 1.2
  k.strokeRect(bx, sy, barW, 8)
  for (let i = 0; i < segs; i++) if (i % 2 === 0) k.fillRect(bx + (barW / segs) * i, sy, barW / segs, 8)
  drawType(k, '0', bx, sy + 28, small, 14, 'center')
  drawType(k, '1 MILE', bx + barW, sy + 28, small, 14, 'right')
  sy += 56
  drawType(k, 'SCALE 1:24 000', sx + sw / 2, sy, small, 15, 'center')
  sy += 24
  drawType(k, 'CONTOUR INTERVAL', sx + sw / 2, sy, small, 13, 'center')
  sy += 18
  drawType(k, '40 FEET', sx + sw / 2, sy, small, 13, 'center')
  drawType(k, SITE_URL.toUpperCase(), right.x + right.w / 2, right.y + right.h - 6, { family: fonts.gothic, weight: 500, tracking: 0.18 }, 15, 'center')
  drawType(r, `EDITION OF ${copy.year ?? ''} · No. ${sc.printNo}`, right.x + right.w / 2, right.y + right.h - 28, small, 13, 'center')
}

/** A meandering river crossing the map from one edge to another. */
function makeRiverLine(map: Box, rng: Rng): Pt[] {
  const horizontal = rng.chance(0.55)
  const pts: Pt[] = []
  const n = 60
  const amp = (horizontal ? map.h : map.w) * rng.range(0.12, 0.22)
  const f1 = rng.range(1.2, 2.4)
  const f2 = rng.range(3, 5)
  const p1 = rng.range(0, 6)
  const p2 = rng.range(0, 6)
  const c = rng.range(0.35, 0.65)
  const tilt = rng.range(-0.25, 0.25)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const off = amp * (Math.sin(t * f1 * Math.PI + p1) + 0.3 * Math.sin(t * f2 * Math.PI + p2)) + tilt * (t - 0.5) * (horizontal ? map.h : map.w)
    if (horizontal) pts.push([map.x - 40 + t * (map.w + 80), map.y + map.h * c + off])
    else pts.push([map.x + map.w * c + off, map.y - 40 + t * (map.h + 80)])
  }
  return pts
}

function distToPolyline(pts: Pt[], x: number, y: number): { d: number; s: number } {
  let best = Infinity
  let bestS = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const dx = bx - ax
    const dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2)
    const px = ax + dx * t
    const py = ay + dy * t
    const d = (x - px) * (x - px) + (y - py) * (y - py)
    if (d < best) {
      best = d
      bestS = (i + t) / (pts.length - 1)
    }
  }
  return { d: Math.sqrt(best), s: bestS }
}

function pointAlong(pts: Pt[], t: number): Pt {
  const f = clamp(t) * (pts.length - 1)
  const i = Math.min(pts.length - 2, Math.floor(f))
  const u = f - i
  return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]
}

function normalAlong(pts: Pt[], t: number): Pt {
  const [x1, y1] = pointAlong(pts, t - 0.01)
  const [x2, y2] = pointAlong(pts, t + 0.01)
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  return [-(y2 - y1) / len, (x2 - x1) / len]
}

function offsetLine(pts: Pt[], d: number): Pt[] {
  return pts.map((_, i) => {
    const t = i / (pts.length - 1)
    const [x, y] = pts[i]
    const [nx, ny] = normalAlong(pts, t)
    return [x + nx * d, y + ny * d]
  })
}

function riverChannel(pts: Pt[], rng: Rng): Path2D {
  const noise = new Noise2D(rng)
  const left: Pt[] = []
  const right: Pt[] = []
  const sm = chaikin(pts, 2)
  sm.forEach(([x, y], i) => {
    const t = i / (sm.length - 1)
    const [nx, ny] = normalAlong(sm, t)
    const wdt = 7 + 5 * (0.5 + 0.5 * noise.noise(t * 9, 1)) + t * 6
    left.push([x + nx * wdt, y + ny * wdt])
    right.push([x - nx * wdt, y - ny * wdt])
  })
  const p = new Path2D()
  left.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)))
  right.reverse().forEach(([x, y]) => p.lineTo(x, y))
  p.closePath()
  return p
}

/** Chaikin corner cutting. */
function chaikin(pts: Pt[], iterations: number): Pt[] {
  let out = pts
  for (let it = 0; it < iterations; it++) {
    if (out.length < 3) return out
    const next: Pt[] = [out[0]]
    for (let i = 0; i < out.length - 1; i++) {
      const [x0, y0] = out[i]
      const [x1, y1] = out[i + 1]
      next.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75])
    }
    next.push(out[out.length - 1])
    out = next
  }
  return out
}

/**
 * Marching squares for one level, with segments stitched into polylines by
 * shared grid edges.
 */
function contourLines(F: Float32Array, gw: number, gh: number, level: number, cell: number, ox: number, oy: number): Pt[][] {
  type Seg = { a: number; b: number; pa: Pt; pb: Pt }
  const segs: Seg[] = []
  const edgeId = (i: number, j: number, vertical: boolean) => (j * gw + i) * 2 + (vertical ? 1 : 0)
  const interp = (i0: number, j0: number, i1: number, j1: number): Pt => {
    const v0 = F[j0 * gw + i0]
    const v1 = F[j1 * gw + i1]
    const t = (level - v0) / (v1 - v0 || 1e-6)
    return [ox + (i0 + (i1 - i0) * t) * cell, oy + (j0 + (j1 - j0) * t) * cell]
  }
  for (let j = 0; j < gh - 1; j++) {
    for (let i = 0; i < gw - 1; i++) {
      const tl = F[j * gw + i] > level ? 1 : 0
      const tr = F[j * gw + i + 1] > level ? 1 : 0
      const br = F[(j + 1) * gw + i + 1] > level ? 1 : 0
      const bl = F[(j + 1) * gw + i] > level ? 1 : 0
      const code = tl * 8 + tr * 4 + br * 2 + bl
      if (code === 0 || code === 15) continue
      const T = () => ({ id: edgeId(i, j, false), p: interp(i, j, i + 1, j) })
      const R = () => ({ id: edgeId(i + 1, j, true), p: interp(i + 1, j, i + 1, j + 1) })
      const B = () => ({ id: edgeId(i, j + 1, false), p: interp(i, j + 1, i + 1, j + 1) })
      const L = () => ({ id: edgeId(i, j, true), p: interp(i, j, i, j + 1) })
      const add = (e1: { id: number; p: Pt }, e2: { id: number; p: Pt }) => segs.push({ a: e1.id, b: e2.id, pa: e1.p, pb: e2.p })
      switch (code) {
        case 1:
        case 14:
          add(L(), B())
          break
        case 2:
        case 13:
          add(B(), R())
          break
        case 3:
        case 12:
          add(L(), R())
          break
        case 4:
        case 11:
          add(T(), R())
          break
        case 5:
          add(L(), T())
          add(B(), R())
          break
        case 6:
        case 9:
          add(T(), B())
          break
        case 7:
        case 8:
          add(L(), T())
          break
        case 10:
          add(T(), R())
          add(L(), B())
          break
      }
    }
  }
  // stitch
  const byEdge = new Map<number, number[]>()
  segs.forEach((s, idx) => {
    for (const e of [s.a, s.b]) {
      const list = byEdge.get(e)
      if (list) list.push(idx)
      else byEdge.set(e, [idx])
    }
  })
  const used = new Uint8Array(segs.length)
  const lines: Pt[][] = []
  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue
    used[start] = 1
    const line: Pt[] = [segs[start].pa, segs[start].pb]
    // extend forward from b, then backward from a
    for (const dir of [1, -1]) {
      let edge = dir === 1 ? segs[start].b : segs[start].a
      for (;;) {
        const next = (byEdge.get(edge) ?? []).find((s) => !used[s])
        if (next === undefined) break
        used[next] = 1
        const s = segs[next]
        const forward = s.a === edge
        const p = forward ? s.pb : s.pa
        edge = forward ? s.b : s.a
        if (dir === 1) line.push(p)
        else line.unshift(p)
      }
    }
    if (line.length > 3) lines.push(line)
  }
  return lines
}

/**
 * A drainage network by D8 flow accumulation: every grid node drains to its
 * lowest neighbour, catchment area accumulates downhill, and channels start
 * where the area passes a threshold — so creeks branch and converge in the
 * real valleys the way they do on a survey map.
 */
function traceStreams(H: Float32Array, gw: number, gh: number, cell: number, map: Box, riverDist: Float32Array, rng: Rng): Pt[][] {
  const n = gw * gh
  const down = new Int32Array(n).fill(-1)
  for (let j = 1; j < gh - 1; j++) {
    for (let i = 1; i < gw - 1; i++) {
      const k = j * gw + i
      let best = H[k]
      let bk = -1
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const nk = (j + dj) * gw + i + di
          const drop = (H[k] - H[nk]) / (di && dj ? 1.414 : 1)
          if (drop > 0 && H[k] - drop < best) {
            best = H[k] - drop
            bk = nk
          }
        }
      }
      down[k] = bk
    }
  }
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => H[b] - H[a])
  const acc = new Float32Array(n).fill(1)
  for (const k of order) if (down[k] >= 0) acc[down[k]] += acc[k]
  const threshold = rng.range(220, 360)
  const isChannel = (k: number) => acc[k] >= threshold && riverDist[k] > 8
  // heads: channel nodes with no channel flowing into them
  const hasUpstream = new Uint8Array(n)
  for (let k = 0; k < n; k++) if (down[k] >= 0 && isChannel(k)) hasUpstream[down[k]] = 1
  const drawn = new Uint8Array(n)
  const out: Array<{ pts: Pt[]; size: number }> = []
  for (let k = 0; k < n; k++) {
    if (!isChannel(k) || hasUpstream[k]) continue
    const pts: Pt[] = []
    let c = k
    let size = 0
    for (let step = 0; step < 900 && c >= 0; step++) {
      pts.push([map.x + (c % gw) * cell, map.y + Math.floor(c / gw) * cell])
      size = Math.max(size, acc[c])
      if (drawn[c] || riverDist[c] < 8) break
      drawn[c] = 1
      c = down[c]
    }
    if (pts.length > 8) out.push({ pts, size })
  }
  return out.sort((a, b) => b.size - a.size).map((s) => s.pts)
}

function findSummits(H: Float32Array, gw: number, gh: number, cell: number, map: Box, radius: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  for (let j = radius; j < gh - radius; j += 3) {
    for (let i = radius; i < gw - radius; i += 3) {
      const v = H[j * gw + i]
      let isMax = true
      for (let dj = -radius; dj <= radius && isMax; dj += 2) {
        for (let di = -radius; di <= radius; di += 2) {
          if (H[(j + dj) * gw + i + di] > v) {
            isMax = false
            break
          }
        }
      }
      if (isMax) out.push([map.x + i * cell, map.y + j * cell, v])
    }
  }
  return out.sort((a, b) => b[2] - a[2])
}
