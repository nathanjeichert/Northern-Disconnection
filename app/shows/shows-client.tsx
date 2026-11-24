'use client'

import { useState } from 'react'
import { MapPin, Clock, Ticket, Share2 } from 'lucide-react'
import type { Show } from '@/types/content'
import { getDateParts, getWeekday } from '@/lib/dates'
import PageHead from '@/app/components/trail/page-head'
import ShowFlyerModal from '@/app/components/show-flyer-modal'
import AddToCalendar from '@/app/components/add-to-calendar'
import './shows.css'

interface ShowsPageProps {
  title: string
  shows: Show[]
  nextShowIndex: number
  /** Stand-in dates on a preview build (see lib/preview.ts). */
  sample?: boolean
}

/*
  Campfire Circle: the calendar, each show posted as a paper bill — the date
  on a block of ink down the side, the venue in poster caps.
*/
export default function ShowsClient({ title, shows, nextShowIndex, sample }: ShowsPageProps) {
  const [flyerShow, setFlyerShow] = useState<Show | null>(null)

  return (
    <div className="trail-page">
      <div className="mx-auto max-w-3xl">
        <PageHead place="campfire" title={title} />

        {sample && (
          <p className="band mb-6 px-4 py-3 text-center text-sm text-sand">
            <strong className="font-display uppercase tracking-[0.18em] text-gold">Preview build</strong> — the calendar is empty right now, so these are
            sample dates to show the layout. The live site only ever lists real shows.
          </p>
        )}

        <div className="space-y-6">
          {shows.map((show, index) => {
            const parts = getDateParts(show)
            const weekday = getWeekday(show)
            const isNext = index === nextShowIndex

            return (
              <article key={`${show.date}-${show.venue}`} className="show-bill placard" data-next={isNext || undefined} style={{ '--i': index } as React.CSSProperties}>
                <div className="show-bill__date">
                  {parts ? (
                    <>
                      <span className="show-bill__weekday">{weekday?.slice(0, 3)}</span>
                      <span className="show-bill__day">{parts.day}</span>
                      <span className="show-bill__month">
                        {parts.month} {parts.year}
                      </span>
                    </>
                  ) : (
                    <span className="show-bill__tba">{show.date}</span>
                  )}
                </div>

                <div className="show-bill__body">
                  {isNext && <span className="show-bill__flag">Next show</span>}
                  <h2 className="poster-title">{show.venue}</h2>
                  <p className="show-bill__meta">
                    <span>
                      <MapPin size={16} aria-hidden="true" />
                      {show.location}
                    </span>
                    {show.time && (
                      <span>
                        <Clock size={16} aria-hidden="true" />
                        {show.time}
                      </span>
                    )}
                  </p>
                  {show.description && <p className="show-bill__note">{show.description}</p>}

                  <div className="show-bill__actions">
                    {show.soldOut ? (
                      <span className="show-bill__soldout">Sold out</span>
                    ) : (
                      show.hasTickets &&
                      show.ticketsUrl && (
                        <a href={show.ticketsUrl} target="_blank" rel="noopener noreferrer" className="retro-button retro-button--sm">
                          <Ticket size={15} />
                          Tickets
                        </a>
                      )
                    )}
                    {parts && <AddToCalendar show={show} triggerClassName="show-bill__link" />}
                    <button type="button" onClick={() => setFlyerShow(show)} className="show-bill__link">
                      <Share2 size={14} aria-hidden="true" />
                      Share flyer
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        {shows.length === 0 && (
          <div className="placard placard--keyline px-6 py-12 text-center sm:px-10">
            <p className="eyebrow">The calendar</p>
            <h2 className="poster-title mt-2 text-3xl sm:text-4xl">Nothing posted just now</h2>
            <p className="mx-auto mt-3 max-w-md text-lg leading-snug">
              New dates go up here first. Sign the trail register and we&apos;ll write the moment one is posted.
            </p>
            <a href="#register" className="retro-button mt-7">
              Get show alerts
            </a>
          </div>
        )}
      </div>

      {flyerShow && <ShowFlyerModal show={flyerShow} onClose={() => setFlyerShow(null)} />}
    </div>
  )
}
