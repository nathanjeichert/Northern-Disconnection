// Generates public/email-masthead.png — the newsletter header banner.
//
// Why an image: Gmail's forced dark mode (iOS especially) rewrites every CSS
// color with no reliable opt-out, but it never touches images. Baking the
// pine-and-cream brand lockup into a PNG is the only way the header renders
// identically in every client and color mode. Re-run this script if the logo
// art or palette changes:
//
//   node scripts/make-email-masthead.mjs
import sharp from 'sharp'

const PINE = '#0c2318'
const CREAM = '#f7f2e5'
const GOLD = '#e9b949'

// 2x for retina; displayed at 560 CSS px wide in the email.
const W = 1120
const H = 460
const FRAME_INSET = 18
const FRAME_WIDTH = 3

// Flat recolor: the art is ink-on-transparent, so its alpha channel is the
// ink mask — join it onto a flat fill of the target color.
async function tintFlat(file, color) {
  const trimmed = await sharp(file).trim().png().toBuffer()
  const alpha = await sharp(trimmed).ensureAlpha().extractChannel(3).toBuffer()
  const { width, height } = await sharp(alpha).metadata()
  return sharp({ create: { width, height, channels: 3, background: color } })
    .joinChannel(alpha)
    .png()
    .toBuffer()
}

// Detailed recolor for the guitar-tree mark (black outlines over a white
// fill): silhouette becomes a flat cream shape, then the ink linework (dark
// luminance, masked to the silhouette) is re-drawn on top in pine so the
// drawing's interior detail survives.
async function tintWithInk(file, fillColor, inkColor) {
  const trimmed = await sharp(file).trim().png().toBuffer()
  const alpha = await sharp(trimmed).ensureAlpha().extractChannel(3).toBuffer()
  const { width, height } = await sharp(alpha).metadata()
  const ink = await sharp(trimmed)
    .flatten({ background: '#ffffff' })
    .grayscale()
    .negate()
    .composite([{ input: alpha, blend: 'multiply' }])
    .png()
    .toBuffer()
  const silhouette = await sharp({
    create: { width, height, channels: 3, background: fillColor },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer()
  const linework = await sharp({
    create: { width, height, channels: 3, background: inkColor },
  })
    .joinChannel(ink)
    .png()
    .toBuffer()
  return sharp(silhouette)
    .composite([{ input: linework, blend: 'over' }])
    .png()
    .toBuffer()
}

const GUITAR_H = 360
const WORDMARK_W = 680
const GAP = 48

const guitar = await sharp(await tintWithInk('public/logo-mark.png', CREAM, PINE))
  .resize({ height: GUITAR_H })
  .toBuffer()
const wordmark = await sharp(await tintFlat('public/logo-wordmark.png', CREAM))
  .resize({ width: WORDMARK_W })
  .toBuffer()

const { width: gw } = await sharp(guitar).metadata()
const { height: wh } = await sharp(wordmark).metadata()
const contentW = gw + GAP + WORDMARK_W
const left = Math.round((W - contentW) / 2)

// Thin gold frame inset from the edges, like a handbill border.
const frame = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
     <rect x="${FRAME_INSET}" y="${FRAME_INSET}"
           width="${W - 2 * FRAME_INSET}" height="${H - 2 * FRAME_INSET}"
           fill="none" stroke="${GOLD}" stroke-width="${FRAME_WIDTH}" />
   </svg>`
)

await sharp({ create: { width: W, height: H, channels: 3, background: PINE } })
  .composite([
    { input: frame, top: 0, left: 0 },
    { input: guitar, top: Math.round((H - GUITAR_H) / 2), left },
    { input: wordmark, top: Math.round((H - wh) / 2), left: left + gw + GAP },
  ])
  .png({ compressionLevel: 9 })
  .toFile('public/email-masthead.png')

console.log('Wrote public/email-masthead.png')
