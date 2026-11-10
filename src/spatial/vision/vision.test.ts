import { describe, expect, it } from 'vitest'
import { detectCorners } from './features'
import { cameraFromPlaneHomography, fitHomography, quatFromMat, ransacHomography } from './homography'
import { at, pyramid, type Gray } from './image'
import { apply, inv3, mul3, rng, type Mat3, type Pt } from './math'
import { trackPoints } from './lk'
import { findQuads } from './quad'
import { SurfaceTracker } from './surface'
import { focalFromHomography, planeColumns, turnHomography } from './homography'
import { surfaceFrame } from './plane'

/** A textured greyscale picture (smoothed noise, so there is something to follow at every scale). */
function texture(w: number, h: number, seed = 3): Gray {
  const r = rng(seed)
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = r() * 255
  let g: Gray = { w, h, d }
  for (let pass = 0; pass < 2; pass++) {
    const s = new Float32Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let a = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) (a += g.d[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))]), n++
        s[y * w + x] = a / n
      }
    g = { w, h, d: s }
  }
  // stretch the contrast back out
  let lo = 255
  let hi = 0
  for (const v of g.d) (lo = Math.min(lo, v)), (hi = Math.max(hi, v))
  for (let i = 0; i < g.d.length; i++) g.d[i] = ((g.d[i] - lo) / (hi - lo)) * 255
  return g
}

/** The picture as it looks after the surface moves by H (reference -> new): every new pixel is read from where it came from. */
function warp(src: Gray, H: Mat3): Gray {
  const inv = inv3(H)!
  const d = new Float32Array(src.w * src.h)
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const p = apply(inv, x, y)
      d[y * src.w + x] = at(src, p.x, p.y)
    }
  return { w: src.w, h: src.h, d }
}

const shift = (dx: number, dy: number): Mat3 => [1, 0, dx, 0, 1, dy, 0, 0, 1]

describe('following a surface', () => {
  it('finds corners in texture, spread out, none in a flat picture', () => {
    const g = texture(160, 120)
    const pts = detectCorners(g, { max: 60, minDist: 5 })
    expect(pts.length).toBeGreaterThan(30)
    expect(detectCorners({ w: 40, h: 40, d: new Float32Array(1600).fill(100) }, { max: 20, minDist: 5 })).toHaveLength(0)
  })

  it('follows points through a movement of several pixels', () => {
    const a = texture(160, 120)
    const b = warp(a, shift(5.4, -3.2))
    const pts = detectCorners(a, { max: 40, minDist: 6, margin: 12 })
    const out = trackPoints(pyramid(a, 3), pyramid(b, 3), pts)
    let good = 0
    out.pts.forEach((p, i) => {
      if (out.ok[i] && Math.abs(p.x - pts[i].x - 5.4) < 0.4 && Math.abs(p.y - pts[i].y + 3.2) < 0.4) good++
    })
    expect(good).toBeGreaterThan(pts.length * 0.8)
  })

  it('fits a homography to pairs, ignoring the ones that are wrong', () => {
    const H: Mat3 = [1.05, 0.04, 6, -0.03, 0.97, -4, 0.0004, -0.0002, 1]
    const r = rng(9)
    const src: Pt[] = Array.from({ length: 60 }, () => ({ x: r() * 160, y: r() * 120 }))
    const dst = src.map((p) => apply(H, p.x, p.y))
    for (let i = 0; i < 12; i++) dst[i] = { x: r() * 160, y: r() * 120 } // a fifth of them are junk
    const fit = ransacHomography(src, dst, { iters: 120 })!
    expect(fit.count).toBeGreaterThanOrEqual(46)
    const test = apply(fit.H, 80, 60)
    const want = apply(H, 80, 60)
    expect(Math.hypot(test.x - want.x, test.y - want.y)).toBeLessThan(0.5)
    expect(fitHomography(src.slice(0, 3), dst.slice(0, 3))).toBeNull()
  })

  it('works out where the camera is from how a rectangle looks', () => {
    // a unit-wide sheet, 1.294 tall (letter), lying on the surface, seen by a camera 2 units away, a little to the side and turned
    const f = 400
    const k = { f, cx: 160, cy: 120 }
    const cam = { x: 0.35, y: -0.2, z: 2 }
    const yaw = 0.12
    // the camera looks at the surface origin from `cam`: Three-style axes, built by hand for this test
    const fwd = [-cam.x, -cam.y, -cam.z]
    const len = Math.hypot(...fwd)
    const z = [-fwd[0] / len, -fwd[1] / len, -fwd[2] / len] // backward axis
    const up = [0, 1, 0]
    const xAxis = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]
    const xl = Math.hypot(...xAxis)
    const x = xAxis.map((v) => v / xl)
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]
    void yaw
    const project = (px: number, py: number): Pt => {
      const d = [px - cam.x, py - cam.y, 0 - cam.z]
      const cx = d[0] * x[0] + d[1] * x[1] + d[2] * x[2]
      const cy = d[0] * y[0] + d[1] * y[1] + d[2] * y[2]
      const cz = d[0] * z[0] + d[1] * z[1] + d[2] * z[2]
      return { x: k.cx + (f * cx) / -cz, y: k.cy - (f * cy) / -cz }
    }
    const plane: Pt[] = [{ x: -0.5, y: 0.647 }, { x: 0.5, y: 0.647 }, { x: 0.5, y: -0.647 }, { x: -0.5, y: -0.647 }]
    const img = plane.map((p) => project(p.x, p.y))
    const H = fitHomography(plane, img)!
    const pose = cameraFromPlaneHomography(H, k)!
    expect(pose.position[0]).toBeCloseTo(cam.x, 2)
    expect(pose.position[1]).toBeCloseTo(cam.y, 2)
    expect(pose.position[2]).toBeCloseTo(cam.z, 2)
    // a homography made from a UNIT square to the sheet's corners reveals the sheet's proportions (height over width)
    const unit: Pt[] = [{ x: -0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: -0.5 }, { x: -0.5, y: -0.5 }]
    const Hu = fitHomography(unit, img)!
    expect(cameraFromPlaneHomography(Hu, k)!.aspect).toBeCloseTo(1.294, 2)
    // its orientation: columns are the camera's axes in surface coordinates
    expect(pose.R[0]).toBeCloseTo(x[0], 2)
    expect(pose.R[3]).toBeCloseTo(x[1], 2)
    expect(pose.R[8]).toBeCloseTo(z[2], 2)
    const q = quatFromMat(pose.R)
    expect(Math.hypot(...q)).toBeCloseTo(1, 6)
  })

  it('finds a sheet of paper on a wall, bright or dark', () => {
    const w = 160
    const h = 120
    for (const bright of [true, false]) {
      const d = new Float32Array(w * h).fill(bright ? 90 : 170)
      const quad = [{ x: 48, y: 30 }, { x: 118, y: 36 }, { x: 112, y: 96 }, { x: 44, y: 88 }]
      // fill the quadrilateral
      const inside = (x: number, y: number) => {
        let s = 0
        for (let i = 0; i < 4; i++) {
          const a = quad[i]
          const b = quad[(i + 1) % 4]
          const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
          if (c !== 0) s = s || Math.sign(c)
          if (c !== 0 && Math.sign(c) !== s) return false
        }
        return true
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) d[y * w + x] = bright ? 225 : 40
      const found = findQuads({ w, h, d })
      expect(found.length).toBeGreaterThan(0)
      const q = found[0].quad
      for (const corner of quad) expect(Math.min(...q.map((p) => Math.hypot(p.x - corner.x, p.y - corner.y)))).toBeLessThan(4)
    }
    // a plain wall has none
    expect(findQuads({ w, h, d: new Float32Array(w * h).fill(120) })).toHaveLength(0)
  })

  it('holds a surface through a run of frames, and reports it lost when it is covered', () => {
    const base = texture(160, 120, 5)
    const tr = new SurfaceTracker()
    const region = [{ x: 30, y: 24 }, { x: 130, y: 24 }, { x: 130, y: 96 }, { x: 30, y: 96 }] as [Pt, Pt, Pt, Pt]
    expect(tr.acquire(base, region)).toBe(true)
    let H: Mat3 = shift(0, 0)
    for (let i = 1; i <= 12; i++) {
      // the camera drifts: the surface shifts and turns a little each frame
      const th = 0.004 * i
      H = mul3(shift(1.1 * i, -0.7 * i), [Math.cos(th), -Math.sin(th), 0, Math.sin(th), Math.cos(th), 0, 0, 0, 1])
      const st = tr.update(warp(base, H))
      expect(st.status).toBe('tracking')
    }
    const st = tr.state()
    const got = apply(st.H, 80, 60)
    const want = apply(H, 80, 60)
    expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1.5)
    // everything covered by a flat colour: nothing to follow
    const gone = tr.update({ w: 160, h: 120, d: new Float32Array(160 * 120).fill(128) })
    expect(gone.status).toBe('lost')
  })

  it('keeps holding after the surface it started on has left the view (the map grows as the camera moves)', () => {
    const world = texture(520, 120, 9)
    const view = (ox: number): Gray => {
      const d = new Float32Array(160 * 120)
      for (let y = 0; y < 120; y++) for (let x = 0; x < 160; x++) d[y * 160 + x] = at(world, x + ox, y)
      return { w: 160, h: 120, d }
    }
    const tr = new SurfaceTracker()
    const region = [{ x: 20, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 100 }, { x: 20, y: 100 }] as [Pt, Pt, Pt, Pt]
    expect(tr.acquire(view(0), region)).toBe(true)
    let ox = 0
    for (let i = 1; i <= 90; i++) {
      ox = 3 * i // (270 px: far past where the first region was, which is out of the picture after about 40 frames)
      const st = tr.update(view(ox))
      expect(st.status).toBe('tracking')
    }
    // a point that was at (50, 60) in the first picture is now at (50 - 270, 60), outside; the fit still knows where it is
    const st = tr.state()
    const got = apply(st.H, 50, 60)
    expect(Math.hypot(got.x - (50 - ox), got.y - 60)).toBeLessThan(6)
    // and the map has grown well past the first region
    expect(st.landmarks.some((p) => p.x > 200)).toBe(true)
  })

  it('works out the focal length from a surface seen at a slant (and says nothing for one seen square-on)', () => {
    const f = 180
    const [cx, cy] = [96, 72]
    const K: Mat3 = [f, 0, cx, 0, f, cy, 0, 0, 1]
    const make = (ax: number, ay: number): Mat3 => {
      const [cxr, sxr, cyr, syr] = [Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay)]
      // R = Ry * Rx ; columns r1, r2 are the surface's axes
      const r1 = [cyr, 0, -syr]
      const r2 = [syr * sxr, cxr, cyr * sxr]
      const t = [0.1, -0.2, 2]
      const P: Mat3 = [r1[0], r2[0], t[0], r1[1], r2[1], t[1], r1[2], r2[2], t[2]]
      return mul3(K, P)
    }
    const got = focalFromHomography(make(0.5, 0.35), cx, cy)
    expect(got).not.toBeNull()
    expect(Math.abs(got! - f) / f).toBeLessThan(0.01)
    expect(focalFromHomography(make(0, 0), cx, cy)).toBeNull()
  })

  it('declares a new surface square-on to the camera, or upright when the phone knows which way is up', () => {
    const k = { f: 180, cx: 96, cy: 72 }
    // no sensors: the surface fills the region it was found in, with no perspective
    const flat = surfaceFrame({ ...k, center: { x: 96, y: 72 }, width: 80, aspect: 1.25 })!
    const p = (x: number, y: number) => apply(flat.H, x, y)
    expect(p(-0.5, 0.625).x).toBeCloseTo(56, 3)
    expect(p(0.5, 0.625).x).toBeCloseTo(136, 3)
    expect(p(0.5, 0.625).y).toBeCloseTo(p(-0.5, 0.625).y, 3)
    expect(p(0.5, -0.625).y - p(0.5, 0.625).y).toBeCloseTo(100, 3)
    // a phone turned 30 degrees, tipped down 12 and rolled 5: the surface is upright (its up is the world's), and the pose read back from the
    // picture is the one that was set
    const cs = (a: number) => Math.cos(a)
    const sn = (a: number) => Math.sin(a)
    const yaw = 0.52, pitch = -0.21, roll = 0.09
    // camera axes in the world: R = Ry(yaw) * Rx(pitch) * Rz(roll)
    const mulM = (A: number[], B: number[]) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]))
    const Ry = [cs(yaw), 0, sn(yaw), 0, 1, 0, -sn(yaw), 0, cs(yaw)]
    const Rx = [1, 0, 0, 0, cs(pitch), -sn(pitch), 0, sn(pitch), cs(pitch)]
    const Rz = [cs(roll), -sn(roll), 0, sn(roll), cs(roll), 0, 0, 0, 1]
    const M = mulM(mulM(Ry, Rx), Rz) // columns: right, up, back
    const col = (c: number): [number, number, number] => [M[c], M[3 + c], M[6 + c]]
    const up = surfaceFrame({ ...k, center: { x: 110, y: 60 }, width: 70, aspect: 1, axes: { right: col(0), up: col(1), back: col(2) } })!
    const pose = cameraFromPlaneHomography(up.H, k)!
    for (let i = 0; i < 9; i++) expect(pose.R[i]).toBeCloseTo(up.R[i], 3)
    // upright: the surface's y axis is the world's up, so each camera axis has the same height in the surface's frame as in the world
    expect(up.R[3]).toBeCloseTo(col(0)[1], 6)
    expect(up.R[4]).toBeCloseTo(col(1)[1], 6)
    expect(up.R[5]).toBeCloseTo(col(2)[1], 6)
  })

  it('draws a point a little off the surface where a real camera would (the step off the plane uses the pose, the plane itself is exact)', () => {
    const k = { f: 180, cx: 96, cy: 72 }
    const [a, b] = [0.4, -0.3]
    const Rx: Mat3 = [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)]
    const Ry: Mat3 = [Math.cos(b), 0, Math.sin(b), 0, 1, 0, -Math.sin(b), 0, Math.cos(b)]
    const R = mul3(Ry, Rx) // surface -> camera, columns r1 r2 r3
    const t = [0.1, -0.2, 2]
    const P: Mat3 = [R[0], R[1], t[0], R[3], R[4], t[1], R[6], R[7], t[2]]
    const H = mul3([k.f, 0, k.cx, 0, k.f, k.cy, 0, 0, 1], P)
    for (const scale of [1, -2.5]) {
      const pc = planeColumns(H.map((v) => v * scale) as Mat3, k)!
      for (const [x, y, z] of [[0.3, -0.2, 0.5], [-0.4, 0.1, -0.3], [0, 0, 0]]) {
        const cam = [R[0] * x + R[1] * y + R[2] * z + t[0], R[3] * x + R[4] * y + R[5] * z + t[1], R[6] * x + R[7] * y + R[8] * z + t[2]]
        const want = { x: k.cx + (k.f * cam[0]) / cam[2], y: k.cy + (k.f * cam[1]) / cam[2] }
        const hx = pc.H[0] * x + pc.H[1] * y + pc.H[2] + pc.zcol[0] * z
        const hy = pc.H[3] * x + pc.H[4] * y + pc.H[5] + pc.zcol[1] * z
        const hw = pc.H[6] * x + pc.H[7] * y + pc.H[8] + pc.zcol[2] * z
        expect(hx / hw).toBeCloseTo(want.x, 3)
        expect(hy / hw).toBeCloseTo(want.y, 3)
        expect(hw).toBeGreaterThan(0)
      }
    }
  })

  it('follows a turn of the phone by the gyro alone: pixels move as a camera turned by that much would see them', () => {
    const k = { f: 180, cx: 96, cy: 72 }
    const a = 0.12 // turned about the camera's y (left or right) by this much
    // direction (old axes) -> (new axes): the new camera is turned by +a, so directions rotate by -a
    const rel: Mat3 = [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)]
    const T = turnHomography(rel, k)!
    const pix = (v: number[]) => ({ x: k.cx + (k.f * v[0]) / -v[2], y: k.cy - (k.f * v[1]) / -v[2] })
    for (const v of [[0.2, 0.1, -1], [-0.3, 0.25, -1.4], [0, 0, -1]]) {
      const w = [rel[0] * v[0] + rel[1] * v[1] + rel[2] * v[2], rel[3] * v[0] + rel[4] * v[1] + rel[5] * v[2], rel[6] * v[0] + rel[7] * v[1] + rel[8] * v[2]]
      const want = pix(w)
      const got = apply(T, pix(v).x, pix(v).y)
      expect(got.x).toBeCloseTo(want.x, 4)
      expect(got.y).toBeCloseTo(want.y, 4)
    }
  })
})
