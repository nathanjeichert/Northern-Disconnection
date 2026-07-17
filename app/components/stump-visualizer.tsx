'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/*
  The redwood stump: a procedural wood cross-section rendered in a single
  fragment shader, driven by live frequency data. Bass moves the heartwood,
  treble shimmers the sapwood. The whole stump — variable-width growth
  rings, heartwood-to-sapwood grading, drying cracks, fissured cinnamon
  bark — is math, so it stays crisp at any size and costs one draw call.

  Audio arrives as a 64x1 texture the parent fills each frame via
  `analyser`; when nothing plays (or the stream is CORS-tainted) the rings
  breathe on a slow synthetic swell instead.
*/

interface StumpVisualizerProps {
  analyserRef: React.RefObject<AnalyserNode | null>
  playing: boolean
  /** True when real frequency data is unavailable (fall back to breathing). */
  synthetic?: boolean
  className?: string
}

const BIN_COUNT = 64

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_t;
uniform float u_level;
uniform sampler2D u_bins;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(31.7, 11.3);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / (0.5 * min(u_res.x, u_res.y));
  p *= 1.0 + 0.02 * u_level;                 // whole stump breathes with loudness

  float rot = u_t * 0.018;
  p = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p;

  vec2 pc = p + vec2(0.05, -0.035);          // pith sits off-center, like a real tree
  float ang = atan(pc.y, pc.x);
  float r = length(pc);

  // trunk outline: low-frequency lobes, like buttressed old growth
  float lobes = 1.0
    + 0.040 * sin(ang * 2.0 + 1.7)
    + 0.030 * sin(ang * 3.0 - 0.6)
    + 0.045 * (noise(vec2(ang * 1.4, 3.7)) - 0.5);
  float R = 0.84 * lobes;
  float rn = r / R;                          // 0 at pith, ~1 at outer bark

  // audio: each radius samples its own frequency band (bass inner)
  float amp = texture2D(u_bins, vec2(clamp(rn, 0.0, 1.0) * 0.92 + 0.02, 0.5)).r;

  // growth rings: warped, with per-ring width variation (fat years, lean years)
  float ringWarp = 1.5 * fbm(pc * 2.6) + 0.55 * fbm(pc * 7.5);
  float rc = rn * 60.0 + ringWarp * 3.2 + amp * 0.5 * sin(ang * 3.0 + u_t * 1.4);
  float ringIdx = floor(rc);
  float f = fract(rc);
  float widthVar = 0.45 + 0.42 * hash(vec2(ringIdx, 7.0));
  float late = smoothstep(widthVar, widthVar + 0.18, f) * (0.5 + 0.5 * hash(vec2(ringIdx, 13.0)));
  late *= 0.7 + amp * 1.6;                   // rings glow with their band

  // wood: deep red heartwood grading out to pale sapwood
  vec3 heartDeep = vec3(0.40, 0.185, 0.115);
  vec3 heart     = vec3(0.54, 0.28, 0.17);
  vec3 heartPale = vec3(0.67, 0.41, 0.26);
  vec3 sap       = vec3(0.86, 0.74, 0.52);
  vec3 wood = mix(heartDeep, heart, smoothstep(0.0, 0.34, rn));
  wood = mix(wood, heartPale, smoothstep(0.34, 0.76, rn));
  wood = mix(wood, sap, smoothstep(0.78, 0.92, rn));

  wood *= 1.0 - late * 0.42;
  wood += vec3(0.91, 0.72, 0.29) * late * amp * 0.38;   // marigold sheen on live rings

  // radial fiber + fine mottle
  wood *= 0.94 + 0.10 * noise(vec2(ang * 34.0, rn * 5.0));
  wood *= 0.96 + 0.07 * noise(pc * 40.0);

  // drying cracks, widening as they run outward
  float crack = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float ca = 6.2831853 * fi / 5.0 + hash(vec2(fi, 3.3)) * 1.3;
    float d = abs(mod(ang - ca + 3.14159, 6.2831853) - 3.14159);
    float wdt = 0.012 + 0.055 * rn * rn * (0.5 + 0.5 * hash(vec2(fi, 9.1)));
    float m = smoothstep(wdt, wdt * 0.2, d) * smoothstep(0.10, 0.5, rn);
    m *= 0.7 + 0.3 * noise(vec2(rn * 26.0, fi * 17.0));
    crack = max(crack, m);
  }
  wood = mix(wood, vec3(0.12, 0.06, 0.035), crack * 0.85);

  // bark: fissured cinnamon-brown annulus with a ragged outer edge
  float barkEdgeNoise = 0.5 * noise(vec2(ang * 9.0, 2.1)) + 0.5 * noise(vec2(ang * 23.0, 5.7));
  float outerEdge = 1.0 + 0.075 * barkEdgeNoise;
  float inBark = smoothstep(0.905, 0.94, rn);
  float fiss = noise(vec2(ang * 58.0, rn * 6.0));
  float fiss2 = noise(vec2(ang * 150.0, rn * 3.0));
  vec3 bark = mix(vec3(0.155, 0.085, 0.05), vec3(0.36, 0.20, 0.115), smoothstep(0.15, 0.85, fiss));
  bark = mix(bark, vec3(0.50, 0.31, 0.18), smoothstep(0.72, 0.95, fiss2) * 0.6);
  bark *= 0.82 + 0.30 * noise(vec2(ang * 280.0, rn * 9.0));
  float cambium = smoothstep(0.906, 0.918, rn) * (1.0 - smoothstep(0.924, 0.94, rn));
  bark = mix(bark, vec3(0.84, 0.70, 0.47), cambium * 0.5);
  wood = mix(wood, bark, inBark);

  // shading: soft AO toward the edge, top-left daylight, dark pith
  wood *= 1.0 - 0.24 * smoothstep(0.5, 0.95, rn) * (1.0 - inBark * 0.5);
  wood *= 1.0 + 0.10 * dot(vec2(-0.53, 0.85), pc) * (1.0 - inBark * 0.4);
  wood = mix(wood, vec3(0.19, 0.095, 0.055), smoothstep(0.035, 0.012, r));

  float edge = smoothstep(outerEdge, outerEdge - 0.018, rn);
  gl_FragColor = vec4(wood, 1.0) * edge;
}
`

export default function StumpVisualizer({ analyserRef, playing, synthetic = false, className }: StumpVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion()
  const [webglFailed, setWebglFailed] = useState(false)
  const playingRef = useRef(playing)
  const syntheticRef = useRef(synthetic)
  playingRef.current = playing
  syntheticRef.current = synthetic

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true })
    if (!gl) {
      setWebglFailed(true)
      return
    }

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, src)
      gl.compileShader(shader)
      return shader
    }
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setWebglFailed(true)
      return
    }
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, 'u_res')
    const uT = gl.getUniformLocation(program, 'u_t')
    const uLevel = gl.getUniformLocation(program, 'u_level')
    const uBins = gl.getUniformLocation(program, 'u_bins')

    // 64x1 luminance texture carrying the smoothed spectrum
    const binTex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, binTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const bins = new Uint8Array(BIN_COUNT)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, BIN_COUNT, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bins)
    gl.uniform1i(uBins, 0)

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(2, Math.round(rect.width * dpr))
      canvas.height = Math.max(2, Math.round(rect.height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const raw = new Uint8Array(1024)
    let level = 0

    const fillBins = (t: number) => {
      const analyser = analyserRef.current
      const live = playingRef.current && analyser && !syntheticRef.current
      if (live) {
        analyser.getByteFrequencyData(raw)
        const usable = Math.min(raw.length, Math.floor(analyser.frequencyBinCount * 0.7))
        let sum = 0
        for (let i = 0; i < BIN_COUNT; i++) {
          // slightly logarithmic bin spacing so lows don't hog the stump
          const start = Math.floor(Math.pow(i / BIN_COUNT, 1.3) * usable)
          const end = Math.max(start + 1, Math.floor(Math.pow((i + 1) / BIN_COUNT, 1.3) * usable))
          let v = 0
          for (let j = start; j < end; j++) v = Math.max(v, raw[j])
          sum += v
          // fast attack, slow release
          bins[i] = Math.max(v, Math.round(bins[i] * 0.9))
        }
        level += ((sum / BIN_COUNT / 255) * 1.4 - level) * 0.08
      } else {
        // idle / synthetic: a slow sap-rise swell through the rings
        const base = playingRef.current ? 60 : 34
        for (let i = 0; i < BIN_COUNT; i++) {
          const wave = 0.5 + 0.5 * Math.sin(t * 1.15 - (i / BIN_COUNT) * 4.2)
          bins[i] = Math.round(base * Math.pow(wave, 1.6))
        }
        level += ((playingRef.current ? 0.22 : 0.1) - level) * 0.04
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BIN_COUNT, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, bins)
    }

    const drawFrame = (t: number) => {
      fillBins(t)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uT, t)
      gl.uniform1f(uLevel, level)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    let raf = 0
    let lost = false
    const start = performance.now()
    const tick = (now: number) => {
      if (lost) return
      drawFrame((now - start) / 1000)
      raf = requestAnimationFrame(tick)
    }

    if (reducedMotion) {
      drawFrame(21)
    } else {
      raf = requestAnimationFrame(tick)
    }

    const onLost = (e: Event) => {
      e.preventDefault()
      lost = true
      cancelAnimationFrame(raf)
      setWebglFailed(true)
    }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('webglcontextlost', onLost)
      ro.disconnect()
      gl.deleteTexture(binTex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
    }
  }, [analyserRef, reducedMotion])

  if (webglFailed) {
    // graceful stand-in: a flat wood disc so the player still reads
    return (
      <div
        className={className}
        aria-hidden="true"
        style={{
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 47% 46%, #6b3421 0%, #8c4a2e 34%, #a86642 62%, #dec28c 82%, #59331f 88%, #2a1710 100%)',
        }}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="Redwood stump cross-section pulsing with the music"
    />
  )
}
