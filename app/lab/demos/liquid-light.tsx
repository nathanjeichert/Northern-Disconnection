'use client'

import { useEffect, useRef } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { cappedDpr } from './support'

/*
  Specimen 04 — a 1960s liquid-light-show oil projection as a fragment
  shader, graded to the site palette and posterized so it reads as
  screen-printed ink rather than a lava lamp. Raw WebGL, no three.js:
  the whole thing is one fullscreen triangle and ~60 lines of GLSL
  (domain-warped fractal noise), so it weighs a few KB and sips GPU.
*/

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_t;
uniform vec2 u_m;

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
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

vec3 grade(float v) {
  vec3 pine   = vec3(0.047, 0.137, 0.094);
  vec3 moss   = vec3(0.114, 0.251, 0.188);
  vec3 forest = vec3(0.208, 0.369, 0.231);
  vec3 tan_   = vec3(0.843, 0.706, 0.541);
  vec3 gold   = vec3(0.914, 0.725, 0.286);
  vec3 cream  = vec3(0.969, 0.949, 0.898);
  if (v < 0.30) return mix(pine, moss, v / 0.30);
  if (v < 0.52) return mix(moss, forest, (v - 0.30) / 0.22);
  if (v < 0.70) return mix(forest, tan_, (v - 0.52) / 0.18);
  if (v < 0.85) return mix(tan_, gold, (v - 0.70) / 0.15);
  return mix(gold, cream, (v - 0.85) / 0.15);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  p += u_m * 0.16;
  float t = u_t * 0.045;

  vec2 q = vec2(fbm(p * 1.7 + vec2(0.0, t)), fbm(p * 1.7 + vec2(5.2, -t * 1.26)));
  vec2 r = vec2(
    fbm(p * 1.7 + 2.6 * q + vec2(1.7, 9.2) + t * 0.35),
    fbm(p * 1.7 + 2.6 * q + vec2(8.3, 2.8) - t * 0.24)
  );
  float v = fbm(p * 1.7 + 2.2 * r);
  v = clamp(v * 1.45 - 0.10, 0.0, 1.0);

  // posterize toward a screen-print, keep a little liquid in the blend
  float bands = 7.0;
  v = mix(v, floor(v * bands) / bands + 0.5 / bands, 0.55);

  vec3 col = grade(v);
  col = mix(col, vec3(0.478, 0.133, 0.188), smoothstep(0.55, 0.95, q.y) * 0.22);
  col += (hash(gl_FragCoord.xy + fract(u_t) * 7.0) - 0.5) * 0.05;
  col *= 1.0 - 0.4 * dot(p, p);

  gl_FragColor = vec4(col, 1.0);
}
`

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

export default function LiquidLight() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inView = useInView(wrapRef, { margin: '15% 0px 15% 0px' })
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
    if (!gl) return

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
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, 'u_res')
    const uT = gl.getUniformLocation(program, 'u_t')
    const uM = gl.getUniformLocation(program, 'u_m')

    const dpr = cappedDpr(1.25)
    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      canvas.width = Math.max(2, Math.round(rect.width * dpr))
      canvas.height = Math.max(2, Math.round(rect.height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    let raf = 0
    let lost = false
    let pointerActive = false
    let targetX = 0
    let targetY = 0
    let curX = 0
    let curY = 0

    const onPointerMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      pointerActive = true
      targetX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      targetY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    }
    const onPointerLeave = () => { pointerActive = false }
    wrap.addEventListener('pointermove', onPointerMove)
    wrap.addEventListener('pointerleave', onPointerLeave)

    const drawFrame = (t: number) => {
      if (!pointerActive) {
        targetX = Math.sin(t * 0.1) * 0.35
        targetY = Math.cos(t * 0.08) * 0.35
      }
      curX += (targetX - curX) * 0.03
      curY += (targetY - curY) * 0.03
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uT, t)
      gl.uniform2f(uM, curX, curY)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const start = performance.now()
    const tick = (now: number) => {
      if (lost) return
      drawFrame((now - start) / 1000)
      raf = requestAnimationFrame(tick)
    }

    if (reducedMotion) {
      drawFrame(42)
    } else if (inView) {
      raf = requestAnimationFrame(tick)
    }

    const onLost = (e: Event) => {
      e.preventDefault()
      lost = true
      cancelAnimationFrame(raf)
    }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('webglcontextlost', onLost)
      wrap.removeEventListener('pointermove', onPointerMove)
      wrap.removeEventListener('pointerleave', onPointerLeave)
      ro.disconnect()
      gl.deleteProgram(program)
      gl.deleteBuffer(buf)
    }
  }, [inView, reducedMotion])

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden aspect-[4/3] sm:aspect-[21/9]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <p className="absolute bottom-3 right-4 hidden text-xs italic text-cream/50 sm:block">
        drag through the oil — it follows
      </p>
    </div>
  )
}
