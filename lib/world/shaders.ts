/*
  GLSL for the world canvas. Screen space ("p") is measured in viewport
  heights: y is 0.5 at the top of the first screen and runs negative below
  the fold (the canvas is taller than the viewport — the poster keeps going
  down to the forest floor), x is 0 at the centre. A world point at
  (dx, dy, dz) from the camera lands at p = (dx / dz, hy + dy / dz), i.e.
  the lens has a 53° vertical field of view.
*/

const COMMON = `
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
float n2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm1(float x) { return n1(x) * 0.5 + n1(x * 2.07 + 7.3) * 0.27 + n1(x * 4.3 + 1.7) * 0.15 + n1(x * 9.1 + 4.1) * 0.08; }
float aastep(float edge, float v) { float w = fwidth(v) * 0.7 + 1e-5; return smoothstep(edge - w, edge + w, v); }
/* the trail's centre line — mirrored in engine.ts */
float pathX(float z) { return 2.4 * sin(z * 0.043 + 1.3) + 1.1 * sin(z * 0.097 + 0.4); }
`

const P_TO_CLIP = `
vec4 toClip(vec2 p) {
  return vec4(p.x * u_vh / (u_res.x * 0.5), 1.0 - 2.0 * (0.5 - p.y) * u_vh / u_res.y, 0.0, 1.0);
}
`

export const FULLSCREEN_VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0); }
`

/* Sky, sun or moon, clouds, far ridges and the ground plane: one flat-ink
   poster painted per pixel. */
export const BACKDROP_FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform float u_vh;
uniform float u_t;
uniform float u_hy;
uniform float u_hy0;
uniform vec3 u_cam;
uniform vec3 u_sky[4];
uniform vec3 u_bands;
uniform vec4 u_sun;
uniform vec4 u_fx;
uniform vec3 u_sunCol;
uniform vec3 u_ring1;
uniform vec3 u_ring2;
uniform vec3 u_cloud;
uniform vec3 u_ridge[4];
uniform vec4 u_rBase;
uniform vec4 u_rAmp;
uniform vec4 u_rSerr;
uniform vec2 u_seed;
uniform float u_blend;
uniform vec3 u_mist;
uniform float u_mistAmt;
uniform vec3 u_ground[3];
uniform vec3 u_path;
uniform vec3 u_dapple;
uniform vec3 u_water;
uniform vec4 u_gfx;
uniform float u_pathK;
uniform float u_audio;
${COMMON}

float halftone(vec2 fc, float cov) {
  float cell = u_vh / 92.0;
  vec2 q = mat2(0.866, -0.5, 0.5, 0.866) * fc / cell;
  float d = length(fract(q) - 0.5);
  float rad = sqrt(clamp(cov, 0.0, 1.0)) * 0.74;
  float aa = 1.1 / cell;
  return (1.0 - smoothstep(rad - aa, rad + aa, d)) * step(0.003, cov);
}

float pill(vec2 q, float l, float r) {
  q.x = abs(q.x) - l;
  return length(vec2(max(q.x, 0.0), q.y)) - r;
}

float ridgeN(float fi, float px, float seed) {
  float x = px * (0.85 + fi * 0.3) + seed * (1.0 + fi * 0.37) + fi * 13.7;
  return fbm1(x * 1.25);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = vec2((fc.x - 0.5 * u_res.x) / u_vh, 0.5 - (u_res.y - fc.y) / u_vh);
  float aspect = u_res.x / u_vh;
  float px = 1.0 / u_vh;

  // ---- sky: flat bands with halftone bleeds between them ----
  float s = (p.y - u_hy) / (0.5 - u_hy0);
  float fade = 0.12;
  vec3 col = u_sky[3];
  col = mix(col, u_sky[2], halftone(fc, (s - (u_bands.x - fade)) / fade));
  col = mix(col, u_sky[1], halftone(fc, (s - (u_bands.y - fade)) / fade));
  col = mix(col, u_sky[0], halftone(fc, (s - (u_bands.z - fade)) / fade));

  vec2 sc = vec2(u_sun.x, u_hy + u_sun.y);
  vec2 sd = p - sc;
  float sr = length(sd);

  // rays turn very slowly — the poster breathes
  if (u_sun.w > 0.01) {
    float ang = atan(sd.y, sd.x);
    float ray = aastep(0.5, abs(fract(ang / 6.2831853 * 15.0 + u_t * 0.0022) - 0.5) * 2.0);
    float reach = smoothstep(u_sun.z * 1.2, u_sun.z * 2.6, sr);
    col = mix(col, mix(col, u_ring2, 0.42), ray * u_sun.w * reach);
  }

  // stars
  if (u_fx.y > 0.01) {
    vec2 g = fc / (u_vh / 30.0);
    vec2 id = floor(g);
    vec2 f = fract(g);
    float h = h21(id);
    if (h > 1.0 - 0.3 * u_fx.y) {
      vec2 c = vec2(h21(id + 3.1), h21(id + 7.7)) * 0.7 + 0.15;
      float r = 0.045 + 0.075 * h21(id + 1.3);
      float tw = 0.72 + 0.28 * sin(u_t * (0.5 + 1.8 * h21(id + 5.5)) + h * 40.0);
      col = mix(col, u_sunCol, (1.0 - smoothstep(r * tw - 0.035, r * tw + 0.035, length(f - c))) * 0.92);
    }
    // a few four-point sparkles
    vec2 g2 = fc / (u_vh / 5.0);
    vec2 id2 = floor(g2);
    if (h21(id2 + 19.3) > 0.62) {
      vec2 f2 = fract(g2) - (vec2(h21(id2 + 2.2), h21(id2 + 9.4)) * 0.6 + 0.2);
      float rr = (0.05 + 0.04 * h21(id2 + 4.4)) * (0.8 + 0.2 * sin(u_t * 0.9 + h21(id2) * 30.0));
      float star = sqrt(abs(f2.x)) + sqrt(abs(f2.y));
      col = mix(col, u_sunCol, (1.0 - smoothstep(sqrt(rr) - 0.03, sqrt(rr) + 0.03, star)) * u_fx.y);
    }
  }

  // clouds: stacked rounded bars, drifting
  if (u_fx.w > 0.01) {
    float cl = 0.0;
    float span = aspect * 0.5 + 0.5;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float y = u_hy + 0.15 + 0.3 * h11(fi * 3.7 + 1.0);
      float x = mod(h11(fi * 7.1 + 2.0) * span * 2.0 + u_t * 0.0028 * (0.5 + h11(fi + 0.5)), span * 2.0) - span;
      float len = 0.07 + 0.13 * h11(fi * 5.3 + 4.0);
      float rad = 0.0072 + 0.004 * h11(fi * 9.1);
      vec2 q = p - vec2(x, y);
      float d = pill(q, len, rad);
      d = min(d, pill(q - vec2(len * 0.45, rad * 2.7), len * 0.62, rad));
      d = min(d, pill(q - vec2(-len * 0.3, -rad * 2.7), len * 0.5, rad));
      cl = max(cl, 1.0 - smoothstep(-px, px, d));
    }
    col = mix(col, u_cloud, cl * u_fx.w);
  }

  // sun or moon with its rings; the rings swell a touch with the music
  float pulse = 1.0 + u_audio * 0.1;
  col = mix(col, u_ring2, (1.0 - smoothstep(-px, px, sr - u_sun.z * 2.25 * pulse)) * u_fx.x);
  col = mix(col, u_ring1, (1.0 - smoothstep(-px, px, sr - u_sun.z * 1.62 * pulse)) * u_fx.x);
  float disk = 1.0 - smoothstep(-px, px, sr - u_sun.z);
  vec3 body = u_sunCol;
  if (u_fx.z > 0.01) {
    // maria: a few flat shadows on the moon
    float m = 0.0;
    m = max(m, 1.0 - smoothstep(-px, px, length(sd - u_sun.z * vec2(-0.3, 0.28)) - u_sun.z * 0.3));
    m = max(m, 1.0 - smoothstep(-px, px, length(sd - u_sun.z * vec2(0.34, -0.1)) - u_sun.z * 0.22));
    m = max(m, 1.0 - smoothstep(-px, px, length(sd - u_sun.z * vec2(-0.12, -0.46)) - u_sun.z * 0.15));
    body = mix(body, mix(u_sunCol, u_ring1, 0.34), m * u_fx.z);
  }
  col = mix(col, body, disk);

  // ---- ridges, far to near, each sinking into pooled mist ----
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float xr = p.x + u_cam.x * (0.0015 + 0.0012 * fi);
    float n = ridgeN(fi, xr, u_seed.x);
    if (u_blend > 0.002) n = mix(n, ridgeN(fi, xr, u_seed.y), u_blend);
    float top = u_rBase[i] + u_rAmp[i] * (n - 0.38);
    float F = 52.0 + fi * 26.0;
    float tx = (xr + fi * 3.3) * F;
    float tooth = 1.0 - abs(fract(tx) - 0.5) * 2.0;
    top += u_rSerr[i] * tooth * (0.35 + 0.65 * h11(floor(tx) + fi * 31.0));
    top = max(top, 0.004);
    float h = u_hy + top;
    float m = 1.0 - smoothstep(-px, px, p.y - h);
    float depth = (h - p.y) / top;
    vec3 rc = mix(u_ridge[i], u_mist, halftone(fc, clamp((depth - 0.28) * 1.25, 0.0, 1.0) * u_mistAmt * (1.0 - fi * 0.16)));
    col = mix(col, rc, m);
  }

  // ---- the ground plane ----
  if (p.y < u_hy) {
    float dz = u_cam.y / max(1e-4, u_hy - p.y);
    float wx = u_cam.x + p.x * dz;
    float wz = u_cam.z + dz;
    float k = log2(dz) + (n1(wx * 0.21 + wz * 0.13) - 0.5) * 0.9;
    vec3 g = u_ground[2];
    g = mix(g, u_ground[1], aastep(3.0, k));
    g = mix(g, u_ground[0], aastep(4.6, k));

    // pools of light on the forest floor
    float da = aastep(0.62, n2(vec2(wx * 0.5, wz * 0.27))) * u_gfx.w * (1.0 - smoothstep(10.0, 30.0, dz));
    g = mix(g, u_dapple, da);

    float bend = 0.17 * dz * smoothstep(8.0, 42.0, dz) * sin(wz * 0.055 + 0.6);

    // the river, when there is one
    if (u_gfx.y > 0.01) {
      float rc = pathX(wz) + (7.0 + 2.6 * sin(wz * 0.05 + 2.0)) * max(u_pathK, 0.7) + bend * 1.6;
      float rw = 2.4 + 0.9 * n1(wz * 0.11 + 5.0) + dz * 0.014;
      float onR = (1.0 - aastep(0.0, abs(wx - rc) - rw)) * u_gfx.y;
      float rip = step(0.8, n2(vec2(wx * 0.9 + u_t * 0.06, wz * 4.0))) * (1.0 - smoothstep(8.0, 36.0, dz));
      g = mix(g, mix(u_water, u_ground[0], rip * 0.55), onR);
    }

    // the trail, with its two wheel ruts
    float pc = pathX(wz) + bend;
    float hw = max((0.82 + 0.22 * n1(wz * 0.31)) * u_pathK, dz * 0.0055);
    float dp = abs(wx - pc);
    float onPath = (1.0 - aastep(0.0, dp - hw)) * u_gfx.x;
    float rut = (1.0 - smoothstep(0.035, 0.07, abs(dp - hw * 0.46) / max(u_pathK, 0.5))) * (1.0 - smoothstep(5.0, 16.0, dz));
    g = mix(g, mix(u_path, u_ground[1], rut * 0.4), onPath);

    // the sea of fog below the lookout
    if (u_gfx.z > 0.01) {
      float fk = log2(dz) * 1.3 + n1(wx * 0.03 + u_t * 0.012) * 1.2 + u_t * 0.008;
      vec3 fs = mix(u_mist, u_ground[0], aastep(0.5, abs(fract(fk) - 0.5) * 2.0));
      g = mix(g, fs, u_gfx.z * smoothstep(7.0, 12.0, dz + n1(wx * 0.4) * 3.0));
    }

    g = mix(g, u_mist, halftone(fc, smoothstep(34.0, 150.0, dz) * 0.8 * u_mistAmt));
    col = g;
  }

  o = vec4(col, 1.0);
}
`

/* One redwood: a tall quad whose fragment shader cuts the trunk, its root
   flare, bark furrows, shaded side and lit rim — three flat inks, sharp at
   any distance. Local x is in trunk radii, y in radii above the ground. */
export const TRUNK_VERT = `#version 300 es
in vec2 a_pos;
uniform vec2 u_res;
uniform float u_vh;
uniform vec4 u_rect; // centre x, bottom y, half width, top y (screen)
uniform vec3 u_dim;  // quad half width in radii, bottom and top height in radii
out vec2 v_l;
${P_TO_CLIP}
void main() {
  float sx = a_pos.x * 2.0 - 1.0;
  v_l = vec2(sx * u_dim.x, mix(u_dim.y, u_dim.z, a_pos.y));
  gl_Position = toClip(vec2(u_rect.x + sx * u_rect.z, mix(u_rect.y, u_rect.w, a_pos.y)));
}
`

export const TRUNK_FRAG = `#version 300 es
precision highp float;
in vec2 v_l;
out vec4 o;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform float u_alpha;
uniform float u_seed;
uniform float u_light;
uniform float u_px;
${COMMON}
void main() {
  float x = v_l.x;
  float y = v_l.y;
  float yy = max(y, 0.0);
  float cx = 0.1 * sin(y * 0.045 + u_seed * 6.283) + 0.07 * (n1(y * 0.21 + u_seed * 40.0) - 0.5);
  float hw = 1.0 - 0.0035 * yy + 0.78 * exp(-yy * 0.85) + 0.05 * (n1(y * 0.35 + u_seed * 17.0) - 0.5);
  hw = max(hw, 0.5);
  float un = (x - cx) / hw;
  float aa = fwidth(un) * 0.75 + 1e-4;
  float m = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, abs(un));
  // the roots meet the ground in a lumpy line
  float base = -0.16 - 0.14 * sin(x * 3.1 + u_seed * 20.0);
  float ay = fwidth(y) * 0.75 + 1e-4;
  m *= smoothstep(base - ay, base + ay, y);
  if (m < 0.004) discard;

  vec3 col = u_c0;
  float detail = smoothstep(4.0, 20.0, u_px);
  // bark: long broken furrows
  float N = 6.0;
  float cu = (un * 0.5 + 0.5) * N + 0.5 * sin(y * 0.13 + u_seed * 9.0);
  float id = floor(cu);
  float fx = abs(fract(cu) - 0.5);
  float seg = fract(y * (0.04 + 0.05 * h11(id + u_seed * 13.0)) + h11(id * 7.0 + u_seed * 5.0));
  float on = step(seg, 0.48 + 0.36 * h11(id + 3.0 + u_seed));
  float lw = 0.075 + 0.03 * h11(id + 11.0);
  float line = (1.0 - smoothstep(lw, lw + aa * N * 0.5 + 0.01, fx)) * on;
  col = mix(col, u_c1, line * detail);

  float sn = un * u_light;
  float shadeEdge = -0.26 + 0.2 * (n1(y * 0.16 + u_seed * 3.0) - 0.5);
  col = mix(col, u_c1, 1.0 - smoothstep(shadeEdge - aa, shadeEdge + aa, sn));
  float rimEdge = 0.86 + 0.1 * (n1(y * 0.22 + u_seed * 8.0) - 0.5);
  col = mix(col, u_c2, smoothstep(rimEdge - aa, rimEdge + aa, sn));
  // a second, thinner lick of light further in
  float lick = smoothstep(0.022, 0.0, abs(sn - (rimEdge - 0.14))) * step(0.5, n1(y * 0.11 + u_seed * 29.0));
  col = mix(col, u_c2, lick * detail);

  o = vec4(col, m * u_alpha);
}
`

/* Painted cut-outs: the texture's red, green and blue hold coverage of the
   sprite's three inks; alpha is thresholded so edges stay crisp when a
   cut-out passes close to the camera. */
export const SPRITE_VERT = `#version 300 es
in vec2 a_pos;
uniform vec2 u_res;
uniform float u_vh;
uniform vec4 u_rect;   // anchor x, anchor y, width, height (screen)
uniform vec2 u_anchor; // anchor inside the quad, 0..1 from bottom-left
uniform float u_rot;
uniform float u_flip;
out vec2 v_uv;
${P_TO_CLIP}
void main() {
  vec2 l = (a_pos - u_anchor) * u_rect.zw;
  float c = cos(u_rot);
  float s = sin(u_rot);
  l = vec2(c * l.x - s * l.y, s * l.x + c * l.y);
  l.x *= u_flip;
  v_uv = vec2(a_pos.x, 1.0 - a_pos.y);
  gl_Position = toClip(u_rect.xy + l);
}
`

export const SPRITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform float u_alpha;
uniform float u_soft;
void main() {
  vec4 t = texture(u_tex, v_uv);
  float aa = max(fwidth(t.a) * 0.8, 0.03);
  float m = mix(smoothstep(0.5 - aa, 0.5 + aa, t.a), t.a, u_soft);
  if (m < 0.004) discard;
  vec3 w = t.rgb + 1e-4;
  w /= (w.r + w.g + w.b);
  w = pow(w, vec3(mix(5.0, 1.0, u_soft)));
  w /= (w.r + w.g + w.b);
  o = vec4(u_c0 * w.r + u_c1 * w.g + u_c2 * w.b, m * u_alpha);
}
`

/* Fireflies, campfire sparks and drifting motes: points animated entirely
   in the vertex shader from a static buffer. */
export const POINT_VERT = `#version 300 es
in vec4 a_p; // world x, y, z, phase
in vec2 a_k; // kind, size
uniform vec2 u_res;
uniform float u_vh;
uniform float u_t;
uniform float u_hy;
uniform vec3 u_cam;
uniform vec3 u_amt;   // fireflies, sparks, motes
uniform vec2 u_range; // near, far
uniform float u_audio;
out float v_a;
out float v_kind;
${P_TO_CLIP}
void main() {
  float kind = a_k.x;
  float ph = a_p.w;
  vec3 w = a_p.xyz;
  float a = 0.0;
  float size = a_k.y;
  if (kind < 0.5) {
    w.x += sin(u_t * 0.31 + ph * 30.0) * 0.9 + sin(u_t * 0.13 + ph * 11.0) * 0.6;
    w.y += sin(u_t * 0.27 + ph * 17.0) * 0.45;
    w.z += cos(u_t * 0.21 + ph * 23.0) * 0.9;
    float bl = sin(u_t * (0.7 + ph) + ph * 50.0);
    a = smoothstep(0.05, 0.7, bl) * u_amt.x * (0.75 + u_audio * 1.2);
    size *= 1.0 + u_audio * 0.9;
  } else if (kind < 1.5) {
    float life = fract(u_t * (0.14 + 0.1 * fract(ph * 7.0)) + ph);
    w.y += life * 5.5;
    w.x += sin(life * 9.0 + ph * 40.0) * 0.5 * life + life * 1.1 * (fract(ph * 13.0) - 0.5);
    a = (1.0 - life) * smoothstep(0.0, 0.06, life) * u_amt.y;
    size *= 1.0 - life * 0.6;
  } else {
    w.x += sin(u_t * 0.11 + ph * 30.0) * 1.2;
    w.y += sin(u_t * 0.09 + ph * 12.0) * 0.7;
    a = (0.45 + 0.55 * sin(u_t * 0.4 + ph * 40.0)) * u_amt.z * 0.55;
  }
  float dz = w.z - u_cam.z;
  a *= smoothstep(u_range.x, u_range.x + 1.2, dz) * (1.0 - smoothstep(u_range.y * 0.7, u_range.y, dz));
  v_a = a;
  v_kind = kind;
  if (dz < 0.2 || a < 0.004) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec2 p = vec2((w.x - u_cam.x) / dz, u_hy + (w.y - u_cam.y) / dz);
  gl_Position = toClip(p);
  gl_PointSize = clamp(size / dz * u_vh, 1.5, 64.0);
}
`

export const POINT_FRAG = `#version 300 es
precision highp float;
in float v_a;
in float v_kind;
out vec4 o;
uniform vec3 u_col;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.34, 0.42, d);
  float halo = (1.0 - smoothstep(0.9, 1.0, d)) * 0.26;
  float a = max(core, halo * step(v_kind, 1.5));
  if (a < 0.01) discard;
  o = vec4(u_col, a * v_a);
}
`

/* Paper: fine grain and the odd fleck where the ink didn't take. Output is
   premultiplied (blend ONE, ONE_MINUS_SRC_ALPHA). */
export const GRAIN_FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform float u_vh;
uniform vec3 u_paper;
${COMMON}
void main() {
  vec2 fc = gl_FragCoord.xy;
  float cell = max(1.0, u_vh / 760.0);
  float g = h21(floor(fc / cell));
  float mott = n2(fc / (u_vh * 0.016)) * 0.6 + n2(fc / (u_vh * 0.11)) * 0.4;
  float dark = 0.055 * g + 0.05 * mott;
  float fleck = step(0.9992, h21(floor(fc / (cell * 1.5)) + 7.0)) * 0.22 + smoothstep(0.82, 1.0, g * mott * 1.6) * 0.05;
  o = vec4(u_paper * fleck, dark * (1.0 - fleck) + fleck);
}
`
