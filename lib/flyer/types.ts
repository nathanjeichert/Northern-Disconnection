import type { Show } from '@/types/content'
import type { Ctx, Fonts, LogoArt, Rng, ShowCopy } from './kit'

export type FlyerFormat = 'post' | 'story'

export interface StyleContext {
  ctx: Ctx
  w: number
  h: number
  format: FlyerFormat
  /** True for the tall 9:16 story format. */
  story: boolean
  show: Show
  copy: ShowCopy
  seed: number
  /** Base RNG — use `rng.fork('label')` for choices that should survive a format switch. */
  rng: Rng
  fonts: Fonts
  logo: LogoArt | null
  /** Four-digit print number derived from the seed, e.g. "0421". */
  printNo: string
}

export type StyleRenderer = (sc: StyleContext) => void | Promise<void>
