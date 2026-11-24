import type { Metadata } from 'next'
import { getShowsContent } from '@/lib/content'
import { sortShowsByDate, findNextShowIndex, upcomingOnly } from '@/lib/dates'
import { upcomingEventsJsonLd } from '@/lib/structured-data'
import { withPreviewShows } from '@/lib/preview'
import ShowsClient from './shows-client'

const description = 'Upcoming concerts and events for Northern Disconnection.'

// Re-render hourly so each show drops off the list the day after it happens
// (Pacific time) without needing a redeploy.
export const revalidate = 3600

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
  const real = sortShowsByDate(upcomingOnly(content.upcomingShows))
  // structured data only ever describes real shows
  const eventsJsonLd = upcomingEventsJsonLd(real)
  const { shows, sample } = withPreviewShows(real)
  const nextShowIndex = findNextShowIndex(shows)

  return (
    <>
      {eventsJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventsJsonLd) }}
        />
      )}
      <ShowsClient title={content.pageContent.title} shows={shows} nextShowIndex={nextShowIndex} sample={sample} />
    </>
  )
}
