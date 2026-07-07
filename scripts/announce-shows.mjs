// Sends a show-alert email (Resend Broadcast) when new shows are added to
// content/shows.json. Run by .github/workflows/announce-shows.yml on push.
//
// Only genuinely NEW shows are announced: it diffs the file between two git
// refs and keys shows by venue+date, so edits to existing entries (time,
// description, typo fixes) never trigger an email. Past-dated shows are
// ignored. All new shows in one push go out as a single digest.
//
// Env:
//   RESEND_API_KEY, RESEND_AUDIENCE_ID — required to send (no-op if missing)
//   BEFORE_REF / AFTER_REF — git refs to diff (default HEAD^ / HEAD)
//   BEFORE_FILE / AFTER_FILE — file paths that override git refs (for testing)
//   DRY_RUN=1 — render the email to a temp file and print it, don't send
import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseShowDate,
  showKey,
  renderEmail,
  resendPost,
  FROM,
  REPLY_TO,
} from './newsletter-lib.mjs'

const SHOWS_PATH = 'content/shows.json'

function loadShows(ref, fileOverride) {
  let raw
  if (fileOverride) {
    raw = readFileSync(fileOverride, 'utf8')
  } else {
    try {
      raw = execFileSync('git', ['show', `${ref}:${SHOWS_PATH}`], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      })
    } catch {
      return null // ref unreachable (first push, force push, shallow clone)
    }
  }
  try {
    return JSON.parse(raw.replace(/^﻿/, '')).upcomingShows ?? []
  } catch {
    return null
  }
}

function buildEmail(newShows) {
  const plural = newShows.length > 1
  const introText = plural
    ? `We've added ${newShows.length} new shows — hope to see you out there:`
    : `We've added a new show — hope to see you out there:`
  const introHtml = plural
    ? `We&rsquo;ve added ${newShows.length} new shows &mdash; hope to see you out there:`
    : `We&rsquo;ve added a new show &mdash; hope to see you out there:`
  const subject = plural
    ? `${newShows.length} new Northern Disconnection shows announced`
    : `New show: ${newShows[0].venue}, ${newShows[0].location} — ${newShows[0].date}`
  return renderEmail({ subject, eyebrow: 'Show Alert', introHtml, introText, shows: newShows })
}

const beforeRef = process.env.BEFORE_REF || 'HEAD^'
const afterRef = process.env.AFTER_REF || 'HEAD'

const before =
  /^0+$/.test(beforeRef) // all-zero SHA = branch creation; nothing to diff against
    ? loadShows('HEAD^', process.env.BEFORE_FILE)
    : loadShows(beforeRef, process.env.BEFORE_FILE)
const after = loadShows(afterRef, process.env.AFTER_FILE)

if (!after) {
  console.log('Could not read current shows.json — nothing to do.')
  process.exit(0)
}
if (!before) {
  console.log('No previous version of shows.json to diff against — skipping (will not mass-announce existing shows).')
  process.exit(0)
}

const known = new Set(before.map(showKey))
// 24h grace so a show added on the day of the gig still announces across timezones
const cutoff = Date.now() - 24 * 60 * 60 * 1000
const newShows = after
  .filter((s) => s.venue && s.date && !known.has(showKey(s)))
  .filter((s) => {
    const d = parseShowDate(s.date)
    return d !== null && d.getTime() >= cutoff
  })
  .sort((a, b) => (parseShowDate(a.date)?.getTime() ?? 0) - (parseShowDate(b.date)?.getTime() ?? 0))

if (newShows.length === 0) {
  console.log('No new upcoming shows detected — no email sent.')
  process.exit(0)
}

console.log(`New upcoming show(s) detected:`)
for (const s of newShows) console.log(`  - ${s.date} | ${s.venue} | ${s.location}`)

const { subject, html, text } = buildEmail(newShows)

if (process.env.DRY_RUN === '1') {
  const out = join(tmpdir(), 'nd-announce-preview.html')
  writeFileSync(out, html)
  console.log(`\nDRY RUN — no email sent.\nSubject: ${subject}\nPreview written to: ${out}\n\n--- text version ---\n${text}`)
  process.exit(0)
}

const apiKey = process.env.RESEND_API_KEY
const audienceId = process.env.RESEND_AUDIENCE_ID
if (!apiKey || !audienceId) {
  console.log('RESEND_API_KEY / RESEND_AUDIENCE_ID not set — skipping send (newsletter not configured yet).')
  process.exit(0)
}

const broadcast = await resendPost('/broadcasts', {
  name: subject,
  audience_id: audienceId,
  from: FROM,
  reply_to: REPLY_TO,
  subject,
  html,
  text,
}, apiKey)

await resendPost(`/broadcasts/${broadcast.id}/send`, {}, apiKey)
console.log(`Broadcast ${broadcast.id} sent to audience ${audienceId}.`)
