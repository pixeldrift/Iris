import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { WATER } from './water'

export interface WaterHandle {
  /**
   * Drop a ripple at (x, y) in the canvas' CSS pixels. `hw`/`hh` are the half-size of
   * the thing that made it (a box for the add bubble, a small drop for a circle).
   */
  ripple: (x: number, y: number, opts?: { hw?: number; hh?: number; strength?: number }) => void
}

/*
 * The water is a height field, not a drawing. `field()` sums a few wave trains
 * (each a crest followed by a trough, widening and fading as it travels) into a
 * height `h` and its slope `g`; `shade()` turns those into light: a narrow bright
 * edge on the side of each crest that faces the light and a soft shadow on the
 * far side. Rings begin as the source's own oval and relax to a circle with
 * distance, and their radius and strength wobble a little around the ring, so
 * nothing is a perfect outline.
 *
 * To add refraction later: in main(), `g` is the surface slope. Sample a backdrop
 * texture at `p + g * k` for displacement, or once per colour channel with slightly
 * different `k` for chromatic aberration, and composite that in shade().
 */
const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uCss;       // canvas size, CSS px
uniform float uScale;    // canvas px per CSS px
uniform vec4 uA[${WATER.max}];  // x, y, halfWidth, halfHeight   (CSS px)
uniform vec4 uB[${WATER.max}];  // age (s), strength, seed, enabled
uniform vec2 uLight;     // unit vector pointing towards the light, screen space
uniform float uSpeed;
uniform float uLife;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Distance outward from the source's outline. Starts as its own oval, relaxes to a circle.
float outline(vec2 q, vec2 h) {
  float s = length(q / h);
  vec2 gr = q / (h * h);
  float de = (s - 1.0) * s / max(length(gr), 0.0001);
  float dc = length(q) - 0.5 * (h.x + h.y);
  return max(mix(de, dc, smoothstep(0.0, 300.0, de)), 0.0);
}

// Height of one ripple at p. 'near' is raised when p is within a wave, so empty water is skipped fast.
float rippleHeight(vec2 p, vec4 A, vec4 B, inout float near) {
  vec2 q = p - A.xy;
  float r = length(q);
  // Cheap reject: is any ring near this pixel at all? The outline distance d sits between
  // r - (largest half-size) and r - (smallest half-size), give or take the lumpiness.
  float lo = r - max(A.z, A.w) - 30.0;
  float hi = r - min(A.z, A.w) + 30.0;
  float any = 0.0;
  for (int n = 0; n < 1; n++) {
    float fn = float(n);
    float a = B.x - fn * (0.46 + 0.13 * fn);
    float front = uSpeed * a;
    float reach = 3.6 * (6.5 + 3.4 * sqrt(max(a, 0.0)));
    if (a > 0.0 && front + reach > lo && front - reach < hi) any = 1.0;
  }
  if (any < 0.5) return 0.0;
  vec2 dir = q / max(r, 0.001);
  float d = outline(q, max(A.zw, vec2(2.0)));
  // each ring is a little lumpy: its radius and its strength vary around the circle
  float lump = vnoise(dir * 1.7 + B.z) - 0.5;
  float lump2 = vnoise(dir * 3.3 + B.z * 1.9) - 0.5;
  d += (lump * 18.0 + lump2 * 7.0) * smoothstep(0.0, 220.0, d);
  float strength = B.y * (0.78 + 0.5 * vnoise(dir * 2.3 + B.z * 3.1));
  float lifeFade = 1.0 - smoothstep(uLife - 1.8, uLife, B.x);

  float h = 0.0;
  for (int n = 0; n < 1; n++) {
    float fn = float(n);
    float a = B.x - fn * (0.46 + 0.13 * fn);     // each ring leaves a little later than the last
    if (a <= 0.0) continue;
    float u = uSpeed * a - d;                    // distance behind the front
    float sigma = 6.5 + 3.4 * sqrt(a);           // waves broaden as they travel
    float x = u / sigma;
    if (abs(x) > 3.6) continue;
    near = 1.0;
    float amp = strength * pow(0.66, fn) * exp(-a / 1.5) / (1.0 + d / 60.0) * smoothstep(0.0, 0.5, a) * lifeFade;
    h += amp * -x * exp(-0.5 * x * x);           // crest in front, trough behind
  }
  return h;
}

float field(vec2 p, inout float near) {
  float h = 0.0;
  for (int i = 0; i < ${WATER.max}; i++) {
    if (uB[i].w > 0.5) h += rippleHeight(p, uA[i], uB[i], near);
  }
  return h;
}

vec4 shade(float h, vec2 g) {
  float slope = -dot(g, uLight) * 46.0;                     // positive on the side facing the light
  float hi = pow(clamp(slope, 0.0, 1.0), 1.7) * 0.6;        // narrow bright edge
  float lo = pow(clamp(-slope, 0.0, 1.0), 1.2) * 0.26 + clamp(-h, 0.0, 1.0) * 0.06;  // soft shade away from the light, a hint of trough depth
  vec3 hiCol = vec3(1.0, 0.99, 0.96);
  vec3 loCol = vec3(0.42, 0.3, 0.62);
  return vec4(hiCol * hi + loCol * lo, hi + lo);            // premultiplied alpha
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uCss.y * uScale - gl_FragCoord.y) / uScale;
  float near = 0.0;
  float h0 = field(p, near);
  if (near < 0.5) { gl_FragColor = vec4(0.0); return; }
  float hx = field(p + vec2(1.6, 0.0), near);
  float hy = field(p + vec2(0.0, 1.6), near);
  vec2 g = vec2(hx - h0, hy - h0) / 1.6;                    // surface slope
  gl_FragColor = shade(h0, g);
}
`

interface Drop {
  x: number
  y: number
  hw: number
  hh: number
  strength: number
  seed: number
  t0: number
}

export const WaterRipples = forwardRef<WaterHandle, { className?: string }>(function WaterRipples({ className = '' }, handle) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drops = useRef<Drop[]>([])
  const kick = useRef<() => void>(() => {})

  useImperativeHandle(handle, () => ({
    ripple: (x, y, opts = {}) => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      const list = drops.current
      list.push({ x, y, hw: opts.hw ?? 9, hh: opts.hh ?? 9, strength: opts.strength ?? 0.8, seed: Math.random() * 50, t0: performance.now() })
      if (list.length > WATER.max) list.shift()
      kick.current()
    },
  }))

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const gl = el.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
    if (!gl) return // no WebGL: the bubbles still bob, there just isn't a surface to light

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('Water shader:', gl.getShaderInfoLog(s))
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('Water shader failed to build:', gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const u = (n: string) => gl.getUniformLocation(prog, n)
    const uCss = u('uCss'), uScale = u('uScale'), uA = u('uA'), uB = u('uB'), uLight = u('uLight'), uSpeed = u('uSpeed'), uLife = u('uLife')
    gl.uniform2f(uLight, -0.55, -0.83)
    gl.uniform1f(uSpeed, WATER.speed)
    gl.uniform1f(uLife, WATER.life)
    gl.clearColor(0, 0, 0, 0)

    // Waves are soft, so a reduced-resolution canvas is smoother on the GPU and looks the same.
    let scale = Math.min(1.1, Math.max(0.6, (window.devicePixelRatio || 1) * 0.65))
    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      el.width = Math.max(1, Math.round(w * scale))
      el.height = Math.max(1, Math.round(h * scale))
      gl.viewport(0, 0, el.width, el.height)
      gl.uniform2f(uCss, w, h)
      gl.uniform1f(uScale, scale)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    const A = new Float32Array(WATER.max * 4)
    const B = new Float32Array(WATER.max * 4)
    let raf = 0
    let last = 0
    let slow = 0
    const frame = () => {
      const now = performance.now()
      // If frames are taking too long (weak GPU), quietly render at a lower resolution
      if (last) {
        slow = now - last > 30 ? slow + 1 : Math.max(0, slow - 1)
        if (slow > 6 && scale > 0.35) {
          scale *= 0.8
          slow = 0
          resize()
        }
      }
      last = now
      drops.current = drops.current.filter((d) => (now - d.t0) / 1000 < WATER.life)
      A.fill(0)
      B.fill(0)
      drops.current.forEach((d, i) => {
        A.set([d.x, d.y, d.hw, d.hh], i * 4)
        B.set([(now - d.t0) / 1000, d.strength, d.seed, 1], i * 4)
      })
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (drops.current.length) {
        gl.uniform4fv(uA, A)
        gl.uniform4fv(uB, B)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        raf = requestAnimationFrame(frame)
      } else {
        raf = 0
        last = 0
      }
    }
    kick.current = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      kick.current = () => {}
    }
  }, [])

  return <canvas ref={canvas} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />
})
