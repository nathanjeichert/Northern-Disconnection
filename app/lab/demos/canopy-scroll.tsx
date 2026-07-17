'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform, useReducedMotion, type MotionValue } from 'framer-motion'
import { FernBed, TreeLine } from './flora'
import { makeRng } from './support'

/*
  Specimen 06 — scrollytelling with the site's existing Framer Motion.
  The section is 340vh tall; a sticky stage stays pinned while scroll
  progress drives every layer: the canopy lifts away, the trunks slide,
  the light dies, ferns rise, fireflies come out. No scroll hijacking —
  the page scrolls normally and the stage simply listens.
*/

function Trunks({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const rng = makeRng(301)
  const trunks = [8, 27, 52, 71, 91].map((cx) => {
    const w = 36 + rng() * 34
    const x = cx * 12
    const lean = (rng() - 0.5) * 20
    const stubs: string[] = []
    for (let y = 90; y < 720; y += 130 + rng() * 90) {
      const dir = rng() > 0.5 ? 1 : -1
      const sw = w * (0.9 + rng() * 0.7)
      stubs.push(
        `M ${x + (dir * w) / 2} ${y} L ${(x + dir * (w / 2 + sw)).toFixed(1)} ${(y + sw * 0.55).toFixed(1)} L ${x + (dir * w) / 2} ${y + sw * 0.4} Z`
      )
    }
    return (
      `M ${x - w * 0.62} 800 L ${x - w / 2 + lean} 0 L ${x + w / 2 + lean} 0 L ${x + w * 0.62} 800 Z ` + stubs.join(' ')
    )
  })
  return (
    <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" className={className} style={style} aria-hidden="true">
      <path d={trunks.join(' ')} fill="#04100a" />
    </svg>
  )
}

const FIREFLY_SPOTS = (() => {
  const rng = makeRng(88)
  return Array.from({ length: 14 }, () => ({
    left: 6 + rng() * 88,
    top: 45 + rng() * 48,
    delay: rng() * 4,
    duration: 2.8 + rng() * 3,
    size: 2 + Math.round(rng() * 2),
  }))
})()

interface CaptionProps {
  opacity: MotionValue<number>
  eyebrow: string
  title: string
  sub: string
}

function Caption({ opacity, eyebrow, title, sub }: CaptionProps) {
  return (
    <motion.div
      style={{ opacity }}
      className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-6 text-center"
    >
      <p className="eyebrow text-gold">{eyebrow}</p>
      <h3 className="font-display vintage-shadow mt-2 text-4xl text-cream sm:text-6xl">{title}</h3>
      <p className="mx-auto mt-4 max-w-md text-base italic text-sand/90 sm:text-lg">{sub}</p>
    </motion.div>
  )
}

export default function CanopyDescent() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })

  const bg = useTransform(scrollYProgress, [0, 0.55, 1], ['#1c4432', '#0b2015', '#050f0a'])
  const sunOpacity = useTransform(scrollYProgress, [0, 0.32], [1, 0])
  const canopyY = useTransform(scrollYProgress, [0, 0.65], ['0%', '-85%'])
  const canopyY2 = useTransform(scrollYProgress, [0, 0.65], ['0%', '-55%'])
  const trunksY = useTransform(scrollYProgress, [0, 1], ['4%', '-16%'])
  const mistY = useTransform(scrollYProgress, [0, 1], ['12%', '-12%'])
  const fernsY = useTransform(scrollYProgress, [0.45, 0.88], ['80%', '4%'])
  const groundOpacity = useTransform(scrollYProgress, [0.5, 0.9], [0, 1])
  const firefliesOpacity = useTransform(scrollYProgress, [0.58, 0.85], [0, 1])
  const railTop = useTransform(scrollYProgress, [0, 1], ['3%', '95%'])

  const caption1 = useTransform(scrollYProgress, [0, 0.06, 0.24, 0.32], [0, 1, 1, 0])
  const caption2 = useTransform(scrollYProgress, [0.34, 0.42, 0.58, 0.66], [0, 1, 1, 0])
  const caption3 = useTransform(scrollYProgress, [0.68, 0.78, 0.99, 1], [0, 1, 1, 1])

  if (reducedMotion) {
    return (
      <div ref={sectionRef} className="relative overflow-hidden bg-[#0b2015]">
        <Trunks className="absolute inset-0 h-full w-full opacity-70" />
        <div className="relative z-10 mx-auto flex max-w-2xl flex-col gap-14 px-6 py-24 text-center">
          {[
            ['300 ft up', 'The Canopy', 'Where the fog drinks first.'],
            ['the middle world', 'The Understory', 'Ferns the size of doorways. Light arrives secondhand.'],
            ['ground level', 'The Forest Floor', 'Where the amps get plugged in.'],
          ].map(([eyebrow, title, sub]) => (
            <div key={title}>
              <p className="eyebrow text-gold">{eyebrow}</p>
              <h3 className="font-display vintage-shadow mt-2 text-4xl text-cream">{title}</h3>
              <p className="mt-3 italic text-sand/90">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={sectionRef} className="relative h-[340vh]">
      <motion.div style={{ backgroundColor: bg }} className="sticky top-0 h-[100svh] overflow-hidden">
        {/* dying light from above */}
        <motion.div
          style={{ opacity: sunOpacity }}
          className="absolute inset-x-0 top-0 h-[55%] bg-[radial-gradient(ellipse_at_50%_-20%,rgba(233,185,73,0.5),rgba(233,185,73,0.12)_45%,transparent_70%)]"
        />

        {/* trunks run the whole descent */}
        <motion.div style={{ y: trunksY }} className="absolute inset-x-0 top-[-8%] h-[124%]">
          <Trunks className="h-full w-full opacity-80" />
        </motion.div>

        {/* canopy lifting away overhead (flipped so the crowns hang down) */}
        <motion.div style={{ y: canopyY2 }} className="absolute inset-x-0 top-0 h-[52%] opacity-70">
          <TreeLine seed={61} count={12} fill="#0a1f14" minH={0.5} maxH={0.9} className="h-full w-full" style={{ transform: 'scaleY(-1)' }} />
        </motion.div>
        <motion.div style={{ y: canopyY }} className="absolute inset-x-0 top-0 h-[58%]">
          <TreeLine seed={73} count={9} fill="#04100a" minH={0.6} maxH={1} className="h-full w-full" style={{ transform: 'scaleY(-1)' }} />
        </motion.div>

        {/* hanging mist */}
        <motion.div
          style={{ y: mistY }}
          className="lab-fog lab-fog--a left-[-25%] top-[38%] h-[30%] w-[150%] bg-[radial-gradient(closest-side,rgba(239,230,207,0.13),transparent_70%)]"
        />

        {/* forest floor: a low mist glow so the ferns silhouette against it */}
        <motion.div style={{ opacity: groundOpacity }} className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-t from-[#030b07] via-[#030b07cc] to-transparent" />
        <motion.div
          style={{ opacity: groundOpacity }}
          className="absolute inset-x-0 bottom-0 h-[28%] bg-[radial-gradient(ellipse_at_50%_100%,rgba(233,185,73,0.10),rgba(239,230,207,0.05)_55%,transparent_80%)]"
        />
        <motion.div style={{ y: fernsY }} className="absolute inset-x-0 bottom-0 h-[42%]">
          <FernBed seed={45} count={16} fill="#0d241a" className="h-full w-full" />
        </motion.div>

        {/* fireflies at the bottom of the descent */}
        <motion.div style={{ opacity: firefliesOpacity }} className="absolute inset-0" aria-hidden="true">
          {FIREFLY_SPOTS.map((f, i) => (
            <span
              key={i}
              className="lab-star"
              style={{
                left: `${f.left}%`,
                top: `${f.top}%`,
                width: f.size,
                height: f.size,
                background: '#e9b949',
                boxShadow: '0 0 6px 2px rgba(233,185,73,0.4)',
                animationDelay: `${f.delay}s`,
                animationDuration: `${f.duration}s`,
              }}
            />
          ))}
        </motion.div>

        <Caption opacity={caption1} eyebrow="300 ft up" title="The Canopy" sub="Where the fog drinks first." />
        <Caption opacity={caption2} eyebrow="the middle world" title="The Understory" sub="Ferns the size of doorways. Light arrives secondhand." />
        <Caption opacity={caption3} eyebrow="ground level" title="The Forest Floor" sub="Where the amps get plugged in." />

        {/* progress rail */}
        <div className="absolute bottom-[4%] right-5 top-[4%] w-px bg-rust/25" aria-hidden="true">
          <motion.span style={{ top: railTop }} className="absolute -left-[3px] h-[7px] w-[7px] rounded-full bg-gold" />
        </div>
      </motion.div>
    </div>
  )
}
