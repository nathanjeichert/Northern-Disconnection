import type { Metadata } from 'next'
import { getShowsContent } from '@/lib/content'
import { sortShowsByDate, findNextShowIndex, upcomingOnly } from '@/lib/dates'
import { withPreviewShows } from '@/lib/preview'
import press from '@/content/press.json'
import HomeClient from './components/home-client'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

// Re-render hourly so the "Next Show" notice moves on the day after a gig.
export const revalidate = 3600

export default function Page() {
  const { upcomingShows } = getShowsContent()
  const { shows, sample } = withPreviewShows(sortShowsByDate(upcomingOnly(upcomingShows)))
  const nextIndex = findNextShowIndex(shows)
  const nextShow = nextIndex >= 0 ? shows[nextIndex] : null

  // the first sentence of the press bio introduces the band on the postcard
  const intro = press.shortBio.split(/(?<=\.)\s/)[0]

  return <HomeClient nextShow={nextShow} sample={sample} intro={intro} />
}
