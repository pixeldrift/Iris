import { at, type Gray } from './image'
import type { Pt } from './math'

/**
 * Where each point of the previous picture went in the next one (pyramidal Lucas-Kanade): at the coarsest scale first, so it can follow
 * movements of several pixels, then refined. Points that cannot be followed (flat patches, leaving the picture) are marked not ok.
 */
export function trackPoints(prev: Gray[], cur: Gray[], pts: Pt[], opts: { win?: number; iters?: number } = {}): { pts: Pt[]; ok: boolean[] } {
  const win = opts.win ?? 4
  const iters = opts.iters ?? 12
  const levels = Math.min(prev.length, cur.length)
  const out: Pt[] = []
  const ok: boolean[] = []
  for (const p of pts) {
    let gx = 0
    let gy = 0
    let good = true
    for (let L = levels - 1; L >= 0 && good; L--) {
      const A = prev[L]
      const B = cur[L]
      const s = 1 / (1 << L)
      const px = p.x * s
      const py = p.y * s
      // the gradient matrix of the window in the previous picture (it does not change over the iterations)
      let gxx = 0
      let gxy = 0
      let gyy = 0
      const ixs: number[] = []
      const iys: number[] = []
      const vals: number[] = []
      for (let dy = -win; dy <= win; dy++)
        for (let dx = -win; dx <= win; dx++) {
          const x = px + dx
          const y = py + dy
          const ix = (at(A, x + 1, y) - at(A, x - 1, y)) * 0.5
          const iy = (at(A, x, y + 1) - at(A, x, y - 1)) * 0.5
          ixs.push(ix)
          iys.push(iy)
          vals.push(at(A, x, y))
          gxx += ix * ix
          gxy += ix * iy
          gyy += iy * iy
        }
      const det = gxx * gyy - gxy * gxy
      if (det < 1e-3 * (2 * win + 1) * (2 * win + 1)) {
        good = L > 0 // (flat at a coarse level is forgiven; at the finest it is a lost point)
        if (L > 0) {
          gx *= 2
          gy *= 2
        }
        continue
      }
      let dx = 0
      let dy = 0
      for (let it = 0; it < iters; it++) {
        let bx = 0
        let by = 0
        let k = 0
        for (let wy = -win; wy <= win; wy++)
          for (let wx = -win; wx <= win; wx++, k++) {
            const e = vals[k] - at(B, px + wx + gx + dx, py + wy + gy + dy)
            bx += e * ixs[k]
            by += e * iys[k]
          }
        const ux = (gyy * bx - gxy * by) / det
        const uy = (gxx * by - gxy * bx) / det
        dx += ux
        dy += uy
        if (ux * ux + uy * uy < 1e-4) break
      }
      gx += dx
      gy += dy
      if (L > 0) {
        gx *= 2
        gy *= 2
      }
    }
    const nx = p.x + gx
    const ny = p.y + gy
    const inside = nx > 2 && ny > 2 && nx < cur[0].w - 3 && ny < cur[0].h - 3
    out.push({ x: nx, y: ny })
    ok.push(good && inside && Number.isFinite(nx) && Number.isFinite(ny))
  }
  return { pts: out, ok }
}
