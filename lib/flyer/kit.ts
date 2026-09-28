import type { Show } from '@/types/content'
import { getWeekday, parseShowDate } from '@/lib/dates'

/*
  Flyer toolkit — the shared print shop every flyer style draws with.

  The guiding idea is to think like a screenprinter / letterpress
  operator rather than a digital illustrator: a sheet of paper with
  tooth and fibres, a handful of flat inks each laid down on its own
  layer, overprinted with multiply and nudged slightly out of register,
  ink that doesn't quite cover (voids, speckle, mottled density), and
  hand-drawn wobble in the lines. Everything is driven by a seeded RNG
  so a (show, seed, style, format) always reproduces the same print.
*/

export type Ctx = CanvasRenderingContext2D
export type Canvas = HTMLCanvasElement
export type Pt = [number, number]
/** Anything you can trace a path into — a context or a Path2D. */
export type PathSink = CanvasPath

/* ------------------------------------------------------------------ */
/* Random numbers                                                      */
/* ------------------------------------------------------------------ */

export function hashSeed(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mixSeed(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Rng {
  readonly seed: number
  private readonly gen: () => number
  private spare: number | null = null

  constructor(seed: number) {
    this.seed = seed >>> 0
    this.gen = mulberry32(this.seed)
  }

  next(): number {
    return this.gen()
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.gen()
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(min + (max - min + 1) * this.gen())
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.gen() * items.length) % items.length]
  }

  chance(p: number): boolean {
    return this.gen() < p
  }

  sign(): number {
    return this.gen() < 0.5 ? -1 : 1
  }

  gaussian(mean = 0, sd = 1): number {
    if (this.spare !== null) {
      const s = this.spare
      this.spare = null
      return mean + sd * s
    }
    let u = 0
    let v = 0
    while (u === 0) u = this.gen()
    while (v === 0) v = this.gen()
    const mag = Math.sqrt(-2 * Math.log(u))
    this.spare = mag * Math.sin(2 * Math.PI * v)
    return mean + sd * mag * Math.cos(2 * Math.PI * v)
  }

  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
    const pool = items.filter(([, w]) => w > 0)
    const total = pool.reduce((sum, [, w]) => sum + w, 0)
    let roll = this.gen() * total
    for (const [item, w] of pool) {
      roll -= w
      if (roll <= 0) return item
    }
    return pool[pool.length - 1][0]
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.gen() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  /**
   * An independent stream derived from this RNG's *seed* (not its current
   * state), so e.g. the palette stays identical between the post and story
   * formats even though the compositions consume different amounts of
   * randomness.
   */
  fork(label: string | number): Rng {
    return new Rng(mixSeed(this.seed, typeof label === 'string' ? hashSeed(label) : label))
  }
}

/* ------------------------------------------------------------------ */
/* Noise                                                               */
/* ------------------------------------------------------------------ */

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** Seeded 2D gradient (Perlin) noise with fractal sums. Output ≈ [-1, 1]. */
export class Noise2D {
  private readonly p = new Uint16Array(512)
  private readonly gx = new Float32Array(256)
  private readonly gy = new Float32Array(256)

  constructor(rng: Rng) {
    const perm = rng.shuffle(Array.from({ length: 256 }, (_, i) => i))
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255]
    for (let i = 0; i < 256; i++) {
      const a = rng.next() * Math.PI * 2
      this.gx[i] = Math.cos(a)
      this.gy[i] = Math.sin(a)
    }
  }

  noise(x: number, y: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const X = xi & 255
    const Y = yi & 255
    const p = this.p
    const gx = this.gx
    const gy = this.gy
    const aa = p[p[X] + Y]
    const ab = p[p[X] + Y + 1]
    const ba = p[p[X + 1] + Y]
    const bb = p[p[X + 1] + Y + 1]
    const u = fade(xf)
    const v = fade(yf)
    const n00 = gx[aa] * xf + gy[aa] * yf
    const n10 = gx[ba] * (xf - 1) + gy[ba] * yf
    const n01 = gx[ab] * xf + gy[ab] * (yf - 1)
    const n11 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1)
    const x1 = n00 + (n10 - n00) * u
    const x2 = n01 + (n11 - n01) * u
    return (x1 + (x2 - x1) * v) * 1.41
  }

  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1
    let freq = 1
    let sum = 0
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq + i * 17.13, y * freq - i * 9.71)
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }
}

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

export const PALETTE = {
  pine: '#0c2318',
  forest: '#355e3b',
  moss: '#1d4030',
  cream: '#f7f2e5',
  parchment: '#efe6cf',
  rust: '#d7b48a',
  sand: '#e8dcc6',
  gold: '#e9b949',
  burgundy: '#7a2230',
  sage: '#7d8471',
} as const

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return rgbToHex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t))
}

/** Multiply two inks, the way they'd overprint on paper. */
export function multiplyHex(a: string, b: string): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return rgbToHex((r1 * r2) / 255, (g1 * g2) / 255, (b1 * b2) / 255)
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/* ------------------------------------------------------------------ */
/* Canvas helpers                                                      */
/* ------------------------------------------------------------------ */

export function makeCanvas(w: number, h: number): Canvas {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  return canvas
}

export function getCtx(canvas: Canvas): Ctx {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return ctx
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function inset(box: Box, dx: number, dy = dx): Box {
  return { x: box.x + dx, y: box.y + dy, w: box.w - dx * 2, h: box.h - dy * 2 }
}

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

export interface Fonts {
  /** Fraunces (variable, 100–900) — the site's display face. */
  display: string
  /** Alegreya Sans 400/500/700/800 + italics — the site's body face. */
  body: string
  /** Libre Caslon Display — refined vintage serif; its J sits on the baseline. */
  caslon: string
  /** Rye — ornamental Western wood type. */
  rye: string
  /** Alfa Slab One — heavy slab wood type. */
  slab: string
  /** Oswald (200–700) — condensed gothic wood type / WPA sans. */
  gothic: string
}

const LOCAL_FACES: Array<{ family: string; file: string; weight: string; key: keyof Fonts }> = [
  { family: 'NDFlyerCaslon', file: '/fonts/libre-caslon-display.woff2', weight: '400', key: 'caslon' },
  { family: 'NDFlyerRye', file: '/fonts/flyer/rye.woff2', weight: '400', key: 'rye' },
  { family: 'NDFlyerSlab', file: '/fonts/flyer/alfa-slab-one.woff2', weight: '400', key: 'slab' },
  { family: 'NDFlyerGothic', file: '/fonts/flyer/oswald.woff2', weight: '200 700', key: 'gothic' },
]

let fontsPromise: Promise<Fonts> | null = null

/** Lazily registers the flyer-only faces (never site-wide) and warms the site faces. */
export function loadFonts(): Promise<Fonts> {
  fontsPromise ??= (async () => {
    const styles = getComputedStyle(document.documentElement)
    const display = styles.getPropertyValue('--font-display').trim() || 'Georgia, serif'
    const body = styles.getPropertyValue('--font-body').trim() || 'Georgia, serif'
    const fonts: Fonts = {
      display: `${display}, Georgia, serif`,
      body: `${body}, Georgia, serif`,
      caslon: `${display}, Georgia, serif`,
      rye: `${display}, Georgia, serif`,
      slab: `${display}, Georgia, serif`,
      gothic: `${body}, 'Arial Narrow', sans-serif`,
    }
    const fallbackFor: Record<string, string> = {
      caslon: 'Georgia, serif',
      rye: 'Georgia, serif',
      slab: 'Georgia, serif',
      gothic: "'Arial Narrow', sans-serif",
    }

    await Promise.all(
      LOCAL_FACES.map(async ({ family, file, weight, key }) => {
        try {
          if (typeof FontFace === 'undefined') return
          const face = new FontFace(family, `url(${file})`, { weight })
          await face.load()
          document.fonts.add(face)
          fonts[key] = `"${family}", ${fallbackFor[key]}`
        } catch {
          // keep the fallback family — the flyer still renders
        }
      }),
    )

    try {
      await Promise.all([
        ...[300, 400, 500, 600, 700, 800, 900].map((w) => document.fonts.load(`${w} 80px ${display}`)),
        ...[400, 500, 700, 800].map((w) => document.fonts.load(`${w} 40px ${body}`)),
        document.fonts.load(`italic 400 40px ${body}`),
        document.fonts.load(`italic 500 40px ${body}`),
        document.fonts.load(`italic 700 40px ${body}`),
        document.fonts.load(`400 40px ${fonts.caslon}`),
        document.fonts.load(`400 40px ${fonts.rye}`),
        document.fonts.load(`400 40px ${fonts.slab}`),
        ...[300, 400, 500, 600, 700].map((w) => document.fonts.load(`${w} 40px ${fonts.gothic}`)),
      ])
    } catch {
      // draw with whatever loaded
    }
    return fonts
  })()
  return fontsPromise
}

/* ------------------------------------------------------------------ */
/* Typography                                                          */
/* ------------------------------------------------------------------ */

export interface TypeSpec {
  family: string
  weight?: number | string
  italic?: boolean
  /** Letter-spacing in em. */
  tracking?: number
}

export function fontString(spec: TypeSpec, size: number): string {
  return `${spec.italic ? 'italic ' : ''}${spec.weight ?? 400} ${Math.max(1, size).toFixed(2)}px ${spec.family}`
}

function setNativeSpacing(ctx: Ctx, px: number) {
  if ('letterSpacing' in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`
}

const supportsSpacing = (ctx: Ctx) => 'letterSpacing' in ctx

/** Set the font and return the tracking in px. */
export function useType(ctx: Ctx, spec: TypeSpec, size: number): number {
  ctx.font = fontString(spec, size)
  setNativeSpacing(ctx, 0)
  return (spec.tracking ?? 0) * size
}

/** Width of text in the current font with extra tracking between glyphs. */
export function textWidth(ctx: Ctx, text: string, trackingPx = 0): number {
  const chars = [...text]
  return ctx.measureText(text).width + trackingPx * Math.max(0, chars.length - 1)
}

export function measureType(ctx: Ctx, text: string, spec: TypeSpec, size: number) {
  const tracking = useType(ctx, spec, size)
  const m = ctx.measureText(text)
  return {
    width: m.width + tracking * Math.max(0, [...text].length - 1),
    ascent: m.actualBoundingBoxAscent,
    descent: m.actualBoundingBoxDescent,
  }
}

export type Align = 'left' | 'center' | 'right'

/**
 * Draw a line of text (fill) at (x, baselineY) with alignment and tracking.
 * Uses native canvas letter-spacing when available (keeps kerning), otherwise
 * falls back to per-glyph placement.
 */
export function fillTracked(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  trackingPx = 0,
  align: Align = 'left',
  mode: 'fill' | 'stroke' = 'fill',
): number {
  const width = textWidth(ctx, text, trackingPx)
  let left = x
  if (align === 'center') left = x - width / 2
  else if (align === 'right') left = x - width
  ctx.textAlign = 'left'
  if (trackingPx === 0) {
    if (mode === 'fill') ctx.fillText(text, left, y)
    else ctx.strokeText(text, left, y)
  } else if (supportsSpacing(ctx)) {
    setNativeSpacing(ctx, trackingPx)
    if (mode === 'fill') ctx.fillText(text, left, y)
    else ctx.strokeText(text, left, y)
    setNativeSpacing(ctx, 0)
  } else {
    let cx = left
    for (const ch of text) {
      if (mode === 'fill') ctx.fillText(ch, cx, y)
      else ctx.strokeText(ch, cx, y)
      cx += ctx.measureText(ch).width + trackingPx
    }
  }
  return width
}

/** Draw a line of text with a spec; returns width. baseline is alphabetic. */
export function drawType(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  spec: TypeSpec,
  size: number,
  align: Align = 'left',
): number {
  const tracking = useType(ctx, spec, size)
  ctx.textBaseline = 'alphabetic'
  return fillTracked(ctx, text, x, y, tracking, align)
}

/** Largest size (≤ maxSize) at which text fits maxWidth. */
export function fitSize(
  ctx: Ctx,
  text: string,
  spec: TypeSpec,
  maxWidth: number,
  maxSize: number,
  minSize = 8,
): number {
  const tracking = useType(ctx, spec, 100)
  const width100 = textWidth(ctx, text, tracking)
  if (width100 <= 0) return maxSize
  // width scales linearly with size — measure once then verify
  let size = Math.min(maxSize, (maxWidth / width100) * 100)
  for (let i = 0; i < 6; i++) {
    const tr = useType(ctx, spec, size)
    if (textWidth(ctx, text, tr) <= maxWidth) break
    size *= 0.97
  }
  return Math.max(minSize, size)
}

/** Greedy word wrap. */
export function wrapWords(ctx: Ctx, text: string, maxWidth: number, trackingPx = 0): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || textWidth(ctx, candidate, trackingPx) <= maxWidth) current = candidate
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

/** Wrap into the same number of lines but with lines as even as possible. */
export function balancedWrap(ctx: Ctx, text: string, maxWidth: number, trackingPx = 0): string[] {
  const greedy = wrapWords(ctx, text, maxWidth, trackingPx)
  if (greedy.length <= 1) return greedy
  let lo = textWidth(ctx, text, trackingPx) / greedy.length
  let hi = maxWidth
  let best = greedy
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    const attempt = wrapWords(ctx, text, mid, trackingPx)
    if (attempt.length <= greedy.length && attempt.every((l) => textWidth(ctx, l, trackingPx) <= maxWidth)) {
      best = attempt
      hi = mid
    } else lo = mid
  }
  return best
}

function ellipsize(ctx: Ctx, line: string, maxWidth: number, trackingPx: number): string {
  let out = line.replace(/[\s,;:.–—-]+$/, '')
  while (out.length > 1 && textWidth(ctx, `${out}…`, trackingPx) > maxWidth) {
    out = out.replace(/\s*\S+$/, '') || out.slice(0, -1)
  }
  return `${out.replace(/[\s,;:.–—-]+$/, '')}…`
}

/**
 * Fit text into at most maxLines lines within maxWidth, as large as possible
 * down to minSize. If it still doesn't fit, truncates with an ellipsis.
 */
export function fitLines(
  ctx: Ctx,
  text: string,
  spec: TypeSpec,
  maxWidth: number,
  maxLines: number,
  maxSize: number,
  minSize: number,
  opts: { maxHeight?: number; leading?: number; balance?: boolean } = {},
): { size: number; lines: string[] } {
  const leading = opts.leading ?? 1.1
  let size = maxSize
  while (size >= minSize) {
    const tracking = useType(ctx, spec, size)
    const lines = opts.balance === false
      ? wrapWords(ctx, text, maxWidth, tracking)
      : balancedWrap(ctx, text, maxWidth, tracking)
    const widest = Math.max(...lines.map((l) => textWidth(ctx, l, tracking)))
    const height = size * leading * lines.length
    if (lines.length <= maxLines && widest <= maxWidth && (!opts.maxHeight || height <= opts.maxHeight)) {
      return { size, lines }
    }
    size -= Math.max(1, size * 0.04)
  }
  size = minSize
  const tracking = useType(ctx, spec, size)
  const lines = wrapWords(ctx, text, maxWidth, tracking)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = ellipsize(ctx, `${kept[maxLines - 1]} ${lines[maxLines]}`, maxWidth, tracking)
    return { size, lines: kept }
  }
  return { size, lines: lines.map((l) => (textWidth(ctx, l, tracking) > maxWidth ? ellipsize(ctx, l, maxWidth, tracking) : l)) }
}

/** Truncate prose (e.g. a show description) to a few lines at a fixed size. */
export function clampParagraph(
  ctx: Ctx,
  text: string,
  spec: TypeSpec,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (!text.trim()) return []
  const tracking = useType(ctx, spec, size)
  const lines = wrapWords(ctx, text, maxWidth, tracking)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = ellipsize(ctx, `${kept[maxLines - 1]} ${lines[maxLines]}`, maxWidth, tracking)
  return kept
}

/**
 * Set text along a circular arc. `angle` is the centre of the run in radians
 * (−π/2 = top of the circle). On the top half glyphs stand on the arc facing
 * outwards; with `bottom` they hang beneath it and read left to right.
 * Returns the angular span used.
 */
export function textOnArc(
  ctx: Ctx,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  spec: TypeSpec,
  size: number,
  opts: { bottom?: boolean; mode?: 'fill' | 'stroke' } = {},
): number {
  const tracking = useType(ctx, spec, size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const chars = [...text]
  const widths = chars.map((ch) => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1)
  const span = total / radius
  const dir = opts.bottom ? -1 : 1
  let acc = 0
  chars.forEach((ch, i) => {
    const mid = acc + widths[i] / 2
    const theta = angle - (dir * span) / 2 + (dir * mid) / radius
    ctx.save()
    ctx.translate(cx + Math.cos(theta) * radius, cy + Math.sin(theta) * radius)
    ctx.rotate(theta + (dir * Math.PI) / 2)
    if (opts.mode === 'stroke') ctx.strokeText(ch, 0, 0)
    else ctx.fillText(ch, 0, 0)
    ctx.restore()
    acc += widths[i] + tracking
  })
  return span
}

/** Size so that text on an arc spans at most maxSpan radians. */
export function fitArcSize(
  ctx: Ctx,
  text: string,
  spec: TypeSpec,
  radius: number,
  maxSpan: number,
  maxSize: number,
): number {
  return fitSize(ctx, text, spec, radius * maxSpan, maxSize)
}

/* ------------------------------------------------------------------ */
/* Show copy                                                           */
/* ------------------------------------------------------------------ */

export const SITE_URL = 'northerndisconnection.com'

export interface ShowCopy {
  weekday: string | null
  weekdayShort: string | null
  month: string | null
  monthShort: string | null
  day: number | null
  ordinal: string | null
  year: string | null
  /** e.g. "Saturday, September 12th" (falls back to the raw date string). */
  dateLine: string
  /** e.g. "September 12th" */
  monthDay: string
  /** e.g. "09.12.26" */
  numeric: string | null
  venue: string
  location: string
  city: string
  region: string
  time: string
  description: string
  date: Date | null
}

function ordinalSuffix(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
}

export function showCopy(show: Show): ShowCopy {
  const date = parseShowDate(show.date)
  const weekday = getWeekday(show)
  const month = date ? date.toLocaleDateString('en-US', { month: 'long' }) : null
  const day = date ? date.getDate() : null
  const ordinal = day !== null ? `${day}${ordinalSuffix(day)}` : null
  // an unreadable date ("TBA", "Fall 2026") is printed exactly as written
  const monthDay = month && ordinal ? `${month} ${ordinal}` : show.date.trim()
  const dateLine = `${weekday ? `${weekday}, ` : ''}${monthDay}`
  const [city, ...rest] = show.location.split(',')
  return {
    weekday,
    weekdayShort: weekday ? weekday.slice(0, 3) : null,
    month,
    monthShort: date ? date.toLocaleDateString('en-US', { month: 'short' }) : null,
    day,
    ordinal,
    year: date ? String(date.getFullYear()) : null,
    dateLine,
    monthDay,
    numeric: date
      ? `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}.${String(date.getFullYear()).slice(2)}`
      : null,
    venue: show.venue.trim(),
    location: show.location.trim(),
    city: city.trim(),
    region: rest.join(',').trim(),
    time: (show.time ?? '').trim(),
    description: (show.description ?? '').trim(),
    date,
  }
}

/** "Forestville, CA · 8:00 PM" (time omitted when empty). */
export function whereWhen(copy: ShowCopy, sep = '  ·  '): string {
  return [copy.location, copy.time].filter(Boolean).join(sep)
}

/* ------------------------------------------------------------------ */
/* Logo                                                                */
/* ------------------------------------------------------------------ */

export interface LogoArt {
  /** Ink lines of the guitar-tree mark (black on transparent, hi-res). */
  markInk: Canvas
  /** The white interior of the mark as a mask (black on transparent). */
  markFill: Canvas
  /** The "Northern Disconnection" wordmark ink. */
  wordmark: Canvas
  /** width / height */
  markAspect: number
  wordAspect: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Split black-ink line art into ink (dark) and interior (light) masks. */
function separateInk(src: CanvasImageSource, w: number, h: number): { ink: Canvas; fill: Canvas } {
  const base = makeCanvas(w, h)
  const bctx = getCtx(base)
  bctx.drawImage(src, 0, 0, w, h)
  const image = bctx.getImageData(0, 0, w, h)
  const fillData = bctx.createImageData(w, h)
  const d = image.data
  const f = fillData.data
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    if (a === 0) continue
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255
    f[i + 3] = Math.round(a * lum)
    d[i] = 0
    d[i + 1] = 0
    d[i + 2] = 0
    d[i + 3] = Math.round(a * (1 - lum))
  }
  bctx.putImageData(image, 0, 0)
  const fill = makeCanvas(w, h)
  getCtx(fill).putImageData(fillData, 0, 0)
  return { ink: base, fill }
}

let logoPromise: Promise<LogoArt | null> | null = null

export function loadLogo(): Promise<LogoArt | null> {
  logoPromise ??= (async () => {
    try {
      const wordImg = await loadImage('/logo-wordmark.png')
      const word = separateInk(wordImg, wordImg.naturalWidth, wordImg.naturalHeight)
      let mark: { ink: Canvas; fill: Canvas }
      try {
        // The vector trace rasterises crisply at poster sizes.
        const svg = await loadImage('/logonotext.svg')
        const H = 1900
        const W = Math.round(H * (326.05225 / 972.14185))
        mark = separateInk(svg, W, H)
      } catch {
        const png = await loadImage('/logo-mark.png')
        mark = separateInk(png, png.naturalWidth, png.naturalHeight)
      }
      return {
        markInk: mark.ink,
        markFill: mark.fill,
        wordmark: word.ink,
        markAspect: mark.ink.width / mark.ink.height,
        wordAspect: word.ink.width / word.ink.height,
      }
    } catch {
      return null
    }
  })()
  return logoPromise
}

const tintCache = new WeakMap<Canvas, Map<string, Canvas>>()

/** Recolour a mask canvas (cached per colour). */
export function tint(src: Canvas, color: string): Canvas {
  let byColor = tintCache.get(src)
  if (!byColor) {
    byColor = new Map()
    tintCache.set(src, byColor)
  }
  const hit = byColor.get(color)
  if (hit) return hit
  const out = makeCanvas(src.width, src.height)
  const octx = getCtx(out)
  octx.drawImage(src, 0, 0)
  octx.globalCompositeOperation = 'source-in'
  octx.fillStyle = color
  octx.fillRect(0, 0, out.width, out.height)
  byColor.set(color, out)
  return out
}

/**
 * Draw the guitar-tree mark, uniformly scaled to height h with its top-left
 * at (x, y). `fill` paints the white interior (omit to leave it open).
 */
export function drawMark(
  ctx: Ctx,
  logo: LogoArt,
  x: number,
  y: number,
  h: number,
  ink: string,
  fill?: string | null,
) {
  const w = h * logo.markAspect
  if (fill) ctx.drawImage(tint(logo.markFill, fill), x, y, w, h)
  ctx.drawImage(tint(logo.markInk, ink), x, y, w, h)
}

/** Draw the mark's full silhouette (ink + interior) in one colour — for knockouts and halos. */
export function drawMarkSilhouette(ctx: Ctx, logo: LogoArt, x: number, y: number, h: number, color: string) {
  const w = h * logo.markAspect
  ctx.drawImage(tint(logo.markFill, color), x, y, w, h)
  ctx.drawImage(tint(logo.markInk, color), x, y, w, h)
}

export function drawWordmark(ctx: Ctx, logo: LogoArt, x: number, y: number, w: number, color: string) {
  const h = w / logo.wordAspect
  ctx.drawImage(tint(logo.wordmark, color), x, y, w, h)
}

/* ------------------------------------------------------------------ */
/* Paper                                                               */
/* ------------------------------------------------------------------ */

export interface PaperOptions {
  color: string
  /** Strength of the uneven, blotchy tone (0–1). */
  tone?: number
  /** Number of fibres per megapixel. */
  fibers?: number
  /** Number of specks/inclusions per megapixel. */
  specks?: number
  /** Darken toward the edges like an old sheet (0–1). */
  age?: number
  /** Dark stock — lighten instead of darken for tone and fibres. */
  dark?: boolean
}

/** Fill the sheet with a paper stock: tone, fibres, inclusions and aged edges. */
export function paper(ctx: Ctx, w: number, h: number, rng: Rng, opts: PaperOptions) {
  const { color, tone = 0.5, fibers = 90, specks = 60, age = 0.4, dark = false } = opts
  ctx.save()
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)

  // Uneven tone from a coarse noise field, smoothly upscaled.
  const noise = new Noise2D(rng.fork('paper-tone'))
  const gw = Math.ceil(w / 12)
  const gh = Math.ceil(h / 12)
  const toneCanvas = makeCanvas(gw, gh)
  const tctx = getCtx(toneCanvas)
  const img = tctx.createImageData(gw, gh)
  const shade = dark ? hexToRgb(mixHex(color, '#ffffff', 0.25)) : hexToRgb(mixHex(color, '#6b4a22', 0.55))
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const n = noise.fbm(x / 22, y / 22, 4)
      const i = (y * gw + x) * 4
      img.data[i] = shade[0]
      img.data[i + 1] = shade[1]
      img.data[i + 2] = shade[2]
      img.data[i + 3] = Math.round(clamp(n * 0.6 + 0.35) * 255 * tone * 0.16)
    }
  }
  tctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(toneCanvas, 0, 0, w, h)

  // Fibres: short, faint curling strands.
  const mp = (w * h) / 1e6
  const fiberColor = dark ? '#ffffff' : mixHex(color, '#5a3e1c', 0.7)
  const lightFiber = dark ? mixHex(color, '#000000', 0.4) : '#ffffff'
  ctx.lineCap = 'round'
  for (let i = 0; i < fibers * mp; i++) {
    const x = rng.next() * w
    const y = rng.next() * h
    const len = rng.range(6, 26)
    const a = rng.next() * Math.PI * 2
    const bend = rng.range(-0.6, 0.6)
    ctx.strokeStyle = rgba(rng.chance(0.65) ? fiberColor : lightFiber, rng.range(0.05, 0.16))
    ctx.lineWidth = rng.range(0.5, 1.3)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(a + bend) * len * 0.6,
      y + Math.sin(a + bend) * len * 0.6,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    )
    ctx.stroke()
  }

  // Specks and inclusions.
  for (let i = 0; i < specks * mp; i++) {
    const x = rng.next() * w
    const y = rng.next() * h
    const r = rng.chance(0.9) ? rng.range(0.4, 1.2) : rng.range(1.2, 2.4)
    ctx.fillStyle = rgba(dark ? '#000000' : '#3a2a16', rng.range(0.12, 0.45))
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * rng.range(0.5, 1), rng.next() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  // Aged edges — a soft, uneven darkening toward the sheet border.
  if (age > 0) {
    const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.hypot(w, h) * 0.56)
    const ageColor = dark ? '#000000' : '#6b4a22'
    edge.addColorStop(0, rgba(ageColor, 0))
    edge.addColorStop(1, rgba(ageColor, 0.22 * age))
    ctx.fillStyle = edge
    ctx.fillRect(0, 0, w, h)
  }
  ctx.restore()
}

/* ------------------------------------------------------------------ */
/* Ink layers                                                          */
/* ------------------------------------------------------------------ */

export interface Layer {
  canvas: Canvas
  ctx: Ctx
}

/** A transparent full-sheet layer: draw an ink's coverage in any colour. */
export function newLayer(w: number, h: number): Layer {
  const canvas = makeCanvas(w, h)
  return { canvas, ctx: getCtx(canvas) }
}

/** Speckle + mottle knock-out texture, oversized so it can be shifted per ink. */
export interface InkTexture {
  canvas: Canvas
  pad: number
}

export function inkTexture(
  w: number,
  h: number,
  rng: Rng,
  opts: { mottle?: number; specks?: number; scratches?: number; scale?: number } = {},
): InkTexture {
  const { mottle = 0.5, specks = 1, scratches = 0.3, scale = 1 } = opts
  const pad = 160
  const W = w + pad
  const H = h + pad
  const canvas = makeCanvas(W, H)
  const ctx = getCtx(canvas)
  const noise = new Noise2D(rng.fork('ink-texture'))

  // Mottle: blotchy areas where the ink starved (soft knock-out).
  if (mottle > 0) {
    const gw = Math.ceil(W / 4)
    const gh = Math.ceil(H / 4)
    const m = makeCanvas(gw, gh)
    const mctx = getCtx(m)
    const img = mctx.createImageData(gw, gh)
    const f = 1 / (38 * scale)
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const n = noise.fbm(x * f, y * f, 5, 2.1, 0.55)
        const fine = noise.noise(x * f * 9 + 40, y * f * 9 - 12)
        const v = smoothstep(0.08, 0.55, n) * 0.55 + smoothstep(0.35, 0.9, fine) * 0.35
        img.data[(y * gw + x) * 4 + 3] = Math.round(clamp(v) * 255 * mottle)
      }
    }
    mctx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(m, 0, 0, W, H)
  }

  // Specks: salt voids, clustered where noise is high.
  const count = Math.round(((W * H) / 1e6) * 2600 * specks)
  ctx.fillStyle = '#000'
  for (let i = 0; i < count; i++) {
    const x = rng.next() * W
    const y = rng.next() * H
    const cluster = noise.noise(x / 90, y / 90)
    if (cluster < -0.15 && rng.chance(0.75)) continue
    const r = rng.chance(0.94) ? rng.range(0.35, 1.0) : rng.range(1.0, 1.9)
    ctx.globalAlpha = rng.range(0.25, 0.85)
    ctx.beginPath()
    ctx.ellipse(x, y, r * rng.range(0.6, 1.4), r, rng.next() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  // Scratches — the odd hairline where a block was nicked.
  ctx.strokeStyle = '#000'
  ctx.lineCap = 'round'
  const scratchCount = Math.round(((W * H) / 1e6) * 14 * scratches)
  for (let i = 0; i < scratchCount; i++) {
    const x = rng.next() * W
    const y = rng.next() * H
    const a = rng.next() * Math.PI
    const len = rng.range(10, 70)
    ctx.globalAlpha = rng.range(0.3, 0.8)
    ctx.lineWidth = rng.range(0.5, 1.4)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 + rng.range(-6, 6),
      y + Math.sin(a) * len * 0.5 + rng.range(-6, 6),
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    )
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  return { canvas, pad }
}

export interface PrintOptions {
  /** Ink colour; null keeps the layer's own colours (e.g. a split-fountain blend). */
  color: string | null
  /** Misregistration offset in px. */
  offset?: Pt
  blend?: GlobalCompositeOperation
  alpha?: number
  texture?: InkTexture | null
  /** How strongly the texture knocks ink out (0–1). */
  wear?: number
  rng?: Rng
}

/**
 * Colourise a layer's coverage and print it onto the sheet — by default
 * overprinting with multiply, as translucent screen/letterpress inks do.
 */
export function printLayer(target: Ctx, layer: Layer, opts: PrintOptions) {
  const { color, offset = [0, 0], blend = 'multiply', alpha = 1, texture, wear = 0.8, rng } = opts
  const { canvas, ctx } = layer
  ctx.save()
  if (color) {
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  if (texture && wear > 0) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.globalAlpha = wear
    const ox = rng ? -rng.range(0, texture.pad) : -texture.pad / 2
    const oy = rng ? -rng.range(0, texture.pad) : -texture.pad / 2
    ctx.drawImage(texture.canvas, ox, oy)
  }
  ctx.restore()
  target.save()
  target.globalCompositeOperation = blend
  target.globalAlpha = alpha
  target.drawImage(canvas, offset[0], offset[1])
  target.restore()
}

/** A small random misregistration offset. */
export function misregister(rng: Rng, amount = 3): Pt {
  return [rng.range(-amount, amount), rng.range(-amount, amount)]
}

/* ------------------------------------------------------------------ */
/* Film grain + finishing                                              */
/* ------------------------------------------------------------------ */

let grainTile: Canvas | null = null

function getGrainTile(): Canvas {
  if (grainTile) return grainTile
  const size = 256
  const tile = makeCanvas(size, size)
  const tctx = getCtx(tile)
  const img = tctx.createImageData(size, size)
  const rand = mulberry32(0x5eed)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rand() + rand() + rand() - 1.5) * 120
    img.data[i] = v
    img.data[i + 1] = v
    img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  tctx.putImageData(img, 0, 0)
  grainTile = tile
  return tile
}

/** Overlay a fine grain for paper tooth / film texture. */
export function grain(ctx: Ctx, w: number, h: number, rng: Rng, amount = 0.12, blend: GlobalCompositeOperation = 'overlay') {
  const pattern = ctx.createPattern(getGrainTile(), 'repeat')
  if (!pattern) return
  ctx.save()
  ctx.globalCompositeOperation = blend
  ctx.globalAlpha = amount
  ctx.translate(-rng.range(0, 256), -rng.range(0, 256))
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, w + 256, h + 256)
  ctx.restore()
}

/* ------------------------------------------------------------------ */
/* Halftone                                                            */
/* ------------------------------------------------------------------ */

/**
 * Rotated-grid halftone dots. `value(x, y)` returns ink coverage 0–1.
 * Draw into a layer (colour is applied when the layer is printed).
 */
export function halftone(
  ctx: Ctx,
  box: Box,
  value: (x: number, y: number) => number,
  opts: { cell?: number; angle?: number; jitter?: number; rng?: Rng; shape?: 'dot' | 'line' } = {},
) {
  const { cell = 10, angle = Math.PI / 4, jitter = 0, rng, shape = 'dot' } = opts
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const reach = Math.hypot(box.w, box.h) / 2 + cell
  ctx.beginPath()
  for (let v = -reach; v <= reach; v += cell) {
    for (let u = -reach; u <= reach; u += cell) {
      const x = cx + u * cos - v * sin
      const y = cy + u * sin + v * cos
      if (x < box.x - cell || x > box.x + box.w + cell || y < box.y - cell || y > box.y + box.h + cell) continue
      const k = clamp(value(x, y))
      if (k <= 0.01) continue
      if (shape === 'dot') {
        let r = cell * Math.sqrt(k / Math.PI) * 1.02
        if (k > 0.78) r = cell * (0.5 + (k - 0.78) * 1.4) // let dots merge in the shadows
        const jx = jitter && rng ? rng.range(-jitter, jitter) : 0
        const jy = jitter && rng ? rng.range(-jitter, jitter) : 0
        ctx.moveTo(x + jx + r, y + jy)
        ctx.arc(x + jx, y + jy, r, 0, Math.PI * 2)
      } else {
        const t = cell * k * 0.5
        ctx.moveTo(x - (cell / 2) * cos - t * -sin, y - (cell / 2) * sin - t * cos)
        ctx.lineTo(x + (cell / 2) * cos - t * -sin, y + (cell / 2) * sin - t * cos)
        ctx.lineTo(x + (cell / 2) * cos + t * -sin, y + (cell / 2) * sin + t * cos)
        ctx.lineTo(x - (cell / 2) * cos + t * -sin, y - (cell / 2) * sin + t * cos)
        ctx.closePath()
      }
    }
  }
  ctx.fill()
}

/* ------------------------------------------------------------------ */
/* Hand-drawn geometry                                                 */
/* ------------------------------------------------------------------ */

/** Resample a straight line into jittered points. */
export function wobbleLine(x1: number, y1: number, x2: number, y2: number, rng: Rng, amp = 1.2, step = 18): Pt[] {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const n = Math.max(2, Math.ceil(len / step))
  const nx = -(y2 - y1) / len
  const ny = (x2 - x1) / len
  const pts: Pt[] = []
  let drift = 0
  for (let i = 0; i <= n; i++) {
    const t = i / n
    drift = drift * 0.6 + rng.range(-amp, amp) * 0.8
    const d = i === 0 || i === n ? drift * 0.3 : drift
    pts.push([lerp(x1, x2, t) + nx * d, lerp(y1, y2, t) + ny * d])
  }
  return pts
}

/** Points around a slightly irregular circle/ellipse. */
export function wobbleEllipse(cx: number, cy: number, rx: number, ry: number, rng: Rng, amp = 1.5, n = 72): Pt[] {
  const noise = new Noise2D(rng)
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const k = 1 + (noise.noise(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5) * amp) / Math.max(rx, ry)
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
  }
  return pts
}

/** Trace points as a smooth curve (quadratic through midpoints). */
export function smoothPath(ctx: PathSink, pts: Pt[], closed = false) {
  if (pts.length < 2) return
  if (!closed) {
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2
      const my = (pts[i][1] + pts[i + 1][1]) / 2
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
    }
    const last = pts[pts.length - 1]
    ctx.lineTo(last[0], last[1])
    return
  }
  const n = pts.length
  const mid = (i: number): Pt => {
    const a = pts[i % n]
    const b = pts[(i + 1) % n]
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  }
  const start = mid(0)
  ctx.moveTo(start[0], start[1])
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n]
    const m = mid(i)
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1])
  }
  ctx.closePath()
}

export function polyPath(ctx: PathSink, pts: Pt[], closed = false) {
  if (!pts.length) return
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  if (closed) ctx.closePath()
}

/** A hand-ruled line (stroked). */
export function handLine(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, rng: Rng, amp = 1) {
  ctx.beginPath()
  smoothPath(ctx, wobbleLine(x1, y1, x2, y2, rng, amp))
  ctx.stroke()
}

/** n-point star path (centred). */
export function starPath(ctx: PathSink, cx: number, cy: number, outer: number, inner: number, points = 5, rotation = -Math.PI / 2) {
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = rotation + (i * Math.PI) / points
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/** A four-point twinkle/sparkle path. */
export function sparklePath(ctx: PathSink, cx: number, cy: number, r: number, waist = 0.18, rotation = 0) {
  ctx.moveTo(cx + Math.cos(rotation) * r, cy + Math.sin(rotation) * r)
  for (let i = 1; i <= 8; i++) {
    const a = rotation + (i * Math.PI) / 4
    const rr = i % 2 === 0 ? r : r * waist
    // concave sides: route through a control point near the centre
    const prevA = rotation + ((i - 0.5) * Math.PI) / 4
    ctx.quadraticCurveTo(cx + Math.cos(prevA) * r * waist * 0.6, cy + Math.sin(prevA) * r * waist * 0.6, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
}

/** A classic sunburst / starburst seal outline. */
export function burstPath(ctx: PathSink, cx: number, cy: number, outer: number, inner: number, points: number, rotation = 0) {
  starPath(ctx, cx, cy, outer, inner, points, rotation)
}

/** Rounded-rectangle path that doesn't rely on ctx.roundRect. */
export function roundRectPath(ctx: PathSink, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** A simple conifer (layered conical canopy) as a path — used for redwoods. */
export function redwoodPath(
  ctx: PathSink,
  x: number,
  baseY: number,
  height: number,
  width: number,
  rng: Rng,
  opts: { tiers?: number; trunk?: number; droop?: number; lean?: number } = {},
) {
  const tiers = opts.tiers ?? Math.max(5, Math.round(height / (width * 0.55)))
  const trunkW = opts.trunk ?? width * 0.09
  const droop = opts.droop ?? 0.35
  const lean = opts.lean ?? 0
  const crownBase = baseY - height * rng.range(0.16, 0.3)
  const top = baseY - height
  // trunk
  ctx.moveTo(x - trunkW, baseY)
  ctx.lineTo(x - trunkW * 0.6 + lean * height * 0.6, crownBase)
  ctx.lineTo(x + trunkW * 0.6 + lean * height * 0.6, crownBase)
  ctx.lineTo(x + trunkW, baseY)
  ctx.closePath()
  // canopy tiers: overlapping drooping triangles narrowing to the top
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers
    const t1 = (i + 1.6) / tiers
    const yb = lerp(crownBase, top, t0)
    const yt = lerp(crownBase, top, Math.min(1, t1))
    const cxT = x + lean * (baseY - yt)
    const cxB = x + lean * (baseY - yb)
    const halfW = (width / 2) * Math.pow(1 - t0, 0.85) * rng.range(0.82, 1.12)
    const sag = halfW * droop
    ctx.moveTo(cxT, yt)
    ctx.quadraticCurveTo(cxB + halfW * 0.35, yb - sag * 0.6, cxB + halfW, yb + sag * 0.3)
    ctx.quadraticCurveTo(cxB + halfW * 0.4, yb - sag * 0.1, cxB, yb + sag * 0.15)
    ctx.quadraticCurveTo(cxB - halfW * 0.4, yb - sag * 0.1, cxB - halfW, yb + sag * 0.3)
    ctx.quadraticCurveTo(cxB - halfW * 0.35, yb - sag * 0.6, cxT, yt)
    ctx.closePath()
  }
  // spire
  ctx.moveTo(x + lean * height - width * 0.05, top + height * 0.05)
  ctx.lineTo(x + lean * height, top - height * 0.02)
  ctx.lineTo(x + lean * height + width * 0.05, top + height * 0.05)
  ctx.closePath()
}

/** Ridge line points across the width from summed sines + noise. */
export function ridgeLine(
  w: number,
  baseY: number,
  amp: number,
  rng: Rng,
  opts: { step?: number; roughness?: number; x0?: number; x1?: number } = {},
): Pt[] {
  const { step = 6, roughness = 0.35, x0 = -20, x1 = w + 20 } = opts
  const noise = new Noise2D(rng)
  const f1 = rng.range(0.6, 1.4)
  const f2 = rng.range(1.6, 3.2)
  const p1 = rng.range(0, 10)
  const p2 = rng.range(0, 10)
  const pts: Pt[] = []
  for (let x = x0; x <= x1; x += step) {
    const t = x / w
    const y =
      baseY +
      amp *
        (0.55 * Math.sin(t * f1 * Math.PI * 2 + p1) +
          0.3 * Math.sin(t * f2 * Math.PI * 2 + p2) +
          roughness * noise.fbm(t * 6, p1, 4))
    pts.push([x, y])
  }
  return pts
}

/** Sample a ridge polyline at x (linear). */
export function sampleRidge(pts: Pt[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= x) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      return lerp(y0, y1, (x - x0) / (x1 - x0))
    }
  }
  return pts[pts.length - 1][1]
}

/* ------------------------------------------------------------------ */
/* Moon phase                                                          */
/* ------------------------------------------------------------------ */

/** Moon age fraction (0 = new, 0.5 = full) for a date. */
export function moonPhase(date: Date): number {
  const synodic = 29.530588853
  const knownNew = Date.UTC(2000, 0, 6, 18, 14)
  const days = (date.getTime() - knownNew) / 86400000
  return (((days / synodic) % 1) + 1) % 1
}

export function moonPhaseName(phase: number): string {
  const names = [
    'New Moon',
    'Waxing Crescent',
    'First Quarter',
    'Waxing Gibbous',
    'Full Moon',
    'Waning Gibbous',
    'Last Quarter',
    'Waning Crescent',
  ]
  return names[Math.round(phase * 8) % 8]
}

/**
 * Path of the lit portion of a moon of radius r at phase (0..1),
 * northern-hemisphere orientation (waxing lit on the right).
 */
export function moonLitPath(ctx: PathSink, cx: number, cy: number, r: number, phase: number) {
  const p = ((phase % 1) + 1) % 1
  if (p < 0.005 || p > 0.995) return
  const waxing = p < 0.5
  // terminator ellipse half-width: +r at new, 0 at quarter, -r at full
  const k = Math.cos(p * Math.PI * 2) * r
  if (waxing) {
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false) // right limb
    ctx.ellipse(cx, cy, Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k > 0)
  } else {
    ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, false) // left limb
    ctx.ellipse(cx, cy, Math.abs(k), r, 0, -Math.PI / 2, Math.PI / 2, k > 0)
  }
  ctx.closePath()
}

/* ------------------------------------------------------------------ */
/* Stacked type (poster "slugs")                                       */
/* ------------------------------------------------------------------ */

export interface StackLine {
  text: string
  spec: TypeSpec
  /** Largest size allowed. */
  size: number
  minSize?: number
  /** Max width for this line (defaults to the box width). */
  measure?: number
  /** Space after this line, px (scaled with the stack when it must shrink). */
  gap?: number
  /** Arbitrary tag the caller can use when drawing (ink, ornaments…). */
  tag?: string
}

export interface PlacedLine {
  line: StackLine
  size: number
  width: number
  /** Anchor x for the requested alignment. */
  x: number
  baseline: number
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Typeset a stack of display lines into a box: each line is fitted to its
 * measure (capped at its size), then the whole stack is scaled down if it
 * overflows the box height and positioned per `valign`. Heights use the
 * glyphs' actual ink bounds so big wood-type lines pack tightly.
 */
function stackMetrics(ctx: Ctx, lines: StackLine[], width: number, scale: number) {
  return lines.map((line) => {
    const measure = line.measure ?? width
    let size = Math.min(line.size * scale, fitSize(ctx, line.text, line.spec, measure, line.size * scale))
    size = Math.max(line.minSize ?? 8, size)
    const m = measureType(ctx, line.text, line.spec, size)
    return { size, width: m.width, ascent: m.ascent, descent: m.descent, gap: (line.gap ?? 0) * Math.min(1, scale) }
  })
}

function stackTotal(ms: ReturnType<typeof stackMetrics>): number {
  return ms.reduce((sum, m, i) => sum + m.ascent + m.descent + (i < ms.length - 1 ? m.gap : 0), 0)
}

/** Natural height of a stack at full size (before any shrink-to-fit). */
export function measureStack(ctx: Ctx, lines: StackLine[], width: number): number {
  return stackTotal(stackMetrics(ctx, lines, width, 1))
}

/**
 * Typeset a stack of display lines into a box: each line is fitted to its
 * measure (capped at its size), then the whole stack is scaled down if it
 * overflows the box height and positioned per `valign`. Heights use the
 * glyphs' actual ink bounds so big wood-type lines pack tightly.
 */
export function fitStack(
  ctx: Ctx,
  lines: StackLine[],
  box: Box,
  opts: { align?: Align; valign?: 'top' | 'center' | 'bottom' | 'spread'; maxSpreadGap?: number } = {},
): PlacedLine[] {
  const align = opts.align ?? 'center'
  const valign = opts.valign ?? 'center'
  let scale = 1
  let metrics = stackMetrics(ctx, lines, box.w, scale)
  for (let i = 0; i < 8 && stackTotal(metrics) > box.h; i++) {
    scale *= (box.h / stackTotal(metrics)) * 0.995
    metrics = stackMetrics(ctx, lines, box.w, scale)
  }
  const total = stackTotal(metrics)
  let spare = Math.max(0, box.h - total)
  let y = box.y
  let extraGap = 0
  if (valign === 'spread' && lines.length > 1) {
    extraGap = spare / (lines.length - 1)
    if (opts.maxSpreadGap !== undefined && extraGap > opts.maxSpreadGap) {
      extraGap = opts.maxSpreadGap
      spare -= extraGap * (lines.length - 1)
      y += spare / 2
    }
  } else if (valign === 'center') y += spare / 2
  else if (valign === 'bottom') y += spare

  return lines.map((line, i) => {
    const m = metrics[i]
    const baseline = y + m.ascent
    const x = align === 'left' ? box.x : align === 'right' ? box.x + box.w : box.x + box.w / 2
    const left = align === 'left' ? x : align === 'right' ? x - m.width : x - m.width / 2
    const placed: PlacedLine = {
      line,
      size: m.size,
      width: m.width,
      x,
      baseline,
      top: y,
      bottom: baseline + m.descent,
      left,
      right: left + m.width,
    }
    y = baseline + m.descent + m.gap + extraGap
    return placed
  })
}

/** Draw a placed line (fill) with its own spec. */
export function drawPlaced(ctx: Ctx, p: PlacedLine, align: Align = 'center') {
  drawType(ctx, p.line.text, align === 'left' ? p.left : align === 'right' ? p.right : p.left + p.width / 2, p.baseline, p.line.spec, p.size, align)
}

/* ------------------------------------------------------------------ */
/* Wood grain                                                          */
/* ------------------------------------------------------------------ */

/**
 * Horizontal wood-grain streaks (as a knock-out mask) — the look of big
 * wood-type letters and woodblock solids, where the grain of the block
 * starves the ink in long wavy lines.
 */
export function woodGrain(w: number, h: number, rng: Rng, opts: { density?: number; strength?: number; vertical?: boolean } = {}): Canvas {
  const { density = 1, strength = 1, vertical = false } = opts
  const W = vertical ? h : w
  const H = vertical ? w : h
  const canvas = makeCanvas(w, h)
  const ctx = getCtx(canvas)
  if (vertical) {
    ctx.translate(w, 0)
    ctx.rotate(Math.PI / 2)
  }
  const noise = new Noise2D(rng)
  ctx.strokeStyle = '#000'
  ctx.lineCap = 'round'
  const count = Math.round((H / 1.6) * density)
  // knots that the grain bends around
  const knots = Array.from({ length: rng.int(1, 3) }, () => ({ x: rng.range(0, W), y: rng.range(0, H), r: rng.range(20, 60) }))
  for (let i = 0; i < count; i++) {
    const y0 = rng.range(-10, H + 10)
    const broad = rng.chance(0.25)
    const a = (broad ? Math.pow(rng.next(), 2) * 0.12 : Math.pow(rng.next(), 3) * 0.32) * strength
    if (a < 0.015) continue
    ctx.globalAlpha = a
    ctx.lineWidth = broad ? rng.range(3, 9) : rng.range(0.5, 1.6)
    ctx.beginPath()
    const x0 = rng.range(-40, W * 0.7)
    const x1 = x0 + rng.range(W * 0.2, W * 1.2)
    for (let x = x0; x <= x1; x += 16) {
      let y = y0 + noise.fbm(x / 520, y0 / 90, 3) * 26
      for (const k of knots) {
        const dx = (x - k.x) / (k.r * 3)
        const dy = y - k.y
        const bump = Math.exp(-dx * dx) * k.r * Math.sign(dy || 1) * Math.exp(-Math.abs(dy) / (k.r * 1.5))
        y += bump
      }
      if (x === x0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  // the knots themselves
  for (const k of knots) {
    for (let r = k.r * 0.2; r < k.r; r += rng.range(3, 6)) {
      ctx.globalAlpha = rng.range(0.1, 0.35) * strength
      ctx.lineWidth = rng.range(0.8, 1.8)
      ctx.beginPath()
      ctx.ellipse(k.x, k.y, r * 2.2, r * 0.7, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  return canvas
}

/** Knock a mask out of a layer (e.g. wood grain) at some strength. */
export function knockOut(layer: Layer, mask: Canvas, strength = 1, dx = 0, dy = 0) {
  layer.ctx.save()
  layer.ctx.globalCompositeOperation = 'destination-out'
  layer.ctx.globalAlpha = strength
  layer.ctx.drawImage(mask, dx, dy)
  layer.ctx.restore()
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const AP_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']

/** AP-style abbreviated month ("Sept.") — null if the date didn't parse. */
export function apMonth(copy: ShowCopy): string | null {
  return copy.date ? AP_MONTHS[copy.date.getMonth()] : null
}

/** Short time like "8 PM" / "7:30 PM". */
export function shortTime(time: string): string {
  return time.replace(/:00\s*/i, ' ').replace(/\s+/g, ' ').trim()
}

/** Print number shown as a small imprint, e.g. "No. 0421". */
export function imprint(printNo: string): string {
  return `No. ${printNo}`
}

/* ------------------------------------------------------------------ */
/* Colour separations (screenprint plates)                             */
/* ------------------------------------------------------------------ */

export type Shape = Path2D | ((ctx: Ctx) => void)

/**
 * A set of screenprint plates, one per ink. `paint()` lays a shape down in
 * one ink and (unless overprinting) knocks it out of every other plate —
 * painter's-algorithm occlusion, the way stencils are cut. `print()` then
 * pulls each plate onto the paper with its own small misregistration, so
 * edges show authentic slivers of paper and overlap.
 */
export class Separation {
  readonly plates = new Map<string, Layer>()

  constructor(
    readonly w: number,
    readonly h: number,
  ) {}

  plate(color: string): Layer {
    let layer = this.plates.get(color)
    if (!layer) {
      layer = newLayer(this.w, this.h)
      this.plates.set(color, layer)
    }
    return layer
  }

  private apply(ctx: Ctx, shape: Shape) {
    if (typeof shape === 'function') shape(ctx)
    else ctx.fill(shape)
  }

  /** Paint `shape` in `color` (null = bare paper). */
  paint(color: string | null, shape: Shape, opts: { overprint?: boolean; alpha?: number; clip?: Path2D } = {}) {
    if (!opts.overprint) {
      for (const [c, layer] of this.plates) {
        if (c === color) continue
        const lctx = layer.ctx
        lctx.save()
        if (opts.clip) lctx.clip(opts.clip)
        lctx.globalCompositeOperation = 'destination-out'
        lctx.fillStyle = '#000'
        lctx.strokeStyle = '#000'
        this.apply(lctx, shape)
        lctx.restore()
      }
    }
    if (color) {
      const lctx = this.plate(color).ctx
      lctx.save()
      if (opts.clip) lctx.clip(opts.clip)
      lctx.globalAlpha = opts.alpha ?? 1
      lctx.fillStyle = '#000'
      lctx.strokeStyle = '#000'
      this.apply(lctx, shape)
      lctx.restore()
    }
  }

  /** Pull every plate onto the sheet, lightest ink first. */
  print(
    target: Ctx,
    rng: Rng,
    opts: {
      texture?: InkTexture | null
      wear?: number
      maxOffset?: number
      blend?: GlobalCompositeOperation
      still?: string[]
      /** Opaque inks on dark stock print dark-first so light inks land on top. */
      darkFirst?: boolean
    } = {},
  ) {
    const { texture = null, wear = 0.6, maxOffset = 2, blend = 'multiply', still = [], darkFirst = false } = opts
    const order = [...this.plates.keys()].sort((a, b) => (darkFirst ? luminance(a) - luminance(b) : luminance(b) - luminance(a)))
    for (const color of order) {
      const layer = this.plates.get(color)
      if (!layer) continue
      printLayer(target, layer, {
        color,
        offset: still.includes(color) ? [0, 0] : misregister(rng, maxOffset),
        texture,
        wear,
        rng,
        blend,
      })
    }
  }
}

/** Build a Path2D from a drawing callback. */
export function path(build: (p: Path2D) => void): Path2D {
  const p = new Path2D()
  build(p)
  return p
}

/**
 * Libre Caslon Display's capital J descends below the baseline, which looks
 * wrong in an all-caps date ("JUNE", "JANUARY"). On canvas Fraunces renders
 * without its WONK alternates, so its J sits on the line — swap to it for
 * any caps string containing a J.
 */
export function jSafe(fonts: Fonts, text: string, spec: TypeSpec): TypeSpec {
  if (spec.family === fonts.caslon && /J/.test(text)) return { ...spec, family: fonts.display, weight: 400, tracking: (spec.tracking ?? 0) * 0.8 }
  return spec
}
