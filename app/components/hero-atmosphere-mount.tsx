'use client'

import dynamic from 'next/dynamic'

const HeroAtmosphere = dynamic(() => import('./three/hero-atmosphere'), { ssr: false })

// Sits over the hero photo, under the hero text. Pure decoration: no
// pointer events, skipped entirely if WebGL is unavailable.
export default function HeroAtmosphereMount() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden="true">
      <HeroAtmosphere />
    </div>
  )
}
