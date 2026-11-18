'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { archiveStreamUrls, fetchArchiveShow, formatTime } from '@/lib/archive'

interface Track {
  title: string
  file: string
  seconds: number
  original: boolean
}

interface PressTracksProps {
  identifier: string
  tracks: Track[]
}

// Quick-listen strip: a handful of songs from one Archive tape, one shared
// <audio>. Stream URLs come from the item metadata (datanodes first, see
// lib/archive.ts); until that answers, the generic download URL is used.
export default function PressTracks({ identifier, tracks }: PressTracksProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const urlsRef = useRef<Record<string, string[]>>({})
  const attemptRef = useRef(0)
  const [current, setCurrent] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetchArchiveShow(identifier, ctrl.signal)
      .then((show) => {
        for (const t of show.tracks) urlsRef.current[t.file] = t.urls
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [identifier])

  const urlsFor = (file: string) => urlsRef.current[file] ?? archiveStreamUrls(identifier, file)

  const start = (file: string, attempt = 0) => {
    const audio = audioRef.current
    if (!audio) return
    const urls = urlsFor(file)
    if (attempt >= urls.length) {
      setFailed(file)
      setPlaying(false)
      return
    }
    attemptRef.current = attempt
    audio.src = urls[attempt]
    setCurrent(file)
    setFailed(null)
    if (attempt === 0) setTime(0)
    audio.play().catch(() => {})
  }

  const toggle = (file: string) => {
    const audio = audioRef.current
    if (!audio) return
    if (current === file) {
      if (audio.paused) audio.play().catch(() => {})
      else audio.pause()
    } else {
      start(file)
    }
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>, track: Track) => {
    const audio = audioRef.current
    if (!audio || current !== track.file) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * (audio.duration || track.seconds)
  }

  return (
    <div className="press-tracks">
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onError={() => current && start(current, attemptRef.current + 1)}
      />
      <ol>
        {tracks.map((track) => {
          const active = current === track.file
          const isPlaying = active && playing
          const elapsed = active ? time : 0
          return (
            <li key={track.file} className={active ? 'is-active' : undefined}>
              <button
                type="button"
                onClick={() => toggle(track.file)}
                className="press-tracks__play"
                aria-label={`${isPlaying ? 'Pause' : 'Play'} ${track.title}`}
              >
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              </button>
              <div className="press-tracks__body">
                <div className="press-tracks__row">
                  <span className="press-tracks__title">{track.title}</span>
                  {track.original && <span className="press-tracks__tag">Original</span>}
                  <span className="press-tracks__time">
                    {active ? `${formatTime(elapsed)} / ` : ''}
                    {formatTime(track.seconds)}
                  </span>
                </div>
                <div
                  className="press-tracks__bar"
                  onClick={(e) => seek(e, track)}
                  aria-hidden="true"
                >
                  <span style={{ transform: `scaleX(${Math.min(1, elapsed / track.seconds)})` }} />
                </div>
                {failed === track.file && (
                  <p className="press-tracks__error">This track won’t load right now. Try the full tape on the Music page.</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
