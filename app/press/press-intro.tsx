'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Play, Volume2, VolumeX } from 'lucide-react'

interface PressIntroProps {
  poster: string
  /** 1080p encode, for large screens. */
  hd: string
  /** 720p encode, for phones and small or data-saving screens. */
  sd: string
  durationLabel: string
  /** id of the element the intro hands off to. */
  targetId: string
}

// preview: muted, looping, with the "play with sound" prompt over it.
// sound: playing from the top with sound; the page is held on the video.
type Mode = 'preview' | 'sound'

/** Window event that other components dispatch to restart the promo with sound. */
export const REPLAY_EVENT = 'press:replay'

const UI_IDLE_MS = 2500

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function pickSource(hd: string, sd: string) {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return sd
  const pixels = window.innerWidth * (window.devicePixelRatio || 1)
  return pixels > 1400 ? hd : sd
}

function lockPage(locked: boolean) {
  const root = document.documentElement
  if (locked) root.style.overflow = 'hidden'
  else root.style.removeProperty('overflow')
}

// The promo owns the first screen. It starts muted the moment the page loads
// (browsers only allow sound after a click or tap) with the play prompt
// floating over it; any click or tap restarts it from the top with sound.
// The site nav stays out of the way while the video fills the screen and
// comes back on scroll or when the pointer reaches the top edge. Wherever
// the video doesn't match the screen's shape, a blurred copy of the current
// frame fills the rest, so there is never a visible frame or letterbox.
export default function PressIntro({ poster, hd, sd, durationLabel, targetId }: PressIntroProps) {
  const heroRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef<Mode>('preview')
  const inViewRef = useRef(true)

  const [mode, setMode] = useState<Mode>('preview')
  const [paused, setPaused] = useState(true)
  const [muted, setMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [uiAwake, setUiAwake] = useState(true)
  const [immersive, setImmersive] = useState(true)

  const changeMode = (next: Mode) => {
    modeRef.current = next
    setMode(next)
  }

  // Start the muted preview as soon as the page is interactive.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.src = pickSource(hd, sd)
    video.muted = true
    video.loop = true
    if (!prefersReducedMotion()) video.play().catch(() => {})
  }, [hd, sd])

  // Hide the nav while the hero fills the screen, and only spend CPU on the
  // preview while it can be seen.
  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    const root = document.documentElement
    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting
        const filling = entry.intersectionRatio >= 0.5
        setImmersive(filling)
        if (filling) root.dataset.pressImmersive = ''
        else {
          delete root.dataset.pressImmersive
          delete root.dataset.pressPeek
        }
        const video = videoRef.current
        if (!video || modeRef.current === 'sound') return
        if (entry.isIntersecting && !prefersReducedMotion()) video.play().catch(() => {})
        else video.pause()
      },
      { threshold: [0, 0.5] },
    )
    observer.observe(hero)

    const nav = document.querySelector('.site-nav')
    const unpeek = () => delete root.dataset.pressPeek
    nav?.addEventListener('mouseleave', unpeek)

    return () => {
      observer.disconnect()
      nav?.removeEventListener('mouseleave', unpeek)
      delete root.dataset.pressImmersive
      delete root.dataset.pressPeek
      lockPage(false)
    }
  }, [])

  // Ambient fill: a tiny canvas copy of the current frame, blurred by CSS.
  useEffect(() => {
    const video = videoRef.current
    const ctx = canvasRef.current?.getContext('2d')
    if (!video || !ctx) return
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < 120 || document.hidden || !inViewRef.current || video.readyState < 2) return
      last = now
      ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const finish = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.muted = true
      video.loop = true
    }
    setMuted(true)
    setProgress(0)
    lockPage(false)
    changeMode('preview')
    document.getElementById(targetId)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [targetId])

  const playWithSound = useCallback(() => {
    const video = videoRef.current
    const hero = heroRef.current
    if (!video || !hero) return
    window.scrollTo({ top: hero.getBoundingClientRect().top + window.scrollY, behavior: 'instant' })
    if (!video.getAttribute('src')) video.src = pickSource(hd, sd)
    video.loop = false
    video.muted = false
    video.currentTime = 0
    setMuted(false)
    setUiAwake(true)
    lockPage(true)
    changeMode('sound')
    video.play().catch(() => {
      // Sound refused after all: keep playing silently rather than stall.
      video.muted = true
      setMuted(true)
      video.play().catch(() => {})
    })
  }, [hd, sd])

  useEffect(() => {
    window.addEventListener(REPLAY_EVENT, playWithSound)
    return () => window.removeEventListener(REPLAY_EVENT, playWithSound)
  }, [playWithSound])

  // While the promo plays with sound, any attempt to move on skips to the kit.
  useEffect(() => {
    if (mode !== 'sound') return
    let touchStartY: number | null = null
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 4) finish()
    }
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY
      if (touchStartY != null && y != null && touchStartY - y > 40) finish()
    }
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'ArrowDown', 'PageDown', 'End'].includes(e.key)) {
        e.preventDefault()
        finish()
      }
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [mode, finish])

  // Controls fade out while the promo plays and come back on any movement.
  useEffect(() => {
    if (mode !== 'sound') {
      setUiAwake(true)
      return
    }
    let timer = setTimeout(() => setUiAwake(false), UI_IDLE_MS)
    const wake = () => {
      setUiAwake(true)
      clearTimeout(timer)
      timer = setTimeout(() => setUiAwake(false), UI_IDLE_MS)
    }
    window.addEventListener('pointermove', wake)
    window.addEventListener('touchstart', wake, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('touchstart', wake)
    }
  }, [mode])

  const togglePause = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  const sound = mode === 'sound'
  const showUi = !sound || uiAwake || paused

  return (
    <section
      ref={heroRef}
      className="press-intro"
      data-mode={mode}
      data-ui={showUi ? 'on' : 'off'}
      aria-label="Promo video"
    >
      <div className="press-intro__ambient" style={{ backgroundImage: `url(${poster})` }} aria-hidden="true">
        <canvas ref={canvasRef} width={64} height={36} />
      </div>

      <video
        ref={videoRef}
        className="press-intro__video"
        poster={poster}
        preload="auto"
        muted
        playsInline
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          if (modeRef.current === 'sound' && v.duration) setProgress(v.currentTime / v.duration)
        }}
        onEnded={() => modeRef.current === 'sound' && finish()}
        aria-label="Northern Disconnection promo video"
      />

      {sound ? (
        <button
          type="button"
          className="press-intro__surface"
          onClick={togglePause}
          aria-label={paused ? 'Resume the promo' : 'Pause the promo'}
        >
          {paused && (
            <span className="press-intro__disc">
              <Play size={34} fill="currentColor" />
            </span>
          )}
        </button>
      ) : (
        <button type="button" className="press-intro__surface press-intro__prompt" onClick={playWithSound}>
          <span className="press-intro__disc">
            <Play size={34} fill="currentColor" />
          </span>
          <span className="press-intro__label">
            Play with sound
            <span className="press-intro__time">{durationLabel}</span>
          </span>
        </button>
      )}

      <div className="press-intro__chrome">
        {sound ? (
          <>
            <button
              type="button"
              className="press-intro__chip"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button type="button" className="press-intro__chip" onClick={finish}>
              Skip intro
              <ChevronDown size={14} />
            </button>
          </>
        ) : (
          <a href={`#${targetId}`} className="press-intro__cue">
            Press kit
            <ChevronDown size={18} />
          </a>
        )}
      </div>

      {sound && (
        <div className="press-intro__progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}

      {/* Pointer at the top edge brings the nav back (desktop). */}
      {immersive && (
        <div
          className="press-intro__peek"
          onMouseEnter={() => (document.documentElement.dataset.pressPeek = '')}
          aria-hidden="true"
        />
      )}
    </section>
  )
}
