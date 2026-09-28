import type { Show } from '@/types/content'

// Parsing and "has it happened yet" live in show-dates.mjs, shared with the
// newsletter scripts so the site and the emails always agree.
export { parseShowDate, isPastShow, showToday } from './show-dates.mjs'
import { isPastShow, parseShowDate, showToday } from './show-dates.mjs'

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

// Shows that haven't happened yet: a show stays listed through its own day
// (Pacific time) and drops off the day after. Undated shows ("TBA") stay.
export function upcomingOnly(shows: Show[]): Show[] {
  return shows.filter((show) => !isPastShow(show.date))
}

// Index (within the date-sorted list) of the first show on or after today.
export function findNextShowIndex(sortedShows: Show[]): number {
  const today = showToday()

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
