'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Show } from '@/types/content'
import { getWeekday } from '@/lib/dates'
import Lockup from './trail/lockup'
import Signpost from './trail/signpost'
import './home.css'

type LatestVideo = {
  videoId: string
  title: string
  publishedAt: string | null
  thumbnail?: string | null
  url: string
}

interface HomeClientProps {
  nextShow: Show | null
  /** The show is a stand-in on a preview build (see lib/preview.ts). */
  sample?: boolean
}

/*
  The trailhead. The first screen is the poster itself: the logo set in the
  dusk sky, a notice for the next show staked in the ferns, and the
  signpost — the site's navigation — standing beside the trail.
*/
export default function HomeClient({ nextShow, sample }: HomeClientProps) {
  const [latestVideo, setLatestVideo] = useState<LatestVideo | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [isLoadingVideo, setIsLoadingVideo] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadLatestVideo = async () => {
      try {
        const response = await fetch('/api/youtube/latest')
        if (!response.ok) throw new Error(`Failed to fetch latest video (status ${response.status})`)
        const data: LatestVideo = await response.json()
        if (isMounted) {
          setLatestVideo(data)
          setVideoError(null)
        }
      } catch (error) {
        console.error('Error fetching latest YouTube video', error)
        if (isMounted) setVideoError('Unable to load the latest video right now.')
      } finally {
        if (isMounted) setIsLoadingVideo(false)
      }
    }

    loadLatestVideo()
    return () => {
      isMounted = false
    }
  }, [])

  const weekday = nextShow ? getWeekday(nextShow) : null

  return (
    <div className="home">
      <section className="hero">
        <div className="hero__identity">
          <h1 className="sr-only">Northern Disconnection</h1>
          <Lockup />
          <p className="hero__ribbon">
            <span>Psychedelic Americana</span>
            <i aria-hidden="true">✦</i>
            <span>Sonoma County, California</span>
          </p>
        </div>

        <div className="hero__ground">
          {nextShow ? (
            <Link href="/shows" className="notice placard">
              <span className="notice__head">{sample ? 'Next show · sample' : 'Next show'}</span>
              <span className="notice__body">
                <span className="notice__date">
                  {weekday ? `${weekday}, ` : ''}
                  {nextShow.date.replace(/,\s*\d{4}$/, '')}
                </span>
                <span className="notice__venue">{nextShow.venue}</span>
                <span className="notice__where">
                  {nextShow.location}
                  {nextShow.time ? ` · ${nextShow.time}` : ''}
                  <b aria-hidden="true">→</b>
                </span>
              </span>
            </Link>
          ) : (
            <a href="#register" className="notice placard">
              <span className="notice__head">Shows</span>
              <span className="notice__body">
                <span className="notice__venue">New dates soon</span>
                <span className="notice__where">
                  Get an email when one is posted
                  <b aria-hidden="true">→</b>
                </span>
              </span>
            </a>
          )}

          <Signpost />
        </div>
      </section>

      {/* ============ LATEST VIDEO ============ */}
      <section className="reel">
        <div className="band band--keyline reel__frame">
          <header className="reel__head">
            <p className="eyebrow">Latest from the stage</p>
            <h2 className="font-display">{latestVideo?.title ?? (isLoadingVideo ? 'Tuning up…' : 'New video coming soon')}</h2>
          </header>
          {isLoadingVideo ? (
            <div className="aspect-video w-full animate-pulse bg-black/30" />
          ) : videoError || !latestVideo ? (
            <div className="flex aspect-video items-center justify-center bg-black/25 p-6 text-center text-sm text-sand">
              {videoError ?? 'No recent video found. Check back soon!'}
            </div>
          ) : (
            <div className="relative aspect-video w-full overflow-hidden">
              <iframe
                src={`https://www.youtube.com/embed/${latestVideo.videoId}`}
                title={latestVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                className="h-full w-full"
              />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
