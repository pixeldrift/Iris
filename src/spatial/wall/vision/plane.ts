import { fitHomography } from './homography'
import type { Mat3, Pt, Vec3 } from './math'

/**
 * The frame a newly found surface is given. What the camera sees of it is only a region (a sheet, a frame, the middle of a wall), and
 * its perspective cannot be trusted (it may not be a rectangle at all, and the lens is a guess), so the surface is not taken from how
 * that region looks. It is simply declared: a flat rectangle facing the viewer, as wide as the region on screen and centred on it. If
 * the phone's own sense of up is known (`axes`: the camera's right, up and back, in a world where y is up) the surface is made to stand
 * upright, like a wall, facing the way the phone is pointing; without it the surface faces the camera square-on.
 *
 * Returns the surface (width 1, height `aspect`, y up, centred) -> picture pixels, and the camera's axes in surface coordinates.
 */
export function surfaceFrame(opts: { cx: number; cy: number; f: number; center: Pt; width: number; aspect: number; axes?: { right: Vec3; up: Vec3; back: Vec3 } }): { H: Mat3; R: Mat3 } | null {
  const { cx, cy, f, center, width, aspect } = opts
  if (!(width > 1e-6) || !(f > 1e-6)) return null
  // the camera's axes expressed in the surface's frame (columns of R)
  let right: Vec3 = [1, 0, 0]
  let up: Vec3 = [0, 1, 0]
  let back: Vec3 = [0, 0, 1]
  const a = opts.axes
  if (a) {
    const fwd: Vec3 = [-a.back[0], -a.back[1], -a.back[2]]
    const hl = Math.hypot(fwd[0], fwd[2])
    if (hl > 0.25) {
      // the surface: normal (toward the viewer) is the horizontal part of "backwards"; its up is the world's up
      const n: Vec3 = [-fwd[0] / hl, 0, -fwd[2] / hl]
      const r: Vec3 = [n[2], 0, -n[0]] // up x n
      const d = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
      const wup: Vec3 = [0, 1, 0]
      right = [d(a.right, r), d(a.right, wup), d(a.right, n)]
      up = [d(a.up, r), d(a.up, wup), d(a.up, n)]
      back = [d(a.back, r), d(a.back, wup), d(a.back, n)]
    }
  }
  // the surface's middle is `d` in front of the camera, along the ray through the region's centre (so the region is `width` pixels wide)
  const d = f / width
  const ux = (center.x - cx) / f
  const uy = -(center.y - cy) / f
  const pc: Vec3 = [ux * d, uy * d, -d]
  const pos: Vec3 = [0, 1, 2].map((i) => -(pc[0] * right[i] + pc[1] * up[i] + pc[2] * back[i])) as Vec3
  const project = (x: number, y: number): Pt => {
    const v: Vec3 = [x - pos[0], y - pos[1], -pos[2]]
    const px = v[0] * right[0] + v[1] * right[1] + v[2] * right[2]
    const py = v[0] * up[0] + v[1] * up[1] + v[2] * up[2]
    const pz = v[0] * back[0] + v[1] * back[1] + v[2] * back[2]
    return { x: cx + (f * px) / -pz, y: cy - (f * py) / -pz }
  }
  const h = aspect / 2
  const src: Pt[] = [{ x: -0.5, y: h }, { x: 0.5, y: h }, { x: 0.5, y: -h }, { x: -0.5, y: -h }]
  const H = fitHomography(src, src.map((p) => project(p.x, p.y)))
  if (!H) return null
  const R: Mat3 = [right[0], up[0], back[0], right[1], up[1], back[1], right[2], up[2], back[2]]
  return { H, R }
}

/**
 * The frame for the *virtual* wall (where the groups live), as a turn of the tracked surface's frame: facing the camera exactly (its normal
 * is the camera's own back axis) and level (its up is the world's up as seen across that normal, so no roll). Without a sense of up it
 * just faces the camera, keeping the camera's own up. All in the tracked surface's frame; `p_surface = R * p_virtual` with the result's
 * columns being the virtual wall's x, y and normal. Null when the camera's axes make no sense.
 */
export function levelFrame(axes: { right: Vec3; up: Vec3; back: Vec3 }, worldUp?: Vec3): Mat3 | null {
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const unit = (v: Vec3): Vec3 | null => {
    const l = Math.hypot(v[0], v[1], v[2])
    return l > 1e-6 ? [v[0] / l, v[1] / l, v[2] / l] : null
  }
  const n = unit(axes.back)
  if (!n) return null
  let u: Vec3 | null = null
  if (worldUp) {
    const d = dot(worldUp, n)
    u = unit([worldUp[0] - d * n[0], worldUp[1] - d * n[1], worldUp[2] - d * n[2]])
    // (looking straight up or down: there is no level to speak of)
    if (u && Math.hypot(worldUp[0] - d * n[0], worldUp[1] - d * n[1], worldUp[2] - d * n[2]) < 0.2) u = null
  }
  u ??= unit(axes.up)
  if (!u) return null
  const r: Vec3 = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]] // up x normal
  return [r[0], u[0], n[0], r[1], u[1], n[1], r[2], u[2], n[2]]
}
