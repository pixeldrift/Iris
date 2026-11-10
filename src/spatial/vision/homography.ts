import { apply, cross, dot, inv3, mul3, mulVec, norm, rng, solve, transpose3, type Mat3, type Pt, type Vec3 } from './math'

/** The homography taking `src` to `dst` (least squares over four or more pairs, with the points first normalised for stability). */
export function fitHomography(src: Pt[], dst: Pt[]): Mat3 | null {
  const n = src.length
  if (n < 4) return null
  const norm = (pts: Pt[]) => {
    let cx = 0
    let cy = 0
    for (const p of pts) (cx += p.x), (cy += p.y)
    cx /= pts.length
    cy /= pts.length
    let m = 0
    for (const p of pts) m += Math.hypot(p.x - cx, p.y - cy)
    m /= pts.length
    const s = m > 1e-9 ? Math.SQRT2 / m : 1
    const T: Mat3 = [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1]
    return { T, pts: pts.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s })) }
  }
  const a = norm(src)
  const b = norm(dst)
  // normal equations for the 8 unknowns (h9 = 1)
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0))
  const Atb = new Array(8).fill(0)
  for (let i = 0; i < n; i++) {
    const { x, y } = a.pts[i]
    const { x: u, y: v } = b.pts[i]
    const r1 = [x, y, 1, 0, 0, 0, -u * x, -u * y]
    const r2 = [0, 0, 0, x, y, 1, -v * x, -v * y]
    for (let j = 0; j < 8; j++) {
      for (let k = 0; k < 8; k++) AtA[j][k] += r1[j] * r1[k] + r2[j] * r2[k]
      Atb[j] += r1[j] * u + r2[j] * v
    }
  }
  const h = solve(AtA, Atb)
  if (!h || h.some((v) => !Number.isFinite(v))) return null
  const Hn: Mat3 = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
  const Tb = inv3(b.T)
  if (!Tb) return null
  const H = mul3(mul3(Tb, Hn), a.T)
  const k = H[8]
  return Math.abs(k) < 1e-12 ? null : (H.map((v) => v / k) as Mat3)
}

/**
 * The homography that most pairs agree on (RANSAC): try many from four random pairs, keep the one most pairs fit within `thresh` pixels,
 * then refit to all that fit. Returns which pairs fit.
 */
export function ransacHomography(src: Pt[], dst: Pt[], opts: { iters?: number; thresh?: number; seed?: number } = {}): { H: Mat3; inliers: boolean[]; count: number } | null {
  const n = src.length
  if (n < 4) return null
  const iters = opts.iters ?? 80
  const thresh = opts.thresh ?? 2.5
  const rand = rng(opts.seed ?? 1)
  let best: { H: Mat3; count: number } | null = null
  const fits = (H: Mat3) => {
    const flags: boolean[] = []
    let count = 0
    for (let i = 0; i < n; i++) {
      const p = apply(H, src[i].x, src[i].y)
      const ok = Math.hypot(p.x - dst[i].x, p.y - dst[i].y) < thresh
      flags.push(ok)
      if (ok) count++
    }
    return { flags, count }
  }
  for (let it = 0; it < iters; it++) {
    const idx = new Set<number>()
    while (idx.size < 4) idx.add(Math.floor(rand() * n))
    const pick = [...idx]
    const H = fitHomography(pick.map((i) => src[i]), pick.map((i) => dst[i]))
    if (!H) continue
    const { count } = fits(H)
    if (!best || count > best.count) best = { H, count }
    if (best.count > n * 0.9) break
  }
  if (!best || best.count < 4) return null
  const { flags } = fits(best.H)
  const s2 = src.filter((_, i) => flags[i])
  const d2 = dst.filter((_, i) => flags[i])
  const refit = fitHomography(s2, d2)
  const H = refit ?? best.H
  const fin = fits(H)
  return fin.count >= best.count * 0.8 ? { H, inliers: fin.flags, count: fin.count } : { H: best.H, inliers: flags, count: best.count }
}

/** The camera's lens, in pixels: focal length and where the middle of the picture is. */
export interface Intrinsics {
  f: number
  cx: number
  cy: number
}
export const kMatrix = (k: Intrinsics): Mat3 => [k.f, 0, k.cx, 0, k.f, k.cy, 0, 0, 1]

/**
 * Where the camera is relative to a flat surface, from the homography taking the surface's own coordinates (x right, y up, z out
 * toward the viewer, in whatever unit the homography was made with) to image pixels.
 *
 * Returns the camera's position in the surface's coordinates and its orientation as a rotation matrix (columns are the camera's right,
 * up and backward axes in the surface's coordinates, the way a Three.js camera is posed: it looks down its own -z), plus the surface's
 * aspect (height over width) that the homography implies if it was made from a rectangle of unit width.
 */
export function cameraFromPlaneHomography(H: Mat3, k: Intrinsics): { position: Vec3; R: Mat3; aspect: number } | null {
  const Ki = inv3(kMatrix(k))
  if (!Ki) return null
  const h1: Vec3 = [H[0], H[3], H[6]]
  const h2: Vec3 = [H[1], H[4], H[7]]
  const h3: Vec3 = [H[2], H[5], H[8]]
  let a1 = mulVec(Ki, h1)
  let a2 = mulVec(Ki, h2)
  let a3 = mulVec(Ki, h3)
  const lambda = 1 / (norm(a1) || 1)
  a1 = a1.map((v) => v * lambda) as Vec3
  a2 = a2.map((v) => v * lambda) as Vec3
  a3 = a3.map((v) => v * lambda) as Vec3
  // the surface is in front of the camera
  if (a3[2] < 0) {
    a1 = a1.map((v) => -v) as Vec3
    a2 = a2.map((v) => -v) as Vec3
    a3 = a3.map((v) => -v) as Vec3
  }
  // r1, r2, r3 as an orthonormal frame (Gram-Schmidt: r1 kept, r2 made square to it)
  const r1 = a1.map((v) => v / (norm(a1) || 1)) as Vec3
  let r2 = a2.map((v, i) => v - dot(a2, r1) * r1[i]) as Vec3
  r2 = r2.map((v) => v / (norm(r2) || 1)) as Vec3
  const r3 = cross(r1, r2)
  // surface -> camera (OpenCV: x right, y down, z forward): columns r1, r2, r3 ; translation a3
  const Rcw: Mat3 = [r1[0], r2[0], r3[0], r1[1], r2[1], r3[1], r1[2], r2[2], r3[2]]
  const Rwc = transpose3(Rcw) // camera axes in surface coordinates, rows = camera x,y,z
  const position = mulVec(Rwc, a3).map((v) => -v) as Vec3
  // Three.js camera axes: x right (same), y up (= -OpenCV y), z backward (= -OpenCV z); as matrix columns in surface coordinates
  const R: Mat3 = [Rwc[0], -Rwc[1], -Rwc[2], Rwc[3], -Rwc[4], -Rwc[5], Rwc[6], -Rwc[7], -Rwc[8]]
  const aspect = norm(mulVec(Ki, h2)) / (norm(mulVec(Ki, h1)) || 1)
  return { position, R, aspect }
}

/**
 * The surface's picture as three columns, for drawing things on it and a little off it: `H` (the surface's x and y and 1 -> picture) with
 * its sign made so that the surface is in front of the camera, and `zcol`, where a point one surface unit toward the viewer goes. A
 * point (x, y, z) of the surface's frame is at H*(x, y, 1) + zcol*z in the picture (homogeneous). In the plane it is exactly the
 * homography the tracker followed; only the small step off it uses the pose.
 */
export function planeColumns(H: Mat3, k: Intrinsics): { H: Mat3; zcol: Vec3 } | null {
  const K = kMatrix(k)
  const Ki = inv3(K)
  if (!Ki) return null
  let h: Mat3 = H
  const a1 = mulVec(Ki, [h[0], h[3], h[6]])
  const a2 = mulVec(Ki, [h[1], h[4], h[7]])
  const a3 = mulVec(Ki, [h[2], h[5], h[8]])
  let sign = 1
  if (a3[2] < 0) sign = -1
  if (sign < 0) h = h.map((v) => -v) as Mat3
  const l = norm(a1) || 1
  const r1 = a1.map((v) => v / l) as Vec3
  let r2 = a2.map((v, i) => v - dot(a2, r1) * r1[i]) as Vec3
  r2 = r2.map((v) => v / (norm(r2) || 1)) as Vec3
  const r3 = cross(r1, r2)
  const z = mulVec(K, r3).map((v) => v * l) as Vec3
  void a3
  return { H: h, zcol: z }
}

/**
 * How the picture changes when the camera only turns: a turn `rel` (a rotation matrix taking a direction in the old camera's axes, x right,
 * y up, z back, to the new one's) moves every pixel by K * R * K^-1 in the picture's own axes (x right, y down, z forward).
 */
export function turnHomography(rel: Mat3, k: Intrinsics): Mat3 | null {
  const Ki = inv3(kMatrix(k))
  if (!Ki) return null
  const f = [1, -1, -1]
  const R = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => rel[r * 3 + c] * f[r] * f[c])) as Mat3
  return mul3(mul3(kMatrix(k), R), Ki)
}

/**
 * The lens's focal length (in the picture's pixels) as one picture of a flat surface implies it, taking the middle of the picture as the
 * lens's centre: the surface's two axes must be square to each other, which fixes the focal length whenever the surface is seen at a slant.
 * Null for a surface seen square-on (it says nothing then) or when the answer is not possible.
 */
export function focalFromHomography(H: Mat3, cx: number, cy: number): number | null {
  // centre the picture
  const T: Mat3 = [1, 0, -cx, 0, 1, -cy, 0, 0, 1]
  const Hc = mul3(T, H)
  const [a1, b1, c1, a2, b2, c2] = [Hc[0], Hc[3], Hc[6], Hc[1], Hc[4], Hc[7]]
  const n1 = Math.hypot(a1, b1)
  const n2 = Math.hypot(a2, b2)
  const num = a1 * a2 + b1 * b2
  // (seen square-on the axes are still square in the picture, and there is nothing to learn)
  if (n1 < 1e-9 || n2 < 1e-9 || Math.abs(num) / (n1 * n2) < 0.08) return null
  const f2 = -num / (c1 * c2)
  return f2 > 0 && Number.isFinite(f2) ? Math.sqrt(f2) : null
}

/** A quaternion (x, y, z, w) from a rotation matrix. */
export function quatFromMat(m: Mat3): [number, number, number, number] {
  const t = m[0] + m[4] + m[8]
  let x: number, y: number, z: number, w: number
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2
    w = 0.25 * s
    x = (m[7] - m[5]) / s
    y = (m[2] - m[6]) / s
    z = (m[3] - m[1]) / s
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2
    w = (m[7] - m[5]) / s
    x = 0.25 * s
    y = (m[1] + m[3]) / s
    z = (m[2] + m[6]) / s
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2
    w = (m[2] - m[6]) / s
    x = (m[1] + m[3]) / s
    y = 0.25 * s
    z = (m[5] + m[7]) / s
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2
    w = (m[3] - m[1]) / s
    x = (m[2] + m[6]) / s
    y = (m[5] + m[7]) / s
    z = 0.25 * s
  }
  const n = Math.hypot(x, y, z, w) || 1
  return [x / n, y / n, z / n, w / n]
}
