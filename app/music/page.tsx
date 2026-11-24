import { Youtube } from 'lucide-react'
import TapeShelf from '@/app/components/tape-shelf'
import './player.css'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Music',
  description: 'Live at G-Fest 2026 and 2025 — stream the full soundboard sets through the tree-ring tape deck.',
  alternates: { canonical: '/music' },
  openGraph: {
    title: 'Music | Northern Disconnection',
    description: 'Live at G-Fest 2026 and 2025 — stream the full soundboard sets through the tree-ring tape deck.',
    url: '/music',
    images: ['/band-photos/gfest-live.jpg'],
  },
}

// The old grove: press play and the forest behind the page listens —
// fireflies, toadstools and the moon's rings all move with the tape.
export default function MusicPage() {
  return (
    <div className="trail-page">
      <div className="mx-auto max-w-4xl">
        <TapeShelf />

        <div className="mt-14 text-center">
          <a href="https://www.youtube.com/channel/UCOpZMRlcndhoCcN1knIHIHA" target="_blank" rel="noopener noreferrer" className="retro-button retro-button--ghost">
            <Youtube size={16} />
            More live videos
          </a>
        </div>
      </div>
    </div>
  )
}
