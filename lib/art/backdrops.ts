import { GLSL_COMMON } from './shader-scene'

/*
  The site-wide ambient backdrop: one fragment shader rendered behind every
  page by <SiteBackdrop />. Deliberately dim and slow — page content
  (cream type, pine panels) always has to win.
*/

const HEADER = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 u_res;
uniform float u_t;
uniform float u_scroll;
uniform float u_intro;
${GLSL_COMMON}
`

/* ------------------------------------------------------------------ */
/* Topo Map — a USGS-style contour sheet of imaginary Sonoma hills,    */
/* index contours, engraved water-lining, survey crosses. Pans with    */
/* scroll like sliding a paper map.                                    */
/* ------------------------------------------------------------------ */
export const TOPO_FRAG = `${HEADER}

float terrain(vec2 q) {
  vec2 w = vec2(fbm3(q * 0.6 + 3.1), fbm3(q * 0.6 + 8.3));
  float h = fbm(q + w * 1.1);
  return h;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / u_res;
  float t = u_t;
  vec2 q = fc / u_res.y * 2.1;
  q += vec2(t * 0.0035, -u_scroll * 0.42 + t * 0.002);

  float h = terrain(q);
  float waterLevel = 0.31;

  // base tint: valleys a touch deeper, ridges a touch mossier
  vec3 col = mix(vec3(0.034, 0.098, 0.068), vec3(0.070, 0.150, 0.108), smoothstep(0.25, 0.8, h));

  // soft hillshade from the NW
  vec2 grad = vec2(dFdx(h), dFdy(h)) * u_res.y * 0.6;
  float shade = dot(normalize(vec3(-grad, 1.0)), normalize(vec3(-0.6, 0.7, 0.6)));
  col *= 0.86 + 0.22 * shade;

  // contour lines
  float N = 24.0;
  float v = h * N;
  float fw = max(fwidth(v), 1e-4);
  float dist = abs(fract(v + 0.5) - 0.5);
  float isIndex = step(mod(floor(v + 0.5), 5.0), 0.5);
  float minor = 1.0 - smoothstep(fw * 0.5, fw * 1.3, dist);
  float major = 1.0 - smoothstep(fw * 0.9, fw * 2.1, dist);
  float land = step(waterLevel, h);
  float lineA = mix(minor * 0.12, major * 0.24, isIndex) * land;
  vec3 lineCol = mix(RUST, mix(RUST, GOLD, 0.35), isIndex);
  float intro = smoothstep(0.0, 1.0, u_intro);
  col = mix(col, lineCol, lineA * intro);

  // water: a cool pool with engraved water-lining that widens off shore
  if (h < waterLevel) {
    float depth = waterLevel - h;
    col = mix(col, vec3(0.040, 0.105, 0.110), 0.85);
    float wl = sqrt(depth) * 38.0;
    float wfw = max(fwidth(wl), 1e-4);
    float wd = abs(fract(wl + 0.5) - 0.5);
    float wline = (1.0 - smoothstep(wfw * 0.5, wfw * 1.3, wd)) * smoothstep(0.12, 0.0, depth);
    col = mix(col, vec3(0.45, 0.62, 0.60), wline * 0.14 * intro);
    // shoreline
    float sfw = max(fwidth(h), 1e-5);
    float shore = 1.0 - smoothstep(sfw * 0.6, sfw * 1.6, abs(h - waterLevel));
    col = mix(col, vec3(0.55, 0.66, 0.60), shore * 0.25 * intro);
  }

  // survey crosses on a graticule
  vec2 gq = q * 1.25;
  vec2 gcell = fract(gq) - 0.5;
  vec2 gfw = fwidth(gq);
  float arm = 0.035;
  float crossH = (1.0 - smoothstep(gfw.y * 0.5, gfw.y * 1.2, abs(gcell.y))) * step(abs(gcell.x), arm);
  float crossV = (1.0 - smoothstep(gfw.x * 0.5, gfw.x * 1.2, abs(gcell.x))) * step(abs(gcell.y), arm);
  col = mix(col, SAND, max(crossH, crossV) * 0.16 * intro);

  // paper tooth + vignette
  col *= 0.97 + 0.05 * noise(fc * 0.9);
  col *= 1.0 - 0.3 * pow(length((uv - 0.5) * vec2(1.0, 0.9)) * 1.25, 2.2);
  gl_FragColor = vec4(dither(col, fc), 1.0);
}
`
