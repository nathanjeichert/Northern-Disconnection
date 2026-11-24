'use client'

import { useState, type FormEvent } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface SubscribeFormProps {
  className?: string
}

// The trail register: sign it to hear when a show is posted.
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
        setMessage('You’re on the list. See you out there.')
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
    <div className={className}>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-stretch gap-3">
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
          autoComplete="email"
          required
          disabled={status === 'loading'}
          className="min-w-0 flex-1 basis-56 border-2 border-ink bg-cream px-4 py-2.5 text-base text-ink placeholder:text-ink/45 focus:border-redwood focus:outline-none disabled:opacity-50"
          style={{ borderColor: 'var(--ink)' }}
        />
        <button type="submit" disabled={status === 'loading'} className="retro-button disabled:opacity-50">
          {status === 'loading' ? 'Signing…' : 'Sign up'}
        </button>
      </form>

      <p aria-live="polite" className={`mt-3 min-h-[1.25rem] text-sm ${status === 'error' ? 'text-burgundy' : 'text-redwood'}`}>
        {message}
      </p>
    </div>
  )
}
