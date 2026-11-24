import type { Metadata } from 'next'
import Image from 'next/image'
import { Mail } from 'lucide-react'
import PageHead from '@/app/components/trail/page-head'
import './about.css'

const aboutSections = [
  {
    text: "Evan Pellkofer (guitar) and Nathan Eichert (keys) have been playing music together since elementary school. After a decade-plus, and with a little help from a rotating cast of talented friends, the duo is bringing their blend of blues, folk, jazz, and psychedelic rock to audiences around the San Francisco Bay Area.",
    image: {
      src: '/band-photos/BrickPhoto.jpg',
      alt: 'Northern Disconnection performing in front of a brick backdrop',
    },
  },
  {
    text: "Northern Disconnection's diverse set lists feature a blend of original songs and their take on the music that formed the soundtrack of their childhood, such as the Grateful Dead, Crosby, Stills, Nash and Young, and Steely Dan.",
    image: {
      src: '/band-photos/GrassPhoto.jpg',
      alt: 'Northern Disconnection playing outdoors surrounded by greenery',
    },
  },
] as const

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn the story of Northern Disconnection and the longtime friends behind the band.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About | Northern Disconnection',
    description: 'Learn the story of Northern Disconnection and the longtime friends behind the band.',
    url: '/about',
    images: ['/band-photos/BrickPhoto.jpg'],
  },
}

// Base camp: the story on paper notices, the photographs as snapshots
// tacked up beside them.
export default function AboutPage() {
  return (
    <div className="trail-page">
      <div className="mx-auto max-w-5xl">
        <PageHead place="camp" title="About the Band">
          <p className="page-head__deck">Blues, folk, jazz and psychedelic rock from the coastal forests of Northern California.</p>
        </PageHead>

        <div className="about-story">
          {aboutSections.map((section, index) => (
            <section key={section.image.src} className="about-leaf" data-flip={index % 2 === 1 || undefined}>
              <div className="about-leaf__text placard placard--keyline">
                <p>{section.text}</p>
              </div>

              <figure className="about-leaf__photo">
                <div className="relative aspect-[3/4] overflow-hidden">
                  <Image src={section.image.src} alt={section.image.alt} fill sizes="(min-width: 768px) 420px, 80vw" className="object-cover" priority={index === 0} />
                </div>
              </figure>
            </section>
          ))}
        </div>

        {/* Booking call-out */}
        <section className="band band--keyline mx-auto mt-20 max-w-3xl px-8 py-11 text-center">
          <p className="eyebrow mb-3">Booking &amp; inquiries</p>
          <h2 className="poster-title text-3xl text-cream sm:text-4xl">Bring the band to you</h2>
          <p className="mx-auto mb-7 mt-3 max-w-md text-lg text-sand">Venues, festivals, and private events around the Bay Area — drop us a line.</p>
          <a href="mailto:booking@northerndisconnection.com" className="retro-button">
            <Mail size={16} />
            Contact us
          </a>
        </section>
      </div>
    </div>
  )
}
