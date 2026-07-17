import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import Ornament from '../components/ornament'
import MistyGrove from './demos/misty-grove'
import BoilingInk from './demos/boiling-ink'
import TreeRings from './demos/tree-rings'
import LiquidLight from './demos/liquid-light'
import HalftonePrint from './demos/halftone-print'
import CanopyDescent from './demos/canopy-scroll'
import './lab.css'

// A private demo shelf: working experiments in atmosphere and motion that
// could be grafted onto the real pages. Not linked from the nav, not
// indexed — only people with the URL find it.
export const metadata: Metadata = {
  title: 'The Wow Lab',
  description: 'Working experiments in atmosphere, ink, and sound for the Northern Disconnection website.',
  robots: { index: false, follow: false },
}

interface SpecimenProps {
  no: string
  title: string
  tech: string
  where: string
  blurb: string
  children: ReactNode
}

function Specimen({ no, title, tech, where, blurb, children }: SpecimenProps) {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-14">
      <header className="mb-6">
        <p className="eyebrow text-gold">Specimen No. {no}</p>
        <h2 className="font-display mt-2 text-3xl text-cream sm:text-4xl">{title}</h2>
        <p className="mt-3 max-w-2xl text-sand/85">{blurb}</p>
        <p className="mt-3 text-[0.7rem] uppercase tracking-[0.22em] text-rust/80">{tech}</p>
      </header>
      <div className="border-2 border-rust/50 bg-pine/60 p-2 shadow-[8px_8px_0_rgba(215,180,138,0.25)] sm:p-3">
        {children}
      </div>
      <p className="mt-4 text-sm italic text-sage">Where it could live → {where}</p>
    </section>
  )
}

export default function LabPage() {
  return (
    <div className="min-h-screen pb-24 pt-32">
      <header className="mx-auto max-w-3xl px-4 text-center">
        <p className="eyebrow">Field Notes · For the Band&apos;s Eyes Only</p>
        <h1 className="font-display vintage-shadow mt-3 text-5xl text-cream sm:text-6xl">The Wow Lab</h1>
        <p className="mx-auto mt-6 max-w-2xl leading-relaxed text-sand/85">
          Six working experiments in atmosphere, ink, and sound — each one a technique the
          site could absorb. Everything on this shelf runs on the stack already deployed
          (no new libraries, a few KB apiece), honors reduced-motion, and pauses itself
          offscreen. Nothing ships unless you say so.
        </p>
        <Ornament className="mt-8" />
      </header>

      <Specimen
        no="01"
        title="Fog & Fireflies"
        tech="layered svg silhouettes · css keyframes · one 36-particle canvas · pointer parallax"
        blurb="A living grove: procedurally grown redwood silhouettes stacked in depth, drifting fog banks, moonlight rays, and fireflies wandering on a canvas. Move your cursor and the layers part around you."
        where="the home hero (behind or instead of the photo at dusk), or the shows-page header."
      >
        <MistyGrove />
      </Specimen>

      <Specimen
        no="02"
        title="The Boiling Handbill"
        tech="svg feTurbulence + feDisplacementMap · seed-stepped at 7 fps · zero kb of javascript libraries"
        blurb="The 'boiling line' of hand-inked animation, applied to live text. Every ~140 ms the noise seed steps and the letterpress re-registers, like each frame was pulled by hand. Hold your cursor on it and the ink melts psychedelic."
        where="page headings and the fleuron sitewide (at whisper intensity), or show-poster graphics."
      >
        <BoilingInk />
      </Specimen>

      <Specimen
        no="03"
        title="Tree Rings"
        tech="web audio analyser → canvas · streams the real g-fest soundboard from archive.org · synth fallback"
        blurb="A redwood stump cross-section that grows with your sound. Press play: the site pulls the actual Live at G-Fest recording from the Internet Archive and pipes it through a frequency analyser — bass swells the heartwood, treble shimmers the outer rings."
        where="the music page — where it now lives, grown into the full tape-deck player."
      >
        <TreeRings />
      </Specimen>

      <Specimen
        no="04"
        title="Liquid Light"
        tech="raw webgl fragment shader · domain-warped noise · posterized to the site palette · 3 kb total"
        blurb="A 1960s liquid-light-show oil projection, screen-printed. Domain-warped noise graded through pine, moss, marigold, and cream, then posterized so it reads as ink separations instead of a lava lamp. It follows your cursor like oil on a projector plate."
        where="section backdrops on about or music at low opacity — or a sitewide 'trip mode' toggle."
      >
        <LiquidLight />
      </Specimen>

      <Specimen
        no="05"
        title="Pulled Prints"
        tech="canvas halftone resample · duotone + off-register gold pass · renders once, costs nothing after"
        blurb="Hover the photograph and it becomes the screen print of itself: pine ink dots on parchment with a misregistered gold underlay. Real halftone math on a canvas, not a CSS approximation — computed once, then it's just a still."
        where="every band photo on the about page; flyer thumbnails on the shows page."
      >
        <HalftonePrint />
      </Specimen>

      <section className="mx-auto mt-6 w-full max-w-3xl px-4 pb-8 text-center">
        <p className="eyebrow text-gold">Specimen No. 06</p>
        <h2 className="font-display mt-2 text-3xl text-cream sm:text-4xl">The Descent</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sand/85">
          Scrollytelling with the Framer Motion already in the site: keep scrolling and the
          page pins while you drop from the canopy to the forest floor — light dying, ferns
          rising, fireflies coming out. Imagine the about page told this way.
        </p>
        <p className="mt-3 text-[0.7rem] uppercase tracking-[0.22em] text-rust/80">
          framer motion useScroll · sticky stage · no scroll hijacking
        </p>
      </section>

      <CanopyDescent />

      <footer className="mx-auto mt-20 max-w-2xl px-4 text-center">
        <Ornament glyph="❦" />
        <p className="mt-8 leading-relaxed text-sand/85">
          That&apos;s the shelf. React to any specimen in the chat and the keepers get grafted
          into the real pages — tuned quieter, faster, and properly composed for each spot.
        </p>
        <Link href="/" className="retro-button mt-8">
          Back to the Site
        </Link>
      </footer>
    </div>
  )
}
