'use client'

import { useState } from 'react'
import Ornament from './ornament'
import LiveTapePlayer from './live-tape-player'

// One Archive.org item per show, newest first. Only the selected tape is
// mounted, so two players never pre-buffer or claim media controls at once.
// To add a tape: put its item at the top of this list.
const TAPES = [
  { identifier: 'ND2026-09-19', year: '2026', title: 'Live at G-Fest 2026', date: 'September 19, 2026 · Petaluma, CA' },
  { identifier: 'ND2025-09-27', year: '2025', title: 'Live at G-Fest 2025', date: 'September 27, 2025 · Petaluma, CA' },
]

export default function TapeShelf() {
  const [selected, setSelected] = useState(TAPES[0].identifier)
  const tape = TAPES.find((t) => t.identifier === selected) ?? TAPES[0]

  return (
    <>
      <header className="mb-12 text-center">
        <h1 className="font-display vintage-shadow text-5xl text-cream sm:text-6xl">{tape.title}</h1>
        <p className="mt-4 text-sand/80">{tape.date}</p>
        <div className="mt-6 flex items-center justify-center gap-2" role="group" aria-label="Choose a live tape">
          {TAPES.map((t) => {
            const active = t.identifier === selected
            return (
              <button
                key={t.identifier}
                type="button"
                onClick={() => setSelected(t.identifier)}
                aria-pressed={active}
                className={`border px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.15em] transition-colors ${
                  active ? 'border-cream bg-cream text-pine' : 'border-rust/40 text-rust hover:border-rust hover:text-cream'
                }`}
              >
                G-Fest {t.year}
              </button>
            )
          })}
        </div>
        <Ornament className="mt-6" />
      </header>

      {/* Full show — soundboard streamed from the Internet Archive */}
      <LiveTapePlayer key={tape.identifier} identifier={tape.identifier} fallbackTitle={tape.title} />
    </>
  )
}
