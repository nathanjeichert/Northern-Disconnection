import type { Metadata } from 'next'
import { getShowsContent } from '@/lib/content'
import { sortShowsByDate, findNextShowIndex, upcomingOnly } from '@/lib/dates'
import HomeClient from './components/home-client'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

// Re-render hourly so the "Next Show" banner moves on the day after a gig.
export const revalidate = 3600

export default function Page() {
  const { upcomingShows } = getShowsContent()
  const sorted = sortShowsByDate(upcomingOnly(upcomingShows))
  const nextIndex = findNextShowIndex(sorted)
  const nextShow = nextIndex >= 0 ? sorted[nextIndex] : null

  return <HomeClient nextShow={nextShow} />
}
