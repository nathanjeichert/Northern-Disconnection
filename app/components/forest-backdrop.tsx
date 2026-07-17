'use client'

import dynamic from 'next/dynamic'

// The three.js grove renders client-only (WebGL); until it mounts — or if
// WebGL is unavailable — the flat body color beneath simply shows through.
const ForestScene = dynamic(() => import('./three/forest-scene'), { ssr: false })

export default function ForestBackdrop() {
  return (
    <div className="fixed inset-0 z-0" aria-hidden="true">
      <ForestScene />
      {/* gentle vignette so page copy keeps contrast over the grove */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,transparent_36%,rgba(5,14,10,0.55)_100%)]" />
    </div>
  )
}
