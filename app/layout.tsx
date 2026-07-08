import './global.css'
import type { Metadata } from 'next'
import { Fraunces, Alegreya_Sans } from 'next/font/google'
import { Navbar } from './components/nav'
import Footer from './components/footer'
import MotionProvider from './components/motion-provider'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { baseUrl } from './sitemap'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${fraunces.variable} ${alegreyaSans.variable}`}
    >
      <body className="antialiased min-h-screen">
        <div className="grain-overlay"></div>
        <div className="watermark-overlay" aria-hidden="true"></div>
        <main className="relative z-10">
          <MotionProvider>
            <Navbar />
            {children}
            <Footer />
          </MotionProvider>
          <Analytics />
          <SpeedInsights />
        </main>
      </body>
    </html>
  )
}
