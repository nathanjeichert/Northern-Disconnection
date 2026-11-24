import type { Place } from '@/lib/world/places'

/* Flat one-ink pictograms for each place on the trail — the kind stencilled
   on a park map legend. 24×24, drawn in currentColor. */
const PATHS: Record<Place['id'], React.ReactNode> = {
  // a signpost with two boards
  trailhead: (
    <>
      <rect x="11" y="2" width="2" height="20" />
      <path d="M13 4h6l2.2 2.2L19 8.5h-6z" />
      <path d="M11 10H5l-2.2 2.2L5 14.5h6z" />
    </>
  ),
  // a campfire
  campfire: (
    <>
      <path d="M12 2c.6 3 4.2 4.6 4.2 8.6A4.3 4.3 0 0 1 12 15a4.3 4.3 0 0 1-4.2-4.4c0-1.8 1-2.9 1.9-3.9.3 1.4.9 2 1.6 2.3C11 6.600 10.900 4 12 2z" />
      <path d="M3.5 17.200l15.500 4.300 1-2.100L4.500 15.100z" />
      <path d="M20.500 17.200L5 21.500l-1-2.100 15.500-4.300z" />
    </>
  ),
  // a toadstool
  grove: (
    <>
      <path d="M2.500 12.500C2.500 7 6.700 3 12 3s9.500 4 9.500 9.500z" />
      <path d="M9.800 13.500h4.400l.9 7.500H8.900z" />
    </>
  ),
  // a wall tent
  camp: (
    <>
      <path d="M12 3l9.500 17.500h-19z M12 10l-3.800 10.500h7.600z" fillRule="evenodd" />
      <rect x="11.300" y="1" width="1.400" height="4" />
    </>
  ),
  // a fire lookout tower
  lookout: (
    <>
      <path d="M5 6l7-4 7 4v1.200H5z" />
      <rect x="7" y="7.800" width="10" height="4.200" />
      <path d="M5.500 12.600h13v1.300h-13z" />
      <path d="M8.300 14l-2.500 8h1.700l2.300-7.300 2.200 3.300 2.200-3.300 2.300 7.300h1.700l-2.500-8h-1.600L12 16.500 9.900 14z" />
    </>
  ),
}

export default function PlaceIcon({ id, size = 24, className }: { id: Place['id']; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" className={className}>
      {PATHS[id]}
    </svg>
  )
}
