import type { Show } from '@/types/content'

/*
  Sample dates for looking at a design. On Vercel *preview* deployments (and
  in local dev) an empty calendar is filled with clearly-labelled stand-in
  shows, so the shows page, the home page notice and the flyer maker can be
  reviewed between real gigs. Production never sees them: there
  VERCEL_ENV is "production" and this returns the real list untouched.
*/

const isPreview = process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development'

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function dateIn(days: number): string {
  const d = new Date(Date.now() + days * 86400000)
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'America/Los_Angeles' })
  const day = Number(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' }))
  const year = d.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'America/Los_Angeles' })
  return `${month} ${ordinal(day)}, ${year}`
}

export function withPreviewShows(shows: Show[]): { shows: Show[]; sample: boolean } {
  if (!isPreview || shows.length > 0) return { shows, sample: false }
  const base = { description: '', hasTickets: false, soldOut: false }
  return {
    sample: true,
    shows: [
      { ...base, date: dateIn(11), time: '8:00 PM', venue: 'The Forestville Club', location: 'Forestville, CA' },
      { ...base, date: dateIn(32), time: '7:00 PM', venue: 'Kilowatt', location: 'San Francisco, CA', description: 'Two sets, with friends sitting in.' },
      { ...base, date: dateIn(60), time: '', venue: 'The Big Easy', location: 'Petaluma, CA', hasTickets: true, ticketsUrl: 'https://northerndisconnection.com' },
    ],
  }
}
