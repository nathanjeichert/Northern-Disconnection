import './global.css'
import type { Metadata, Viewport } from 'next'
import { Oswald, Fraunces, Alegreya_Sans } from 'next/font/google'
import WorldCanvas from './components/world/world-canvas'
import MotionProvider from './components/motion-provider'
import TrailChrome from './components/trail/trail-chrome'
import Footer from './components/footer'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { baseUrl } from './sitemap'
import { musicGroupJsonLd } from '@/lib/structured-data'

// Condensed gothic caps: the voice of a WPA park poster.
const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-poster',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  axes: ['SOFT', 'WONK', 'opsz'],
})

const alegreyaSans = Alegreya_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-body',
})

const description =
  'Northern Disconnection plays psychedelic americana around the San Francisco Bay Area — original songs alongside the music of the Grateful Dead, CSNY, and Steely Dan.'

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'Northern Disconnection',
    template: '%s | Northern Disconnection',
  },
  description,
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/northern-disconnection-logo.svg',
  },
  openGraph: {
    title: 'Northern Disconnection',
    description,
    url: baseUrl,
    siteName: 'Northern Disconnection',
    locale: 'en_US',
    type: 'website',
    images: ['/band-photos/gfest-live.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  themeColor: '#f2e8cf',
}

// Names the place before first paint, so the stand-in sky and the type on
// it are already the right inks (the world canvas takes over from there).
const placeScript = `(function(){var m={shows:'campfire',music:'grove',about:'camp',press:'lookout'};document.documentElement.dataset.place=m[location.pathname.split('/')[1]]||'trailhead'})()`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-place="trailhead"
      suppressHydrationWarning
      className={`${oswald.variable} ${fraunces.variable} ${alegreyaSans.variable}`}
    >
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: placeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(musicGroupJsonLd) }}
        />
        <WorldCanvas />
        <MotionProvider>
          <TrailChrome />
          <div className="page">
            <main>{children}</main>
            <Footer />
          </div>
        </MotionProvider>
        <div className="grain-overlay" aria-hidden="true" />
        <div className="poster-frame" aria-hidden="true" />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
