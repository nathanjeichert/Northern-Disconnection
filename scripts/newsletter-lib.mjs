// Shared helpers for the show-alert and show-reminder newsletter scripts.
// Keeps the email chrome (header, footer, unsubscribe, mailing address) and the
// Resend plumbing in one place so both emails stay consistent.

export const SITE_URL = 'https://www.northerndisconnection.com'
export const FROM = 'Northern Disconnection <shows@northerndisconnection.com>'
export const REPLY_TO = 'nathanjeichert@gmail.com'
// CAN-SPAM: commercial email needs a valid physical/postal location.
export const MAILING_LOCATION = 'Sonoma County, CA'

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
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="border-left:3px solid #b45a33;padding:4px 0 4px 16px;">
        <p style="margin:0;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#b45a33;">${escapeHtml(dateLine)}${show.time ? ` &middot; ${escapeHtml(show.time)}` : ''}</p>
        <p style="margin:4px 0 0;font-size:20px;font-weight:bold;color:#1d3a2f;">${escapeHtml(show.venue)}</p>
        <p style="margin:2px 0 0;font-size:15px;color:#4a5d52;">${escapeHtml(show.location)}</p>
        ${show.description ? `<p style="margin:6px 0 0;font-size:14px;font-style:italic;color:#4a5d52;">${escapeHtml(show.description)}</p>` : ''}
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

// Builds the full multipart (HTML + text) email around a set of shows.
// `eyebrow` is the small uppercase label under the band name (e.g. "Show Alert").
// `introHtml` / `introText` are the one-line lead-in above the show cards.
export function renderEmail({ subject, eyebrow, introHtml, introText, shows }) {
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#f4ecd9;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4ecd9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:0 0 24px;text-align:center;">
          <p style="margin:0;font-size:24px;font-weight:bold;letter-spacing:1px;color:#1d3a2f;">Northern Disconnection</p>
          <p style="margin:4px 0 0;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#b45a33;">${escapeHtml(eyebrow)}</p>
        </td></tr>
        <tr><td style="background-color:#fffdf5;border:2px solid #1d3a2f;padding:28px;">
          <p style="margin:0 0 20px;font-size:17px;color:#1d3a2f;">${introHtml}</p>
          ${shows.map(renderShowHtml).join('')}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 0;"><tr><td style="background-color:#1d3a2f;text-align:center;">
            <a href="${SITE_URL}/shows" style="display:inline-block;padding:12px 28px;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#f4ecd9;text-decoration:none;">All shows &amp; details</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:24px 12px 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#6b7a70;">You&rsquo;re getting this because you signed up for show alerts at <a href="${SITE_URL}" style="color:#6b7a70;">northerndisconnection.com</a>. We only email about upcoming shows.</p>
          <p style="margin:8px 0 0;font-size:12px;color:#6b7a70;">Northern Disconnection &middot; ${escapeHtml(MAILING_LOCATION)}</p>
          <p style="margin:8px 0 0;font-size:12px;color:#6b7a70;"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#6b7a70;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

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
