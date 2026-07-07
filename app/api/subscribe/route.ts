import { NextResponse } from 'next/server'

const RESEND_API = 'https://api.resend.com'
const FROM = 'Northern Disconnection <shows@northerndisconnection.com>'
const REPLY_TO = 'nathanjeichert@gmail.com'
const SITE_URL = 'https://www.northerndisconnection.com'
const MAILING_LOCATION = 'Sonoma County, CA'

// Best-effort in-memory rate limit. Serverless instances don't share memory, so
// this only throttles bursts hitting the same warm instance — enough to blunt a
// naive script without standing up a database. Paired with the honeypot below.
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE_LIMIT
}

// Welcome note sent once, when a brand-new contact is created. Best effort: a
// failure here never fails the subscription itself.
async function sendWelcome(email: string, apiKey: string) {
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#f4ecd9;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4ecd9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:0 0 24px;text-align:center;">
          <p style="margin:0;font-size:24px;font-weight:bold;letter-spacing:1px;color:#1d3a2f;">Northern Disconnection</p>
          <p style="margin:4px 0 0;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#b45a33;">You&rsquo;re on the list</p>
        </td></tr>
        <tr><td style="background-color:#fffdf5;border:2px solid #1d3a2f;padding:28px;">
          <p style="margin:0 0 16px;font-size:17px;color:#1d3a2f;">Thanks for signing up for show alerts.</p>
          <p style="margin:0;font-size:15px;color:#4a5d52;">We&rsquo;ll only email you when there&rsquo;s a new show to announce or one coming up soon &mdash; no noise. See you out there.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 0;"><tr><td style="background-color:#1d3a2f;text-align:center;">
            <a href="${SITE_URL}/shows" style="display:inline-block;padding:12px 28px;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#f4ecd9;text-decoration:none;">See upcoming shows</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:24px 12px 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#6b7a70;">You&rsquo;re getting this because you just signed up at <a href="${SITE_URL}" style="color:#6b7a70;">northerndisconnection.com</a>.</p>
          <p style="margin:8px 0 0;font-size:12px;color:#6b7a70;">Northern Disconnection &middot; ${MAILING_LOCATION}</p>
          <p style="margin:8px 0 0;font-size:12px;color:#6b7a70;">To unsubscribe, reply with &ldquo;unsubscribe&rdquo; or use the link in any show alert.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = [
    'Thanks for signing up for Northern Disconnection show alerts.',
    '',
    "We'll only email you when there's a new show to announce or one coming up soon — no noise. See you out there.",
    '',
    `Upcoming shows: ${SITE_URL}/shows`,
    '',
    'You are getting this because you just signed up at northerndisconnection.com.',
    `Northern Disconnection · ${MAILING_LOCATION}`,
    'To unsubscribe, reply with "unsubscribe" or use the link in any show alert.',
  ].join('\n')

  await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: email,
      reply_to: REPLY_TO,
      subject: "You're on the Northern Disconnection list",
      html,
      text,
      headers: {
        'List-Unsubscribe': `<mailto:${REPLY_TO}?subject=unsubscribe>`,
      },
    }),
  })
}

// Subscribers live in a Resend Audience (free tier) — no database to keep alive.
// Unsubscribes are managed by Resend and automatically excluded from broadcasts.
export async function POST(request: Request) {
  try {
    const { email, hp } = await request.json()

    // Honeypot: real users never fill the hidden field. Pretend success so bots
    // get no signal, but add nothing.
    if (typeof hp === 'string' && hp.trim() !== '') {
      return NextResponse.json({ success: true })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many attempts — please try again in a few minutes.' },
        { status: 429 }
      )
    }

    if (
      !email ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }

    const apiKey = process.env.RESEND_API_KEY
    const audienceId = process.env.RESEND_AUDIENCE_ID

    if (!apiKey || !audienceId) {
      return NextResponse.json(
        { error: 'Signups are temporarily offline — please try again soon.' },
        { status: 503 }
      )
    }

    const normalized = email.trim().toLowerCase()
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    const created = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: normalized, unsubscribed: false }),
    })

    if (created.ok) {
      // New contact — send a one-time welcome. Best effort; don't block success.
      try {
        await sendWelcome(normalized, apiKey)
      } catch (e) {
        console.error('Welcome email failed (subscription still succeeded):', e)
      }
      return NextResponse.json({ success: true })
    }

    // Already subscribed once before — re-opt them in by email address.
    if (created.status === 409) {
      const updated = await fetch(
        `${RESEND_API}/audiences/${audienceId}/contacts/${encodeURIComponent(normalized)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ unsubscribed: false }),
        }
      )
      if (updated.ok) {
        return NextResponse.json({ success: true })
      }
    }

    console.error('Resend contact error:', created.status, await created.text())
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 502 })
  } catch (error) {
    console.error('Subscription error:', error)
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
  }
}
