'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Play } from 'lucide-react'

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

type Mode = 'idle' | 'playing'

/** Window event that other components dispatch to restart the promo. */
export const REPLAY_EVENT = 'press:replay'

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
  webkitDisplayingFullscreen?: boolean
}

// Phones get the device's real full screen (16:9 in a portrait viewport is a
// thin strip); desktops keep the in-page takeover.
function enterPhoneFullscreen(video: FullscreenVideo) {
  if (!window.matchMedia('(pointer: coarse)').matches) return
  if (video.requestFullscreen) {
    video
      .requestFullscreen()
      .then(() => {
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        orientation.lock?.('landscape').catch(() => {})
      })
      .catch(() => {})
  } else {
    video.webkitEnterFullscreen?.()
  }
}

function exitFullscreen(video: FullscreenVideo | null) {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else if (video?.webkitDisplayingFullscreen) video.webkitExitFullscreen?.()
}

function pickSource(hd: string, sd: string) {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return sd
  const pixels = window.innerWidth * (window.devicePixelRatio || 1)
  return pixels > 1400 ? hd : sd
}

// Full-screen promo gate: the end-card still with a Play button. Browsers
// only allow sound after a click, so playback always starts from one. While
// it plays the page is locked to the video; scrolling, Esc or "Skip intro"
// hand off to the press kit, and so does the video ending.
export default function PressIntro({ poster, hd, sd, durationLabel, targetId }: PressIntroProps) {
  const heroRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [progress, setProgress] = useState(0)

  const lockPage = (locked: boolean) => {
    const root = document.documentElement
    if (locked) {
      root.style.overflow = 'hidden'
      root.dataset.pressPlaying = ''
    } else {
      root.style.removeProperty('overflow')
      delete root.dataset.pressPlaying
    }
  }

  const finish = useCallback(() => {
    const video = videoRef.current
    exitFullscreen(video)
    if (video) {
      video.pause()
      // Dropping the source brings the poster back for the next visit up here.
      video.removeAttribute('src')
      video.load()
    }
    lockPage(false)
    setMode('idle')
    setProgress(0)
    document.getElementById(targetId)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [targetId])

  const play = useCallback(() => {
    const video = videoRef.current
    const hero = heroRef.current
    if (!video || !hero) return
    window.scrollTo({ top: hero.getBoundingClientRect().top + window.scrollY, behavior: 'instant' })
    video.src = pickSource(hd, sd)
    video.muted = false
    lockPage(true)
    setMode('playing')
    enterPhoneFullscreen(video)
    video.play().catch(() => {
      lockPage(false)
      setMode('idle')
    })
  }, [hd, sd])

  // While the promo plays, any attempt to move on skips to the press kit.
  useEffect(() => {
    if (mode !== 'playing') return
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

    // Leaving the phone's full screen (back gesture, iOS "Done") also skips.
    const video = videoRef.current
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) finish()
    }
    const onIosEnd = () => finish()
    document.addEventListener('fullscreenchange', onFullscreenChange)
    video?.addEventListener('webkitendfullscreen', onIosEnd)

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      video?.removeEventListener('webkitendfullscreen', onIosEnd)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [mode, finish])

  useEffect(() => {
    window.addEventListener(REPLAY_EVENT, play)
    return () => {
      window.removeEventListener(REPLAY_EVENT, play)
      lockPage(false)
    }
  }, [play])

  const togglePause = () => {
    const video = videoRef.current
    if (!video || mode !== 'playing') return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  const playing = mode === 'playing'

  return (
    <section ref={heroRef} className="press-intro" data-mode={mode} aria-label="Promo video">
      <div className="press-intro__stage">
        <video
          ref={videoRef}
          className="press-intro__video"
          poster={poster}
          preload="none"
          playsInline
          onClick={togglePause}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            if (v.duration) setProgress(v.currentTime / v.duration)
          }}
          onEnded={finish}
          aria-label="Northern Disconnection promo video"
        />
      </div>

      <div className="press-intro__bar">
        <div className="press-intro__progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>

        {playing ? (
          <button type="button" onClick={finish} className="retro-button retro-button--ghost retro-button--sm">
            Skip intro
            <ChevronDown size={14} />
          </button>
        ) : (
          <>
            <button type="button" onClick={play} className="retro-button">
              <Play size={16} fill="currentColor" />
              Play the promo
              <span className="press-intro__time">{durationLabel}</span>
            </button>
            <a href={`#${targetId}`} className="retro-button retro-button--ghost retro-button--sm">
              Skip intro
              <ChevronDown size={14} />
            </a>
          </>
        )}
      </div>
    </section>
  )
}
