'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { placeIndexForPath } from '@/lib/world/places'
import { travelTo } from '@/lib/world/bus'
import './trail.css'

const TrailMap = dynamic(() => import('./trail-map'), { ssr: false })

/** How long the page takes to fade before the route changes. */
const LEAVE_MS = 230

/*
  The site's standing navigation: a tag that leads home and a tag that
  unfolds the trail map. It also turns every in-site link into a walk — on
  click the page fades, the camera sets off for the destination, and the
  route changes a beat later.
*/
export default function TrailChrome() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pastHero, setPastHero] = useState(false)
  const mapButton = useRef<HTMLButtonElement>(null)
  const here = placeIndexForPath(pathname)
  const isHome = pathname === '/'

  // arriving: show the new page, fold the map away
  useEffect(() => {
    delete document.documentElement.dataset.leaving
    setOpen(false)
  }, [pathname])

  // every in-site link walks there
  useEffect(() => {
    let timer = 0
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const raw = anchor.getAttribute('href')
      if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return
      if (url.pathname.startsWith('/api/') || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return
      e.preventDefault()
      const href = url.pathname + url.search + url.hash
      travelTo(placeIndexForPath(url.pathname))
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        router.push(href)
        return
      }
      document.documentElement.dataset.leaving = ''
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        router.push(href)
        // never leave the page hidden if the route change stalls
        timer = window.setTimeout(() => delete document.documentElement.dataset.leaving, 2500)
      }, LEAVE_MS)
    }
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.clearTimeout(timer)
    }
  }, [router])

  // on the home page the big logo is the way home until it scrolls away
  useEffect(() => {
    if (!isHome) return
    const onScroll = () => setPastHero(window.scrollY > window.innerHeight * 0.45)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isHome])

  const close = useCallback(() => {
    setOpen(false)
    mapButton.current?.focus({ preventScroll: true })
  }, [])

  return (
    <>
      <div className="trail-chrome site-nav">
        <Link href="/" className="trail-tag trail-tag--home" data-hidden={isHome && !pastHero} aria-label="Northern Disconnection — home" tabIndex={isHome && !pastHero ? -1 : undefined}>
          <Image src="/logonotext.svg" alt="" width={36} height={107} className="logo-ink" priority />
          <span>Northern Disconnection</span>
        </Link>
        <button ref={mapButton} type="button" className="trail-tag trail-tag--map" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
          <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden="true">
            <path d="M3 5.200l5.500-2 7 2.300L21 3.500v15.300l-5.500 2-7-2.300L3 20.500z M8.500 5.100v11.500l1.600.500V5.600z M13.900 6.900v11.500l1.600.500V7.400z" fillRule="evenodd" />
          </svg>
          <span>
            <span className="max-sm:hidden">Trail </span>Map
          </span>
        </button>
      </div>
      {open && <TrailMap here={here} onClose={close} />}
    </>
  )
}
