'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X, Shuffle, Download, Share2, RefreshCw } from 'lucide-react'
import type { Show } from '@/types/content'
import {
  drawFlyer,
  flyerFilename,
  hashSeed,
  preloadFlyerAssets,
  printNumber,
  randomSeed,
  styleForSeed,
  FLYER_DIMENSIONS,
  FLYER_STYLES,
  type FlyerFormat,
  type FlyerStyleId,
} from '@/lib/flyer'

interface ShowFlyerModalProps {
  show: Show
  onClose: () => void
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not render flyer'))), 'image/png')
  })
}

const PULL_MS = 720

/*
  Share-flyer modal. Two stacked canvases: the next print is drawn off to
  the side, then "pulled" over the current one — a squeegee sweeps down the
  sheet revealing the fresh ink beneath it — and the canvases swap roles.
*/
export default function ShowFlyerModal({ show, onClose }: ShowFlyerModalProps) {
  const reduceMotion = useReducedMotion()
  const canvasA = useRef<HTMLCanvasElement>(null)
  const canvasB = useRef<HTMLCanvasElement>(null)
  const chipRow = useRef<HTMLDivElement>(null)
  const [format, setFormat] = useState<FlyerFormat>('post')
  const [seed, setSeed] = useState(() => hashSeed(`${show.date}-${show.venue}`))
  const [style, setStyle] = useState<FlyerStyleId>(() => styleForSeed(hashSeed(`${show.date}-${show.venue}`)))
  // which canvas is showing, and a counter that restarts the pull animation
  const [front, setFront] = useState<0 | 1 | null>(null)
  const [pull, setPull] = useState(0)
  const [pending, setPending] = useState(true)
  const [shown, setShown] = useState<{ style: FlyerStyleId; seed: number; format: FlyerFormat } | null>(null)
  const [canShare, setCanShare] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const token = useRef(0)
  const frontRef = useRef<0 | 1 | null>(null)
  const shownFormat = useRef<FlyerFormat | null>(null)

  useEffect(() => {
    preloadFlyerAssets()
    const probe = new File([new Blob()], 'flyer.png', { type: 'image/png' })
    setCanShare(typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] }))
  }, [])

  // Render the requested print into the back canvas, then pull it over the front.
  useEffect(() => {
    const id = ++token.current
    const backIndex: 0 | 1 = frontRef.current === 0 ? 1 : 0
    const back = (backIndex === 0 ? canvasA : canvasB).current
    const current = frontRef.current === null ? null : (frontRef.current === 0 ? canvasA : canvasB).current
    if (!back) return
    setPending(true)
    drawFlyer(back, show, format, seed, style)
      .then(() => {
        if (id !== token.current) return
        const first = frontRef.current === null
        const sameFormat = shownFormat.current === format
        back.style.zIndex = '10'
        back.style.opacity = '1'
        if (current) current.style.zIndex = '0'
        if (!first && sameFormat && !reduceMotion) {
          back.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], {
            duration: PULL_MS,
            easing: 'cubic-bezier(0.55, 0.05, 0.35, 1)',
          })
          setPull((n) => n + 1)
        } else {
          back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: first ? 380 : 220, easing: 'ease-out' })
        }
        if (current && !sameFormat) current.style.opacity = '0'
        frontRef.current = backIndex
        shownFormat.current = format
        setFront(backIndex)
        setShown({ style, seed, format })
        setPending(false)
      })
      .catch(() => {
        if (id === token.current) setPending(false)
        console.error('Failed to draw flyer')
      })
  }, [show, format, seed, style, reduceMotion])

  const pickStyle = useCallback((id: FlyerStyleId) => {
    setStyle(id)
    setSeed(randomSeed())
  }, [])

  const surprise = useCallback(() => {
    const others = FLYER_STYLES.filter((s) => s.id !== style)
    setStyle(others[Math.floor(Math.random() * others.length)].id)
    setSeed(randomSeed())
  }, [style])

  const reroll = useCallback(() => setSeed(randomSeed()), [])

  const stepStyle = useCallback(
    (dir: 1 | -1) => {
      const i = FLYER_STYLES.findIndex((s) => s.id === style)
      pickStyle(FLYER_STYLES[(i + dir + FLYER_STYLES.length) % FLYER_STYLES.length].id)
    },
    [style, pickStyle],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea')) return
      if (event.key === 'ArrowRight') stepStyle(1)
      if (event.key === 'ArrowLeft') stepStyle(-1)
      if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) reroll()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose, stepStyle, reroll])

  // keep the active chip in view on narrow screens
  useEffect(() => {
    const row = chipRow.current
    const chip = row?.querySelector<HTMLElement>(`[data-style="${style}"]`)
    if (!row || !chip) return
    const target = chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2
    row.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [style, reduceMotion])

  const frontCanvas = () => (frontRef.current === null ? null : (frontRef.current === 0 ? canvasA : canvasB).current)

  const download = useCallback(async () => {
    const canvas = frontCanvas()
    if (!canvas || isBusy || !shown) return
    setIsBusy(true)
    try {
      const blob = await canvasToBlob(canvas)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = flyerFilename(show, shown.format, shown.style)
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsBusy(false)
    }
  }, [show, isBusy, shown])

  const share = useCallback(async () => {
    const canvas = frontCanvas()
    if (!canvas || isBusy || !shown) return
    setIsBusy(true)
    try {
      const blob = await canvasToBlob(canvas)
      const file = new File([blob], flyerFilename(show, shown.format, shown.style), { type: 'image/png' })
      await navigator.share({
        files: [file],
        title: `Northern Disconnection at ${show.venue}`,
      })
    } catch {
      // user dismissed the share sheet
    } finally {
      setIsBusy(false)
    }
  }, [show, isBusy, shown])

  const dims = FLYER_DIMENSIONS[shown?.format ?? format]
  const styleName = FLYER_STYLES.find((s) => s.id === (shown?.style ?? style))?.name ?? ''
  const ratio = dims.width / dims.height

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-pine/85 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Share flyer for ${show.venue}`}
    >
      <style>{`
        @keyframes flyer-squeegee { from { top: 0%; opacity: 1; } 92% { opacity: 1; } to { top: 100%; opacity: 0; } }
        .flyer-frame { max-width: calc(52vh * var(--ratio)); max-height: 52vh; }
        @media (min-width: 640px) { .flyer-frame { max-width: calc(58vh * var(--ratio)); max-height: 58vh; } }
        .flyer-squeegee { animation: flyer-squeegee ${PULL_MS}ms cubic-bezier(0.55, 0.05, 0.35, 1) both; }
        .flyer-chips { scrollbar-width: none; -webkit-mask-image: linear-gradient(to right, transparent, #000 14px, #000 calc(100% - 14px), transparent); mask-image: linear-gradient(to right, transparent, #000 14px, #000 calc(100% - 14px), transparent); }
        .flyer-chips::-webkit-scrollbar { display: none; }
      `}</style>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex max-h-full w-full max-w-lg flex-col border-2 border-rust/50 bg-pine p-4 shadow-[8px_8px_0_rgba(215,180,138,0.25)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <p className="eyebrow truncate !tracking-[0.25em]" aria-live="polite">
            {shown ? (
              <>
                {styleName} <span className="text-sand/50">·</span> <span className="text-gold">No. {printNumber(shown.seed)}</span>
              </>
            ) : (
              'Setting type…'
            )}
          </p>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 p-1 text-rust transition-colors hover:text-cream">
            <X size={20} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div
            className="flyer-frame relative w-full overflow-hidden border border-rust/30 bg-moss/40"
            style={{ aspectRatio: `${dims.width} / ${dims.height}`, ['--ratio' as string]: ratio }}
          >
            {[canvasA, canvasB].map((ref, index) => (
              <canvas
                key={index}
                ref={ref}
                className="absolute inset-0 block h-full w-full object-contain opacity-0"
                aria-hidden={front !== index}
                aria-label={front === index ? `Flyer for Northern Disconnection at ${show.venue}, ${show.date}` : undefined}
              />
            ))}
            {/* the squeegee: a rubber blade sweeping ink down the screen */}
            {pull > 0 && !reduceMotion && (
              <span
                key={`sq-${pull}`}
                aria-hidden
                className="flyer-squeegee pointer-events-none absolute left-[-4%] z-20 block h-3 w-[108%] -translate-y-1/2"
                style={{
                  background: 'linear-gradient(to bottom, rgba(247,242,229,0), rgba(12,35,24,0.95) 35%, rgba(12,35,24,0.95) 65%, rgba(233,185,73,0.9))',
                  boxShadow: '0 -18px 26px rgba(12,35,24,0.28), 0 4px 10px rgba(0,0,0,0.35)',
                }}
              />
            )}
            {front === null && (
              <span className="absolute inset-0 flex items-center justify-center text-[0.65rem] font-bold uppercase tracking-[0.3em] text-rust/70">
                <span className="animate-pulse">Inking the screen…</span>
              </span>
            )}
          </div>
        </div>

        {/* styles: tap one for a fresh pull in that style */}
        <div className="mt-4 shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.62rem] font-bold uppercase tracking-[0.28em] text-rust/80">Print style</span>
            <span className="hidden text-[0.6rem] uppercase tracking-[0.2em] text-sand/40 sm:inline">← → to browse · R to reroll</span>
          </div>
          <div ref={chipRow} className="flyer-chips -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
            <button
              type="button"
              onClick={surprise}
              className="inline-flex shrink-0 items-center gap-1.5 border border-gold/70 bg-gold/10 px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-pine"
            >
              <Shuffle size={13} />
              Surprise me
            </button>
            {FLYER_STYLES.map((s) => {
              const active = style === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  data-style={s.id}
                  onClick={() => pickStyle(s.id)}
                  title={active ? `Another ${s.name} pull` : s.blurb}
                  aria-pressed={active}
                  className={`shrink-0 border px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.15em] transition-colors ${
                    active ? 'border-cream bg-cream text-pine' : 'border-rust/40 text-rust hover:border-rust hover:text-cream'
                  }`}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            {(Object.keys(FLYER_DIMENSIONS) as FlyerFormat[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFormat(key)}
                aria-pressed={format === key}
                className={`border px-2.5 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] transition-colors ${
                  format === key ? 'border-gold bg-gold/15 text-gold' : 'border-rust/40 text-rust hover:border-rust hover:text-cream'
                }`}
              >
                {FLYER_DIMENSIONS[key].label}
              </button>
            ))}
            <button
              type="button"
              onClick={reroll}
              aria-label="Another pull in this style"
              title="Another pull (R)"
              className="border border-rust/40 p-1.5 text-rust transition-colors hover:border-rust hover:text-cream"
            >
              <RefreshCw size={14} className={pending ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={download} disabled={isBusy || !shown} className="retro-button retro-button--sm disabled:opacity-50">
              <Download size={14} />
              Download
            </button>
            {canShare && (
              <button
                type="button"
                onClick={share}
                disabled={isBusy || !shown}
                className="retro-button retro-button--sm retro-button--ghost disabled:opacity-50"
              >
                <Share2 size={14} />
                Share
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
