'use client'

import dynamic from 'next/dynamic'
import type { StumpVariantProps } from './stump/types'

/*
  The redwood stump at the heart of the tape deck: a living linocut
  (./stump/woodcut.tsx) — cream-inked growth rings, one per frequency band,
  carved by the music as the block turns. Fed the live analyser, transport
  state and song progress; the analysis lives in ./stump/analysis.ts and
  the render-loop plumbing in ./stump/engine.ts.
*/

function Placeholder() {
  return <div className="aspect-square w-full" aria-hidden="true" />
}

const LinocutStump = dynamic(() => import('./stump/woodcut'), { ssr: false, loading: Placeholder })

export default function StumpVisualizer({ className, ...props }: StumpVariantProps) {
  return (
    <div className={className}>
      <LinocutStump {...props} className="w-full" />
    </div>
  )
}
