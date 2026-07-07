// Sends a "coming up soon" reminder email (Resend Broadcast) for each show that
// is within the next REMINDER_DAYS days. Run daily by
// .github/workflows/remind-shows.yml on a cron schedule.
//
// Unlike the announce script (which is push/diff driven), this is time driven:
// it reads the CURRENT content/shows.json and finds shows landing soon.
//
// Dedup: each show's reminder broadcast is named deterministically
// ("Reminder | <date> | <venue>"). Before sending we list existing broadcasts
// and skip any show that already has one — so the daily cron sends each show's
// reminder exactly once (the first day it enters the window), never repeatedly.
//
// Env:
//   RESEND_API_KEY, RESEND_AUDIENCE_ID — required to send (no-op if missing)
//   REMINDER_DAYS — window size in days (default 7)
//   SHOWS_FILE — path to shows.json (default content/shows.json; for testing)
//   DRY_RUN=1 — render each due reminder and print it, don't send
import { writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseShowDate,
  showKey,
  renderEmail,
  resendPost,
  resendGet,
  FROM,
  REPLY_TO,
} from './newsletter-lib.mjs'

const SHOWS_FILE = process.env.SHOWS_FILE || 'content/shows.json'
const REMINDER_DAYS = Number(process.env.REMINDER_DAYS ?? 7)

function loadShows(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')).upcomingShows ?? []
  } catch {
    return null
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Whole days from today (UTC date) to the show date. 0 = today, 7 = a week out.
function daysUntil(show) {
  const d = parseShowDate(show.date)
  if (!d) return null
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const showUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.round((showUtc - todayUtc) / MS_PER_DAY)
}

const reminderName = (show) => `Reminder | ${showKey(show)}`

function buildEmail(show, days) {
  const when =
    days <= 0 ? 'today' : days === 1 ? 'tomorrow' : days <= 7 ? 'this week' : 'soon'
  const introText = `We're playing ${when} — hope to see you there:`
  const introHtml = `We&rsquo;re playing ${when} &mdash; hope to see you there:`
  const subject =
    days <= 1
      ? `Tonight-ish: Northern Disconnection at ${show.venue}`
      : `Coming up: Northern Disconnection at ${show.venue}, ${show.location}`
  return renderEmail({ subject, eyebrow: 'Reminder', introHtml, introText, shows: [show] })
}

const shows = loadShows(SHOWS_FILE)
if (!shows) {
  console.log(`Could not read ${SHOWS_FILE} — nothing to do.`)
  process.exit(0)
}

const due = shows
  .map((s) => ({ show: s, days: daysUntil(s) }))
  .filter(({ show, days }) => show.venue && show.date && days !== null && days >= 0 && days <= REMINDER_DAYS)
  .sort((a, b) => a.days - b.days)

if (due.length === 0) {
  console.log(`No shows within ${REMINDER_DAYS} days — no reminders to send.`)
  process.exit(0)
}

console.log(`Show(s) within ${REMINDER_DAYS} days:`)
for (const { show, days } of due) console.log(`  - ${show.date} | ${show.venue} (in ${days}d)`)

if (process.env.DRY_RUN === '1') {
  for (const { show, days } of due) {
    const { subject, html, text } = buildEmail(show, days)
    const out = join(tmpdir(), `nd-reminder-${showKey(show).replace(/[^a-z0-9]+/gi, '-')}.html`)
    writeFileSync(out, html)
    console.log(`\nDRY RUN — no email sent.\nSubject: ${subject}\nPreview written to: ${out}\n\n--- text version ---\n${text}`)
  }
  process.exit(0)
}

const apiKey = process.env.RESEND_API_KEY
const audienceId = process.env.RESEND_AUDIENCE_ID
if (!apiKey || !audienceId) {
  console.log('RESEND_API_KEY / RESEND_AUDIENCE_ID not set — skipping send (newsletter not configured yet).')
  process.exit(0)
}

// Fetch existing broadcasts once so we can skip shows already reminded.
const existing = await resendGet('/broadcasts', apiKey)
const existingNames = new Set((existing.data ?? []).map((b) => b.name))

let sent = 0
for (const { show, days } of due) {
  const name = reminderName(show)
  if (existingNames.has(name)) {
    console.log(`Already reminded: ${show.venue} (${show.date}) — skipping.`)
    continue
  }
  const { subject, html, text } = buildEmail(show, days)
  const broadcast = await resendPost('/broadcasts', {
    name,
    audience_id: audienceId,
    from: FROM,
    reply_to: REPLY_TO,
    subject,
    html,
    text,
  }, apiKey)
  await resendPost(`/broadcasts/${broadcast.id}/send`, {}, apiKey)
  console.log(`Reminder broadcast ${broadcast.id} sent for ${show.venue} (${show.date}).`)
  sent++
}

console.log(`Done — ${sent} reminder(s) sent.`)
