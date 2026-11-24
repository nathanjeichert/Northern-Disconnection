'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { PLACES } from '@/lib/world/places'
import { mulberry } from '@/lib/world/paint'
import PlaceIcon from './place-icon'

/*
  The fold-out trail map: the whole site on one sheet. Drawn in code like
  the park maps handed out at a ranger station — contour lines, a river,
  stands of timber, a dotted trail — with each page as a labelled stop.
  Two layouts share the stops: a wide sheet, and a tall one for phones.
*/

interface Props {
  here: number
  onClose: () => void
}

type Pt = [number, number]

/** Stop positions, in percent of the sheet: [wide x, wide y, tall x, tall y]. */
const STOPS: [number, number, number, number][] = [
  [14, 73, 27, 24],
  [34, 46, 71, 35],
  [54, 71, 30, 47.5],
  [72, 43, 70, 60],
  [89, 27, 36, 72.5],
]

/** Smooth path through points (Catmull-Rom → cubic Béziers). */
function through(pts: Pt[]): string {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

function buildArt(w: number, h: number, stops: Pt[], seed: number) {
  const r = mulberry(seed)
  const R = (a: number, b: number) => a + (b - a) * r()

  // contour lines: nested, wobbling rings around a few summits
  const contours: string[] = []
  const hills: [number, number, number][] = [
    [w * 0.88, h * 0.2, Math.min(w, h) * 0.42],
    [w * 0.2, h * 0.3, Math.min(w, h) * 0.34],
    [w * 0.55, h * 0.95, Math.min(w, h) * 0.36],
    [w * 0.02, h * 0.9, Math.min(w, h) * 0.26],
  ]
  for (const [cx, cy, rad] of hills) {
    const p1 = R(0, 6.28)
    const p2 = R(0, 6.28)
    const rings = 6
    for (let k = 1; k <= rings; k++) {
      const rr = (rad * k) / rings
      const pts: Pt[] = []
      const n = 44
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2
        const wob = 1 + 0.16 * Math.sin(a * 3 + p1 + k * 0.4) + 0.1 * Math.sin(a * 5 + p2 - k * 0.3)
        pts.push([cx + Math.cos(a) * rr * wob * 1.15, cy + Math.sin(a) * rr * wob * 0.9])
      }
      contours.push(through(pts))
    }
  }

  // the trail: through every stop, with a little wander between them
  const trailPts: Pt[] = []
  stops.forEach((s, i) => {
    trailPts.push(s)
    const n = stops[i + 1]
    if (!n) return
    const mx = (s[0] + n[0]) / 2
    const my = (s[1] + n[1]) / 2
    const dx = n[0] - s[0]
    const dy = n[1] - s[1]
    const len = Math.hypot(dx, dy)
    const bow = (i % 2 ? 1 : -1) * len * 0.14
    trailPts.push([mx - (dy / len) * bow, my + (dx / len) * bow])
  })
  const lead: Pt = [stops[0][0] - w * 0.16, stops[0][1] + h * 0.1]
  const trail = through([lead, ...trailPts])

  // the river crosses under the trail near base camp
  const tall = h > w
  const river = tall
    ? through([[w * 1.05, h * 0.5], [w * 0.86, h * 0.56], [w * 0.9, h * 0.66], [w * 0.62, h * 0.73], [w * 0.7, h * 0.86], [w * 0.5, h * 1.02]])
    : through([[w * 0.5, h * -0.04], [w * 0.57, h * 0.14], [w * 0.5, h * 0.3], [w * 0.64, h * 0.42], [w * 0.6, h * 0.58], [w * 0.78, h * 0.7], [w * 0.76, h * 1.04]])

  // stands of timber, kept off the stops
  const trees: { x: number; y: number; s: number }[] = []
  let guard = 0
  while (trees.length < (tall ? 70 : 90) && guard++ < 2000) {
    const x = R(w * 0.04, w * 0.96)
    const y = R(h * 0.2, h * 0.9)
    if (stops.some((s) => Math.hypot(s[0] - x, (s[1] - y) * 0.8) < Math.min(w, h) * 0.13)) continue
    if (trailPts.some((s) => Math.hypot(s[0] - x, s[1] - y) < Math.min(w, h) * 0.05)) continue
    trees.push({ x, y, s: R(0.7, 1.25) })
    // trees come in clumps
    const clump = Math.floor(R(1, 5))
    for (let k = 0; k < clump; k++) trees.push({ x: x + R(-26, 26), y: y + R(-14, 14), s: R(0.6, 1.1) })
  }
  trees.sort((a, b) => a.y - b.y)

  return { contours, trail, river, trees }
}

function Art({ w, h, stops, seed, className }: { w: number; h: number; stops: Pt[]; seed: number; className: string }) {
  const art = useMemo(() => buildArt(w, h, stops, seed), [w, h, stops, seed])
  const unit = Math.min(w, h) / 600
  const tall = h > w
  const cx = tall ? w * 0.84 : w * 0.925
  const cy = tall ? h * 0.9 : h * 0.72
  const cr = 30 * unit
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      {/* the neat line */}
      <rect x={14 * unit} y={14 * unit} width={w - 28 * unit} height={h - 28 * unit} fill="none" stroke="#10241a" strokeWidth={3 * unit} />
      <rect x={21 * unit} y={21 * unit} width={w - 42 * unit} height={h - 42 * unit} fill="none" stroke="#10241a" strokeWidth={1 * unit} />
      <clipPath id={`clip-${seed}`}>
        <rect x={22 * unit} y={22 * unit} width={w - 44 * unit} height={h - 44 * unit} />
      </clipPath>
      <g clipPath={`url(#clip-${seed})`}>
        <g fill="none" stroke="#c9a877" strokeWidth={1.3 * unit} opacity={0.75}>
          {art.contours.map((d, i) => (
            <path key={i} d={d} strokeWidth={(i % 6 === 5 ? 2.2 : 1.2) * unit} />
          ))}
        </g>
        <path d={art.river} fill="none" stroke="#10241a" strokeWidth={17 * unit} strokeLinecap="round" opacity={0.85} />
        <path d={art.river} fill="none" stroke="#9cc7bd" strokeWidth={13 * unit} strokeLinecap="round" />
        <g fill="#2f5d3f">
          {art.trees.map((t, i) => {
            const s = t.s * 9 * unit
            return <path key={i} d={`M${t.x} ${t.y - s * 2.3}l${s * 0.75} ${s * 1.1}h${-s * 0.35}l${s * 0.6} ${s * 1.2}h${-s * 2}l${s * 0.6} ${-s * 1.2}h${-s * 0.35}z`} />
          })}
        </g>
        <path d={art.trail} fill="none" stroke="#f2e8cf" strokeWidth={9 * unit} strokeLinecap="round" />
        <path d={art.trail} className="trail-map__path" fill="none" stroke="#8a3b27" strokeWidth={5 * unit} strokeLinecap="round" strokeDasharray={`${1 * unit} ${13 * unit}`} />
      </g>
      {/* compass */}
      <g transform={`translate(${cx} ${cy})`} stroke="#10241a" fill="#10241a">
        <circle r={cr} fill="#f2e8cf" strokeWidth={2 * unit} />
        <circle r={cr * 0.72} fill="none" strokeWidth={0.8 * unit} />
        <path d={`M0 ${-cr * 1.15}L${cr * 0.2} 0L0 ${cr * 1.15}L${-cr * 0.2} 0Z`} stroke="none" />
        <path d={`M${-cr * 0.86} 0L0 ${-cr * 0.16}L${cr * 0.86} 0L0 ${cr * 0.16}Z`} fill="#8a3b27" stroke="none" />
        <text y={-cr * 1.3} textAnchor="middle" fontSize={15 * unit} fontWeight={700} stroke="none">
          N
        </text>
      </g>
    </svg>
  )
}

export default function TrailMap({ here, onClose }: Props) {
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab' || !sheet.current) return
      // keep focus on the sheet while it is open
      const items = sheet.current.querySelectorAll<HTMLElement>('a, button')
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.paddingRight = `${scrollbar}px`
    sheet.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
      document.documentElement.style.paddingRight = ''
    }
  }, [onClose])

  const wide = useMemo(() => STOPS.map(([x, y]) => [x * 12, y * 8] as Pt), [])
  const tall = useMemo(() => STOPS.map(([, , x, y]) => [x * 6.2, y * 10] as Pt), [])

  return (
    <div className="trail-map" role="dialog" aria-modal="true" aria-label="Trail map — site navigation" onClick={onClose}>
      <div ref={sheet} className="trail-map__sheet" onClick={(e) => e.stopPropagation()}>
        <Art w={1200} h={800} stops={wide} seed={1936} className="trail-map__art trail-map__art--wide" />
        <Art w={620} h={1000} stops={tall} seed={1937} className="trail-map__art trail-map__art--tall" />

        <div className="trail-map__title">
          <p>Northern Disconnection</p>
          <h2>Trail Map</h2>
        </div>

        <button type="button" className="trail-map__close" onClick={onClose}>
          <span aria-hidden="true">✕</span> Close
        </button>

        <nav aria-label="Pages">
          {PLACES.map((place, i) => (
            <Link
              key={place.id}
              href={place.path}
              className="map-stop"
              aria-current={i === here ? 'page' : undefined}
              onClick={i === here ? onClose : undefined}
              style={
                {
                  '--x': `${STOPS[i][0]}%`,
                  '--y': `${STOPS[i][1]}%`,
                  '--tx': `${STOPS[i][2]}%`,
                  '--ty': `${STOPS[i][3]}%`,
                  '--i': i,
                } as React.CSSProperties
              }
            >
              {i === here && <span className="map-stop__here">You are here</span>}
              <span className="map-stop__badge">
                <PlaceIcon id={place.id} />
              </span>
              <span className="map-stop__label">{place.label}</span>
              <span className="map-stop__name">{place.name}</span>
            </Link>
          ))}
        </nav>

        <div className="trail-map__foot">
          <a href="mailto:booking@northerndisconnection.com">booking@northerndisconnection.com</a>
          <ul>
            <li>
              <a href="#register" onClick={onClose}>
                Mailing list
              </a>
            </li>
            <li>
              <a href="https://www.instagram.com/northerndisconnection" target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
            </li>
            <li>
              <a href="https://www.youtube.com/channel/UCOpZMRlcndhoCcN1knIHIHA" target="_blank" rel="noopener noreferrer">
                YouTube
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
