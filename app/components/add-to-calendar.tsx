'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarPlus } from 'lucide-react'
import type { Show } from '@/types/content'
import {
  buildShowIcs,
  showIcsFilename,
  googleCalendarUrl,
  outlookCalendarUrl,
} from '@/lib/calendar'

function downloadIcs(show: Show) {
  const ics = buildShowIcs(show)
  if (!ics) return
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = showIcsFilename(show)
  link.click()
  URL.revokeObjectURL(url)
}

/*
  Device-agnostic "Add to Calendar": instead of dropping a raw .ics that many
  visitors won't know what to do with, this opens a small picker so the event
  lands in whatever calendar they actually use. Apple Calendar (and any desktop
  calendar app) gets the .ics; Google and Outlook get a prefilled add-event link.

  The menu is rendered through a portal with fixed positioning so it escapes the
  show card's CSS mask (the ticket-stub perforation), which would otherwise clip
  the dropdown at the card's edge.
*/
export default function AddToCalendar({ show, triggerClassName }: { show: Show; triggerClassName?: string }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const place = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const menuHeight = menuRef.current?.offsetHeight ?? 176
    const spaceBelow = window.innerHeight - rect.bottom
    // flip above the button when there isn't room below (e.g. the last card)
    const top =
      spaceBelow < menuHeight + 12 ? Math.max(8, rect.top - menuHeight - 8) : rect.bottom + 8
    setCoords({ top, left: rect.left })
  }, [])

  // position before the browser paints, so the menu never flashes at 0,0
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  const google = googleCalendarUrl(show)
  const outlook = outlookCalendarUrl(show)

  type Option = { label: string; href?: string; onSelect?: () => void }
  const options: Option[] = [
    ...(google ? [{ label: 'Google Calendar', href: google }] : []),
    { label: 'Apple Calendar', onSelect: () => downloadIcs(show) },
    ...(outlook ? [{ label: 'Outlook', href: outlook }] : []),
    { label: 'Download .ics', onSelect: () => downloadIcs(show) },
  ]

  const itemClass =
    'font-display block w-full px-4 py-2.5 text-left text-[0.78rem] uppercase tracking-[0.16em] text-ink transition-colors hover:bg-gold'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName ?? 'inline-flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-rust/80 transition-colors hover:text-gold'}
      >
        <CalendarPlus size={14} className="shrink-0" />
        Add to Calendar
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 70 }}
            className="min-w-[12rem] border-2 border-ink bg-paper shadow-[5px_5px_0_rgba(5,14,10,0.6)]"
          >
            {options.map((option) =>
              option.href ? (
                <a
                  key={option.label}
                  role="menuitem"
                  href={option.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className={itemClass}
                >
                  {option.label}
                </a>
              ) : (
                <button
                  key={option.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    option.onSelect?.()
                    setOpen(false)
                  }}
                  className={itemClass}
                >
                  {option.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
