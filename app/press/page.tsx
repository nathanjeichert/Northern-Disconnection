import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Download, ExternalLink, Mail } from 'lucide-react'
import Ornament from '@/app/components/ornament'
import press from '@/content/press.json'
import PressIntro from './press-intro'
import PressTracks from './press-tracks'
import { CopyButton } from './press-buttons'
import './press.css'

const title = 'Press Kit'
const description = `${press.tagline}. Promo video, bio, photos, live recordings, stage plot and booking contact.`

export const metadata: Metadata = {
  title,
  description,
  keywords: ['Northern Disconnection', 'press kit', 'EPK', 'Sonoma County', ...press.seoGenres],
  alternates: { canonical: '/press' },
  openGraph: {
    title: 'Press Kit | Northern Disconnection',
    description,
    url: '/press',
    images: [{ url: '/press/promo-poster.jpg', width: 1920, height: 1080 }],
    videos: [{ url: '/press/promo-1080.mp4', type: 'video/mp4', width: 1920, height: 1080 }],
  },
}

// Inlined so its labels pick up the site fonts.
const stagePlotSvg = fs.readFileSync(path.join(process.cwd(), 'public/press/stage-plot.svg'), 'utf8')

const CONTENT_ID = 'press-kit'
const leadPhoto = press.photos.find((p) => p.lead) ?? press.photos[0]

function SectionHead({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <header className="press-head">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="font-display text-3xl text-cream sm:text-4xl">{title}</h2>
    </header>
  )
}

export default function PressPage() {
  return (
    <>
      <PressIntro
        poster="/press/promo-poster.jpg"
        hd="/press/promo-1080.mp4"
        sd="/press/promo-720.mp4"
        durationLabel="1:51"
        targetId={CONTENT_ID}
      />

      <div id={CONTENT_ID} className="press-kit px-4 pb-24">
        <div className="mx-auto max-w-5xl">
          {/* ============ MASTHEAD ============ */}
          <header className="pt-28 text-center sm:pt-32">
            <p className="eyebrow">Electronic Press Kit</p>
            <h1 className="font-display vintage-shadow mt-3 text-5xl text-cream sm:text-7xl">Northern Disconnection</h1>
            <p className="mt-4 text-lg italic text-sand sm:text-xl">{press.tagline}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <a href={`mailto:${press.booking.email}`} className="retro-button">
                <Mail size={16} />
                Booking
              </a>
            </div>
          </header>

          <figure className="press-lead">
            <Image
              src={leadPhoto.file}
              alt={leadPhoto.alt}
              width={leadPhoto.width}
              height={leadPhoto.height}
              sizes="(min-width: 1024px) 1000px, 100vw"
              priority
            />
          </figure>

          {/* ============ BIO ============ */}
          <section className="press-section">
            <SectionHead eyebrow="Bio" title="About the band" />
            <div className="press-bio">
              <div className="press-bio__block">
                <div className="press-bio__label">
                  <span className="eyebrow">Short bio</span>
                  <CopyButton text={press.shortBio} />
                </div>
                <p className="press-bio__short">{press.shortBio}</p>
              </div>
              <div className="press-bio__block">
                <div className="press-bio__label">
                  <span className="eyebrow">Long bio</span>
                  <CopyButton text={press.longBio.join('\n\n')} />
                </div>
                {press.longBio.map((para) => (
                  <p key={para.slice(0, 32)} className="press-bio__long">
                    {para}
                  </p>
                ))}
              </div>
            </div>

            <div className="press-fans">
              <span className="eyebrow">For fans of</span>
              <ul>
                {press.forFansOf.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          </section>

          <Ornament className="my-16" />

          {/* ============ LISTEN ============ */}
          <section className="press-section">
            <SectionHead eyebrow="Listen" title={press.tape.title} />
            <PressTracks identifier={press.tape.identifier} tracks={press.tape.tracks} />
            <p className="mt-5 text-center">
              <Link href="/music" className="press-link">
                Full sets from G-Fest 2026 and 2025 on the Music page →
              </Link>
            </p>
          </section>

          <Ornament className="my-16" />

          {/* ============ HIGHLIGHTS + VENUES ============ */}
          <section className="press-section">
            <SectionHead title="Recent Highlights" />
            <ul className="press-highlights">
              {press.highlights.map((h) => (
                <li key={h.title}>
                  <h3 className="font-display text-xl text-cream">{h.title}</h3>
                  <p>{h.detail}</p>
                </li>
              ))}
            </ul>

            <div className="press-venues">
              <p className="eyebrow mb-4 text-center">Venues & festivals</p>
              <ul>
                {press.venues.map((v) => (
                  <li key={v.name}>
                    <span className="font-display text-cream">{v.name}</span>
                    <span className="press-venues__city">{v.city}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <Ornament className="my-16" />

          {/* ============ PHOTOS ============ */}
          <section className="press-section">
            <SectionHead eyebrow="Photos" title="Press photos" />
            <ul className="press-photos">
              {press.photos.map((photo) => (
                <li key={photo.file}>
                  <a href={photo.file} download className="press-photos__frame" aria-label={`Download full-size photo: ${photo.alt}`}>
                    <Image src={photo.file} alt={photo.alt} width={photo.width} height={photo.height} sizes="(min-width: 768px) 320px, 100vw" />
                  </a>
                  <a href={photo.file} download className="press-photos__dl">
                    <Download size={13} />
                    {photo.width} × {photo.height} JPG
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <Ornament className="my-16" />

          {/* ============ BOOKING & TECH ============ */}
          <section className="press-section">
            <SectionHead eyebrow="Booking" title="Booking & tech" />
            <div className="press-tech">
              <dl className="press-facts">
                <div>
                  <dt className="eyebrow">Lineup</dt>
                  <dd>{press.booking.lineup}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Sets</dt>
                  <dd>{press.booking.sets}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Sound</dt>
                  <dd>{press.booking.tech}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Inputs</dt>
                  <dd>
                    <table className="press-inputs">
                      <tbody>
                        {press.inputList.map((row) => (
                          <tr key={row.ch}>
                            <td>{row.ch}</td>
                            <td>{row.source}</td>
                            <td>{row.input}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-sm text-sand/80">{press.monitorMixes} monitor mixes</p>
                  </dd>
                </div>
              </dl>
              <figure className="press-plot">
                <div dangerouslySetInnerHTML={{ __html: stagePlotSvg }} />
              </figure>
            </div>
          </section>

          <Ornament className="my-16" />

          {/* ============ DOWNLOADS ============ */}
          <section className="press-section">
            <SectionHead eyebrow="Downloads" title="Press materials" />
            <ul className="press-downloads">
              {press.downloads.map((d) => (
                <li key={d.file}>
                  <a href={d.file} download>
                    <Download size={18} />
                    <span className="font-display text-lg text-cream">{d.label}</span>
                    <span className="press-downloads__kind">{d.kind}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* ============ CONTACT ============ */}
          <section className="press-contact">
            <p className="eyebrow">Booking & press</p>
            <a href={`mailto:${press.booking.email}`} className="press-contact__email font-display">
              {press.booking.email}
            </a>
            <CopyButton text={press.booking.email} label="Copy email" />
            <ul className="press-contact__links">
              {press.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.label}
                    <ExternalLink size={13} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
