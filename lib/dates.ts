import type { Show } from '@/types/content'

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

// Show dates are human-readable strings like "June 26th, 2026". Parsed
// strictly — an optional weekday, a month name or abbreviation ("Sept"),
// a day, and an optional year — because Date's own parser guesses: it
// reads "TBA — Fall 2026" as January 1st and "August 21st" as 2001.
// Anything unrecognised returns null so callers show the raw text instead.
// A missing year means the next time that date comes around.
export function parseShowDate(value: string): Date | null {
  const match = value
    .trim()
    .match(/^(?:[a-z]+\.?,?\s+)?([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i)
  if (!match) return null
  const month = MONTHS.findIndex((name) => name.startsWith(match[1].toLowerCase()))
  if (month === -1) return null
  const day = Number(match[2])
  let year = match[3] ? Number(match[3]) : new Date().getFullYear()
  const build = (y: number) => new Date(y, month, day)
  let date = build(year)
  if (!match[3]) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (date.getTime() < today.getTime()) date = build(++year)
  }
  // reject impossible days (Feb 30th) rather than letting them roll over
  if (date.getMonth() !== month || date.getDate() !== day) return null
  return date
}

export function sortShowsByDate(shows: Show[]): Show[] {
  return [...shows].sort((a, b) => {
    const dateA = parseShowDate(a.date)
    const dateB = parseShowDate(b.date)
    if (!dateA && !dateB) return 0
    if (!dateA) return 1
    if (!dateB) return -1
    return dateA.getTime() - dateB.getTime()
  })
}

// Index (within the date-sorted list) of the first show on or after today.
export function findNextShowIndex(sortedShows: Show[]): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return sortedShows.findIndex((show) => {
    const date = parseShowDate(show.date)
    return date !== null && date.getTime() >= today.getTime()
  })
}

export function getWeekday(show: Show): string | null {
  const date = parseShowDate(show.date)
  if (!date) return null
  return date.toLocaleDateString('en-US', { weekday: 'long' })
}

export function getDateParts(show: Show): { month: string; day: string; year: string } | null {
  const date = parseShowDate(show.date)
  if (!date) return null
  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }),
    day: date.toLocaleDateString('en-US', { day: 'numeric' }),
    year: date.toLocaleDateString('en-US', { year: 'numeric' }),
  }
}
