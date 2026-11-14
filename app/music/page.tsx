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

export default function MusicPage() {
  return (
    <div className="min-h-screen px-4 pb-24 pt-32">
      <div className="mx-auto max-w-4xl">
        <TapeShelf />

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
