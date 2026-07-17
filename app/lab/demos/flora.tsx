// Procedural silhouette flora for the lab scenes: redwoods, ferns, and a
// hanging canopy. Pure functions of a seeded RNG, safe to render on the
// server. Shapes are rough on purpose — silhouettes read as woodcut ink.

import { makeRng } from './support'

type Rng = () => number

/**
 * A redwood silhouette as an SVG path: tall, narrow, slightly asymmetric
 * crown built from drooping branch tiers over a short trunk.
 */
export function coniferPath(cx: number, baseY: number, h: number, w: number, rng: Rng): string {
  const tiers = 12
  const crownH = h * 0.94
  const tipX = cx + (rng() - 0.5) * w * 0.14
  const trunkW = Math.max(1.6, w * 0.05)

  const side = (dir: 1 | -1) => {
    const pts: string[] = []
    for (let i = 1; i <= tiers; i++) {
      const t = i / tiers
      const y = baseY - h + t * crownH
      const tierH = crownH / tiers
      const reach = (w / 2) * Math.pow(t, 0.72) * (0.72 + rng() * 0.52)
      const droop = tierH * (0.35 + rng() * 0.4)
      // branch tip, then a notch back toward the trunk
      pts.push(`L ${(cx + dir * reach).toFixed(1)} ${(y + droop).toFixed(1)}`)
      pts.push(`L ${(cx + dir * Math.max(trunkW, reach * 0.38)).toFixed(1)} ${(y + tierH * 0.55).toFixed(1)}`)
    }
    return pts
  }

  const right = side(1)
  const leftUp = side(-1).reverse()

  return [
    `M ${tipX.toFixed(1)} ${(baseY - h).toFixed(1)}`,
    ...right,
    `L ${(cx + trunkW).toFixed(1)} ${baseY.toFixed(1)}`,
    `L ${(cx - trunkW).toFixed(1)} ${baseY.toFixed(1)}`,
    ...leftUp,
    'Z',
  ].join(' ')
}

/** A clump of fern blades fanning out of one point on the forest floor. */
export function fernPath(cx: number, baseY: number, size: number, rng: Rng): string {
  const blades = 6 + Math.floor(rng() * 3)
  const parts: string[] = []
  for (let i = 0; i < blades; i++) {
    const angle = -Math.PI / 2 + ((i / (blades - 1)) - 0.5) * (Math.PI * 0.85)
    const len = size * (0.6 + rng() * 0.5)
    const tipX = cx + Math.cos(angle) * len
    const tipY = baseY + Math.sin(angle) * len
    const ctrlX = cx + Math.cos(angle) * len * 0.5 - Math.sin(angle) * len * 0.18
    const ctrlY = baseY + Math.sin(angle) * len * 0.5 + Math.cos(angle) * len * 0.18
    const half = Math.max(0.8, size * 0.045)
    parts.push(
      `M ${(cx - half).toFixed(1)} ${baseY.toFixed(1)}`,
      `Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)}`,
      `Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${(cx + half).toFixed(1)} ${baseY.toFixed(1)}`,
      'Z'
    )
  }
  return parts.join(' ')
}

interface TreeLineProps {
  seed: number
  count: number
  fill: string
  /** Height range of trees as a fraction of the 600-unit viewBox height. */
  minH?: number
  maxH?: number
  className?: string
  style?: React.CSSProperties
  opacity?: number
}

const VIEW_W = 1200
const VIEW_H = 600

/** A band of redwood silhouettes pinned to the bottom of its box. */
export function TreeLine({
  seed,
  count,
  fill,
  minH = 0.45,
  maxH = 0.9,
  className,
  style,
  opacity = 1,
}: TreeLineProps) {
  const rng = makeRng(seed)
  const paths: string[] = []
  for (let i = 0; i < count; i++) {
    const cx = (i + 0.5) * (VIEW_W / count) + (rng() - 0.5) * (VIEW_W / count) * 0.9
    const h = VIEW_H * (minH + rng() * (maxH - minH))
    const w = h * (0.24 + rng() * 0.1)
    paths.push(coniferPath(cx, VIEW_H + 2, h, w, rng))
  }
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMax slice"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={paths.join(' ')} fill={fill} opacity={opacity} fillRule="nonzero" />
    </svg>
  )
}

interface FernBedProps {
  seed: number
  count: number
  fill: string
  className?: string
  style?: React.CSSProperties
}

/** A strip of fern clumps along the bottom edge. */
export function FernBed({ seed, count, fill, className, style }: FernBedProps) {
  const rng = makeRng(seed)
  const paths: string[] = []
  for (let i = 0; i < count; i++) {
    const cx = (i + 0.5) * (VIEW_W / count) + (rng() - 0.5) * 60
    const size = 60 + rng() * 90
    paths.push(fernPath(cx, VIEW_H + 4, size, rng))
  }
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMax slice"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={paths.join(' ')} fill={fill} />
    </svg>
  )
}
