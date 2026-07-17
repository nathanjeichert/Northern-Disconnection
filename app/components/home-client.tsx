'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { Music, Calendar, Mail, MapPin } from 'lucide-react'
import type { Show } from '@/types/content'
import { getWeekday } from '@/lib/dates'
import SubscribeForm from './subscribe-form'
import Ornament from './ornament'
import HeroAtmosphereMount from './hero-atmosphere-mount'

type LatestVideo = {
  videoId: string
  title: string
  publishedAt: string | null
  thumbnail?: string | null
  url: string
}

interface HomeClientProps {
  nextShow: Show | null
}

export default function HomeClient({ nextShow }: HomeClientProps) {
  const [latestVideo, setLatestVideo] = useState<LatestVideo | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [isLoadingVideo, setIsLoadingVideo] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadLatestVideo = async () => {
      try {
        const response = await fetch('/api/youtube/latest')

        if (!response.ok) {
          throw new Error(`Failed to fetch latest video (status ${response.status})`)
        }

        const data: LatestVideo = await response.json()

        if (isMounted) {
          setLatestVideo(data)
          setVideoError(null)
        }
      } catch (error) {
        console.error('Error fetching latest YouTube video', error)
        if (isMounted) {
          setVideoError('Unable to load the latest video right now.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingVideo(false)
        }
      }
    }

    loadLatestVideo()

    return () => {
      isMounted = false
    }
  }, [])

  const nextShowWeekday = nextShow ? getWeekday(nextShow) : null

  const renderVideoEmbed = () => {
    if (isLoadingVideo) {
      return <div className="aspect-video w-full animate-pulse rounded-sm bg-moss/60" />
    }

    if (videoError || !latestVideo) {
      return (
        <div className="flex aspect-video items-center justify-center rounded-sm border border-rust/40 bg-moss/40 p-6 text-center text-sm text-rust/80">
          {videoError ?? 'No recent video found. Check back soon!'}
        </div>
      )
    }

    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-sm">
        <iframe
          src={`https://www.youtube.com/embed/${latestVideo.videoId}`}
          title={latestVideo.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen text-cream">
      {/* ============ HERO — live at G-Fest ============ */}
      <section className="relative flex min-h-[100svh] flex-col overflow-hidden px-4 pb-12">
        {/* zoomed and bottom-anchored so the band's faces sit above the text block */}
        <Image
          src="/band-photos/gfest-live.jpg"
          alt="Northern Disconnection performing live on the riverfront stage at G-Fest"
          fill
          priority
          sizes="100vw"
          className="origin-bottom -translate-y-12 scale-[1.2] object-cover object-center"
        />
        {/* light dusk wash so the type reads over the daylight photo */}
        <div className="absolute inset-0 bg-[#0c2318]/15" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c2318]/40 via-transparent to-[#0c2318]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(12,35,24,0.35)_100%)]" />

        {/* the forest leans into the frame: edge redwoods, fog, fireflies */}
        <HeroAtmosphereMount />

        {/*
          Spacer that tracks the band's faces across aspect ratios. The photo
          (1744x902) is object-cover'd, scaled 1.2x from the bottom, and
          shifted up 48px, so its rendered height is 1.2 * max(100svh, vw/1.933)
          and the faces' chins sit ~43% from the image top. The calc reserves
          exactly that much viewport (plus a 32px buffer; 7rem floor clears the
          fixed nav) so the logo always starts just below the faces.
        */}
        <div
          aria-hidden="true"
          className="h-[max(7rem,calc(100svh_-_max(68.4svh,35.39vw)_-_32px))] shrink-0"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center gap-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="w-full max-w-[35rem]"
          >
            <Image
              src="/logo-hero.png"
              alt="Northern Disconnection"
              width={900}
              height={506}
              priority
              className="logo-ink h-auto w-full"
            />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.5 }}
            className="max-w-xl text-lg italic leading-relaxed text-sand sm:text-xl"
          >
            Psychedelic americana from Sonoma County
          </motion.p>

          {nextShow && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.75 }}
              className="w-full max-w-2xl"
            >
              <Link
                href="/shows"
                className="group block border-y-2 border-rust/60 bg-pine/40 px-6 py-4 backdrop-blur-sm transition-colors hover:bg-pine/60"
              >
                <p className="eyebrow mb-1 text-gold">Next Show</p>
                <p className="font-display text-xl text-cream sm:text-2xl">
                  {nextShowWeekday ? `${nextShowWeekday}, ` : ''}
                  {nextShow.date}
                  {nextShow.time ? ` · ${nextShow.time}` : ''}
                </p>
                <p className="mt-1 flex items-center justify-center gap-1.5 text-sand">
                  <MapPin size={15} className="shrink-0" />
                  {nextShow.venue} — {nextShow.location}
                  <span className="ml-1 text-rust transition-transform group-hover:translate-x-1">→</span>
                </p>
              </Link>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 1.0 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <Link href="/music" className="retro-button">
              <Music size={16} />
              Listen Now
            </Link>
            <Link href="/shows" className="retro-button retro-button--ghost">
              <Calendar size={16} />
              All Shows
            </Link>
            <a href="mailto:nathanjeichert@gmail.com" className="retro-button retro-button--ghost">
              <Mail size={16} />
              Contact
            </a>
          </motion.div>
        </div>
      </section>

      {/* ============ SHOW ALERTS ============ */}
      <section className="border-y-2 border-rust/40 bg-moss/40 px-4 py-5">
        <SubscribeForm />
      </section>

      {/* ============ LATEST VIDEO ============ */}
      <section className="relative mx-auto w-full max-w-4xl px-4 py-24">
        <div
          className="aurora pointer-events-none absolute inset-x-0 top-10 -z-10 h-80 rounded-full bg-[radial-gradient(ellipse_at_center,_rgba(233,185,73,0.08),_rgba(53,94,59,0.18)_55%,_transparent_80%)] blur-2xl"
          aria-hidden="true"
        />

        {/* The lone classic fleuron — page headers carry the logo mark instead */}
        <Ornament className="mb-6 text-xl" glyph="❦" />
        <h2 className="font-display mb-8 text-center text-2xl text-cream sm:text-3xl">
          {latestVideo?.title ?? (isLoadingVideo ? 'Tuning up…' : 'New video coming soon')}
        </h2>

        <div className="border-2 border-rust/50 bg-pine/60 p-2 shadow-[8px_8px_0_rgba(215,180,138,0.25)] sm:p-3">
          {renderVideoEmbed()}
        </div>
      </section>
    </div>
  )
}
