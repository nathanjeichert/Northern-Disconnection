import type { Metadata } from 'next'
import { getShowsContent } from '@/lib/content'
import { sortShowsByDate, findNextShowIndex } from '@/lib/dates'
import HomeClient from './components/home-client'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

export default function Page() {
  const { upcomingShows } = getShowsContent()
  const sorted = sortShowsByDate(upcomingShows)
  const nextIndex = findNextShowIndex(sorted)
  const nextShow = nextIndex >= 0 ? sorted[nextIndex] : null

  return <HomeClient nextShow={nextShow} />
}
