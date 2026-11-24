/*
  The trail. Every page of the site is a place along one path through an
  old-growth forest, and the world canvas (lib/world/engine.ts) walks the
  camera between them. This file is the light, DOM-safe half: names, routes
  and order. The paint (palettes, scene parameters) lives in palette.ts and
  is only loaded with the engine.
*/

export interface Place {
  /** Stable id — also the value of <html data-place>. */
  id: 'trailhead' | 'campfire' | 'grove' | 'camp' | 'lookout'
  /** Route this place is the backdrop for. */
  path: string
  /** Plain label — what a visitor is looking for. */
  label: string
  /** The place's name on the trail. */
  name: string
  /** One line for the map. */
  blurb: string
  /** Trail distance shown on signs. */
  mile: string
  /** Time of day in the scene (used for meta theme colour / fallbacks). */
  sky: string
  ground: string
}

export const PLACES: Place[] = [
  {
    id: 'trailhead',
    path: '/',
    label: 'Home',
    name: 'The Trailhead',
    blurb: 'Start here',
    mile: '0',
    sky: '#2a6a5f',
    ground: '#143023',
  },
  {
    id: 'campfire',
    path: '/shows',
    label: 'Shows',
    name: 'Campfire Circle',
    blurb: 'Where and when we play next',
    mile: '1',
    sky: '#11213a',
    ground: '#08141a',
  },
  {
    id: 'grove',
    path: '/music',
    label: 'Music',
    name: 'The Old Grove',
    blurb: 'Full live sets, played through a redwood stump',
    mile: '2',
    sky: '#1f1a47',
    ground: '#0c0a20',
  },
  {
    id: 'camp',
    path: '/about',
    label: 'The Band',
    name: 'Base Camp',
    blurb: 'Who we are',
    mile: '3',
    sky: '#eda95a',
    ground: '#27432c',
  },
  {
    id: 'lookout',
    path: '/press',
    label: 'Press Kit',
    name: 'The Lookout',
    blurb: 'Bio, photos, video and booking',
    mile: '4',
    sky: '#7fb2bb',
    ground: '#2a5440',
  },
]

/** Index of the place a pathname belongs to (unknown routes stay at the trailhead). */
export function placeIndexForPath(pathname: string): number {
  if (pathname === '/') return 0
  const i = PLACES.findIndex((p) => p.path !== '/' && (pathname === p.path || pathname.startsWith(p.path + '/')))
  return i < 0 ? 0 : i
}

export function placeForPath(pathname: string): Place {
  return PLACES[placeIndexForPath(pathname)]
}
