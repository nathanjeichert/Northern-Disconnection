// Shared helpers for the newsletter emails: the show-alert and show-reminder
// scripts and the /api/subscribe welcome email all render through the same
// chrome (masthead, card, footer) and Resend plumbing here.

export const SITE_URL = 'https://www.northerndisconnection.com'
export const FROM = 'Northern Disconnection <shows@northerndisconnection.com>'
export const REPLY_TO = 'nathanjeichert@gmail.com'
// CAN-SPAM: commercial email needs a valid physical/postal location.
export const MAILING_LOCATION = 'Sonoma County, CA'

// ── Palette ─────────────────────────────────────────────────────────────────
// DARK MODE STRATEGY — three mechanisms, one design:
//
// 1. Gmail apps force-invert every CSS color with no reliable opt-out (worst
//    on iOS, which even inverts dark designs back to light). [data-ogsc] is
//    Outlook-only and Gmail strips prefers-color-scheme, so nothing can
//    *target* Gmail. Instead the light design is built to survive inversion:
//    the brand identity lives in the masthead IMAGE (images are never
//    recolored), there are no large dark fills to blow out, and the accents
//    (gold, burgundy, gray-green) are midtones that shift little. Inverted,
//    the email reads as a deliberate night theme that matches the untouched
//    pine masthead.
// 2. Apple Mail honors prefers-color-scheme — it gets real branded dark
//    styles (the DARK values below).
// 3. Outlook.com/365 tags force-recolored elements with data-ogsc/data-ogsb —
//    the same DARK palette is re-asserted there.
const LIGHT = {
  canvas: '#efe6cf', // parchment
  card: '#f7f2e5', // cream
  ink: '#0c2318', // pine — headings & body
  date: '#1d4030', // moss — show date lines
  soft: '#355e3b', // forest — secondary text
  desc: '#4a5d52', // spruce — show descriptions
  fine: '#6b7a70', // footer fine print
  eyebrow: '#7a2230', // burgundy
  gold: '#e9b949', // accents, button, poster shadow
}
const DARK = {
  canvas: '#0c2318',
  card: '#143122',
  cardBorder: '#2e5238',
  ink: '#f7f2e5',
  date: '#e9b949',
  soft: '#d7b48a',
  desc: '#a9b39e',
  fine: '#d7b48a',
  eyebrow: '#e9b949',
}

// "June 26th, 2026" → Date (same logic as lib/dates.ts)
export function parseShowDate(value) {
  const cleaned = String(value ?? '').replace(/(\d+)(st|nd|rd|th)/i, '$1')
  const parsed = new Date(cleaned)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const showKey = (s) =>
  `${String(s.date ?? '').trim().toLowerCase()}|${String(s.venue ?? '').trim().toLowerCase()}`

export function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderShowHtml(show) {
  const weekday = parseShowDate(show.date)?.toLocaleDateString('en-US', { weekday: 'long' })
  const dateLine = [weekday, show.date].filter(Boolean).join(', ')
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="border-left:3px solid ${LIGHT.gold};padding:2px 0 2px 18px;">
        <p class="nd-date" style="margin:0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${LIGHT.date};">${escapeHtml(dateLine)}${show.time ? ` &middot; ${escapeHtml(show.time)}` : ''}</p>
        <p class="nd-ink" style="margin:5px 0 0;font-size:21px;font-weight:bold;color:${LIGHT.ink};">${escapeHtml(show.venue)}</p>
        <p class="nd-soft" style="margin:3px 0 0;font-size:15px;color:${LIGHT.soft};">${escapeHtml(show.location)}</p>
        ${show.description ? `<p class="nd-desc" style="margin:7px 0 0;font-size:14px;font-style:italic;color:${LIGHT.desc};">${escapeHtml(show.description)}</p>` : ''}
      </td></tr>
    </table>`
}

export function showTextLine(s) {
  const weekday = parseShowDate(s.date)?.toLocaleDateString('en-US', { weekday: 'long' })
  return [
    `${[weekday, s.date].filter(Boolean).join(', ')}${s.time ? ` · ${s.time}` : ''}`,
    `${s.venue} — ${s.location}`,
    s.description || null,
    '',
  ].filter((l) => l !== null).join('\n')
}

export function renderButtonHtml(label, href) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 0;"><tr>
      <td class="nd-btn" style="background-color:${LIGHT.gold};border:2px solid ${LIGHT.ink};">
        <a href="${href}" class="nd-btn-link" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LIGHT.ink};text-decoration:none;">${label}</a>
      </td>
    </tr></table>`
}

// The shared email shell: masthead image, eyebrow, bordered card with the
// poster shadow, and fine-print footer. `eyebrow`, `bodyHtml`, and
// `footerLines` are trusted HTML (use entities, not raw non-ASCII, so the
// markup survives any charset mangling); `preheader` is the hidden inbox
// preview line, plain text.
export function renderChrome({ eyebrow, preheader, bodyHtml, footerLines }) {
  const footerHtml = footerLines
    .map(
      (line, i) =>
        `<p class="nd-fine" style="margin:${i === 0 ? '0' : '9px 0 0'};font-size:12px;line-height:1.6;color:${LIGHT.fine};">${line}</p>`
    )
    .join('\n          ')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  /* Branded dark theme for standards-honoring clients (Apple Mail). Keep in
     sync with the Outlook.com block below — same palette, different hook. */
  @media (prefers-color-scheme: dark) {
    .nd-canvas { background-color:${DARK.canvas} !important; }
    .nd-card { background-color:${DARK.card} !important; border-color:${DARK.cardBorder} !important; }
    .nd-eyebrow { color:${DARK.eyebrow} !important; }
    .nd-ink { color:${DARK.ink} !important; }
    .nd-date { color:${DARK.date} !important; }
    .nd-soft { color:${DARK.soft} !important; }
    .nd-desc { color:${DARK.desc} !important; }
    .nd-fine, .nd-fine a { color:${DARK.fine} !important; }
  }
  /* Outlook.com/365 forced dark mode tags recolored elements with
     data-ogsc (text) / data-ogsb (background) — re-assert the dark palette. */
  [data-ogsb] .nd-canvas { background-color:${DARK.canvas} !important; }
  [data-ogsb] .nd-card { background-color:${DARK.card} !important; }
  [data-ogsb] .nd-shadow { background-color:${LIGHT.gold} !important; }
  [data-ogsb] .nd-btn { background-color:${LIGHT.gold} !important; }
  [data-ogsc] .nd-eyebrow { color:${DARK.eyebrow} !important; }
  [data-ogsc] .nd-ink { color:${DARK.ink} !important; }
  [data-ogsc] .nd-date { color:${DARK.date} !important; }
  [data-ogsc] .nd-soft { color:${DARK.soft} !important; }
  [data-ogsc] .nd-desc { color:${DARK.desc} !important; }
  [data-ogsc] .nd-fine, [data-ogsc] .nd-fine a { color:${DARK.fine} !important; }
  [data-ogsc] .nd-btn-link { color:${LIGHT.ink} !important; }
</style>
</head>
<body class="nd-canvas" style="margin:0;padding:0;background-color:${LIGHT.canvas};font-family:Georgia,'Times New Roman',serif;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" class="nd-canvas" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT.canvas};padding:28px 12px 40px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:0 0 16px;">
          <img src="${SITE_URL}/email-masthead.png" width="560" alt="Northern Disconnection" style="display:block;width:100%;max-width:560px;height:auto;border:0;color:${LIGHT.ink};font-size:24px;font-weight:bold;text-align:center;" />
        </td></tr>
        <tr><td style="padding:0 0 18px;text-align:center;">
          <p class="nd-eyebrow" style="margin:0;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:${LIGHT.eyebrow};">&#10022;&nbsp;&nbsp;${eyebrow}&nbsp;&nbsp;&#10022;</p>
        </td></tr>
        <tr><td class="nd-shadow" style="background-color:${LIGHT.gold};padding:0 7px 7px 0;">
          <table role="presentation" class="nd-card" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT.card};border:2px solid ${LIGHT.ink};">
            <tr><td style="padding:30px 30px 32px;font-family:Georgia,'Times New Roman',serif;">
              ${bodyHtml}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:26px 12px 0;text-align:center;font-family:Georgia,'Times New Roman',serif;">
          ${footerHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// Builds the full multipart (HTML + text) email around a set of shows.
// `eyebrow` is the small uppercase label under the masthead (e.g. "Show Alert").
// `introHtml` / `introText` are the one-line lead-in above the show cards.
export function renderEmail({ subject, eyebrow, introHtml, introText, shows }) {
  const bodyHtml = `
              <p class="nd-ink" style="margin:0 0 22px;font-size:17px;color:${LIGHT.ink};">${introHtml}</p>
              ${shows.map(renderShowHtml).join('')}
              ${renderButtonHtml('All shows &amp; details', `${SITE_URL}/shows`)}`

  const html = renderChrome({
    eyebrow,
    preheader: introText,
    bodyHtml,
    footerLines: [
      `You&rsquo;re getting this because you signed up for show alerts at <a class="nd-fine" href="${SITE_URL}" style="color:${LIGHT.fine};">northerndisconnection.com</a>. We only email about upcoming shows.`,
      `Northern Disconnection &middot; ${escapeHtml(MAILING_LOCATION)}`,
      `<a class="nd-fine" href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:${LIGHT.fine};">Unsubscribe</a>`,
    ],
  })

  const text = [
    introText,
    '',
    ...shows.map(showTextLine),
    `All shows & details: ${SITE_URL}/shows`,
    '',
    `You're getting this because you signed up for show alerts at northerndisconnection.com.`,
    `Northern Disconnection · ${MAILING_LOCATION}`,
    'Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}',
  ].join('\n')

  return { subject, html, text }
}

// One-time welcome note for brand-new subscribers, sent by /api/subscribe.
// No {{{RESEND_UNSUBSCRIBE_URL}}} here — that placeholder only resolves in
// broadcasts; the welcome is a direct send with a List-Unsubscribe header.
export function renderWelcomeEmail() {
  const bodyHtml = `
              <p class="nd-ink" style="margin:0 0 16px;font-size:17px;color:${LIGHT.ink};">Thanks for signing up for show alerts.</p>
              <p class="nd-soft" style="margin:0;font-size:15px;line-height:1.6;color:${LIGHT.soft};">We&rsquo;ll only email you when there&rsquo;s a new show to announce or one coming up soon.</p>
              ${renderButtonHtml('See upcoming shows', `${SITE_URL}/shows`)}`

  const html = renderChrome({
    eyebrow: 'You&rsquo;re on the list',
    preheader: "We'll only email you when there's a new show to announce or one coming up soon.",
    bodyHtml,
    footerLines: [
      `You&rsquo;re getting this because you just signed up at <a class="nd-fine" href="${SITE_URL}" style="color:${LIGHT.fine};">northerndisconnection.com</a>.`,
      `Northern Disconnection &middot; ${MAILING_LOCATION}`,
    ],
  })

  const text = [
    'Thanks for signing up for Northern Disconnection show alerts.',
    '',
    "We'll only email you when there's a new show to announce or one coming up soon.",
    '',
    `Upcoming shows: ${SITE_URL}/shows`,
    '',
    'You are getting this because you just signed up at northerndisconnection.com.',
    `Northern Disconnection · ${MAILING_LOCATION}`,
  ].join('\n')

  return { subject: "You've Joined the Northern Disconnection Mailing List", html, text }
}

export async function resendPost(path, body, apiKey) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Resend POST ${path} failed (${res.status}): ${JSON.stringify(json)}`)
  }
  return json
}

export async function resendGet(path, apiKey) {
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Resend GET ${path} failed (${res.status}): ${JSON.stringify(json)}`)
  }
  return json
}
