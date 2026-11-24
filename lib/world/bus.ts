/*
  The thin line between the page and the world canvas. Components import
  this (never the engine itself, which is loaded lazily) to walk the camera
  somewhere, feed it the music, or pause it while something covers it.
*/

export interface WorldHandle {
  setPlace: (index: number, immediate?: boolean) => void
  debugAt: (t: number) => void
  destroy: () => void
}

/** Live inputs the engine reads every frame. */
export const worldInput = {
  /** 0 … 1 loudness of whatever is playing, and when it was last reported. */
  audio: 0,
  audioAt: 0,
  /** True while the scene is completely covered (the press intro). */
  paused: false,
}

let handle: WorldHandle | null = null
let pending: number | null = null

export function registerWorld(world: WorldHandle | null) {
  handle = world
  if (world && pending !== null) world.setPlace(pending, true)
  pending = null
}

/** Start walking to a place now (called a beat before the route changes). */
export function travelTo(index: number) {
  if (handle) handle.setPlace(index)
  else pending = index
}

export function getWorld() {
  return handle
}
