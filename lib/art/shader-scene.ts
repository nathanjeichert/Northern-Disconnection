/*
  Minimal full-screen fragment-shader runner for the site's ambient art.

  One triangle, a handful of uniforms, and the housekeeping every piece
  needs: resolution scaling, a frame-rate cap, pausing while the tab is hidden or
  the canvas is offscreen, a single still frame under reduced motion, and
  graceful failure (the caller keeps its CSS fallback).

  Uniforms provided to every shader:
    u_res    — render-target size in pixels
    u_t      — seconds since start (frozen under reduced motion)
    u_scroll — page scroll in viewport heights (for gentle parallax)
    u_intro  — 0 → 1 over the first seconds, for fade-in choreography
*/

export interface ShaderSceneOptions {
  frag: string
  /** Render scale relative to CSS pixels (not DPR). */
  scale?: number
  /** Frame-rate cap. */
  fps?: number
  /** Time used for the still frame under reduced motion. */
  stillTime?: number
  /** Seconds for u_intro to reach 1. */
  introSeconds?: number
  reducedMotion?: boolean
  /** Called once the first frame has been drawn. */
  onReady?: () => void
}

export interface ShaderScene {
  destroy: () => void
}

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

export const GLSL_COMMON = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return v;
}
float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = r * p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return v;
}
// brand palette (linear-ish sRGB)
const vec3 PINE = vec3(0.047, 0.137, 0.094);
const vec3 MOSS = vec3(0.114, 0.251, 0.188);
const vec3 FOREST = vec3(0.208, 0.369, 0.231);
const vec3 CREAM = vec3(0.969, 0.949, 0.898);
const vec3 RUST = vec3(0.843, 0.706, 0.541);
const vec3 GOLD = vec3(0.914, 0.725, 0.286);
const vec3 BURGUNDY = vec3(0.478, 0.133, 0.188);
const vec3 SAGE = vec3(0.490, 0.518, 0.443);
const vec3 SAND = vec3(0.910, 0.863, 0.776);
// 8-bit dithering so the long dark gradients never band
vec3 dither(vec3 c, vec2 fc) {
  return c + (hash12(fc) - 0.5) / 255.0 * 1.5;
}
`

export function runShaderScene(canvas: HTMLCanvasElement, opts: ShaderSceneOptions): ShaderScene | null {
  const {
    frag,
    scale = 0.5,
    fps = 30,
    stillTime = 12,
    introSeconds = 2.5,
    reducedMotion = false,
    onReady,
  } = opts

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
  })
  if (!gl) return null
  gl.getExtension('OES_standard_derivatives')

  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader))
    }
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const uRes = gl.getUniformLocation(program, 'u_res')
  const uT = gl.getUniformLocation(program, 'u_t')
  const uScroll = gl.getUniformLocation(program, 'u_scroll')
  const uIntro = gl.getUniformLocation(program, 'u_intro')

  let announced = false

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(2, Math.round(rect.width * scale))
    const h = Math.max(2, Math.round(rect.height * scale))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
  }

  let scroll = window.scrollY / Math.max(1, window.innerHeight)
  let smoothScroll = scroll

  const draw = (t: number, intro: number) => {
    resize()
    gl.uniform2f(uRes, canvas.width, canvas.height)
    gl.uniform1f(uT, t)
    gl.uniform1f(uScroll, smoothScroll)
    gl.uniform1f(uIntro, intro)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    if (!announced) {
      announced = true
      onReady?.()
    }
  }

  let raf = 0
  let running = false
  let visible = true
  let lost = false
  let last = 0
  let elapsed = 0
  let prevNow = performance.now()
  const frameGap = 1000 / fps

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    const dt = Math.min(100, now - prevNow)
    prevNow = now
    elapsed += dt
    if (now - last < frameGap - 2) return
    last = now
    smoothScroll += (scroll - smoothScroll) * 0.12
    const t = elapsed / 1000
    draw(t, Math.min(1, t / introSeconds))
  }

  const start = () => {
    if (running || lost || reducedMotion || !visible || document.hidden) return
    running = true
    prevNow = performance.now()
    raf = requestAnimationFrame(tick)
  }
  const stop = () => {
    running = false
    cancelAnimationFrame(raf)
  }

  const onScroll = () => {
    scroll = window.scrollY / Math.max(1, window.innerHeight)
    if (reducedMotion) {
      smoothScroll = scroll
      draw(stillTime, 1)
    }
  }
  const onVisibility = () => (document.hidden ? stop() : start())
  const onResize = () => {
    if (reducedMotion) draw(stillTime, 1)
  }
  const onLost = (e: Event) => {
    e.preventDefault()
    lost = true
    stop()
  }

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting)
    if (visible) start()
    else stop()
  })
  io.observe(canvas)

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.addEventListener('webglcontextlost', onLost)

  if (reducedMotion) draw(stillTime, 1)
  else start()

  return {
    destroy: () => {
      stop()
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
    },
  }
}
