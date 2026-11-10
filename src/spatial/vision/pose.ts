import { inv3, mulVec, type Mat3, type Pt, type Vec3 } from './math'
import type { Intrinsics } from './homography'

/**
 * Where the camera is, given which way it is turned (from the gyro) and where some points of a flat surface are in the picture. The
 * surface's own coordinates (x, y, 0) go to the camera as `Rcw * (x, y, 0) + t` (the picture's axes: x right, y down, z forward), so with
 * the turn known each point says two linear things about t, and a handful of points give it by least squares. A few rounds drop the
 * points that disagree most (something moving, something not on the surface). Returns t, or null when there is too little to go on.
 */
export function translationFromRotation(Rcw: Mat3, k: Intrinsics, pts: { plane: Pt; pix: Pt }[]): Vec3 | null {
  if (pts.length < 6) return null
  const rows: { a: Vec3; b: number }[] = []
  for (const { plane, pix } of pts) {
    const ax = Rcw[0] * plane.x + Rcw[1] * plane.y
    const ay = Rcw[3] * plane.x + Rcw[4] * plane.y
    const az = Rcw[6] * plane.x + Rcw[7] * plane.y
    const du = pix.x - k.cx
    const dv = pix.y - k.cy
    rows.push({ a: [k.f, 0, -du], b: du * az - k.f * ax })
    rows.push({ a: [0, k.f, -dv], b: dv * az - k.f * ay })
  }
  let use = rows.map((_, i) => i)
  let t: Vec3 | null = null
  for (let round = 0; round < 3; round++) {
    // normal equations of the rows still in use
    const N = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    const r: Vec3 = [0, 0, 0]
    for (const i of use) {
      const { a, b } = rows[i]
      for (let p = 0; p < 3; p++) {
        r[p] += a[p] * b
        for (let q = 0; q < 3; q++) N[p * 3 + q] += a[p] * a[q]
      }
    }
    const Ni = inv3(N as Mat3)
    if (!Ni) return null
    t = mulVec(Ni, r)
    if (round === 2) break
    // (the rows' misfit, in pixels' worth: keep the better three quarters)
    const res = rows.map(({ a, b }) => Math.abs(a[0] * t![0] + a[1] * t![1] + a[2] * t![2] - b))
    const sorted = [...use].sort((x, y) => res[x] - res[y])
    use = sorted.slice(0, Math.max(8, Math.floor(sorted.length * 0.75)))
  }
  return t && t[2] > 1e-6 ? t : null
}
