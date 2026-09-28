import {
  type Box,
  type Ctx,
  type Pt,
  type Rng,
  type StackLine,
  Noise2D,
  Separation,
  clamp,
  clampParagraph,
  drawMark,
  drawType,
  drawWordmark,
  fitStack,
  grain,
  halftone,
  inkTexture,
  makeCanvas,
  getCtx,
  measureStack,
  moonLitPath,
  moonPhase,
  moonPhaseName,
  paper,
  path,
  polyPath,
  redwoodPath,
  ridgeLine,
  sampleRidge,
  SITE_URL,
  sparklePath,
  textOnArc,
  rgba,
  jSafe,
} from '../kit'
import type { StyleContext } from '../types'

/*
  NIGHT — a window onto a Sonoma night, printed in opaque inks on dark
  stock. A stippled Milky Way with dust lanes, a scatter of stars with a
  few bright sparklers, the Big Dipper's pointer stars leading to Polaris
  (the band is "Northern", after all), sometimes an aurora curtain, the
  moon as it will actually be on the night of the show, a redwood ridge
  and — on still nights — its reflection in the lake. Beneath the window, an
  almanac row of moon phases marks the date.
*/

interface NightPalette {
  stock: string
  sky: [string, string, string]
  haze: string
  star: string
  gold: string
  far: string
  near: string
  lake: string
  text: string
  aurora: [string, string] | null
}

const PALETTES: NightPalette[] = [
  {
    stock: '#0b1322',
    sky: ['#0d182c', '#15264a', '#26406a'],
    haze: '#34507e',
    star: '#f4ecd6',
    gold: '#e9b949',
    far: '#1a2c4a',
    near: '#070d18',
    lake: '#10203a',
    text: '#f4ecd6',
    aurora: ['#62d9a4', '#9a7df0'],
  },
  {
    stock: '#0a1a13',
    sky: ['#0b1d16', '#12302a', '#1f4a44'],
    haze: '#2c6158',
    star: '#f3ecd4',
    gold: '#e9b949',
    far: '#153228',
    near: '#06110c',
    lake: '#0f2921',
    text: '#f3ecd4',
    aurora: ['#79e0a0', '#e58fa8'],
  },
  {
    stock: '#140d1f',
    sky: ['#140f26', '#2a1f47', '#553a68'],
    haze: '#4c3f78',
    star: '#f6ead6',
    gold: '#f0b95a',
    far: '#2a2143',
    near: '#0b0714',
    lake: '#1c1532',
    text: '#f6ead6',
    aurora: ['#e58fa8', '#7fb7ff'],
  },
  {
    stock: '#101418',
    sky: ['#0f151c', '#1c2833', '#39475a'],
    haze: '#44546a',
    star: '#f2ecde',
    gold: '#d9b27a',
    far: '#1f2b37',
    near: '#080b0f',
    lake: '#151e28',
    text: '#f2ecde',
    aurora: null,
  },
]

// Big Dipper + Polaris, hand-projected (x right, y down), unit ~ bowl width.
const DIPPER: Record<string, Pt> = {
  alkaid: [0.0, 0.26],
  mizar: [0.2, 0.12],
  alioth: [0.36, 0.1],
  megrez: [0.52, 0.14],
  phecda: [0.54, 0.34],
  merak: [0.78, 0.37],
  dubhe: [0.8, 0.13],
}
const DIPPER_LINES: Array<[string, string]> = [
  ['alkaid', 'mizar'],
  ['mizar', 'alioth'],
  ['alioth', 'megrez'],
  ['megrez', 'dubhe'],
  ['dubhe', 'merak'],
  ['merak', 'phecda'],
  ['phecda', 'megrez'],
]

type Frame = 'arch' | 'bleed'

export default function night(sc: StyleContext) {
  const { ctx, w, h, rng, story, copy, fonts, logo } = sc
  const look = rng.fork('look')
  const pal = look.pick(PALETTES)
  const frame: Frame = look.chance(0.6) ? 'arch' : 'bleed'
  const hasAurora = !!pal.aurora && look.chance(0.55)
  const hasLake = look.chance(0.5)
  const phase = copy.date ? moonPhase(copy.date) : look.range(0, 1)
  const showMoon = phase > 0.07 && phase < 0.93

  paper(ctx, w, h, rng.fork('paper'), { color: pal.stock, tone: 0.5, fibers: 50, specks: 20, age: 0.4, dark: true })
  const sep = new Separation(w, h)

  // ---- window geometry ------------------------------------------------
  let win: Box
  let windowPath: Path2D
  if (frame === 'arch') {
    const x = 96
    const top = story ? 170 : 74
    const ww = w - 2 * x
    const bottom = story ? h * 0.6 : h * 0.575
    win = { x, y: top, w: ww, h: bottom - top }
    windowPath = path((p) => {
      p.moveTo(x, bottom)
      p.lineTo(x, top + ww / 2)
      p.arc(x + ww / 2, top + ww / 2, ww / 2, Math.PI, 0)
      p.lineTo(x + ww, bottom)
      p.closePath()
    })
  } else {
    win = { x: 0, y: 0, w, h: story ? h * 0.64 : h * 0.62 }
    windowPath = path((p) => p.rect(win.x, win.y, win.w, win.h))
  }
  const clip = windowPath
  const paint = (color: string | null, shape: Path2D | ((c: CanvasRenderingContext2D) => void), overprint = false, alpha?: number) =>
    sep.paint(color, shape, { clip, overprint, alpha })

  const horizonY = win.y + win.h * (hasLake ? 0.62 : 0.8)
  const skyTop = win.y

  // ---- sky ---------------------------------------------------------------
  const skyH = horizonY - skyTop
  const b1 = skyTop + skyH * 0.42
  const b2 = skyTop + skyH * 0.74
  paint(pal.sky[0], path((p) => p.rect(win.x, skyTop, win.w, b1 - skyTop + 1)))
  paint(pal.sky[1], path((p) => p.rect(win.x, b1, win.w, b2 - b1 + 1)))
  paint(pal.sky[2], path((p) => p.rect(win.x, b2, win.w, win.y + win.h - b2)))
  const fade = skyH * 0.14
  paint(pal.sky[0], (c) => halftone(c, { x: win.x, y: b1, w: win.w, h: fade }, (_x, y) => 0.95 * (1 - (y - b1) / fade), { cell: 8, angle: 0.4 }))
  paint(pal.sky[1], (c) => halftone(c, { x: win.x, y: b2, w: win.w, h: fade }, (_x, y) => 0.95 * (1 - (y - b2) / fade), { cell: 8, angle: 0.4 }))

  // ---- milky way: stippled haze with dust lanes ---------------------------
  const mw = rng.fork('milkyway')
  const noise = new Noise2D(mw.fork('n'))
  const mwAngle = mw.range(-1.2, -0.5) * mw.sign()
  const mwC: Pt = [win.x + win.w * mw.range(0.3, 0.7), skyTop + skyH * mw.range(0.35, 0.6)]
  const mwWidth = win.w * mw.range(0.12, 0.18)
  const nx = -Math.sin(mwAngle)
  const ny = Math.cos(mwAngle)
  const density = (x: number, y: number) => {
    const d = (x - mwC[0]) * nx + (y - mwC[1]) * ny
    const along = (x - mwC[0]) * Math.cos(mwAngle) + (y - mwC[1]) * Math.sin(mwAngle)
    const wob = noise.noise(along / 260, 3.1) * mwWidth * 0.5
    const core = Math.exp(-Math.pow((d - wob) / mwWidth, 2))
    const clumps = 0.55 + 0.45 * noise.fbm(x / 120, y / 120, 3)
    const dust = smooth(0.1, 0.45, noise.fbm(x / 70 + 40, y / 70 - 11, 4)) * Math.exp(-Math.pow((d - wob * 0.8) / (mwWidth * 0.35), 2))
    return clamp(core * clumps - dust * 0.9)
  }
  paint(pal.haze, (c) => halftone(c, { x: win.x, y: skyTop, w: win.w, h: skyH }, (x, y) => density(x, y) * 0.62 * clamp((horizonY - y) / (skyH * 0.3)), { cell: 5.5, angle: 0.2, jitter: 0.8, rng: mw.fork('j') }), true)

  // ---- stars ---------------------------------------------------------------
  const st = rng.fork('stars')
  const bright: Pt[] = []
  paint(
    pal.star,
    (c) => {
      c.beginPath()
      const n = story ? 1900 : 1500
      for (let i = 0; i < n; i++) {
        const x = win.x + st.next() * win.w
        const y = skyTop + Math.pow(st.next(), 1.15) * skyH
        const dens = density(x, y)
        if (!st.chance(0.22 + dens * 1.4)) continue
        const r = st.chance(0.92) ? st.range(0.5, 1.25) : st.range(1.3, 2.2)
        c.moveTo(x + r, y)
        c.arc(x, y, r, 0, Math.PI * 2)
      }
      for (let i = 0; i < 10; i++) {
        const x = win.x + win.w * st.range(0.06, 0.94)
        const y = skyTop + skyH * st.range(0.05, 0.8)
        bright.push([x, y])
        sparklePath(c, x, y, st.range(8, 15), 0.14, st.range(0, 0.3))
      }
      c.fill()
    },
    true,
  )
  // soft halos on the bright ones
  paint(
    pal.star,
    (c) => {
      c.beginPath()
      for (const [x, y] of bright) {
        c.moveTo(x + 5, y)
        c.arc(x, y, 5, 0, Math.PI * 2)
      }
      c.fill()
    },
    true,
    0.25,
  )

  // ---- the Big Dipper and Polaris ------------------------------------------
  const con = rng.fork('constellation')
  const unit = win.w * (story ? 0.27 : 0.24)
  const leftSide = mwC[0] > win.x + win.w / 2
  // The Dipper wheels around Polaris through the night: pick where Polaris
  // sits, then find a rotation that keeps the whole asterism in the window.
  const inWindow = ([x, y]: Pt, pad = 50) => {
    if (x < win.x + pad || x > win.x + win.w - pad || y < skyTop + pad || y > horizonY - win.h * 0.14) return false
    if (frame === 'arch') {
      const r = win.w / 2
      const cy = win.y + r
      if (y < cy && Math.hypot(x - (win.x + r), y - cy) > r - pad) return false
    }
    return true
  }
  const pointerDist = 1.25
  // offsets from Polaris with the dipper in its reference orientation
  const merak0 = DIPPER.merak
  const dubhe0 = DIPPER.dubhe
  const pv: Pt = [dubhe0[0] - merak0[0], dubhe0[1] - merak0[1]]
  const pl = Math.hypot(...pv)
  const polaris0: Pt = [dubhe0[0] + (pv[0] / pl) * pointerDist, dubhe0[1] + (pv[1] / pl) * pointerDist]
  let polaris: Pt = [0, 0]
  let stars: Record<string, Pt> = {}
  for (let attempt = 0; attempt < 40; attempt++) {
    const px = win.x + win.w * con.range(0.2, 0.8)
    const py = skyTop + skyH * con.range(frame === 'arch' ? 0.25 : 0.12, 0.4)
    const rot = con.range(0, Math.PI * 2)
    const place = ([x, y]: Pt): Pt => {
      const dx = (x - polaris0[0]) * unit
      const dy = (y - polaris0[1]) * unit
      return [px + dx * Math.cos(rot) - dy * Math.sin(rot), py + dx * Math.sin(rot) + dy * Math.cos(rot)]
    }
    const cand = Object.fromEntries(Object.entries(DIPPER).map(([k, p]) => [k, place(p)])) as Record<string, Pt>
    polaris = [px, py]
    stars = cand
    if (inWindow(polaris, 70) && Object.values(cand).every((p) => inWindow(p))) break
  }
  const dubhe = stars.dubhe
  const polarisVisible = inWindow(polaris, 40)
  paint(
    pal.star,
    (c) => {
      c.lineWidth = 1.4
      c.lineCap = 'round'
      c.beginPath()
      for (const [a, b] of DIPPER_LINES) {
        c.moveTo(stars[a][0], stars[a][1])
        c.lineTo(stars[b][0], stars[b][1])
      }
      c.stroke()
    },
    true,
    0.55,
  )
  if (polarisVisible) {
    paint(
      pal.gold,
      (c) => {
        c.lineWidth = 1.2
        c.setLineDash([3, 7])
        c.beginPath()
        c.moveTo(dubhe[0], dubhe[1])
        c.lineTo(polaris[0], polaris[1])
        c.stroke()
        c.setLineDash([])
      },
      true,
      0.7,
    )
  }
  paint(
    pal.star,
    (c) => {
      c.beginPath()
      for (const p of Object.values(stars)) {
        c.moveTo(p[0] + 4, p[1])
        c.arc(p[0], p[1], 4, 0, Math.PI * 2)
      }
      c.fill()
    },
    true,
  )
  if (polarisVisible) {
    paint(pal.gold, (c) => {
      c.beginPath()
      sparklePath(c, polaris[0], polaris[1], 20, 0.12)
      sparklePath(c, polaris[0], polaris[1], 11, 0.2, Math.PI / 4)
      c.fill()
    }, true)
    paint(pal.gold, (c) => drawType(c, 'POLARIS', polaris[0] + 26, polaris[1] + 5, { family: fonts.body, weight: 700, tracking: 0.3 }, 14, 'left'), true, 0.85)
  }
  const dipperPts = Object.values(stars)
  const labelX = dipperPts.reduce((a, p) => a + p[0], 0) / dipperPts.length
  const labelY = Math.max(...dipperPts.map((p) => p[1])) + 30
  // the label only when the dipper itself is on the sheet
  if (labelY > 24 && labelY < h - 24) {
    paint(pal.gold, (c) => drawType(c, 'URSA MAJOR', labelX, labelY, { family: fonts.body, weight: 700, tracking: 0.3 }, 13, 'center'), true, 0.7)
  }

  // ---- moon ------------------------------------------------------------------
  if (showMoon) {
    const mr = win.w * (story ? 0.085 : 0.075)
    const mx = win.x + win.w * (leftSide ? 0.78 : 0.24) + look.range(-30, 30)
    const my = skyTop + skyH * (frame === 'arch' ? 0.42 : 0.28)
    paint(pal.sky[1], path((p) => p.arc(mx, my, mr * 2.1, 0, Math.PI * 2)), true, 0.5)
    paint(pal.haze, path((p) => p.arc(mx, my, mr * 1.45, 0, Math.PI * 2)), true, 0.55)
    paint(pal.sky[2], path((p) => p.arc(mx, my, mr, 0, Math.PI * 2)))
    paint(pal.star, path((p) => moonLitPath(p, mx, my, mr, phase)))
    // maria, overprinted faintly
    const moonRng = look.fork('maria')
    paint(
      pal.haze,
      (c) => {
        c.save()
        c.beginPath()
        moonLitPath(c, mx, my, mr, phase)
        c.clip()
        c.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = moonRng.range(0, Math.PI * 2)
          const d = moonRng.range(0, mr * 0.6)
          const rr = mr * moonRng.range(0.12, 0.3)
          c.moveTo(mx + Math.cos(a) * d + rr, my + Math.sin(a) * d)
          c.ellipse(mx + Math.cos(a) * d, my + Math.sin(a) * d, rr, rr * 0.8, a, 0, Math.PI * 2)
        }
        c.fill()
        c.restore()
      },
      true,
      0.35,
    )
  }

  // ---- ridges and redwoods ---------------------------------------------------
  const rr = rng.fork('ridges')
  const farRidge = ridgeLine(w, horizonY - win.h * 0.1, win.h * 0.05, rr.fork(1), { roughness: 0.5 })
  paint(pal.far, path((p) => polyPath(p, [...farRidge, [w + 20, horizonY + 2], [-20, horizonY + 2]], true)))
  const nearRidge = ridgeLine(w, horizonY - win.h * 0.03, win.h * 0.035, rr.fork(2), { roughness: 0.35 })
  const trees = new Path2D()
  polyPath(trees, [...nearRidge, [w + 20, horizonY + 2], [-20, horizonY + 2]], true)
  const tr = rr.fork(3)
  for (let x = win.x - 20; x < win.x + win.w + 20; x += tr.range(12, 30)) {
    const y = sampleRidge(nearRidge, x) + 4
    const big = tr.chance(0.12)
    const th = (big ? tr.range(120, 210) : tr.range(40, 110)) * (win.h / 1000)
    redwoodPath(trees, x, y, th, th * tr.range(0.2, 0.27), tr, { tiers: Math.max(5, Math.round(th / 14)), trunk: th * 0.012 })
  }
  const ground = path((p) => p.rect(win.x - 20, horizonY, win.w + 40, win.y + win.h - horizonY + 10))
  paint(pal.near, trees)
  if (hasLake) {
    // the lake: sky colour mirrored, the ridge reflected, the moon as a column of light
    paint(pal.lake, ground)
    const mirror = new Path2D()
    const refl = nearRidge.map(([x, y]): Pt => [x, horizonY + (horizonY - y) * 0.8])
    polyPath(mirror, [[-20, horizonY - 1], ...refl, [w + 20, horizonY - 1]], true)
    paint(pal.near, mirror)
    const shimmer = rng.fork('shimmer')
    paint(
      pal.star,
      (c) => {
        c.beginPath()
        const cxs = showMoon ? win.x + win.w * (leftSide ? 0.78 : 0.24) : win.x + win.w / 2
        for (let i = 0; i < 70; i++) {
          const y = horizonY + 14 + Math.pow(shimmer.next(), 0.9) * (win.y + win.h - horizonY - 20)
          const spread = 20 + (y - horizonY) * 0.35
          const x = cxs + shimmer.gaussian(0, spread * 0.5)
          const len = shimmer.range(10, 44) * (0.5 + (y - horizonY) / win.h)
          c.rect(x - len / 2, y, len, shimmer.range(1.2, 2.4))
        }
        for (let i = 0; i < 60; i++) {
          const x = win.x + shimmer.next() * win.w
          const y = horizonY + 30 + shimmer.next() * (win.y + win.h - horizonY - 30)
          c.rect(x, y, shimmer.range(3, 10), 1.3)
        }
        c.fill()
      },
      true,
      showMoon ? 0.85 : 0.4,
    )
  } else {
    paint(pal.near, ground)
  }

  // fireflies along the treeline
  const ff = rng.fork('fireflies')
  const flies: Pt[] = []
  for (let i = 0; i < ff.int(14, 26); i++) {
    const x = win.x + ff.next() * win.w
    flies.push([x, sampleRidge(nearRidge, x) + ff.range(10, hasLake ? 40 : win.h * 0.12)])
  }
  paint(pal.gold, (c) => {
    c.beginPath()
    flies.forEach(([x, y]) => {
      c.moveTo(x + 2.2, y)
      c.arc(x, y, 2.2, 0, Math.PI * 2)
    })
    c.fill()
  }, true)
  paint(pal.gold, (c) => {
    c.beginPath()
    flies.forEach(([x, y]) => {
      c.moveTo(x + 7, y)
      c.arc(x, y, 7, 0, Math.PI * 2)
    })
    c.fill()
  }, true, 0.18)

  // ---- print the plates, then the aurora as light --------------------------
  const tex = inkTexture(w, h, rng.fork('ink'), { mottle: 0.3, specks: 0.5, scratches: 0.15 })
  sep.print(ctx, rng.fork('register'), { texture: tex, wear: 0.4, maxOffset: 1.6, blend: 'source-over', darkFirst: true })
  if (hasAurora && pal.aurora) drawAurora(ctx, win, windowPath, horizonY, nearRidge, pal.aurora, rng.fork('aurora'))

  // ---- frame and bill ----------------------------------------------------
  const ink = (color: string, draw: (c: Ctx) => void, alpha = 1) => {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.strokeStyle = color
    draw(ctx)
    ctx.restore()
  }
  if (frame === 'arch') {
    ink(pal.gold, (c) => {
      c.lineWidth = 3
      c.stroke(windowPath)
      c.lineWidth = 1.2
      c.save()
      c.translate(w / 2, win.y + win.h)
      c.scale((win.w + 28) / win.w, (win.h + 14) / win.h)
      c.translate(-w / 2, -(win.y + win.h))
      c.stroke(windowPath)
      c.restore()
    })
    // astrolabe degree ticks around the arch
    ink(pal.gold, (c) => {
      const r0 = win.w / 2 + 14
      const acx = w / 2
      const acy = win.y + win.w / 2
      c.lineWidth = 1
      c.beginPath()
      for (let deg = 0; deg <= 180; deg += 3) {
        const a = Math.PI + (deg / 180) * Math.PI
        const len = deg % 30 === 0 ? 14 : deg % 15 === 0 ? 10 : 5
        c.moveTo(acx + Math.cos(a) * r0, acy + Math.sin(a) * r0)
        c.lineTo(acx + Math.cos(a) * (r0 + len), acy + Math.sin(a) * (r0 + len))
      }
      c.stroke()
      // keystone star
      c.beginPath()
      sparklePath(c, acx, win.y - 4, 13, 0.22)
      c.fill()
    }, 0.8)
    // url around the top of the arch
    ink(pal.gold, (c) => textOnArc(c, SITE_URL.toUpperCase(), w / 2, win.y + win.w / 2, win.w / 2 + 44, -Math.PI / 2 + 0.62, { family: fonts.body, weight: 700, tracking: 0.5 }, 16), 0.85)
  }

  const textTop = win.y + win.h + (frame === 'arch' ? 34 : 30)
  const phaseRowH = 50
  drawPhaseRow(ctx, w / 2, textTop + phaseRowH / 2, Math.min(w - 220, 620), phase, pal, fonts.body, !!copy.date)
  const box: Box = { x: 90, y: textTop + phaseRowH + 30, w: w - 180, h: h - (textTop + phaseRowH + 30) - (story ? 190 : frame === 'arch' ? 60 : 70) }
  const lockH = Math.min(story ? 210 : 140, box.h * 0.32)
  const lines: StackLine[] = [
    { text: copy.dateLine.toUpperCase(), spec: jSafe(fonts, copy.dateLine.toUpperCase(), { family: fonts.caslon, tracking: 0.05 }), size: story ? 92 : 70, gap: 14, tag: 'gold' },
    { text: copy.venue, spec: { family: fonts.display, weight: 500 }, size: story ? 86 : 64, gap: 14 },
    { text: [copy.location, copy.time].filter(Boolean).join('   ·   '), spec: { family: fonts.body, weight: 500, tracking: 0.12 }, size: story ? 36 : 30, gap: 12 },
  ]
  clampParagraph(ctx, copy.description, { family: fonts.body, weight: 400, italic: true }, 26, box.w * 0.9, 2).forEach((d) =>
    lines.push({ text: d, spec: { family: fonts.body, weight: 400, italic: true }, size: 26, gap: 4, tag: 'soft' }),
  )
  if (frame !== 'arch') lines.push({ text: SITE_URL.toUpperCase(), spec: { family: fonts.body, weight: 700, tracking: 0.4 }, size: 17, gap: 0, tag: 'gold' })
  lines[lines.length - 1].gap = 0
  // identity lockup: mark + wordmark
  if (logo) {
    const wordW = lockH * 0.8 * logo.wordAspect
    const markH = lockH
    const gap = 22
    const groupW = markH * logo.markAspect + gap + wordW
    const gx = w / 2 - groupW / 2
    ink(pal.text, (c) => {
      drawMark(c, logo, gx, box.y, markH, pal.text)
      drawWordmark(c, logo, gx + markH * logo.markAspect + gap, box.y + (markH - wordW / logo.wordAspect) / 2, wordW, pal.text)
    })
  }
  const stackBox: Box = { x: box.x, y: box.y + (logo ? lockH + 28 : 0), w: box.w, h: box.h - (logo ? lockH + 28 : 0) }
  const natural = measureStack(ctx, lines, box.w)
  const placed = fitStack(ctx, lines, stackBox, { align: 'center', valign: natural < stackBox.h * 0.85 ? 'center' : 'spread', maxSpreadGap: 14 })
  placed.forEach((p) => {
    const color = p.line.tag === 'gold' ? pal.gold : pal.text
    ink(color, (c) => drawType(c, p.line.text, p.left + p.width / 2, p.baseline, p.line.spec, p.size, 'center'), p.line.tag === 'soft' ? 0.8 : 1)
  })

  grain(ctx, w, h, rng, 0.1, 'overlay')
}

function smooth(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** Aurora curtains: folded vertical rays, green at the hem, violet above. */
function drawAurora(ctx: Ctx, win: Box, clip: Path2D, horizonY: number, ridge: Pt[], colors: [string, string], rng: Rng) {
  const layer = makeCanvas(ctx.canvas.width, ctx.canvas.height)
  const a = getCtx(layer)
  const noise = new Noise2D(rng)
  const baseY = horizonY - win.h * rng.range(0.12, 0.2)
  const amp = win.h * 0.06
  const height = win.h * rng.range(0.32, 0.46)
  a.lineCap = 'butt'
  for (let x = win.x - 20; x < win.x + win.w + 20; x += 2) {
    const t = x / win.w
    const fold = Math.sin(t * Math.PI * rng.range(2.2, 2.3) + 1.3) * amp + noise.fbm(t * 3, 0.5, 3) * amp
    const yb = baseY + fold
    const intensity = clamp(0.35 + 0.65 * (0.5 + 0.5 * noise.noise(t * 7, 4.2)))
    const hh = height * (0.55 + 0.45 * (0.5 + 0.5 * noise.noise(t * 5, 9.1)))
    for (let k = 0; k < 4; k++) {
      const top = yb - hh * [1, 0.72, 0.45, 0.22][k]
      a.strokeStyle = rgba(colors[0], 0.05 * intensity)
      a.lineWidth = 2
      a.beginPath()
      a.moveTo(x, yb)
      a.lineTo(x + fold * 0.05, top)
      a.stroke()
    }
    // violet crown
    a.strokeStyle = rgba(colors[1], 0.05 * intensity)
    a.beginPath()
    a.moveTo(x, yb - hh * 0.55)
    a.lineTo(x, yb - hh * 1.15)
    a.stroke()
    // bright hem
    a.fillStyle = rgba(colors[0], 0.18 * intensity)
    a.fillRect(x, yb - 3, 2, 5)
  }
  // keep it behind the ridge
  a.globalCompositeOperation = 'destination-out'
  a.beginPath()
  polyPath(a, [...ridge, [ctx.canvas.width + 20, ctx.canvas.height], [-20, ctx.canvas.height]], true)
  a.fill()
  ctx.save()
  ctx.clip(clip)
  ctx.globalCompositeOperation = 'screen'
  ctx.drawImage(layer, 0, 0)
  ctx.restore()
}

/** Almanac row of moon phases with the show night's phase ringed. */
function drawPhaseRow(ctx: Ctx, cx: number, cy: number, width: number, phase: number, pal: NightPalette, family: string, known: boolean) {
  const n = 9
  const r = 11
  const step = width / (n - 1)
  const current = Math.round(phase * 8) % 8
  ctx.save()
  for (let i = 0; i < n; i++) {
    const p = i / 8
    const x = cx - width / 2 + i * step
    ctx.fillStyle = rgba(pal.star, 0.18)
    ctx.beginPath()
    ctx.arc(x, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = pal.star
    ctx.beginPath()
    moonLitPath(ctx, x, cy, r, p === 1 ? 0.999 : p)
    ctx.fill()
    if (known && i === current) {
      ctx.strokeStyle = pal.gold
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, cy, r + 7, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  // thin rules joining the phases
  ctx.strokeStyle = rgba(pal.gold, 0.5)
  ctx.lineWidth = 1
  for (let i = 0; i < n - 1; i++) {
    const x = cx - width / 2 + i * step
    ctx.beginPath()
    ctx.moveTo(x + r + 10, cy)
    ctx.lineTo(x + step - r - 10, cy)
    ctx.stroke()
  }
  if (known) {
    ctx.fillStyle = pal.gold
    drawType(ctx, moonPhaseName(phase).toUpperCase(), cx, cy + r + 30, { family, weight: 700, tracking: 0.4 }, 14, 'center')
  }
  ctx.restore()
}
