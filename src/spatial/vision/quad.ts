import type { Gray } from './image'
import type { Pt } from './math'

/** Four corners, in order round the edge (top-left, top-right, bottom-right, bottom-left as seen). */
export type Quad = [Pt, Pt, Pt, Pt]

/** The brightness that best splits a picture into light and dark (Otsu's method). */
function otsu(g: Gray): number {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < g.d.length; i++) hist[Math.max(0, Math.min(255, g.d[i] | 0))]++
  const total = g.d.length
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0
  let wB = 0
  let best = 0
  let thr = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2
    if (between > best) {
      best = between
      thr = t
    }
  }
  return thr
}

const cross2 = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const lower: Pt[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: Pt[] = []
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

const area = (poly: Pt[]) => {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

/** The four corners that best stand for a convex polygon: the polygon's corners with the least area to give up are dropped until four remain. */
function toFour(poly: Pt[]): Quad | null {
  const p = [...poly]
  while (p.length > 4) {
    let best = 0
    let least = Infinity
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length]
      const b = p[i]
      const c = p[(i + 1) % p.length]
      const tri = Math.abs(cross2(a, b, c)) / 2
      if (tri < least) {
        least = tri
        best = i
      }
    }
    p.splice(best, 1)
  }
  return p.length === 4 ? (p as Quad) : null
}

/**
 * Rectangles in a picture: a sheet of paper, a picture frame, a poster, a screen. Splits the picture into light and dark at its natural
 * brightness break, takes each big blob of one kind, and keeps those that are very nearly four-sided. Best (largest, most rectangular)
 * first. Corners are returned top-left first, going clockwise on screen.
 */
export function findQuads(g: Gray, opts: { minArea?: number; maxArea?: number } = {}): { quad: Quad; score: number }[] {
  const { w, h } = g
  const thr = otsu(g)
  const minA = (opts.minArea ?? 0.03) * w * h
  const maxA = (opts.maxArea ?? 0.85) * w * h
  const out: { quad: Quad; score: number }[] = []
  for (const bright of [true, false]) {
    const on = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) on[i] = (g.d[i] > thr) === bright ? 1 : 0
    const seen = new Uint8Array(w * h)
    for (let s = 0; s < w * h; s++) {
      if (!on[s] || seen[s]) continue
      // flood this blob
      const stack = [s]
      seen[s] = 1
      let count = 0
      let touches = false
      const edge: Pt[] = []
      while (stack.length) {
        const i = stack.pop()!
        const x = i % w
        const y = (i / w) | 0
        count++
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true
        let boundary = false
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !on[ny * w + nx]) {
            boundary = true
            continue
          }
          const j = ny * w + nx
          if (!seen[j]) {
            seen[j] = 1
            stack.push(j)
          }
        }
        if (boundary) edge.push({ x, y })
      }
      if (count < minA || count > maxA || touches) continue
      const hl = hull(edge)
      if (hl.length < 4) continue
      const quad = toFour(hl)
      if (!quad) continue
      const qa = area(quad)
      if (qa < minA) continue
      const fill = count / qa // how much of the four-sided shape the blob really fills
      if (fill < 0.85 || fill > 1.15) continue
      // the hull is nearly the quad (so the blob had no big bites out of it)
      if (area(hl) / qa > 1.08) continue
      // convex, and orientated top-left first, clockwise
      const sorted = orderCorners(quad)
      out.push({ quad: sorted, score: qa * Math.min(fill, 1 / fill) })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Corners as top-left, top-right, bottom-right, bottom-left (by position, which is right for something roughly upright). */
export function orderCorners(q: Quad): Quad {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4
  const byAngle = [...q].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)) // clockwise on screen from the left
  // start at the corner nearest the top-left
  let start = 0
  let least = Infinity
  byAngle.forEach((p, i) => {
    const d = p.x + p.y
    if (d < least) {
      least = d
      start = i
    }
  })
  return [byAngle[start], byAngle[(start + 1) % 4], byAngle[(start + 2) % 4], byAngle[(start + 3) % 4]]
}

export const pointInQuad = (q: Pt[], x: number, y: number): boolean => {
  let sign = 0
  for (let i = 0; i < q.length; i++) {
    const c = cross2(q[i], q[(i + 1) % q.length], { x, y })
    if (c !== 0) {
      const s = c > 0 ? 1 : -1
      if (sign && s !== sign) return false
      sign = s
    }
  }
  return true
}
