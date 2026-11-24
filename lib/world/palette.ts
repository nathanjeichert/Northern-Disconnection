/*
  Inks and scene parameters for each place on the trail. Everything here is
  a number or a colour so the engine can interpolate between two places
  while the camera walks from one to the next: dusk at the trailhead, night
  at the campfire, moonlight in the grove, morning at camp, high noon at
  the lookout. The palettes follow the WPA screenprint logic of the
  "National Park" flyer: a handful of flat inks per scene, darkest nearest.
*/

export type RGB = [number, number, number]
type Tone3 = [string, string, string]

export interface PlacePaint {
  /** Sky bands, top → horizon. */
  sky: [string, string, string, string]
  /** Band boundaries as a fraction of horizon → top of screen. */
  bands: [number, number, number]
  sun: string
  ring1: string
  ring2: string
  cloud: string
  /** Ridges, far → near. */
  ridge: [string, string, string, string]
  mist: string
  /** Ground plane, far → near. */
  ground: Tone3
  path: string
  dapple: string
  water: string
  /** Trunk inks: base, shade, lit rim. */
  trunk: Tone3
  trunkFar: Tone3
  /** Foliage inks: base, shade, lit. */
  leaf: Tone3
  leafFar: Tone3
  shaft: string
  glow: string

  // ---- scene ----
  /** x in half-screens (-1 … 1), y above the horizon and radius in screen heights. */
  sunX: number
  sunY: number
  sunR: number
  /** The same three on a tall, narrow screen. */
  sunTall: [number, number, number]
  rays: number
  rings: number
  stars: number
  moon: number
  clouds: number
  ridgeBase: [number, number, number, number]
  ridgeAmp: [number, number, number, number]
  ridgeSerr: [number, number, number, number]
  mistAmt: number
  pathAmt: number
  riverAmt: number
  fogSea: number
  dappleAmt: number
  /** Distance where things start to haze, and where they are gone. */
  fogStart: number
  fogEnd: number
  /** Screen x (-1 … 1) of the key light, for trunk rims. */
  lightX: number
  shafts: number
  fireflies: number
  sparks: number
  motes: number
  /** Ridge-shape seed. */
  seed: number
}

export const PAINT: PlacePaint[] = [
  // 0 — the trailhead: golden dusk over the valley
  {
    sky: ['#12393a', '#27675f', '#86ab87', '#ecc566'],
    bands: [0.12, 0.3, 0.56],
    sun: '#fbeec0',
    ring1: '#f6d683',
    ring2: '#f0bf5d',
    cloud: '#f2d58b',
    ridge: ['#8fae90', '#5f8a73', '#376653', '#204a39'],
    mist: '#ecd998',
    ground: ['#5f8a50', '#2e5d3d', '#122d21'],
    path: '#eec662',
    dapple: '#3a6a44',
    water: '#8fc0b8',
    trunk: ['#7d3324', '#35130f', '#cf7142'],
    trunkFar: ['#4f6a57', '#3f5a4a', '#86a27e'],
    leaf: ['#123124', '#081b13', '#2f6240'],
    leafFar: ['#3d6a52', '#2f5a45', '#5f8f68'],
    shaft: '#f8e7a8',
    glow: '#fbeec0',
    sunX: 0.44,
    sunY: 0.14,
    sunR: 0.072,
    sunTall: [0.44, 0.14, 0.072],
    rays: 0.55,
    rings: 1,
    stars: 0,
    moon: 0,
    clouds: 0.9,
    ridgeBase: [0.2, 0.135, 0.08, 0.04],
    ridgeAmp: [0.11, 0.085, 0.06, 0.045],
    ridgeSerr: [0, 0, 0.005, 0.01],
    mistAmt: 0.9,
    pathAmt: 1,
    riverAmt: 0,
    fogSea: 0,
    dappleAmt: 0.7,
    fogStart: 16,
    fogEnd: 52,
    lightX: 0.44,
    shafts: 0.35,
    fireflies: 0,
    sparks: 0,
    motes: 0.6,
    seed: 3.1,
  },
  // 1 — campfire circle: night, firelight on the trunks
  {
    sky: ['#081220', '#0f1f37', '#18304d', '#244566'],
    bands: [0.16, 0.42, 0.72],
    sun: '#f3ebcf',
    ring1: '#2e4d72',
    ring2: '#203b5b',
    cloud: '#1b3250',
    ridge: ['#1d3853', '#162c44', '#0f2135', '#0a1725'],
    mist: '#2f5075',
    ground: ['#122a3a', '#0c1d26', '#071217'],
    path: '#4c4a3f',
    dapple: '#3b2a1e',
    water: '#2f5075',
    trunk: ['#42201c', '#150a0c', '#e0702f'],
    trunkFar: ['#142a3d', '#0e2031', '#1f3d57'],
    leaf: ['#0a1e1b', '#050f0d', '#24503d'],
    leafFar: ['#12293a', '#0c1f2f', '#1c3d53'],
    shaft: '#f3ebcf',
    glow: '#ffab3d',
    sunX: 0.76,
    sunY: 0.41,
    sunR: 0.046,
    sunTall: [0.0, 0.505, 0.036],
    rays: 0,
    rings: 1,
    stars: 1,
    moon: 1,
    clouds: 0.35,
    ridgeBase: [0.11, 0.075, 0.045, 0.02],
    ridgeAmp: [0.06, 0.05, 0.04, 0.03],
    ridgeSerr: [0.003, 0.007, 0.011, 0.015],
    mistAmt: 0.5,
    pathAmt: 0.85,
    riverAmt: 0,
    fogSea: 0,
    dappleAmt: 0,
    fogStart: 9,
    fogEnd: 34,
    lightX: 0,
    shafts: 0,
    fireflies: 0.25,
    sparks: 1,
    motes: 0,
    seed: 11.7,
  },
  // 2 — the old grove: violet moonlight, mushrooms and fireflies
  {
    sky: ['#110e29', '#1e1945', '#352964', '#5a3f80'],
    bands: [0.18, 0.44, 0.74],
    sun: '#f6efd6',
    ring1: '#4b3b7f',
    ring2: '#392d6b',
    cloud: '#2b2257',
    ridge: ['#3a2d66', '#2b2152', '#1e173f', '#15102e'],
    mist: '#6b5596',
    ground: ['#1f1b44', '#141230', '#0b091d'],
    path: '#4a4273',
    dapple: '#2d2860',
    water: '#6b5596',
    trunk: ['#35213f', '#130b1b', '#a479cc'],
    trunkFar: ['#251e4c', '#1b163c', '#3d316e'],
    leaf: ['#13203f', '#090f24', '#33528a'],
    leafFar: ['#221d4c', '#1a163e', '#352d6a'],
    shaft: '#cfc4f0',
    glow: '#dcf78c',
    sunX: -0.8,
    sunY: 0.16,
    sunR: 0.115,
    sunTall: [-0.55, 0.4, 0.08],
    rays: 0,
    rings: 1,
    stars: 0.85,
    moon: 1,
    clouds: 0.25,
    ridgeBase: [0.1, 0.07, 0.04, 0.02],
    ridgeAmp: [0.06, 0.05, 0.035, 0.025],
    ridgeSerr: [0.004, 0.008, 0.012, 0.016],
    mistAmt: 0.75,
    pathAmt: 0.8,
    riverAmt: 0,
    fogSea: 0,
    dappleAmt: 0.5,
    fogStart: 7,
    fogEnd: 30,
    lightX: -0.8,
    shafts: 0.6,
    fireflies: 1,
    sparks: 0,
    motes: 0,
    seed: 23.4,
  },
  // 3 — base camp: a gold morning on the river
  {
    sky: ['#e2874b', '#eca85a', '#f3c877', '#f8e0a4'],
    bands: [0.2, 0.46, 0.74],
    sun: '#fdf3cc',
    ring1: '#f9df9a',
    ring2: '#f5cd7c',
    cloud: '#f7dc9b',
    ridge: ['#d69c72', '#b97e60', '#8c6a52', '#5c5c43'],
    mist: '#f7e1ad',
    ground: ['#99904f', '#59693b', '#243f2a'],
    path: '#f1cf82',
    dapple: '#7c8a46',
    water: '#f6dc9e',
    trunk: ['#8a3b27', '#3c150e', '#de8a4f'],
    trunkFar: ['#a7825e', '#8c6c50', '#cda574'],
    leaf: ['#1e3a2a', '#11241a', '#5a773d'],
    leafFar: ['#7b8650', '#677449', '#a3ab62'],
    shaft: '#fff1c4',
    glow: '#fff1c4',
    sunX: 0.34,
    sunY: 0.12,
    sunR: 0.075,
    sunTall: [0.3, 0.13, 0.06],
    rays: 0.75,
    rings: 0.8,
    stars: 0,
    moon: 0,
    clouds: 0.7,
    ridgeBase: [0.17, 0.115, 0.07, 0.035],
    ridgeAmp: [0.09, 0.07, 0.05, 0.04],
    ridgeSerr: [0, 0.002, 0.007, 0.012],
    mistAmt: 1,
    pathAmt: 1,
    riverAmt: 1,
    fogSea: 0,
    dappleAmt: 0.9,
    fogStart: 15,
    fogEnd: 48,
    lightX: 0.34,
    shafts: 1,
    fireflies: 0,
    sparks: 0,
    motes: 1,
    seed: 37.9,
  },
  // 4 — the lookout: high summer above a sea of fog
  {
    sky: ['#4a8aa1', '#7aafba', '#a7cdc8', '#d6e7d7'],
    bands: [0.18, 0.44, 0.74],
    sun: '#fcf2c4',
    ring1: '#e4edd2',
    ring2: '#c6ded1',
    cloud: '#f0f3e6',
    ridge: ['#9fbdb1', '#7ca696', '#588a7b', '#3a6d5d'],
    mist: '#e8efde',
    ground: ['#cfe0d2', '#6f9a7a', '#27503d'],
    path: '#e9dfbc',
    dapple: '#3d6e50',
    water: '#4e8e9f',
    trunk: ['#8b3f2b', '#3a160f', '#d58e58'],
    trunkFar: ['#6f9484', '#5c8272', '#96b7a2'],
    leaf: ['#1c3f2f', '#0f251a', '#4d7b4c'],
    leafFar: ['#5a8a72', '#4a7a64', '#81b08e'],
    shaft: '#ffffff',
    glow: '#fcf2c4',
    sunX: -0.4,
    sunY: 0.37,
    sunR: 0.06,
    sunTall: [-0.3, 0.4, 0.05],
    rays: 0.3,
    rings: 1,
    stars: 0,
    moon: 0,
    clouds: 1,
    ridgeBase: [0.13, 0.085, 0.05, 0.025],
    ridgeAmp: [0.17, 0.13, 0.09, 0.05],
    ridgeSerr: [0, 0, 0.004, 0.008],
    mistAmt: 1,
    pathAmt: 0,
    riverAmt: 0,
    fogSea: 1,
    dappleAmt: 0.3,
    fogStart: 22,
    fogEnd: 64,
    lightX: -0.4,
    shafts: 0.15,
    fireflies: 0,
    sparks: 0,
    motes: 0.4,
    seed: 51.2,
  },
]

export function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

type Num<T> = { [K in keyof T]: T[K] extends string ? RGB : T[K] extends string[] ? RGB[] : T[K] }
/** A paint with every colour parsed to floats. */
export type Mixed = Num<PlacePaint>

const parsed: Mixed[] = PAINT.map((p) => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string') out[k] = hex(v)
    else if (Array.isArray(v) && typeof v[0] === 'string') out[k] = (v as string[]).map(hex)
    else out[k] = v
  }
  return out as unknown as Mixed
})

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function mixValue(a: unknown, b: unknown, t: number): unknown {
  if (typeof a === 'number') return lerp(a, b as number, t)
  const arr = a as unknown[]
  return arr.map((v, i) => mixValue(v, (b as unknown[])[i], t))
}

/** Paint for a fractional position along the trail (0 … PLACES.length - 1). */
export function paintAt(t: number, out?: Mixed): Mixed {
  const max = parsed.length - 1
  const c = Math.max(0, Math.min(max, t))
  const i = Math.min(max - 1, Math.floor(c))
  const f = c - i
  if (f <= 0.0001) return parsed[i]
  if (f >= 0.9999) return parsed[i + 1]
  // ease so each place holds its own colours a little longer
  const e = f * f * (3 - 2 * f)
  const a = parsed[i] as unknown as Record<string, unknown>
  const b = parsed[i + 1] as unknown as Record<string, unknown>
  const res = (out ?? {}) as unknown as Record<string, unknown>
  for (const k of Object.keys(a)) res[k] = k === 'seed' ? a[k] : mixValue(a[k], b[k], e)
  return res as unknown as Mixed
}

export function paintOf(i: number): Mixed {
  return parsed[Math.max(0, Math.min(parsed.length - 1, i))]
}
