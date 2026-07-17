import { Youtube } from 'lucide-react'
import Ornament from '@/app/components/ornament'
import LiveTapePlayer from '@/app/components/live-tape-player'
import './player.css'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Music',
  description: 'Live at G-Fest 2025 — stream the full soundboard through the tree-ring tape deck.',
  alternates: { canonical: '/music' },
  openGraph: {
    title: 'Music | Northern Disconnection',
    description: 'Live at G-Fest 2025 — stream the full soundboard through the tree-ring tape deck.',
    url: '/music',
    images: ['/band-photos/gfest-live.jpg'],
  },
}

export default function MusicPage() {
  return (
    <div className="min-h-screen px-4 pb-24 pt-32">
      <div className="mx-auto max-w-4xl">
        <header className="mb-12 text-center">
          <h1 className="font-display vintage-shadow text-5xl text-cream sm:text-6xl">Live at G-Fest 2025</h1>
          <p className="mt-4 text-sand/80">September 27, 2025 · Petaluma, CA</p>
          <Ornament className="mt-6" />
        </header>

        {/* Full show — taper-style soundboard streamed from the Internet Archive */}
        <LiveTapePlayer identifier="ND2025-09-27" fallbackTitle="Live at G-Fest 2025" />

        <div className="mt-14 text-center">
          <a
            href="https://www.youtube.com/channel/UCOpZMRlcndhoCcN1knIHIHA"
            target="_blank"
            rel="noopener noreferrer"
            className="retro-button retro-button--ghost"
          >
            <Youtube size={16} />
            More Live Videos
          </a>
        </div>
      </div>
    </div>
  )
}
