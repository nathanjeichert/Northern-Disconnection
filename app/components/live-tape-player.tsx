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

  Streams are requested with CORS so the analyser can read them (Archive
  serves the headers). If a file ever comes back uncooperative, playback
  rebuilds on a plain <audio> pipeline — music keeps playing, the stump
  falls back to its idle breathing.
*/

interface LiveTapePlayerProps {
  identifier: string
  /** Display fallback while metadata loads / if the item title is unwieldy. */
  fallbackTitle?: string
}

type LoadState = 'loading' | 'ready' | 'error'

const VOLUME_KEY = 'nd-player-volume'

export default function LiveTapePlayer({ identifier, fallbackTitle = 'Live tape' }: LiveTapePlayerProps) {
  const [show, setShow] = useState<ArchiveShow | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [synthetic, setSynthetic] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)
  const [volume, setVolume] = useState(0.9)
  const [muted, setMuted] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const detachRef = useRef<(() => void) | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const wiredRef = useRef(false)
  const plainModeRef = useRef(false)
  const draggingRef = useRef(false)
  const probeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showRef = useRef<ArchiveShow | null>(null)
  showRef.current = show
  const trackIndexRef = useRef(0)
  trackIndexRef.current = trackIndex

  // ---- metadata ----
  useEffect(() => {
    const controller = new AbortController()
    fetchArchiveShow(identifier, controller.signal)
      .then((data) => {
        setShow(data)
        setLoadState('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState('error')
      })
    return () => controller.abort()
  }, [identifier])

  // ---- element lifecycle ----
  const attachListeners = useCallback((el: HTMLAudioElement) => {
    const onTime = () => {
      if (!draggingRef.current) setCurrentTime(el.currentTime)
    }
    const onDuration = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onWaiting = () => setBuffering(true)
    const onPlaying = () => setBuffering(false)
    const onEnded = () => {
      const tracks = showRef.current?.tracks
      if (tracks && trackIndexRef.current < tracks.length - 1) {
        void startTrackRef.current(trackIndexRef.current + 1)
      } else {
        setPlaying(false)
      }
    }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onDuration)
    el.addEventListener('durationchange', onDuration)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('waiting', onWaiting)
    el.addEventListener('playing', onPlaying)
    el.addEventListener('ended', onEnded)
    detachRef.current = () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onDuration)
      el.removeEventListener('durationchange', onDuration)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('waiting', onWaiting)
      el.removeEventListener('playing', onPlaying)
      el.removeEventListener('ended', onEnded)
    }
  }, [])

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current
    const el = new Audio()
    if (!plainModeRef.current) el.crossOrigin = 'anonymous'
    el.preload = 'metadata'
    attachListeners(el)
    audioRef.current = el
    return el
  }, [attachListeners])

  const ensureContext = useCallback(() => {
    if (plainModeRef.current) return
    if (!ctxRef.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) {
        plainModeRef.current = true
        setSynthetic(true)
        return
      }
      const ctx = new Ctx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.75
      analyser.connect(ctx.destination)
      ctxRef.current = ctx
      analyserRef.current = analyser
    }
    void ctxRef.current.resume().catch(() => {})
  }, [])

  const wireAnalyser = useCallback((el: HTMLAudioElement) => {
    if (wiredRef.current || plainModeRef.current || !ctxRef.current || !analyserRef.current) return
    try {
      const source = ctxRef.current.createMediaElementSource(el)
      source.connect(analyserRef.current)
      wiredRef.current = true
    } catch {
      plainModeRef.current = true
      setSynthetic(true)
    }
  }, [])

  /** Swap to a plain (non-CORS, non-analysed) pipeline without losing the place. */
  const rebuildPlain = useCallback(
    (position: number, autoplay: boolean) => {
      plainModeRef.current = true
      setSynthetic(true)
      const old = audioRef.current
      detachRef.current?.()
      old?.pause()
      audioRef.current = null
      wiredRef.current = false

      const tracks = showRef.current?.tracks
      const track = tracks?.[trackIndexRef.current]
      if (!track) return
      const el = ensureAudio()
      el.volume = volume
      el.muted = muted
      el.src = track.url
      if (position > 0) {
        el.addEventListener('loadedmetadata', () => { el.currentTime = position }, { once: true })
      }
      if (autoplay) void el.play().catch(() => setPlaying(false))
    },
    [ensureAudio, volume, muted]
  )

  /** After playback starts, confirm the analyser actually sees signal. */
  const armTaintProbe = useCallback(() => {
    if (plainModeRef.current || probeRef.current) return
    probeRef.current = setTimeout(() => {
      probeRef.current = null
      const analyser = analyserRef.current
      const el = audioRef.current
      if (!analyser || !el || el.paused) return
      const probe = new Uint8Array(128)
      analyser.getByteFrequencyData(probe)
      if (probe.every((b) => b === 0)) rebuildPlain(el.currentTime, true)
    }, 2500)
  }, [rebuildPlain])

  const startTrack = useCallback(
    async (index: number) => {
      const tracks = showRef.current?.tracks
      const track = tracks?.[index]
      if (!track) return
      setTrackIndex(index)
      setCurrentTime(0)
      setDuration(track.seconds)
      ensureContext()
      const el = ensureAudio()
      el.volume = volume
      el.muted = muted
      el.src = track.url
      try {
        await el.play()
        wireAnalyser(el)
        armTaintProbe()
      } catch {
        if (!plainModeRef.current) {
          // CORS-restricted media refuses to load with crossOrigin set —
          // retry once on the plain pipeline so the music still plays
          rebuildPlain(0, true)
        } else {
          setPlaying(false)
        }
      }
    },
    [armTaintProbe, ensureAudio, ensureContext, muted, rebuildPlain, volume, wireAnalyser]
  )
  const startTrackRef = useRef(startTrack)
  startTrackRef.current = startTrack

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (!el || !el.src) {
      void startTrack(trackIndexRef.current)
      return
    }
    if (el.paused) {
      ensureContext()
      void el.play().catch(() => setPlaying(false))
    } else {
      el.pause()
    }
  }, [ensureContext, startTrack])

  const previous = useCallback(() => {
    const el = audioRef.current
    if (el && el.currentTime > 3) {
      el.currentTime = 0
      setCurrentTime(0)
      return
    }
    if (trackIndexRef.current > 0) void startTrack(trackIndexRef.current - 1)
    else if (el) {
      el.currentTime = 0
      setCurrentTime(0)
    }
  }, [startTrack])

  const next = useCallback(() => {
    const tracks = showRef.current?.tracks
    if (tracks && trackIndexRef.current < tracks.length - 1) void startTrack(trackIndexRef.current + 1)
  }, [startTrack])

  const seekTo = useCallback((value: number) => {
    const el = audioRef.current
    if (el && Number.isFinite(value)) {
      el.currentTime = value
      setCurrentTime(value)
    }
  }, [])

  // ---- volume ----
  useEffect(() => {
    const saved = window.localStorage.getItem(VOLUME_KEY)
    if (saved !== null) {
      const v = Number(saved)
      if (v >= 0 && v <= 1) setVolume(v)
    }
  }, [])

  useEffect(() => {
    const el = audioRef.current
    if (el) {
      el.volume = volume
      el.muted = muted
    }
  }, [volume, muted])

  const changeVolume = useCallback((v: number) => {
    setVolume(v)
    setMuted(v === 0)
    window.localStorage.setItem(VOLUME_KEY, String(v))
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

  // ---- teardown ----
  useEffect(() => {
    return () => {
      if (probeRef.current) clearTimeout(probeRef.current)
      detachRef.current?.()
      audioRef.current?.pause()
      void ctxRef.current?.close().catch(() => {})
    }
  }, [])

  const track = show?.tracks[trackIndex]
  const effectiveDuration = duration ?? track?.seconds ?? null
  const progressPct =
    effectiveDuration && effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0

  const status = buffering
    ? 'buffering…'
    : synthetic && playing
      ? 'tape rolling · visualizer resting (stream data unavailable)'
      : playing
        ? 'streaming from the internet archive'
        : ' '

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
    <div className="border-2 border-rust/50 bg-pine/60 shadow-[8px_8px_0_rgba(215,180,138,0.25)]">
      <div className="flex flex-col items-center px-4 pt-8 sm:px-8">
        {/* the stump, ringed by track progress */}
        <div className="relative w-full max-w-[400px]">
          <div
            aria-hidden="true"
            className="absolute inset-[3%] translate-y-[4%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(3,9,6,0.55),transparent_66%)] blur-lg"
          />
          <StumpVisualizer
            analyserRef={analyserRef}
            playing={playing}
            synthetic={synthetic}
            className="block aspect-square w-full"
          />
          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r="48.6" fill="none" stroke="rgba(215,180,138,0.18)" strokeWidth="0.8" />
            <circle
              cx="50"
              cy="50"
              r="48.6"
              fill="none"
              stroke="var(--gold)"
              strokeWidth="1.4"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray={`${progressPct} 100`}
              opacity="0.85"
            />
          </svg>
        </div>

        <h2 className="font-display mt-6 text-center text-2xl text-cream sm:text-3xl">
          {track?.title ?? fallbackTitle}
        </h2>
        <p className="mt-1 text-center text-xs italic text-sand/60">{status}</p>

        {/* transport */}
        <div className="mt-6 flex items-center gap-4">
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
            disabled={!track}
            onPointerDown={() => { draggingRef.current = true }}
            onPointerUp={() => { draggingRef.current = false }}
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
                onClick={() => (active ? toggle() : void startTrack(i))}
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
                {active && !playing && <Pause size={12} className="shrink-0 text-gold/70" aria-hidden="true" />}
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
