import type { Show } from '@/types/content'
import { parseShowDate } from '@/lib/dates'
import { Rng, getCtx, hashSeed, loadFonts, loadLogo, makeCanvas, showCopy } from './kit'
import type { FlyerFormat, StyleRenderer } from './types'
import hatch from './styles/hatch'
import park from './styles/park'
import rings from './styles/rings'
import topo from './styles/topo'
import night from './styles/night'
import marbled from './styles/marbled'
import fillmore from './styles/fillmore'
import woodcut from './styles/woodcut'
import seventies from './styles/seventies'
import ticket from './styles/ticket'

/*
  Generative show flyers. Each style is a complete poster "print shop" of
  its own — composition, typography and inks — with seeded variation
  inside it. The same (show, seed, style, format) always reproduces the
  same image; if no style is given, the seed picks one.
*/

export type { FlyerFormat } from './types'
export { hashSeed } from './kit'

export const FLYER_DIMENSIONS: Record<FlyerFormat, { width: number; height: number; label: string }> = {
  post: { width: 1080, height: 1350, label: 'Post · 4:5' },
  story: { width: 1080, height: 1920, label: 'Story · 9:16' },
}

export const FLYER_STYLES = [
  { id: 'hatch', name: 'Hatch Show', blurb: 'Letterpress wood type' },
  { id: 'park', name: 'National Park', blurb: 'WPA screenprint' },
  { id: 'rings', name: 'Tree Rings', blurb: 'Redwood cross-section' },
  { id: 'topo', name: 'Topo Map', blurb: 'Quadrangle survey' },
  { id: 'night', name: 'Night Sky', blurb: 'Stars over the ridge' },
  { id: 'marbled', name: 'Marbled', blurb: 'Bookbinder\'s endpaper' },
  { id: 'fillmore', name: 'Fillmore', blurb: 'Psychedelic ballroom' },
  { id: 'woodcut', name: 'Woodcut', blurb: 'Carved relief print' },
  { id: 'seventies', name: 'Golden State', blurb: '70s sunset stripes' },
  { id: 'ticket', name: 'Ticket Stub', blurb: 'Engraved guilloché ticket' },
] as const

export type FlyerStyleId = (typeof FLYER_STYLES)[number]['id']

const RENDERERS: Record<FlyerStyleId, StyleRenderer> = {
  hatch,
  park,
  rings,
  topo,
  night,
  marbled,
  fillmore,
  woodcut,
  seventies,
  ticket,
}

export function isFlyerStyle(value: unknown): value is FlyerStyleId {
  return FLYER_STYLES.some((s) => s.id === value)
}

/** The style a seed lands on when none is chosen explicitly. */
export function styleForSeed(seed: number): FlyerStyleId {
  const mixed = Math.imul((seed >>> 0) ^ 0x2c1b3c6d, 0x297a2d39) >>> 0
  return FLYER_STYLES[(mixed >>> 7) % FLYER_STYLES.length].id
}

export function flyerStyleName(id: FlyerStyleId): string {
  return FLYER_STYLES.find((s) => s.id === id)?.name ?? id
}

/** Four-digit edition number derived from the seed — "No. 0421". */
export function printNumber(seed: number): string {
  return String(((seed >>> 0) % 9999) + 1).padStart(4, '0')
}

/** A fresh random seed (UI helper — never used inside a render). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}

/** Start loading fonts and logo art ahead of the first render. */
export function preloadFlyerAssets(): void {
  void loadFonts()
  void loadLogo()
}

/**
 * Render a flyer into `canvas` (resized to the format). Draws off-screen
 * first so a visible canvas never shows a half-printed sheet. Resolves with
 * the style that was used.
 */
export async function drawFlyer(
  canvas: HTMLCanvasElement,
  show: Show,
  format: FlyerFormat,
  seed: number,
  styleId?: FlyerStyleId,
): Promise<FlyerStyleId> {
  const style = styleId ?? styleForSeed(seed)
  const { width, height } = FLYER_DIMENSIONS[format]
  const [fonts, logo] = await Promise.all([loadFonts(), loadLogo()])

  const work = makeCanvas(width, height)
  const ctx = getCtx(work)
  const rng = new Rng(hashSeed(`${style}:${seed >>> 0}:${show.date}:${show.venue}`))
  await RENDERERS[style]({
    ctx,
    w: width,
    h: height,
    format,
    story: format === 'story',
    show,
    copy: showCopy(show),
    seed: seed >>> 0,
    rng,
    fonts,
    logo,
    printNo: printNumber(seed),
  })

  canvas.width = width
  canvas.height = height
  getCtx(canvas).drawImage(work, 0, 0)
  return style
}

export function flyerFilename(show: Show, format: FlyerFormat, styleId?: FlyerStyleId): string {
  const date = parseShowDate(show.date)
  const datePart = date
    ? `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    : 'show'
  const venuePart = show.venue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `northern-disconnection-${datePart}-${venuePart}${styleId ? `-${styleId}` : ''}-${format}.png`
}
