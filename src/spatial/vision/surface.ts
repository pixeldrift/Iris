import { detectCorners } from './features'
import { ransacHomography } from './homography'
import { pyramid, type Gray } from './image'
import { apply, inv3, type Mat3, type Pt, IDENTITY } from './math'
import { trackPoints } from './lk'
import { pointInQuad, type Quad } from './quad'

export interface SurfaceState {
  /** 'tracking' while it is holding the surface; 'lost' when too little of it can be followed any more. */
  status: 'idle' | 'tracking' | 'lost'
  /** Reference-picture coordinates -> this picture's. */
  H: Mat3
  /** The surface's region as it is in this picture now (the corners, in the order acquired). */
  quad: Quad | null
  /** The points being followed: where each is now, and where it was when the surface was acquired. */
  now: Pt[]
  ref: Pt[]
  inliers: number
}

const MAX_POINTS = 90
const MIN_POINTS = 24
const LOST_BELOW = 8

/**
 * Follows a flat surface from picture to picture. `acquire` takes the surface's region (a rectangle found in the picture, or the middle of
 * it) and picks corners inside it; `update` follows those corners into the next picture, works out how the whole surface moved (one
 * homography that most of the corners agree on, so a hand or a person crossing in front is ignored), and tops up the corners as old ones
 * are lost. Everything is held against the picture it was acquired in, so errors do not pile up frame on frame.
 */
export class SurfaceTracker {
  private prev: Gray[] | null = null
  private ref: Pt[] = []
  private cur: Pt[] = []
  private H: Mat3 = IDENTITY
  private region: Quad | null = null
  private frame = 0
  status: SurfaceState['status'] = 'idle'

  /** Start following the surface whose region is `quad` in `g`. False when there is nothing in it worth following. */
  acquire(g: Gray, quad: Quad): boolean {
    this.prev = pyramid(g, 3)
    this.region = quad
    this.H = IDENTITY
    const pts = detectCorners(g, { max: MAX_POINTS, minDist: 5, margin: 5, mask: (x, y) => pointInQuad(quad, x, y) })
    this.ref = pts
    this.cur = pts.map((p) => ({ ...p }))
    this.frame = 0
    this.status = pts.length >= MIN_POINTS / 2 ? 'tracking' : 'idle'
    return this.status === 'tracking'
  }

  reset() {
    this.status = 'idle'
    this.prev = null
    this.ref = []
    this.cur = []
    this.region = null
    this.H = IDENTITY
  }

  update(g: Gray): SurfaceState {
    if (this.status === 'idle' || !this.prev || !this.region) return this.state()
    const cur = pyramid(g, 3)
    const fwd = trackPoints(this.prev, cur, this.cur)
    // a point that cannot be followed back to where it started was followed wrongly
    const back = trackPoints(cur, this.prev, fwd.pts)
    const keep: number[] = []
    for (let i = 0; i < this.cur.length; i++) {
      if (!fwd.ok[i] || !back.ok[i]) continue
      if (Math.hypot(back.pts[i].x - this.cur[i].x, back.pts[i].y - this.cur[i].y) > 1.2) continue
      keep.push(i)
    }
    const src = keep.map((i) => this.ref[i])
    const dst = keep.map((i) => fwd.pts[i])
    const fit = src.length >= 6 ? ransacHomography(src, dst, { iters: 60, thresh: 2.2, seed: 7 + this.frame }) : null
    if (!fit || fit.count < LOST_BELOW) {
      this.status = 'lost'
      this.prev = cur
      return this.state()
    }
    this.status = 'tracking'
    this.H = fit.H
    const ref: Pt[] = []
    const now: Pt[] = []
    keep.forEach((k, j) => {
      if (fit.inliers[j]) {
        ref.push(this.ref[k])
        now.push(fwd.pts[k])
      }
    })
    this.ref = ref
    this.cur = now
    this.prev = cur
    this.frame++
    // top up: new corners inside where the surface is now, remembered in the reference picture's coordinates
    if (this.cur.length < MIN_POINTS && this.frame % 2 === 0) {
      const quadNow = this.region.map((p) => apply(this.H, p.x, p.y)) as Quad
      const inv = inv3(this.H)
      if (inv) {
        const more = detectCorners(g, { max: MAX_POINTS - this.cur.length, minDist: 5, margin: 5, mask: (x, y) => pointInQuad(quadNow, x, y), avoid: this.cur })
        for (const p of more) {
          this.cur.push(p)
          this.ref.push(apply(inv, p.x, p.y))
        }
      }
    }
    return this.state()
  }

  state(): SurfaceState {
    const quad = this.region ? (this.region.map((p) => apply(this.H, p.x, p.y)) as Quad) : null
    return { status: this.status, H: this.H, quad, now: this.cur, ref: this.ref, inliers: this.cur.length }
  }
}
