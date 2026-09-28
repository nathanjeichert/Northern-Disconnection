'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { archiveItemUrl, fetchArchiveShow, formatTime, type ArchiveShow } from '@/lib/archive'
import StumpVisualizer from './stump-visualizer'

/*
  The tape deck: a full player for one Internet Archive live recording.
  Tracklist, transport, seeking, and volume are standard; the visualizer
  is the redwood stump, fed by a Web Audio analyser tapped into the
  stream. Everything is per-item, so future tapes are just more
  <LiveTapePlayer identifier="..." /> instances.

  Streaming pipeline (per track, never sticky):
    1. "analysed": a crossOrigin <audio> routed through Web Audio
       (source → analyser → gain → speakers), tried on every stream host
       in turn — the item's datanodes first, archive.org/download last
       (the redirector bounces to dn* mirrors that intermittently 500).
    2. "plain": a bare <audio> (no CORS, no Web Audio) on the same hosts,
       used only when no analysed host works, the AudioContext can't run,
       or the analyser provably reads digital silence while the tape rolls.
  The next track always tries the analysed pipeline again. In plain mode
  the stump runs on a synthetic groove, so it never looks switched off.
*/

interface LiveTapePlayerProps {
  identifier: string
  /** Display fallback while metadata loads / if the item title is unwieldy. */
  fallbackTitle?: string
}

type LoadState = 'loading' | 'ready' | 'error'
type Pipeline = 'analysed' | 'plain'
type Attempt = 'ok' | 'error' | 'timeout' | 'blocked'

interface LoadOpts {
  /** Resume position in seconds. */
  position?: number
  /** Index into track.urls to start from. */
  fromHost?: number
  /** Skip the analysed pipeline for this load (this song only). */
  forcePlain?: boolean
}

const VOLUME_KEY = 'nd-player-volume'
/** A host that shows no loading progress for this long is abandoned for the next. */
const STALL_TIMEOUT_MS = 10000
/** Hard cap on one host's attempt to start (slow-but-moving hosts get this long). */
const ATTEMPT_MAX_MS = 45000
/** Start buffering the next song this many seconds before the current one ends. */
const PRELOAD_LEAD_S = 45
/** Taint probe: consecutive exact-zero reads (while the tape advances) that mean "no data". */
const PROBE_ZERO_LIMIT = 8
const PROBE_INTERVAL_MS = 400
const PROBE_MAX_CHECKS = 40

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

export default function LiveTapePlayer({ identifier, fallbackTitle = 'Live tape' }: LiveTapePlayerProps) {
  const [show, setShow] = useState<ArchiveShow | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [started, setStarted] = useState(false)
  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [ctxRunning, setCtxRunning] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [streamError, setStreamError] = useState(false)
  const [streamHost, setStreamHost] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)
  const [volume, setVolume] = useState(0.9)
  const [muted, setMuted] = useState(false)

  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  /** Two analysed elements (ping-pong) so the next song can buffer ahead. */
  const analysedElsRef = useRef<HTMLAudioElement[]>([])
  const analysedBrokenRef = useRef(false)
  const preloadRef = useRef<{ el: HTMLAudioElement; url: string; index: number } | null>(null)
  /** The first song, buffering quietly before the first tap (see prewarm). */
  const prewarmRef = useRef<{ el: HTMLAudioElement; url: string; index: number } | null>(null)
  const plainElRef = useRef<HTMLAudioElement | null>(null)
  const activeRef = useRef<HTMLAudioElement | null>(null)
  const modeRef = useRef<Pipeline>('analysed')
  const hostIdxRef = useRef(0)
  const genRef = useRef(0)
  const attemptingRef = useRef(false)
  const probeRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ctxWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingRef = useRef(false)
  const volumeRef = useRef(volume)
  const mutedRef = useRef(muted)

  const showRef = useRef<ArchiveShow | null>(null)
  showRef.current = show
  const trackIndexRef = useRef(0)

  // ---- metadata ----
  useEffect(() => {
    const controller = new AbortController()
    fetchArchiveShow(identifier, controller.signal)
      .then((data) => {
        setShow(data)
        setLoadState('ready')
        // warm up TLS to the datanodes before the first tap
        for (const url of data.tracks[0]?.urls.slice(0, 2) ?? []) {
          const origin = new URL(url).origin
          if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) continue
          const link = document.createElement('link')
          link.rel = 'preconnect'
          link.href = origin
          link.crossOrigin = 'anonymous'
          document.head.appendChild(link)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState('error')
      })
    return () => controller.abort()
  }, [identifier])

  // ---- volume plumbing ----
  /** Analysed elements stay at unity (the analyser sees the full signal, and
      the stump keeps dancing when muted); the gain node sets loudness. */
  const applyVolume = useCallback(() => {
    const v = mutedRef.current ? 0 : volumeRef.current
    const gain = gainRef.current
    const ctx = ctxRef.current
    if (gain && ctx) {
      try {
        gain.gain.setTargetAtTime(v, ctx.currentTime, 0.015)
      } catch {
        gain.gain.value = v
      }
    }
    for (const a of analysedElsRef.current) {
      if (!a) continue
      a.volume = 1
      a.muted = false
    }
    const p = plainElRef.current
    if (p) {
      p.volume = volumeRef.current
      p.muted = mutedRef.current
    }
  }, [])

  // ---- lazily-built audio graph ----
  const loadTrackRef = useRef<(index: number, opts?: LoadOpts) => Promise<void>>(async () => {})

  const recoverCtx = useCallback(() => {
    // An AudioContext that isn't running renders analysed audio silent.
    // Ask it to resume on the next gesture; if the tape is rolling through
    // it right now, give it a moment and then move the song to the plain
    // pipeline so the music stays audible.
    const ctx = ctxRef.current
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return
    const resumeOnGesture = () => {
      void ctx.resume().catch(() => {})
    }
    document.addEventListener('pointerdown', resumeOnGesture, { once: true, capture: true })
    document.addEventListener('keydown', resumeOnGesture, { once: true, capture: true })
    if (ctxWatchRef.current) clearTimeout(ctxWatchRef.current)
    ctxWatchRef.current = setTimeout(() => {
      ctxWatchRef.current = null
      const el = activeRef.current
      if (ctx.state === 'running' || !el || el.paused || modeRef.current !== 'analysed') return
      void loadTrackRef.current(trackIndexRef.current, {
        position: el.currentTime,
        forcePlain: true,
        fromHost: hostIdxRef.current,
      })
    }, 1500)
  }, [])

  /** Must be called synchronously inside a user gesture the first time. */
  const ensureContext = useCallback((): AudioContext | null => {
    if (!ctxRef.current) {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      try {
        const ctx = new Ctx()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048
        analyser.smoothingTimeConstant = 0.75
        const gain = ctx.createGain()
        analyser.connect(gain)
        gain.connect(ctx.destination)
        ctxRef.current = ctx
        analyserRef.current = analyser
        gainRef.current = gain
        ctx.onstatechange = () => {
          setCtxRunning(ctx.state === 'running')
          if (ctx.state !== 'running') recoverCtx()
        }
        setCtxRunning(ctx.state === 'running')
        applyVolume()
      } catch {
        return null
      }
    }
    const ctx = ctxRef.current
    if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {})
    return ctx
  }, [applyVolume, recoverCtx])

  const onEndedRef = useRef<() => void>(() => {})
  const maybePreloadRef = useRef<(el: HTMLAudioElement) => void>(() => {})
  const onStreamErrorRef = useRef<(el: HTMLAudioElement) => void>(() => {})

  const makeElement = useCallback((cors: boolean) => {
    const el = new Audio()
    if (cors) el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    const mine = () => activeRef.current === el
    el.addEventListener('timeupdate', () => {
      if (!mine()) return
      if (!draggingRef.current) setCurrentTime(el.currentTime)
      maybePreloadRef.current(el)
    })
    const onDuration = () => {
      if (mine() && Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration)
    }
    el.addEventListener('loadedmetadata', onDuration)
    el.addEventListener('durationchange', onDuration)
    el.addEventListener('play', () => mine() && setPlaying(true))
    el.addEventListener('pause', () => mine() && setPlaying(false))
    el.addEventListener('waiting', () => mine() && setBuffering(true))
    el.addEventListener('playing', () => {
      if (!mine()) return
      setBuffering(false)
      setPlaying(true)
    })
    el.addEventListener('canplay', () => mine() && setBuffering(false))
    el.addEventListener('ended', () => mine() && onEndedRef.current())
    el.addEventListener('error', () => {
      // attempts handle their own errors; this catches mid-song drops
      if (mine() && !attemptingRef.current) onStreamErrorRef.current(el)
    })
    return el
  }, [])

  /** Analysed element for `slot` (0 or 1), created and wired on first use. */
  const analysedSlot = useCallback(
    (slot: number): HTMLAudioElement | null => {
      if (analysedBrokenRef.current) return null
      const existing = analysedElsRef.current[slot]
      if (existing) return existing
      const ctx = ctxRef.current
      const analyser = analyserRef.current
      if (!ctx || !analyser) return null
      const el = makeElement(true)
      try {
        ctx.createMediaElementSource(el).connect(analyser)
      } catch {
        analysedBrokenRef.current = true
        return null
      }
      analysedElsRef.current[slot] = el
      applyVolume()
      return el
    },
    [applyVolume, makeElement]
  )

  /** The element to play `url` on: a matching preload, else the current analysed element. */
  const getAnalysedEl = useCallback(
    (url: string): HTMLAudioElement | null => {
      const pre = preloadRef.current
      if (pre && pre.url === url) return pre.el
      const active = activeRef.current
      if (active && analysedElsRef.current.includes(active)) return active
      return analysedSlot(0)
    },
    [analysedSlot]
  )

  const getPlainEl = useCallback((): HTMLAudioElement => {
    if (plainElRef.current) return plainElRef.current
    const el = makeElement(false)
    plainElRef.current = el
    applyVolume()
    return el
  }, [applyVolume, makeElement])

  // ---- signal probe ----
  const stopProbe = useCallback(() => {
    if (probeRef.current) clearInterval(probeRef.current)
    probeRef.current = null
  }, [])

  /**
   * A CORS-tainted MediaElementSource outputs exact digital zeros. Only
   * count reads taken while the tape is genuinely advancing (not paused,
   * seeking, or starved) and the context is running; any non-zero sample
   * clears the stream. Quiet intros are never *exactly* zero.
   */
  const armProbe = useCallback(
    (gen: number) => {
      stopProbe()
      const buf = new Float32Array(2048)
      let zeroRuns = 0
      let checks = 0
      let lastT = -1
      probeRef.current = setInterval(() => {
        if (gen !== genRef.current || modeRef.current !== 'analysed' || ++checks > PROBE_MAX_CHECKS) {
          stopProbe()
          return
        }
        const el = activeRef.current
        const analyser = analyserRef.current
        const ctx = ctxRef.current
        if (!el || !analyser || !ctx || el.paused || el.seeking || el.readyState < 3 || ctx.state !== 'running') {
          lastT = -1
          return
        }
        const t = el.currentTime
        const advancing = lastT >= 0 && t > lastT + 0.05
        lastT = t
        if (!advancing) return
        analyser.getFloatTimeDomainData(buf.subarray(0, analyser.fftSize))
        for (let i = 0; i < analyser.fftSize; i++) {
          if (buf[i] !== 0) {
            stopProbe()
            return
          }
        }
        if (++zeroRuns >= PROBE_ZERO_LIMIT) {
          stopProbe()
          void loadTrackRef.current(trackIndexRef.current, {
            position: el.currentTime,
            forcePlain: true,
            fromHost: hostIdxRef.current,
          })
        }
      }, PROBE_INTERVAL_MS)
    },
    [stopProbe]
  )

  // ---- loading ----
  /**
   * Starts `url` on `el`. Resolves 'ok' once playback begins, 'error' if the
   * host refuses it (HTTP error, CORS), 'timeout' if loading stalls, or
   * 'blocked' if the autoplay policy wants a fresh tap.
   */
  const attempt = useCallback(
    (el: HTMLAudioElement, url: string, position: number): Promise<Attempt> => {
      attemptingRef.current = true
      return new Promise<Attempt>((resolve) => {
        let settled = false
        const progressEvents = ['progress', 'loadedmetadata', 'loadeddata', 'canplay'] as const
        const done = (r: Attempt) => {
          if (settled) return
          settled = true
          clearTimeout(stall)
          clearTimeout(cap)
          el.removeEventListener('error', onError)
          el.removeEventListener('loadedmetadata', onMeta)
          for (const ev of progressEvents) el.removeEventListener(ev, onProgress)
          resolve(r)
        }
        const onError = () => done('error')
        const seek = () => {
          if (position > 0 && Math.abs(el.currentTime - position) > 0.5) {
            try {
              el.currentTime = position
            } catch {
              // seeking before data is best-effort
            }
          }
        }
        const onMeta = () => seek()
        // slow hosts are fine as long as bytes keep arriving
        let stall = setTimeout(() => done('timeout'), STALL_TIMEOUT_MS)
        const onProgress = () => {
          clearTimeout(stall)
          stall = setTimeout(() => done('timeout'), STALL_TIMEOUT_MS)
        }
        const cap = setTimeout(() => done('timeout'), ATTEMPT_MAX_MS)
        el.addEventListener('error', onError)
        el.addEventListener('loadedmetadata', onMeta)
        for (const ev of progressEvents) el.addEventListener(ev, onProgress)
        const pre = preloadRef.current
        if (pre && pre.el === el && pre.url === url && !el.error) {
          // buffered ahead of time: keep what's loaded
          preloadRef.current = null
          if (el.readyState >= 1) seek()
        } else {
          if (pre?.el === el) preloadRef.current = null
          el.src = url
        }
        el.play().then(
          () => done('ok'),
          (e: unknown) => done((e as { name?: string })?.name === 'NotAllowedError' ? 'blocked' : 'error')
        )
      })
    },
    []
  )

  const loadTrack = useCallback(
    async (index: number, opts: LoadOpts = {}) => {
      const track = showRef.current?.tracks[index]
      if (!track) return
      const gen = ++genRef.current
      const position = opts.position ?? 0
      stopProbe()
      trackIndexRef.current = index
      setTrackIndex(index)
      setStarted(true)
      setNeedsTap(false)
      setStreamError(false)
      if (position === 0) setCurrentTime(0)
      setDuration(track.seconds)
      setBuffering(true)
      for (const el of analysedElsRef.current) el?.pause()
      plainElRef.current?.pause()

      const urls = track.urls.length > 0 ? track.urls : [track.url]
      const first = Math.min(Math.max(opts.fromHost ?? 0, 0), urls.length - 1)
      const lanes: Pipeline[] = opts.forcePlain ? ['plain'] : ['analysed', 'plain']

      for (const lane of lanes) {
        for (let i = first; i < urls.length; i++) {
          const el = lane === 'analysed' ? getAnalysedEl(urls[i]) : getPlainEl()
          if (!el) break
          activeRef.current = el
          modeRef.current = lane
          hostIdxRef.current = i
          setPipeline(lane)
          setStreamHost(hostOf(urls[i]))
          const result = await attempt(el, urls[i], position)
          if (gen !== genRef.current) return
          attemptingRef.current = false
          if (result === 'blocked') {
            // autoplay policy wants a fresh tap; the element is primed
            setNeedsTap(true)
            setBuffering(false)
            setPlaying(false)
            return
          }
          if (result !== 'ok') {
            el.pause()
            continue
          }
          if (lane === 'analysed') {
            const ctx = ctxRef.current
            if (ctx && ctx.state !== 'running') recoverCtx()
            armProbe(gen)
          }
          return
        }
      }
      // every host refused this song
      if (gen === genRef.current) {
        attemptingRef.current = false
        setStreamError(true)
        setBuffering(false)
        setPlaying(false)
      }
    },
    [armProbe, attempt, getAnalysedEl, getPlainEl, recoverCtx, stopProbe]
  )
  loadTrackRef.current = loadTrack

  /** Entry point from user gestures: builds the context inside the gesture. */
  const startTrack = useCallback(
    (index: number) => {
      ensureContext()
      // adopt the pre-buffered first song as the analysed element, so the
      // first tap plays from what's already downloaded
      const warm = prewarmRef.current
      if (warm) {
        prewarmRef.current = null
        const ctx = ctxRef.current
        const analyser = analyserRef.current
        let adopted = false
        if (warm.index === index && ctx && analyser && !warm.el.error && !analysedElsRef.current[0] && !analysedBrokenRef.current) {
          try {
            ctx.createMediaElementSource(warm.el).connect(analyser)
            analysedElsRef.current[0] = warm.el
            preloadRef.current = warm
            applyVolume()
            adopted = true
          } catch {
            // fall through: the song loads fresh
          }
        }
        if (!adopted) {
          warm.el.removeAttribute('src')
          warm.el.load()
        }
      }
      // touch every element inside the gesture so strict autoplay policies
      // (iOS) let them start later on their own — the preloaded next song,
      // or the plain fallback
      for (const el of [analysedSlot(1), getPlainEl()]) {
        if (el && !el.getAttribute('src')) el.load()
      }
      void loadTrack(index)
    },
    [analysedSlot, applyVolume, ensureContext, getPlainEl, loadTrack]
  )

  maybePreloadRef.current = (el) => {
    // buffer the next song on the idle analysed element so the show flows
    // on without a cueing gap (archive datanodes can be slow to start)
    const tracks = showRef.current?.tracks
    const nextIndex = trackIndexRef.current + 1
    if (!tracks || nextIndex >= tracks.length || analysedBrokenRef.current) return
    if (!Number.isFinite(el.duration) || el.duration - el.currentTime > PRELOAD_LEAD_S) return
    const url = tracks[nextIndex].urls[0] ?? tracks[nextIndex].url
    if (preloadRef.current?.index === nextIndex) return
    const slot = analysedElsRef.current[0] === activeRef.current ? 1 : 0
    const idle = analysedSlot(slot)
    if (!idle || idle === activeRef.current) return
    preloadRef.current = { el: idle, url, index: nextIndex }
    idle.preload = 'auto'
    idle.src = url
    idle.load()
  }

  onEndedRef.current = () => {
    const tracks = showRef.current?.tracks
    if (tracks && trackIndexRef.current < tracks.length - 1) {
      void loadTrack(trackIndexRef.current + 1)
    } else {
      setPlaying(false)
    }
  }

  onStreamErrorRef.current = (el) => {
    // mid-song network drop: resume from the same spot on the next host
    const urls = showRef.current?.tracks[trackIndexRef.current]?.urls ?? []
    const nextHost = hostIdxRef.current + 1
    if (nextHost < urls.length) {
      void loadTrack(trackIndexRef.current, {
        position: el.currentTime,
        fromHost: nextHost,
        forcePlain: modeRef.current === 'plain',
      })
    } else if (modeRef.current === 'analysed') {
      void loadTrack(trackIndexRef.current, { position: el.currentTime, forcePlain: true })
    } else {
      setStreamError(true)
      setPlaying(false)
    }
  }

  const toggle = useCallback(() => {
    const el = activeRef.current
    if (!el || !el.src || streamError) {
      startTrack(trackIndexRef.current)
      return
    }
    if (el.paused) {
      if (modeRef.current === 'analysed') ensureContext()
      setNeedsTap(false)
      void el.play().catch((e: unknown) => {
        if ((e as { name?: string })?.name === 'NotAllowedError') setNeedsTap(true)
        else onStreamErrorRef.current(el)
      })
    } else {
      el.pause()
    }
  }, [ensureContext, startTrack, streamError])

  const previous = useCallback(() => {
    const el = activeRef.current
    if (el && el.currentTime > 3) {
      el.currentTime = 0
      setCurrentTime(0)
      return
    }
    if (trackIndexRef.current > 0) startTrack(trackIndexRef.current - 1)
    else if (el) {
      el.currentTime = 0
      setCurrentTime(0)
    }
  }, [startTrack])

  const next = useCallback(() => {
    const tracks = showRef.current?.tracks
    if (tracks && trackIndexRef.current < tracks.length - 1) startTrack(trackIndexRef.current + 1)
  }, [startTrack])

  const seekTo = useCallback((value: number) => {
    const el = activeRef.current
    if (el && Number.isFinite(value)) {
      el.currentTime = value
      setCurrentTime(value)
    }
  }, [])

  // ---- volume ----
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VOLUME_KEY)
      if (saved !== null) {
        const v = Number(saved)
        if (v >= 0 && v <= 1) setVolume(v)
      }
    } catch {
      // storage is a convenience only
    }
  }, [])

  useEffect(() => {
    volumeRef.current = volume
    mutedRef.current = muted
    applyVolume()
  }, [volume, muted, applyVolume])

  const changeVolume = useCallback((v: number) => {
    setVolume(v)
    setMuted(v === 0)
    try {
      window.localStorage.setItem(VOLUME_KEY, String(v))
    } catch {
      // storage is a convenience only
    }
  }, [])

  // ---- lock-screen / hardware-key controls ----
  useEffect(() => {
    if (!('mediaSession' in navigator) || !show) return
    const track = show.tracks[trackIndex]
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track?.title ?? fallbackTitle,
        artist: 'Northern Disconnection',
        album: show.title,
        artwork: [{ src: '/band-photos/gfest-live.jpg', sizes: '1744x902', type: 'image/jpeg' }],
      })
      navigator.mediaSession.setActionHandler('play', () => toggle())
      navigator.mediaSession.setActionHandler('pause', () => toggle())
      navigator.mediaSession.setActionHandler('previoustrack', () => previous())
      navigator.mediaSession.setActionHandler('nexttrack', () => next())
      navigator.mediaSession.setActionHandler('seekto', (e) => {
        if (e.seekTime != null) seekTo(e.seekTime)
      })
    } catch {
      // media session is progressive enhancement only
    }
  }, [show, trackIndex, fallbackTitle, next, previous, seekTo, toggle])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.playbackState = playing ? 'playing' : started ? 'paused' : 'none'
    } catch {
      // progressive enhancement
    }
  }, [playing, started])

  // ---- prewarm ----
  // Archive datanodes can take 10–20 s to start a stream. While the visitor
  // reads the page, quietly buffer the first song on a CORS element; the
  // first tap adopts it (startTrack) instead of starting from zero. Skipped
  // under Save-Data. iOS ignores preload, which is harmless.
  useEffect(() => {
    if (!show) return
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (conn?.saveData) return
    const first = show.tracks[0]
    const url = first?.urls[0] ?? first?.url
    if (!url) return
    const timer = setTimeout(() => {
      if (activeRef.current || prewarmRef.current) return
      const el = makeElement(true)
      el.src = url
      el.load()
      prewarmRef.current = { el, url, index: 0 }
    }, 800)
    return () => clearTimeout(timer)
  }, [show, makeElement])

  // ---- teardown ----
  useEffect(() => {
    return () => {
      genRef.current++
      if (probeRef.current) clearInterval(probeRef.current)
      if (ctxWatchRef.current) clearTimeout(ctxWatchRef.current)
      for (const el of [...analysedElsRef.current, plainElRef.current, prewarmRef.current?.el]) {
        if (!el) continue
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
      void ctxRef.current?.close().catch(() => {})
    }
  }, [])

  const track = show?.tracks[trackIndex]
  const effectiveDuration = duration ?? track?.seconds ?? null
  const progress =
    effectiveDuration && effectiveDuration > 0 ? Math.min(1, Math.max(0, currentTime / effectiveDuration)) : 0
  const synthetic = pipeline !== 'analysed' || !ctxRunning

  const status = streamError
    ? 'this song won’t load right now — try another, or open the tape on archive.org'
    : needsTap
      ? 'tap play to keep the tape rolling'
      : buffering && started
        ? 'cueing the tape…'
        : playing
          ? 'soundboard tape · streaming from the internet archive'
          : started
            ? 'paused — tap the stump to pick it back up'
            : show
              ? `${show.tracks.length} songs · tap the stump or press play`
              : ' '

  if (loadState === 'error') {
    return (
      <div className="border-2 border-rust/50 bg-pine/60 p-2 shadow-[8px_8px_0_rgba(215,180,138,0.25)] sm:p-3">
        <div className="px-3 py-4 text-center text-sm italic text-sand/80">
          The tape deck couldn&apos;t reach the Internet Archive just now — here&apos;s the reserve player.
        </div>
        <iframe
          src={`https://archive.org/embed/${identifier}?playlist=1&list_height=180`}
          title={fallbackTitle}
          className="h-[340px] w-full md:h-[380px]"
          frameBorder="0"
          allow="autoplay"
          allowFullScreen
        />
        <div className="py-3 text-center">
          <a
            href={archiveItemUrl(identifier)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs uppercase tracking-[0.2em] text-rust hover:text-gold"
          >
            open on archive.org ↗
          </a>
        </div>
      </div>
    )
  }

  return (
    <div
      className="border-2 border-rust/50 bg-pine/60 shadow-[8px_8px_0_rgba(215,180,138,0.25)]"
      data-pipeline={pipeline ?? 'idle'}
      data-audio-context={ctxRunning ? 'running' : 'stopped'}
      data-stream-host={streamHost || undefined}
    >
      <div className="flex flex-col items-center px-4 pt-7 sm:px-8 sm:pt-9">
        <StumpVisualizer
          analyserRef={analyserRef}
          playing={playing}
          synthetic={synthetic}
          progress={progress}
          onToggle={loadState === 'ready' ? toggle : undefined}
          className="w-full max-w-[460px]"
        />

        <p className="eyebrow mt-6 text-center text-[0.62rem] text-rust/70">
          {track ? `Song ${String(trackIndex + 1).padStart(2, '0')} of ${show?.tracks.length ?? ''}` : ' '}
        </p>
        <h2 className="font-display mt-1 text-center text-2xl text-cream sm:text-3xl">
          {track?.title ?? fallbackTitle}
        </h2>
        <p className="mt-1.5 min-h-[1.25rem] text-center text-xs italic text-sand/60" aria-live="polite">
          {status}
        </p>

        {/* transport */}
        <div className="mt-5 flex items-center gap-4">
          <button
            type="button"
            onClick={previous}
            disabled={loadState !== 'ready'}
            aria-label="Previous track"
            className="nd-transport"
          >
            <SkipBack size={18} />
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={loadState !== 'ready'}
            aria-label={playing ? 'Pause' : 'Play'}
            className="nd-transport nd-transport--main"
          >
            {playing ? <Pause size={24} /> : <Play size={24} className="translate-x-[2px]" />}
          </button>
          <button
            type="button"
            onClick={next}
            disabled={loadState !== 'ready' || !show || trackIndex >= show.tracks.length - 1}
            aria-label="Next track"
            className="nd-transport"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* seek */}
        <div className="mt-6 flex w-full max-w-xl items-center gap-3">
          <span className="w-12 text-right text-xs tabular-nums text-sand/70">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="nd-range flex-1"
            min={0}
            max={effectiveDuration ?? 100}
            step={0.5}
            value={Math.min(currentTime, effectiveDuration ?? currentTime)}
            aria-label="Seek within song"
            disabled={!track || !started}
            onPointerDown={() => {
              draggingRef.current = true
            }}
            onPointerUp={() => {
              draggingRef.current = false
            }}
            onChange={(e) => seekTo(Number(e.target.value))}
          />
          <span className="w-12 text-xs tabular-nums text-sand/70">{formatTime(effectiveDuration)}</span>
        </div>

        {/* volume + credit */}
        <div className="mb-2 mt-3 flex w-full max-w-xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="p-1 text-sand/80 transition-colors hover:text-gold"
            >
              {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <input
              type="range"
              className="nd-range w-24 sm:w-28"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(e) => changeVolume(Number(e.target.value))}
            />
          </div>
          <a
            href={archiveItemUrl(identifier)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.2em] text-rust/80 transition-colors hover:text-gold"
          >
            <ExternalLink size={11} />
            tape on archive.org
          </a>
        </div>
      </div>

      {/* setlist */}
      <ol className="mt-4 border-t-2 border-rust/25">
        {loadState === 'loading' &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="nd-skeleton mx-4 my-4 h-5 sm:mx-6" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        {show?.tracks.map((t, i) => {
          const active = i === trackIndex
          return (
            <li key={t.file} className="border-b border-rust/15 last:border-b-0">
              <button
                type="button"
                onClick={() => (active && started ? toggle() : startTrack(i))}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-6 ${
                  active ? 'bg-[rgba(233,185,73,0.07)]' : 'hover:bg-[rgba(233,185,73,0.04)]'
                }`}
              >
                <span className="w-6 shrink-0 text-xs tabular-nums text-rust/70">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={`flex-1 truncate text-sm sm:text-base ${active ? 'text-gold' : 'text-sand group-hover:text-cream'}`}>
                  {t.title}
                </span>
                {active && playing && (
                  <span className="nd-eq shrink-0" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
                {active && started && !playing && (
                  <Pause size={12} className="shrink-0 text-gold/70" aria-hidden="true" />
                )}
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-sand/50">
                  {formatTime(t.seconds)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
