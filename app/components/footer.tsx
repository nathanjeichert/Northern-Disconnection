'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Instagram, Youtube } from 'lucide-react'

const BOOKING_EMAIL = 'booking@northerndisconnection.com'

export default function Footer() {
  return (
    <footer className="border-t-2 border-rust/40 bg-pine/80 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-10 text-center">
        <p className="eyebrow mb-3">Booking &amp; Inquiries</p>
        <a
          href={`mailto:${BOOKING_EMAIL}`}
          className="text-rust underline decoration-rust/40 underline-offset-4 transition-colors hover:text-gold"
        >
          {BOOKING_EMAIL}
        </a>
        <p className="mt-3">
          <Link
            href="/press"
            className="text-xs font-bold uppercase tracking-[0.2em] text-rust transition-colors hover:text-gold"
          >
            Press kit
          </Link>
        </p>
        <div className="mt-6 flex justify-center space-x-3">
          <motion.a
            whileHover={{ scale: 1.1, rotate: 5 }}
            href="https://www.instagram.com/northerndisconnection"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="rounded-full border border-rust/40 bg-rust/10 p-3 text-cream transition-colors hover:bg-rust/30"
          >
            <Instagram size={18} />
          </motion.a>
          <motion.a
            whileHover={{ scale: 1.1, rotate: -5 }}
            href="https://www.youtube.com/channel/UCOpZMRlcndhoCcN1knIHIHA"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="YouTube"
            className="rounded-full border border-rust/40 bg-rust/10 p-3 text-cream transition-colors hover:bg-rust/30"
          >
            <Youtube size={18} />
          </motion.a>
        </div>
      </div>
    </footer>
  )
}
