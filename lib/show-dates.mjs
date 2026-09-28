// Show-date logic shared by the website (via lib/dates.ts) and the newsletter
// scripts (announce/remind, run by plain Node in GitHub Actions) — one source
// of truth, so the site, the flyers and the emails always agree on when a
// show is and whether it has already happened.
//
// Plain ESM with JSDoc types so both Next.js and bare Node can import it.

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/** The band plays on Pacific time, whatever timezone the server runs in. */
export const SHOW_TIMEZONE = 'America/Los_Angeles'

/**
 * Today's calendar date in the band's timezone, as a local-midnight Date —
 * directly comparable with the dates parseShowDate returns.
 * @param {Date} [now]
 * @returns {Date}
 */
export function showToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOW_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now)
  const get = (type) => Number(parts.find((p) => p.type === type)?.value)
  return new Date(get('year'), get('month') - 1, get('day'))
}

/**
 * Show dates are human-readable strings like "June 26th, 2026". Parsed
 * strictly — an optional weekday, a month name or abbreviation ("Sept"), a
 * day, and an optional year — because Date's own parser guesses: it reads
 * "TBA — Fall 2026" as January 1st and "August 21st" as 2001. Anything
 * unrecognised returns null so callers show the raw text instead. A missing
 * year means the next time that date comes around.
 * @param {string} value
 * @param {Date} [now]
 * @returns {Date | null} local midnight on the show's calendar date
 */
export function parseShowDate(value, now = new Date()) {
  const match = String(value ?? '')
    .trim()
    .match(/^(?:[a-z]+\.?,?\s+)?([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i)
  if (!match) return null
  const month = MONTHS.findIndex((name) => name.startsWith(match[1].toLowerCase()))
  if (month === -1) return null
  const day = Number(match[2])
  const today = showToday(now)
  let year = match[3] ? Number(match[3]) : today.getFullYear()
  let date = new Date(year, month, day)
  if (!match[3] && date.getTime() < today.getTime()) date = new Date(++year, month, day)
  // reject impossible days (Feb 30th) rather than letting them roll over
  if (date.getMonth() !== month || date.getDate() !== day) return null
  return date
}

/**
 * True once a show's day is over in the band's timezone — a show stays
 * "upcoming" through the whole day it happens and drops off the day after.
 * Undated shows ("TBA") are never past.
 * @param {string} dateString
 * @param {Date} [now]
 */
export function isPastShow(dateString, now = new Date()) {
  const date = parseShowDate(dateString, now)
  return date !== null && date.getTime() < showToday(now).getTime()
}

/**
 * Whole days from today (band timezone) to the show: 0 = today, 7 = a week
 * out, negative = already happened. Null for undated shows.
 * @param {string} dateString
 * @param {Date} [now]
 * @returns {number | null}
 */
export function daysUntilShow(dateString, now = new Date()) {
  const date = parseShowDate(dateString, now)
  if (!date) return null
  const today = showToday(now)
  const utc = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((utc(date) - utc(today)) / 86_400_000)
}
