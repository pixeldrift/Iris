import type { Gray } from './image'
import type { Pt } from './math'

/**
 * Corners worth following (Harris): spots where the picture changes in two directions, so they can be found again in the next frame.
 * `minDist` keeps them spread out; `mask` limits where to look (the surface's region).
 */
export function detectCorners(g: Gray, opts: { max: number; minDist: number; margin?: number; quality?: number; mask?: (x: number, y: number) => boolean; avoid?: Pt[] }): Pt[] {
  const { w, h, d } = g
  const margin = opts.margin ?? 6
  const ix = new Float32Array(w * h)
  const iy = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      ix[i] = (d[i + 1] - d[i - 1]) * 0.5
      iy[i] = (d[i + w] - d[i - w]) * 0.5
    }
  // the structure sums over a 5x5 window (a running box sum, per axis)
  const sxx = new Float32Array(w * h)
  const syy = new Float32Array(w * h)
  const sxy = new Float32Array(w * h)
  const R = 2
  for (let y = margin; y < h - margin; y++)
    for (let x = margin; x < w - margin; x++) {
      let a = 0
      let b = 0
      let c = 0
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const i = (y + dy) * w + x + dx
          a += ix[i] * ix[i]
          b += iy[i] * iy[i]
          c += ix[i] * iy[i]
        }
      const i = y * w + x
      sxx[i] = a
      syy[i] = b
      sxy[i] = c
    }
  const resp = new Float32Array(w * h)
  let best = 0
  for (let y = margin; y < h - margin; y++)
    for (let x = margin; x < w - margin; x++) {
      const i = y * w + x
      const det = sxx[i] * syy[i] - sxy[i] * sxy[i]
      const tr = sxx[i] + syy[i]
      const r = det - 0.04 * tr * tr
      resp[i] = r
      if (r > best) best = r
    }
  if (best <= 0) return []
  const thresh = best * (opts.quality ?? 0.02)
  const cand: { i: number; r: number }[] = []
  for (let y = margin; y < h - margin; y++)
    for (let x = margin; x < w - margin; x++) {
      const i = y * w + x
      const r = resp[i]
      if (r < thresh) continue
      // a local maximum
      if (r < resp[i - 1] || r < resp[i + 1] || r < resp[i - w] || r < resp[i + w]) continue
      if (opts.mask && !opts.mask(x, y)) continue
      cand.push({ i, r })
    }
  cand.sort((a, b) => b.r - a.r)
  const out: Pt[] = []
  const md2 = opts.minDist * opts.minDist
  const taken = opts.avoid ? [...opts.avoid] : []
  for (const c of cand) {
    const x = c.i % w
    const y = (c.i / w) | 0
    let ok = true
    for (const p of taken) {
      const dx = p.x - x
      const dy = p.y - y
      if (dx * dx + dy * dy < md2) {
        ok = false
        break
      }
    }
    if (!ok) continue
    out.push({ x, y })
    taken.push({ x, y })
    if (out.length >= opts.max) break
  }
  return out
}
