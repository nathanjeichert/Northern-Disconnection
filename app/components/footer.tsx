'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Instagram, Youtube } from 'lucide-react'
import { PLACES, placeIndexForPath } from '@/lib/world/places'
import SubscribeForm from './subscribe-form'
import './trail/trail.css'

const BOOKING_EMAIL = 'booking@northerndisconnection.com'

/*
  The foot of every page: where the trail goes next, the trail register
  (mailing list), and the booking address and socials on the poster's
  bottom band.
*/
export default function Footer() {
  const pathname = usePathname()
  const index = placeIndexForPath(pathname)
  const known = PLACES.some((p) => p.path === pathname)
  const back = known && index > 0 ? PLACES[index - 1] : null
  const onward = known && index < PLACES.length - 1 ? PLACES[index + 1] : null

  return (
    <div className="relative z-10">
      <nav className="trail-next" aria-label="Along the trail">
        {back && (
          <div className="trail-next__wrap trail-next__wrap--back">
            <Link href={back.path} className="trail-next__sign">
              <small>← Back down the trail</small>
              <strong>{back.label}</strong>
              <em>{back.name}</em>
            </Link>
          </div>
        )}
        {onward && (
          <div className="trail-next__wrap trail-next__wrap--onward">
            <Link href={onward.path} className="trail-next__sign">
              <small>The trail continues →</small>
              <strong>{onward.label}</strong>
              <em>{onward.name}</em>
            </Link>
          </div>
        )}
      </nav>

      <footer className="band !shadow-none">
        <div className="h-1.5 bg-gold" aria-hidden="true" />
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-[1.25fr_1fr] md:gap-14 md:py-14" style={{ paddingInline: 'max(1.5rem, calc(var(--frame) + 1rem))' }}>
          {/* the register */}
          <section id="register" className="placard placard--keyline scroll-mt-24 p-6 sm:p-8">
            <p className="eyebrow">Mailing list</p>
            <h2 className="poster-title mt-1 text-3xl sm:text-4xl">Sign the trail register</h2>
            <p className="mb-5 mt-2 max-w-md text-[1.05rem] leading-snug">
              We&apos;ll write when a new show is posted, and again the week it happens. That&apos;s all.
            </p>
            <SubscribeForm />
          </section>

          <div className="flex flex-col justify-between gap-8">
            <section>
              <p className="eyebrow">Booking &amp; inquiries</p>
              <a
                href={`mailto:${BOOKING_EMAIL}`}
                className="font-display mt-1 inline-block break-all text-xl text-cream underline decoration-gold/60 decoration-2 underline-offset-4 transition-colors hover:text-gold sm:text-2xl"
              >
                {BOOKING_EMAIL}
              </a>
              <p className="mt-3">
                <Link href="/press" className="font-display text-sm uppercase tracking-[0.2em] text-rust transition-colors hover:text-gold">
                  Press kit &amp; tech rider →
                </Link>
              </p>
            </section>

            <section>
              <p className="eyebrow mb-3">Follow along</p>
              <div className="flex flex-wrap gap-3">
                <a href="https://www.instagram.com/northerndisconnection" target="_blank" rel="noopener noreferrer" className="retro-button retro-button--sm retro-button--ghost">
                  <Instagram size={16} />
                  Instagram
                </a>
                <a href="https://www.youtube.com/channel/UCOpZMRlcndhoCcN1knIHIHA" target="_blank" rel="noopener noreferrer" className="retro-button retro-button--sm retro-button--ghost">
                  <Youtube size={16} />
                  YouTube
                </a>
                <a href="https://archive.org/details/NorthernDisconnection" target="_blank" rel="noopener noreferrer" className="retro-button retro-button--sm retro-button--ghost">
                  Live Music Archive
                </a>
              </div>
            </section>
          </div>
        </div>
        <p className="eyebrow px-6 pb-8 text-center !text-[0.62rem] !tracking-[0.3em] opacity-70" style={{ paddingBottom: 'calc(var(--frame) + 1.5rem)' }}>
          Northern Disconnection <span aria-hidden="true">·</span> Sonoma County, California <span aria-hidden="true">·</span> Leave the signal behind
        </p>
      </footer>
    </div>
  )
}
