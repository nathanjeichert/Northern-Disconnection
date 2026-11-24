'use client'

import { useState } from 'react'
import PageHead from './trail/page-head'
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
      <PageHead place="grove" title={tape.title}>
        <p className="page-head__deck">{tape.date}</p>
        <div className="mt-6 flex items-center justify-center gap-3" role="group" aria-label="Choose a live tape">
          {TAPES.map((t) => {
            const active = t.identifier === selected
            return (
              <button
                key={t.identifier}
                type="button"
                onClick={() => setSelected(t.identifier)}
                aria-pressed={active}
                className={`retro-button retro-button--sm ${active ? '' : 'retro-button--ghost'}`}
                style={{ textShadow: 'none' }}
              >
                G-Fest {t.year}
              </button>
            )
          })}
        </div>
      </PageHead>

      {/* Full show — soundboard streamed from the Internet Archive */}
      <LiveTapePlayer key={tape.identifier} identifier={tape.identifier} fallbackTitle={tape.title} />
    </>
  )
}
