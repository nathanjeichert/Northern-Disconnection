// Builds the downloadable files behind /press from content/press.json and the
// source art in public/press:
//
//   public/press/northern-disconnection-logos.zip   logo + mark, original and cream, SVG + PNG
//   public/press/northern-disconnection-photos.zip  full-size press photos
//   public/press/northern-disconnection-one-sheet.pdf
//   public/press/northern-disconnection-tech-rider.pdf  (example stage plot + input list)
//
// Re-run after editing content/press.json, the photos, the logo SVGs or
// public/press/stage-plot.svg:
//
//   node scripts/make-press-kit.mjs
//
// Needs the `zip` command, and Playwright with Chromium for the two PDFs
// (npm i -D playwright && npx playwright install chromium). Without
// Playwright the zips are still rebuilt and the PDFs are left as they are.
// The promo video files are encoded separately; see CLAUDE.md.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PRESS = path.join(ROOT, 'public/press')
const press = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/press.json'), 'utf8'))

const PINE = '#0c2318'
const CREAM = '#f7f2e5'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-press-'))

function zipDir(dir, outFile) {
  fs.rmSync(outFile, { force: true })
  execFileSync('zip', ['-r', '-X', '-q', outFile, path.basename(dir)], { cwd: path.dirname(dir) })
  console.log('wrote', path.relative(ROOT, outFile))
}

// ---------- logos ----------
// Recolor only, never redraw: the cream version paints the artwork's paper
// fills and lettering cream and its linework pine, like the promo end card.
function creamVersion(svg) {
  return svg
    .replace(/fill:#000000/g, `fill:${CREAM}`)
    .replace(/fill:#ffffff/g, `fill:${CREAM}`)
    .replace(/stroke:#000000/g, `stroke:${PINE}`)
}

async function buildLogos() {
  const out = path.join(tmp, 'northern-disconnection-logos')
  fs.mkdirSync(out, { recursive: true })
  const sources = [
    ['northern-disconnection-logo', 'logos/northern-disconnection-logo.svg', 3000],
    ['northern-disconnection-mark', 'logos/northern-disconnection-mark.svg', 1400],
  ]
  for (const [name, file, height] of sources) {
    const svg = fs.readFileSync(path.join(PRESS, file), 'utf8')
    for (const [suffix, body] of [['', svg], ['-cream', creamVersion(svg)]]) {
      fs.writeFileSync(path.join(out, `${name}${suffix}.svg`), body)
      await sharp(Buffer.from(body), { density: 600 })
        .resize({ height: name.endsWith('mark') ? height : undefined, width: name.endsWith('logo') ? height : undefined })
        .png()
        .toFile(path.join(out, `${name}${suffix}.png`))
    }
  }
  zipDir(out, path.join(PRESS, 'northern-disconnection-logos.zip'))
}

// ---------- photos ----------
function buildPhotos() {
  const out = path.join(tmp, 'northern-disconnection-photos')
  fs.mkdirSync(out, { recursive: true })
  for (const photo of press.photos) {
    fs.copyFileSync(path.join(ROOT, 'public', photo.file), path.join(out, path.basename(photo.file)))
  }
  zipDir(out, path.join(PRESS, 'northern-disconnection-photos.zip'))
}

// ---------- PDFs ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fileUrl = (p) => pathToFileURL(p).href

const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;1,400&display=block">'

const BASE_CSS = `
  @page { margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #efe6cf; color: #1f2e25; }
  body { font-family: 'Alegreya Sans', 'Gill Sans', sans-serif; font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .display { font-family: 'Fraunces', Georgia, serif; }
  .eyebrow { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: #7a2230; }
  ul { list-style: none; }
  a { color: inherit; text-decoration: none; }
`

function oneSheetHtml() {
  const logo = fileUrl(path.join(PRESS, 'logos/northern-disconnection-logo.svg'))
  const lead = press.photos.find((p) => p.lead) ?? press.photos[0]
  const leadSrc = fileUrl(path.join(ROOT, 'public', lead.file))
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    .sheet { width: 8.5in; height: 11in; padding: 0.45in 0.55in 0.4in; display: flex; flex-direction: column; gap: 0.17in; overflow: hidden; }
    header { display: flex; align-items: center; gap: 0.3in; }
    header img { width: 2.8in; }
    header .tag { font-size: 13pt; font-style: italic; line-height: 1.35; }
    header .url { margin-top: 0.08in; font-weight: 700; font-size: 9pt; letter-spacing: 0.06em; color: #7a2230; }
    .lead { width: 100%; height: 2.55in; object-fit: cover; border: 5px solid #f7f2e5; box-shadow: 4px 4px 0 rgba(31,46,37,0.25); }
    .cols { display: grid; grid-template-columns: 1.15fr 1fr; gap: 0.32in; flex: 1; min-height: 0; font-size: 10pt; }
    .block + .block { margin-top: 0.16in; }
    .block .eyebrow { margin-bottom: 0.05in; padding-bottom: 0.03in; border-bottom: 1px solid rgba(31,46,37,0.25); }
    .bio { font-size: 10pt; }
    .fans { font-family: 'Fraunces', Georgia, serif; font-size: 10.5pt; }
    .hl li + li { margin-top: 0.06in; }
    .hl b { font-family: 'Fraunces', Georgia, serif; font-weight: 600; }
    .venues li { display: flex; justify-content: space-between; gap: 0.1in; border-bottom: 1px dotted rgba(31,46,37,0.25); padding: 1px 0; }
    .venues span:last-child { color: #7a2230; font-size: 8pt; letter-spacing: 0.1em; text-transform: uppercase; }
    .facts li + li { margin-top: 0.04in; }
    footer { background: #0c2318; color: #f7f2e5; padding: 0.16in 0.3in; display: flex; justify-content: space-between; align-items: center; }
    footer .mail { font-family: 'Fraunces', Georgia, serif; font-size: 15pt; }
    footer .links { font-size: 8pt; letter-spacing: 0.08em; text-align: right; color: #d7b48a; }
  </style></head><body><div class="sheet">
    <header>
      <img src="${logo}" alt="">
      <div>
        <p class="tag display">${esc(press.tagline)}</p>
        <p class="url">northerndisconnection.com/press</p>
      </div>
    </header>
    <img class="lead" src="${leadSrc}" alt="">
    <div class="cols">
      <div>
        <div class="block"><p class="eyebrow">Bio</p><p class="bio">${esc(press.shortBio)}</p></div>
        <div class="block"><p class="eyebrow">For fans of</p><p class="fans">${press.forFansOf.map(esc).join(' · ')}</p></div>
        <div class="block"><p class="eyebrow">Highlights</p><ul class="hl">${press.highlights
          .map((h) => `<li><b>${esc(h.title)}.</b> ${esc(h.detail)}</li>`)
          .join('')}</ul></div>
      </div>
      <div>
        <div class="block"><p class="eyebrow">Venues &amp; festivals</p><ul class="venues">${press.venues
          .map((v) => `<li><span>${esc(v.name)}</span><span>${esc(v.city)}</span></li>`)
          .join('')}</ul></div>
        <div class="block"><p class="eyebrow">Booking</p><ul class="facts">
          <li>${esc(press.booking.lineup)}</li>
          <li>${esc(press.booking.sets)}</li>
          <li>${esc(press.booking.tech)}</li>
        </ul></div>
        <div class="block"><p class="eyebrow">Listen</p><p>${esc(press.tape.title)}: ${press.tape.tracks
          .map((t) => esc(t.title) + (t.original ? '*' : ''))
          .join(', ')}. <span style="font-size:8.5pt">*Original</span></p>
          <p style="margin-top:0.04in">northerndisconnection.com/music</p></div>
      </div>
    </div>
    <footer>
      <span class="mail">${esc(press.booking.email)}</span>
      <span class="links">${press.links
        .filter((l) => l.label !== 'Website')
        .map((l) => esc(l.url.replace(/^https?:\/\/(www\.)?/, '')))
        .join('<br>')}</span>
    </footer>
  </div></body></html>`
}

function riderHtml() {
  const plot = fs.readFileSync(path.join(PRESS, 'stage-plot.svg'), 'utf8')
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    .sheet { width: 11in; height: 8.5in; padding: 0.45in 0.5in; display: grid; grid-template-columns: 6.9in 1fr; gap: 0.35in; align-items: center; }
    .plot svg { width: 100%; height: auto; display: block; border: 1px solid rgba(31,46,37,0.3); }
    h1 { font-family: 'Fraunces', Georgia, serif; font-size: 18pt; font-weight: 600; line-height: 1.15; margin: 0.04in 0 0.18in; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    td { padding: 3px 4px 3px 0; border-bottom: 1px solid rgba(31,46,37,0.2); }
    td:first-child { color: #7a2230; width: 0.3in; }
    td:last-child { text-align: right; color: #4d5a50; }
    .facts { margin-top: 0.2in; }
    .facts li + li { margin-top: 0.06in; }
    .mail { margin-top: 0.25in; font-family: 'Fraunces', Georgia, serif; font-size: 12pt; }
  </style></head><body><div class="sheet">
    <div class="plot">${plot}</div>
    <div>
      <p class="eyebrow">Tech rider</p>
      <h1>Northern Disconnection</h1>
      <p class="eyebrow" style="margin-bottom:0.05in">Input list</p>
      <table>${press.inputList
        .map((r) => `<tr><td>${r.ch}</td><td>${esc(r.source)}</td><td>${esc(r.input)}</td></tr>`)
        .join('')}</table>
      <ul class="facts">
        <li>${press.monitorMixes} monitor mixes</li>
        <li>${esc(press.booking.tech)}</li>
        <li>${esc(press.booking.lineup)}</li>
      </ul>
      <p class="mail">${esc(press.booking.email)}</p>
    </div>
  </div></body></html>`
}

async function buildPdfs() {
  let playwright
  try {
    playwright = require('playwright')
  } catch {
    console.warn('playwright not found; skipping the PDFs (see the header of this script)')
    return
  }
  const browser = await playwright.chromium.launch()
  const page = await browser.newPage()
  const jobs = [
    ['northern-disconnection-one-sheet.pdf', oneSheetHtml(), { width: '8.5in', height: '11in' }],
    ['northern-disconnection-tech-rider.pdf', riderHtml(), { width: '11in', height: '8.5in' }],
  ]
  for (const [name, html, size] of jobs) {
    const file = path.join(tmp, name.replace('.pdf', '.html'))
    fs.writeFileSync(file, html)
    await page.goto(fileUrl(file), { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.pdf({ path: path.join(PRESS, name), ...size, printBackground: true, pageRanges: '1' })
    console.log('wrote', `public/press/${name}`)
  }
  await browser.close()
}

await buildLogos()
buildPhotos()
await buildPdfs()
fs.rmSync(tmp, { recursive: true, force: true })
