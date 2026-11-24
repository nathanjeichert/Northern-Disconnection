import type { ReactNode } from 'react'
import { PLACES, type Place } from '@/lib/world/places'

/* The title block at the top of a page, set straight onto the sky of its
   place: a mile marker, the page's plain name in poster caps, and whatever
   the page wants beneath. */
export default function PageHead({ place, title, children }: { place: Place['id']; title: string; children?: ReactNode }) {
  const p = PLACES.find((x) => x.id === place)!
  return (
    <header className="page-head on-sky">
      <p className="eyebrow">
        Mile {p.mile} <span aria-hidden="true">✦</span> {p.name}
      </p>
      <h1 className="poster-title">{title}</h1>
      {children}
    </header>
  )
}
