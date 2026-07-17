'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import { PALETTE, cappedDpr, makeRng } from './support'

/*
  Specimen 03 — a redwood stump cross-section as an audio visualizer.
  An AnalyserNode feeds live frequency data into 44 hand-wobbled growth
  rings: bass swells the heartwood, treble shimmers the sapwood. It tries
  to stream the band's real G-Fest soundboard from the Internet Archive
  (CORS-clean, so the analyser can read it); if the stream is unavailable
  it falls back to a small synthesized drone so the rings always dance.
*/

const ARCHIVE_ID = 'ND2025-09-27'
const RING_COUNT = 44
const SEGMENTS = 96

type SourceKind = 'idle' | 'loading' | 'archive' | 'drone'

interface Ring {
  base: number
  k1: number
  k2: number
  ph1: number
  ph2: number
  a1: number
  a2: number
  scar: boolean
  bin: number
}

const RINGS: Ring[] = (() => {
  const rng = makeRng(1856)
  return Array.from({ length: RING_COUNT }, (_, i) => ({
    base: 0.1 + 0.9 * Math.pow((i + 1) / RING_COUNT, 0.85),
    k1: 3 + Math.floor(rng() * 4),
    k2: 6 + Math.floor(rng() * 5),
    ph1: rng() * Math.PI * 2,
    ph2: rng() * Math.PI * 2,
    a1: 0.008 + rng() * 0.009,
    a2: 0.003 + rng() * 0.005,
    scar: i % 9 === 7,
    bin: 2 + Math.floor(Math.pow(i / RING_COUNT, 1.35) * 150),
  }))
})()

export default function TreeRings() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inView = useInView(wrapRef, { margin: '15% 0px 15% 0px' })
  const reducedMotion = useReducedMotion()

  const [playing, setPlaying] = useState(false)
  const [source, setSource] = useState<SourceKind>('idle')
  const [trackTitle, setTrackTitle] = useState<string | null>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const wiredElSource = useRef(false)
  const droneStopRef = useRef<(() => void) | null>(null)
  const playingRef = useRef(false)
  playingRef.current = playing

  // ---- drawing ----
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = cappedDpr(2)
    let size = 0
    const resize = () => {
      size = Math.min(wrap.getBoundingClientRect().width, 560)
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const freq = new Uint8Array(512)

    const draw = (t: number) => {
      const analyser = analyserRef.current
      const live = playingRef.current && analyser
      if (live) analyser.getByteFrequencyData(freq)

      ctx.clearRect(0, 0, size, size)
      const cx = size / 2
      const cy = size / 2
      const R = size * 0.44
      const rot = reducedMotion ? 0 : t * 0.03

      // stump face
      const face = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R)
      face.addColorStop(0, PALETTE.parchment)
      face.addColorStop(0.75, PALETTE.parchment)
      face.addColorStop(1, PALETTE.sand)
      ctx.beginPath()
      wobbleCircle(ctx, cx, cy, R * 1.04, rot * 0.4, 5, 0.016)
      ctx.fillStyle = face
      ctx.fill()
      ctx.lineWidth = R * 0.045
      ctx.strokeStyle = 'rgba(122,34,48,0.85)'
      ctx.stroke()

      // growth rings
      for (const ring of RINGS) {
        let v: number
        if (live) {
          v = Math.pow(freq[ring.bin] / 255, 1.3)
        } else if (reducedMotion) {
          v = 0.12
        } else {
          v = 0.1 + 0.1 * Math.sin(t * 1.1 - (ring.base * RING_COUNT) * 0.22)
        }

        ctx.beginPath()
        for (let s = 0; s <= SEGMENTS; s++) {
          const a = (s / SEGMENTS) * Math.PI * 2
          const wobble = ring.a1 * Math.sin(a * ring.k1 + ring.ph1) + ring.a2 * Math.sin(a * ring.k2 + ring.ph2)
          const r = R * (ring.base + wobble) * (1 + v * 0.05)
          const x = cx + Math.cos(a + rot) * r
          const y = cy + Math.sin(a + rot) * r
          if (s === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        if (ring.scar) {
          ctx.strokeStyle = `rgba(122,34,48,${0.26 + v * 0.5})`
          ctx.lineWidth = 2 + v * 2.6
        } else {
          ctx.strokeStyle = `rgba(29,64,48,${0.32 + v * 0.55})`
          ctx.lineWidth = 0.9 + v * 2
        }
        ctx.stroke()
      }

      // heartwood
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(2.5, R * 0.02), 0, Math.PI * 2)
      ctx.fillStyle = PALETTE.moss
      ctx.fill()
    }

    if (reducedMotion && !playing) {
      draw(0)
      return () => ro.disconnect()
    }

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      draw((now - start) / 1000)
      raf = requestAnimationFrame(tick)
    }
    if (inView) raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [inView, reducedMotion, playing])

  // ---- audio teardown on unmount ----
  useEffect(() => {
    return () => {
      droneStopRef.current?.()
      audioElRef.current?.pause()
      audioCtxRef.current?.close().catch(() => {})
    }
  }, [])

  const ensureContext = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.82
      analyser.connect(ctx.destination)
      audioCtxRef.current = ctx
      analyserRef.current = analyser
    }
    audioCtxRef.current.resume().catch(() => {})
    return { ctx: audioCtxRef.current, analyser: analyserRef.current! }
  }

  const startDrone = () => {
    const { ctx, analyser } = ensureContext()
    const master = ctx.createGain()
    master.gain.value = 0.0001
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 760
    filter.connect(master)
    master.connect(analyser)

    const stops: (() => void)[] = []
    const chord: [number, number][] = [[110, 0.16], [164.81, 0.13], [220, 0.11], [277.18, 0.07]]
    chord.forEach(([f, amp], i) => {
      const osc = ctx.createOscillator()
      osc.type = i % 2 ? 'triangle' : 'sawtooth'
      osc.frequency.value = f
      const g = ctx.createGain()
      g.gain.value = amp
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.05 + i * 0.03
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 2.4
      lfo.connect(lfoGain)
      lfoGain.connect(osc.detune)
      osc.connect(g)
      g.connect(filter)
      osc.start()
      lfo.start()
      stops.push(() => { osc.stop(); lfo.stop() })
    })
    master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 1.2)

    droneStopRef.current = () => {
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
      master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
      const s = stops
      setTimeout(() => s.forEach((stop) => stop()), 500)
      droneStopRef.current = null
    }
    setSource('drone')
    setTrackTitle('Redwood drone (synthesized stand-in)')
    setPlaying(true)
  }

  const startArchive = async () => {
    const { ctx, analyser } = ensureContext()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(`https://archive.org/metadata/${ARCHIVE_ID}`, { signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) throw new Error(`metadata ${res.status}`)
      const meta = await res.json()
      const files: { name: string; format?: string }[] = meta?.files ?? []
      const mp3 = files.find((f) => f.format === 'VBR MP3') ?? files.find((f) => f.name?.toLowerCase().endsWith('.mp3'))
      if (!mp3) throw new Error('no mp3 in item')

      const el = audioElRef.current ?? new Audio()
      if (!audioElRef.current) {
        el.crossOrigin = 'anonymous'
        el.preload = 'auto'
        audioElRef.current = el
      }
      el.src = `https://archive.org/download/${ARCHIVE_ID}/${encodeURIComponent(mp3.name)}`
      await el.play()
      if (!wiredElSource.current) {
        const node = ctx.createMediaElementSource(el)
        node.connect(analyser)
        wiredElSource.current = true
      }
      el.onended = () => setPlaying(false)

      // CORS-tainted media plays silent zeros — detect and fall back
      setTimeout(() => {
        const probe = new Uint8Array(64)
        analyser.getByteFrequencyData(probe)
        if (playingRef.current && probe.every((b) => b === 0)) {
          el.pause()
          startDrone()
        }
      }, 2500)

      setSource('archive')
      setTrackTitle(String(meta?.metadata?.title ?? 'Live at G-Fest 2025'))
      setPlaying(true)
    } catch {
      clearTimeout(timeout)
      startDrone()
    }
  }

  const toggle = () => {
    if (playing) {
      audioElRef.current?.pause()
      droneStopRef.current?.()
      audioCtxRef.current?.suspend().catch(() => {})
      setPlaying(false)
      return
    }
    if (source === 'archive' && audioElRef.current) {
      ensureContext()
      audioElRef.current.play().then(() => setPlaying(true)).catch(() => startDrone())
      return
    }
    if (source === 'drone' || source === 'idle' || source === 'loading') {
      if (source === 'drone') {
        startDrone()
        return
      }
      setSource('loading')
      startArchive()
    }
  }

  const statusLine =
    source === 'loading'
      ? 'Reaching the Internet Archive…'
      : source === 'archive'
        ? `Streaming “${trackTitle}” — soundboard via archive.org`
        : source === 'drone'
          ? 'Archive stream unavailable here — synthesized drone stand-in'
          : 'Every show adds a ring.'

  return (
    <div ref={wrapRef} className="flex flex-col items-center gap-6 px-4 py-10">
      <canvas ref={canvasRef} aria-label="Redwood growth rings pulsing with the music" role="img" />
      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={toggle} className="retro-button retro-button--sm">
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? 'Rest' : 'Let the rings play'}
        </button>
        <p className="max-w-md text-center text-xs italic text-sand/70">{statusLine}</p>
      </div>
    </div>
  )
}

function wobbleCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number, k: number, amp: number) {
  for (let s = 0; s <= SEGMENTS; s++) {
    const a = (s / SEGMENTS) * Math.PI * 2
    const rr = r * (1 + amp * Math.sin(a * k + 1.7))
    const x = cx + Math.cos(a + rot) * rr
    const y = cy + Math.sin(a + rot) * rr
    if (s === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}
