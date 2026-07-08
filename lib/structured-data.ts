// JSON-LD structured data (schema.org) for search engines.
// MusicGroup renders sitewide (layout); MusicEvent per upcoming show (/shows).
import type { Show } from '@/types/content'
import { parseShowDate } from '@/lib/dates'
import { baseUrl } from 'app/sitemap'

export const BAND_ID = `${baseUrl}/#band`

export const musicGroupJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'MusicGroup',
  '@id': BAND_ID,
  name: 'Northern Disconnection',
  url: baseUrl,
  image: `${baseUrl}/band-photos/gfest-live.jpg`,
  logo: `${baseUrl}/northern-disconnection-logo.svg`,
  description:
    'Northern Disconnection plays psychedelic americana around the San Francisco Bay Area — original songs alongside the music of the Grateful Dead, CSNY, and Steely Dan.',
  genre: ['Psychedelic Rock', 'Americana', 'Jam Band'],
  foundingLocation: {
    '@type': 'Place',
    name: 'Sonoma County, California',
  },
  sameAs: [
    'https://www.instagram.com/northerndisconnection',
    'https://www.youtube.com/channel/UCOpZMRlcndhoCcN1knIHIHA',
    'https://archive.org/details/NorthernDisconnection',
  ],
} as const

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// "8:00 PM" -> { hours: 20, minutes: 0 }
function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (!match) return null
  let hours = Number(match[1]) % 12
  if (match[3].toUpperCase() === 'PM') hours += 12
  return { hours, minutes: Number(match[2] ?? 0) }
}

// UTC offset ("-07:00" / "-08:00") for America/Los_Angeles on the given date,
// so event times are correct across PDT/PST regardless of build-server timezone.
function pacificOffset(year: number, month: number, day: number): string {
  const probe = new Date(Date.UTC(year, month - 1, day, 20)) // noon-ish Pacific
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')
  const match = part?.value.match(/GMT([+-])(\d{1,2})/)
  if (!match) return '-08:00'
  return `${match[1]}${pad(Number(match[2]))}:00`
}

// ISO-8601 startDate: date-only when no time is listed.
export function showStartDate(show: Show): string | null {
  const date = parseShowDate(show.date)
  if (!date) return null
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const dateStr = `${year}-${pad(month)}-${pad(day)}`
  const time = parseTime(show.time)
  if (!time) return dateStr
  return `${dateStr}T${pad(time.hours)}:${pad(time.minutes)}:00${pacificOffset(year, month, day)}`
}

export function musicEventJsonLd(show: Show) {
  const startDate = showStartDate(show)
  if (!startDate) return null

  const [locality, region] = show.location.split(',').map((s) => s.trim())

  return {
    '@type': 'MusicEvent',
    name: `Northern Disconnection at ${show.venue}`,
    startDate,
    url: `${baseUrl}/shows`,
    image: `${baseUrl}/band-photos/gfest-live.jpg`,
    ...(show.description ? { description: show.description } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: show.venue,
      address: {
        '@type': 'PostalAddress',
        addressLocality: locality,
        addressRegion: region || 'CA',
        addressCountry: 'US',
      },
    },
    performer: { '@id': BAND_ID },
    ...(show.hasTickets && show.ticketsUrl
      ? {
          offers: {
            '@type': 'Offer',
            url: show.ticketsUrl,
            availability: show.soldOut
              ? 'https://schema.org/SoldOut'
              : 'https://schema.org/InStock',
          },
        }
      : {}),
  }
}

// One @graph script for all upcoming shows (past-dated entries are skipped).
export function upcomingEventsJsonLd(shows: Show[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const events = shows
    .filter((show) => {
      const date = parseShowDate(show.date)
      return date !== null && date.getTime() >= today.getTime()
    })
    .map(musicEventJsonLd)
    .filter((event) => event !== null)

  if (events.length === 0) return null
  return { '@context': 'https://schema.org', '@graph': events }
}
