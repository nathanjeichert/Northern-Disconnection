import type { Metadata } from 'next'
import { getShowsContent } from '@/lib/content'
import { sortShowsByDate, findNextShowIndex } from '@/lib/dates'
import { upcomingEventsJsonLd } from '@/lib/structured-data'
import ShowsClient from './shows-client'

const description = 'Upcoming concerts and events for Northern Disconnection.'

export const metadata: Metadata = {
  title: 'Shows',
  description,
  alternates: { canonical: '/shows' },
  openGraph: {
    title: 'Shows | Northern Disconnection',
    description,
    url: '/shows',
    images: ['/band-photos/gfest-live.jpg'],
  },
}

export default function ShowsPage() {
  const content = getShowsContent()
  const sortedShows = sortShowsByDate(content.upcomingShows)
  const nextShowIndex = findNextShowIndex(sortedShows)
  const eventsJsonLd = upcomingEventsJsonLd(sortedShows)

  return (
    <>
      {eventsJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventsJsonLd) }}
        />
      )}
      <ShowsClient
        title={content.pageContent.title}
        shows={sortedShows}
        nextShowIndex={nextShowIndex}
      />
    </>
  )
}
