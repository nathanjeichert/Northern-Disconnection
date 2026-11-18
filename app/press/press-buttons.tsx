'use client'

import { useState } from 'react'
import { Check, Copy, RotateCcw } from 'lucide-react'
import { REPLAY_EVENT } from './press-intro'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button type="button" onClick={copy} className="press-copy" aria-live="polite">
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : label}
    </button>
  )
}

export function ReplayButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(REPLAY_EVENT))}
      className="retro-button retro-button--ghost"
    >
      <RotateCcw size={16} />
      Replay the promo
    </button>
  )
}
