/*
  Audio analysis for the stump.

  StumpAnalysis turns an AnalyserNode (or, when the stream can't be read,
  a synthetic groove) into musically meaningful features once per frame:
  a 64-band log spectrum over ~40 Hz–8 kHz with auto-gain and a treble
  tilt, smoothed level, bass/mid/treble energies, and onset detection
  (spectral flux against an adaptive threshold) with a separate kick
  detector for the low end.
*/

export const BANDS = 64
const F_LO = 40
const F_HI = 8000
const RATIO = F_HI / F_LO

/** Center frequency (Hz) of band i. */
export function bandHz(i: number): number {
  return F_LO * Math.pow(RATIO, (i + 0.5) / BANDS)
}

const BASS_END = bandIndexFor(170)
const MID_START = bandIndexFor(250)
const MID_END = bandIndexFor(2000)
const TREBLE_START = bandIndexFor(2500)
const KICK_END = bandIndexFor(190)

function bandIndexFor(hz: number): number {
  return Math.max(0, Math.min(BANDS - 1, Math.round((Math.log(hz / F_LO) / Math.log(RATIO)) * BANDS - 0.5)))
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// ---------------------------------------------------------------------------
// Synthetic drive: a plausible americana groove rendered straight into the
// band domain, so the stump dances convincingly even without stream data.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const LOG2_HZ = Array.from({ length: BANDS }, (_, i) => Math.log2(bandHz(i)))
const gauss = (x: number, w: number) => Math.exp(-(x * x) / (2 * w * w))

export class PseudoMusic {
  private t = 0
  private readonly bpm: number
  private readonly seed: number
  private readonly jitter = new Float32Array(BANDS)
  private readonly rand: () => number

  constructor(seed = 7) {
    this.seed = seed
    this.rand = mulberry32(seed)
    this.bpm = 104 + Math.floor(this.rand() * 16)
  }

  /** Advance the groove by dt seconds and write band energies (0..1). */
  render(dt: number, out: Float32Array) {
    this.t += dt
    const beatLen = 60 / this.bpm
    const beats = this.t / beatLen
    const bar = Math.floor(beats / 4)
    const inBar = beats - bar * 4
    const s = this.seed * 13.7
    const section = bar % 32
    const intro = section < 2
    const chorus = section >= 16 && section < 24
    const breakdown = section >= 24 && section < 27
    const drums = !intro && !breakdown
    const dyn = intro ? 0.55 : breakdown ? 0.6 : chorus ? 1.0 : 0.8

    // kick pattern with per-bar variation
    const kicks = [0, 2]
    if (hash1(bar + s) > 0.45) kicks.push(2.5)
    if (hash1(bar * 1.7 + s) > 0.7) kicks.push(3.5)
    if (chorus) kicks.push(1.5)
    const since = (list: number[]) => {
      let best = 99
      for (const k of list) if (inBar >= k) best = Math.min(best, (inBar - k) * beatLen)
      // also carry the tail of last bar's final hit
      if (best === 99) best = (inBar + 4 - Math.max(...list)) * beatLen
      return best
    }
    const kick = drums || (breakdown && section === 26) ? Math.exp(-since(kicks) / 0.1) : 0
    const snare = drums ? Math.exp(-since([1, 3]) / 0.13) * (hash1(bar * 3.1 + s) > 0.85 ? 1.15 : 1) : 0
    const eighth = inBar * 2
    const e8 = Math.floor(eighth)
    const swingPos = e8 % 2 === 0 ? e8 / 2 : (e8 - 1) / 2 + 0.58
    const hatSince = Math.max(0, (inBar - swingPos) * beatLen)
    const hat = drums || breakdown ? Math.exp(-hatSince / 0.045) * (e8 % 2 === 0 ? 0.8 : 0.55) : 0
    const crash = chorus && section === 16 ? Math.exp(-(beats - bar * 4) * beatLen / 1.4) : 0

    // harmony: I–IV–V–I in A, one chord per bar
    const prog = [0, 5, 7, 0, 0, 5, 7, 7]
    const root = prog[bar % prog.length]
    const bassHz = 55 * Math.pow(2, (root + (inBar >= 2 && hash1(bar * 5.3 + s) > 0.5 ? 7 : 0)) / 12)
    const bassPluck = Math.exp(-((inBar % 1) * beatLen) / 0.32)
    const bassAmp = intro ? 0.25 : 0.45 + 0.55 * bassPluck
    const chordHz = [220, 277.2, 329.6].map((f) => f * Math.pow(2, root / 12))
    const strum = Math.exp(-((eighth % 1) * beatLen * 0.5) / 0.22)
    const chordAmp = (0.42 + 0.3 * strum) * (0.85 + 0.15 * Math.sin(this.t * 0.7))
    const phrase = Math.floor(bar / 2)
    const singing = !intro && hash1(phrase * 2.3 + s) > 0.35
    const vowel = 0.5 + 0.5 * Math.sin(this.t * 2.1 + Math.sin(this.t * 0.37) * 3)
    const vox = singing ? (0.55 + 0.25 * Math.sin(this.t * 5.5)) * (0.6 + 0.4 * Math.sin((beats % 8) * 0.39)) : 0

    const lb = Math.log2(bassHz)
    for (let i = 0; i < BANDS; i++) {
      const l = LOG2_HZ[i]
      let e = 0.05
      e += kick * (1.5 * gauss(l - 5.9, 0.45) + 0.25 * gauss(l - 11.6, 0.7)) // 60 Hz thump + beater click
      e += snare * (0.8 * gauss(l - 7.7, 0.4) + 0.6 * gauss(l - 11.5, 1.2))
      e += hat * 0.7 * gauss(l - 12.8, 0.45)
      e += crash * 0.9 * gauss(l - 12.3, 0.9)
      e += bassAmp * (0.9 * gauss(l - lb, 0.12) + 0.45 * gauss(l - lb - 1, 0.12) + 0.2 * gauss(l - lb - 1.58, 0.12))
      for (const f of chordHz) e += chordAmp * 0.34 * (gauss(l - Math.log2(f), 0.09) + 0.4 * gauss(l - Math.log2(f) - 1, 0.1))
      e += chordAmp * 0.18 * gauss(l - 9.6, 1.1)
      e += vox * (0.5 * gauss(l - 9.3 - vowel * 0.5, 0.3) + 0.3 * gauss(l - 10.9 - vowel * 0.4, 0.35))
      this.jitter[i] += (this.rand() - 0.5) * 0.08 - this.jitter[i] * 0.2
      const v = 1 - Math.exp(-e * dyn * 1.25)
      out[i] = clamp01(v * (0.94 + this.jitter[i]))
    }
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export class StumpAnalysis {
  /** Smoothed display spectrum, 0..1 (fast attack, slow release). */
  readonly bins = new Float32Array(BANDS)
  /** This frame's normalized spectrum, 0..1. */
  readonly raw = new Float32Array(BANDS)
  level = 0
  bass = 0
  mid = 0
  treble = 0
  /** 0..1 envelope that jumps on onsets and decays. */
  onset = 0
  /** 0..1 envelope for low-end onsets (kick drum / bass hits). */
  kick = 0
  /** True on the frame an onset fires. */
  beat = false
  kickHit = false
  beatStrength = 0
  /** Band with the largest rise at the last onset. */
  beatBand = 0
  sinceBeat = 99
  beats = 0
  /** Whether the last update read real stream data. */
  live = false

  private readonly prev = new Float32Array(BANDS)
  private fft: Uint8Array = new Uint8Array(1024)
  private mapKey = ''
  private lo = new Float32Array(BANDS)
  private hi = new Float32Array(BANDS)
  private tilt = new Float32Array(BANDS)
  private ref = -45
  private fluxAvg = 0.02
  private fluxDev = 0.01
  private armed = true
  private kickAvg = 0.02
  private kickDev = 0.01
  private kickArmed = true
  private sinceKick = 99
  private readonly synth: PseudoMusic

  constructor(seed = 7) {
    this.synth = new PseudoMusic(seed)
  }

  private buildMap(analyser: AnalyserNode) {
    const sr = analyser.context.sampleRate
    const key = `${sr}:${analyser.fftSize}`
    if (key === this.mapKey) return
    this.mapKey = key
    this.fft = new Uint8Array(analyser.frequencyBinCount)
    const binHz = sr / analyser.fftSize
    for (let i = 0; i < BANDS; i++) {
      this.lo[i] = (F_LO * Math.pow(RATIO, i / BANDS)) / binHz
      this.hi[i] = (F_LO * Math.pow(RATIO, (i + 1) / BANDS)) / binHz
      // live music rolls off steeply above the low mids; tilt it back so
      // the treble rings get their share of motion
      this.tilt[i] = 5.5 * Math.max(0, Math.log2(bandHz(i) / 140))
    }
  }

  private readLive(analyser: AnalyserNode, dt: number) {
    this.buildMap(analyser)
    if (analyser.smoothingTimeConstant !== 0.5) analyser.smoothingTimeConstant = 0.5
    analyser.getByteFrequencyData(this.fft)
    const fft = this.fft
    const minDb = analyser.minDecibels
    const span = (analyser.maxDecibels - minDb) / 255
    const n = fft.length - 1
    let peak = -200
    for (let i = 0; i < BANDS; i++) {
      const a = this.lo[i]
      const b = this.hi[i]
      let v: number
      if (b - a < 1) {
        const c = Math.min(n - 1, (a + b) * 0.5)
        const i0 = Math.floor(c)
        const f = c - i0
        v = fft[i0] * (1 - f) + fft[i0 + 1] * f
      } else {
        v = 0
        const end = Math.min(n, Math.ceil(b))
        for (let j = Math.floor(a); j < end; j++) if (fft[j] > v) v = fft[j]
      }
      const db = v <= 0 ? -200 : minDb + v * span + this.tilt[i]
      this.raw[i] = db
      if (db > peak) peak = db
    }
    // auto-gain: fast to rise, slow to fall, floored so hiss never fills the frame
    const target = Math.max(peak, -72)
    const k = target > this.ref ? 1 - Math.exp(-dt / 0.25) : 1 - Math.exp(-dt / 5)
    this.ref += (target - this.ref) * k
    const floor = this.ref - 44
    for (let i = 0; i < BANDS; i++) {
      const v = clamp01((this.raw[i] - floor) / 44)
      this.raw[i] = v * v * (1.6 - 0.6 * v) // gentle expansion: peaks pop, mush stays low
    }
  }

  update(analyser: AnalyserNode | null, playing: boolean, synthetic: boolean, dt: number) {
    dt = Math.max(1 / 240, Math.min(dt, 0.1))
    this.live = false
    if (playing && analyser && !synthetic) {
      this.readLive(analyser, dt)
      this.live = true
    } else if (playing) {
      this.synth.render(dt, this.raw)
    } else {
      const d = Math.exp(-dt / 0.12)
      for (let i = 0; i < BANDS; i++) this.raw[i] *= d
    }

    const raw = this.raw
    let flux = 0
    let fluxW = 0
    let kickFlux = 0
    let bestRise = 0
    let bestBand = this.beatBand
    let sum2 = 0
    let bass = 0
    let mid = 0
    let treble = 0
    for (let i = 0; i < BANDS; i++) {
      const v = raw[i]
      const rise = v - this.prev[i]
      this.prev[i] = v
      const w = i <= KICK_END ? 1.5 : i >= TREBLE_START ? 0.7 : 1
      if (rise > 0) {
        flux += rise * w
        if (i <= KICK_END) kickFlux += rise
        if (rise > bestRise) {
          bestRise = rise
          bestBand = i
        }
      }
      fluxW += w
      sum2 += v * v
      if (i <= BASS_END) bass += v
      else if (i >= MID_START && i <= MID_END) mid += v
      else if (i >= TREBLE_START) treble += v
      const rel = Math.exp(-dt / 0.2)
      this.bins[i] = Math.max(v, this.bins[i] * rel)
    }
    // normalise flux to a 60 fps frame so thresholds hold at 120 Hz too
    const fpsNorm = 1 / Math.max(0.5, dt * 60)
    flux = (flux / fluxW) * fpsNorm * 8
    kickFlux = (kickFlux / (KICK_END + 1)) * fpsNorm * 4

    this.sinceBeat += dt
    this.sinceKick += dt
    this.beat = false
    this.kickHit = false
    if (playing) {
      const ka = 1 - Math.exp(-dt / 0.9)
      const thr = this.fluxAvg + 1.5 * this.fluxDev + 0.02
      if (this.armed && flux > thr && this.sinceBeat > 0.13) {
        this.beat = true
        this.beats++
        this.sinceBeat = 0
        this.beatStrength = clamp01(0.3 + ((flux - thr) / (thr + 0.03)) * 0.9)
        this.beatBand = bestBand
        this.armed = false
      } else if (flux < this.fluxAvg + 0.4 * this.fluxDev) {
        this.armed = true
      }
      this.fluxDev += (Math.abs(flux - this.fluxAvg) - this.fluxDev) * ka
      this.fluxAvg += (flux - this.fluxAvg) * ka

      const kthr = this.kickAvg + 1.6 * this.kickDev + 0.02
      if (this.kickArmed && kickFlux > kthr && this.sinceKick > 0.16) {
        this.kickHit = true
        this.sinceKick = 0
        this.kick = Math.max(this.kick, clamp01(0.45 + ((kickFlux - kthr) / (kthr + 0.03)) * 0.8))
        this.kickArmed = false
      } else if (kickFlux < this.kickAvg + 0.4 * this.kickDev) {
        this.kickArmed = true
      }
      this.kickDev += (Math.abs(kickFlux - this.kickAvg) - this.kickDev) * ka
      this.kickAvg += (kickFlux - this.kickAvg) * ka
    }

    this.onset = Math.max(this.beat ? this.beatStrength : 0, this.onset * Math.exp(-dt / 0.22))
    this.kick *= Math.exp(-dt / 0.17)

    const ease = (cur: number, target: number, up: number, down: number) =>
      cur + (target - cur) * (1 - Math.exp(-dt / (target > cur ? up : down)))
    this.level = ease(this.level, clamp01(Math.sqrt(sum2 / BANDS) * 1.15), 0.04, 0.35)
    this.bass = ease(this.bass, clamp01((bass / (BASS_END + 1)) * 1.15), 0.03, 0.22)
    this.mid = ease(this.mid, clamp01((mid / (MID_END - MID_START + 1)) * 1.25), 0.04, 0.3)
    this.treble = ease(this.treble, clamp01((treble / (BANDS - TREBLE_START)) * 1.3), 0.03, 0.25)
  }
}
