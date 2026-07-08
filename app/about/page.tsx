import type { Metadata } from 'next'
import Image from 'next/image'
import { Mail } from 'lucide-react'
import Ornament from '@/app/components/ornament'

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

export default function AboutPage() {
  return (
    <div className="min-h-screen pb-24 pt-32">
      <div className="mx-auto max-w-6xl space-y-20 px-4">
        <header className="text-center">
          <h1 className="font-display vintage-shadow text-5xl text-cream sm:text-6xl">About the Band</h1>
          <Ornament className="mt-6" />
        </header>

        {aboutSections.map((section, index) => {
          const isEven = index % 2 === 0

          return (
            <section
              key={section.image.src}
              className="grid items-center gap-12 md:grid-cols-2 md:gap-16"
            >
              <div className={`text-lg leading-relaxed text-sand ${isEven ? '' : 'md:order-2'}`}>
                <p className="first-letter:font-display first-letter:float-left first-letter:mr-3 first-letter:text-6xl first-letter:leading-[0.85] first-letter:text-gold">
                  {section.text}
                </p>
              </div>

              <div className={`relative ${isEven ? 'md:-mr-16' : 'md:-ml-16 md:order-1'}`}>
                <div
                  className={`absolute -inset-6 -z-10 rounded-full bg-gold/10 blur-3xl ${
                    isEven ? 'translate-y-8 -translate-x-6' : '-translate-y-8 translate-x-6'
                  }`}
                  aria-hidden="true"
                ></div>
                {/* vintage snapshot frame */}
                <div
                  className={`relative border-[10px] border-cream bg-cream shadow-2xl ${
                    isEven ? 'rotate-1 md:translate-y-6' : '-rotate-1 md:-translate-y-6'
                  }`}
                >
                  <div className="relative aspect-[3/4] overflow-hidden">
                    <Image
                      src={section.image.src}
                      alt={section.image.alt}
                      fill
                      sizes="(min-width: 768px) 420px, 80vw"
                      className="object-cover"
                      priority={index === 0}
                    />
                  </div>
                </div>
              </div>
            </section>
          )
        })}

        {/* Booking call-out */}
        <section className="mx-auto max-w-3xl border-2 border-rust/40 bg-moss/30 px-8 py-10 text-center shadow-[8px_8px_0_rgba(215,180,138,0.2)]">
          <p className="eyebrow mb-3">Booking &amp; Inquiries</p>
          <p className="mb-6 text-lg text-sand">
            Venues, festivals, and private events around the Bay Area — drop us a line.
          </p>
          <a href="mailto:nathanjeichert@gmail.com" className="retro-button">
            <Mail size={16} />
            Contact Us
          </a>
        </section>
      </div>
    </div>
  )
}
