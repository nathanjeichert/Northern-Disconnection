import { NextResponse } from 'next/server'
import { renderWelcomeEmail, FROM, REPLY_TO } from '../../../scripts/newsletter-lib.mjs'

const RESEND_API = 'https://api.resend.com'

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
  const { subject, html, text } = renderWelcomeEmail()
  await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: email,
      reply_to: REPLY_TO,
      subject,
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
