'use client'

import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Mail } from 'lucide-react'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface SubscribeFormProps {
  className?: string
}

// Compact one-line signup strip: label + email input + button.
export default function SubscribeForm({ className = '' }: SubscribeFormProps) {
  const [email, setEmail] = useState('')
  const [hp, setHp] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, hp }),
      })

      if (response.ok) {
        setStatus('success')
        setMessage('Thanks for subscribing!')
        setEmail('')
      } else {
        const data = await response.json().catch(() => null)
        setStatus('error')
        setMessage(data?.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  return (
    <div className={`text-center ${className}`}>
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3"
      >
        <span className="flex items-center gap-2 whitespace-nowrap font-display text-lg text-cream">
          <Mail size={18} className="shrink-0 text-rust" aria-hidden="true" />
          Get Show Alerts
        </span>
        {/* Honeypot: hidden from humans, catches bots that fill every field. */}
        <input
          type="text"
          name="company"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          aria-label="Email address"
          required
          disabled={status === 'loading'}
          className="w-full min-w-0 max-w-xs flex-1 border-2 border-rust/40 bg-pine/60 px-4 py-2 text-sm text-cream placeholder-sand/50 transition-colors focus:border-gold focus:outline-none disabled:opacity-50 max-sm:basis-full sm:w-auto"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="retro-button retro-button--sm disabled:opacity-50"
        >
          {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>

      {message && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`mt-3 text-sm ${status === 'success' ? 'text-gold' : 'text-rust'}`}
        >
          {message}
        </motion.p>
      )}
    </div>
  )
}
