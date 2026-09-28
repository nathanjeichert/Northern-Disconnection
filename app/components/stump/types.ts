import type { RefObject } from 'react'

/** Props the stump receives from the tape deck. */
export interface StumpVariantProps {
  analyserRef: RefObject<AnalyserNode | null>
  playing: boolean
  /** True when real stream data is unavailable: drive from the synthetic groove. */
  synthetic?: boolean
  /** 0..1 progress through the current song. */
  progress?: number
  /** Clicking the stump toggles play/pause. */
  onToggle?: () => void
  className?: string
}
