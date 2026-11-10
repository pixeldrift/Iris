// Wall mode's tracker: it watches the camera for a flat surface (a sheet of paper, a picture frame, a poster, or just a textured wall), holds
// on to it from frame to frame, and says where the phone is relative to it, blended with the gyroscope so the view stays smooth between
// camera frames and survives the surface being hidden for a moment. Nothing here needs a printed marker, and nothing needs to be to scale:
// the surface is the unit everything is measured in. It does its best; it is not ARKit.

import { Matrix4, Quaternion, Vector3 } from 'three'
import { translationFromRotation } from './vision/pose'
import { detectCorners } from './vision/features'
import { cameraFromPlaneHomography, fitHomography, focalFromHomography, planeColumns, quatFromMat, turnHomography } from './vision/homography'
import { levelFrame, surfaceFrame } from './vision/plane'
import { rgbaToGray, type Gray } from './vision/image'
import { apply, inv3, mul3, mulVec, type Mat3, type Pt, type Vec3 } from './vision/math'
import { findQuads, type Quad } from './vision/quad'
import { SurfaceTracker } from './vision/surface'
import type { CameraPose, TrackingProvider, TrackingQuality, TrackingStatus } from './types'

export type WallPhase = 'searching' | 'holding' | 'lost'

/** What the scene draws on the surface: its outline and the points being followed, in the surface's own coordinates (width 1, y up). */
export interface WallOverlay {
  phase: WallPhase
  quad: Pt[] | null
  points: Pt[]
  inliers: number
  /** What was found: a sheet or frame, or just the middle of a textured wall. */
  kind: 'rectangle' | 'texture' | null
}

const GRAY_W = 192
/** About how long ago the camera picture being handled was taken, when it reaches the code (the camera's own delay): the gyro is asked for that moment. */
export const VIDEO_LAG = 45
const COMMON_ASPECTS = [1, 1.294, 1.414, 1.5, 1.333, 0.773, 0.707, 0.667, 0.75]

type Listener = (s: TrackingStatus) => void

export class WallTracking implements TrackingProvider {
  readonly id = 'wall'
  private video: HTMLVideoElement | null = null
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })
  private tracker = new SurfaceTracker()
  private gray: Gray | null = null
  private timer = 0
  private stopped = true
  private listeners = new Set<Listener>()
  /** Where the surface is, in the first picture it was held in: surface coords (width 1, height = aspect, y up) -> picture pixels. */
  private Hplane: Mat3 | null = null
  private aspect = 1
  private kind: WallOverlay['kind'] = null
  phase: WallPhase = 'searching'
  // the search
  private seen: { quad: Quad; n: number } | null = null
  private searchSince = 0
  private lastSearch = 0
  // the lens (set from the camera, adjustable)
  private f = 800
  private autoF = true
  private fBase = 0
  private fSamples: number[] = []
  private vw = 1280
  private vh = 720
  // the pose, blended
  private offset = new Quaternion() // world <- device, corrected by what the camera sees
  private haveOffset = false
  private pos: [number, number, number] = [0, 0, 1.2]
  private visQ = new Quaternion()
  private q = new Quaternion()
  private tmpQ = new Quaternion()
  private scale = 100
  private lift = 7
  private origin: [number, number] = [0, 0]
  private overlay: WallOverlay = { phase: 'searching', quad: null, points: [], inliers: 0, kind: null }
  private fresh = false
  private lastVisionAt = 0
  // the surface's picture, kept as the tracker made it (lightly smoothed) and brought up to date from the gyro between pictures
  private Hs: Mat3 | null = null
  private corners: Pt[] | null = null
  private qFrame = new Quaternion()
  private haveQ = false
  // gyro-led mode: the turn comes from the gyroscope (so a quick move or a still hand is as steady as the gyro is), and the camera gives
  // where the phone is (nearer, farther, to the side). The picture corrects the gyro's slow drift a little at a time (`off`).
  private Wp: Quaternion | null = null // sensor world -> the surface's frame, fixed when the surface was found
  private off = new Quaternion() // the picture's slow correction, in the surface's frame
  private haveOff = false
  private C: [number, number, number] | null = null // where the camera is, in the surface's frame (smoothed)
  // measurements, for finding out where a problem is (see `diagnostics`)
  private stat = { ms: 0, max: 0, recent: [] as number[], frames: 0, seen: 0, windowStart: 0, fps: 0, camFps: 0, seenWin: 0, resid: 0, points: 0, gyroGap: 0, lostCount: 0, lastGap: 0, lastDone: 0 }
  private lastSt: { now: Pt[]; ref: Pt[] } = { now: [], ref: [] }
  /** The device's rotation, from the sensors (null when there are none). */
  device: ((out: Quaternion, ageMs?: number) => boolean) | null = null

  /** Use this camera picture. */
  attach(video: HTMLVideoElement) {
    this.video = video
  }
  /** Size the world: the surface's width, in world units, and how far in front of it the items float. */
  /** How much the view is smoothed, 0 (every twitch) to 1 (very steady). */
  smoothing = 0.15
  configure(opts: { scale?: number; lift?: number; fovV?: number; origin?: [number, number]; smooth?: number }) {
    if (opts.smooth !== undefined) this.smoothing = opts.smooth
    if (opts.scale) this.scale = opts.scale
    if (opts.origin) this.origin = opts.origin
    if (opts.lift !== undefined) this.lift = opts.lift
    if (opts.fovV) {
      this.f = (this.vh / 2) / Math.tan((opts.fovV * Math.PI) / 360)
      this.autoF = false // (set by hand: stop adjusting it)
    }
  }
  get videoSize() {
    return { w: this.vw, h: this.vh, f: this.f }
  }

  async start(): Promise<boolean> {
    if (!this.video) return false
    this.stopped = false
    this.schedule()
    this.report('visual', 'limited')
    return true
  }
  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    this.tracker.reset()
  }
  /** Look for a surface again from scratch. */
  recenter() {
    this.tracker.reset()
    this.Hs = null
    this.corners = null
    this.Wp = null
    this.C = null
    this.haveOff = false
    this.Hplane = null
    this.seen = null
    this.searchSince = performance.now()
    this.setPhase('searching')
  }
  /** Take the middle of what the camera sees as the surface now (for a wall with nothing rectangular on it). */
  anchorHere() {
    if (!this.gray) return
    this.acquire(this.gray, this.centralRect(this.gray), 'texture')
  }

  onStatus(cb: Listener) {
    this.listeners.add(cb)
    return () => void this.listeners.delete(cb)
  }
  private report(source: TrackingStatus['source'], quality: TrackingQuality, note?: string) {
    for (const l of this.listeners) l({ source, quality, note })
  }
  private setPhase(p: WallPhase) {
    if (p === this.phase) return
    this.phase = p
    this.overlay.phase = p
    this.report('visual', p === 'holding' ? 'good' : p === 'lost' ? 'limited' : 'limited')
  }

  getOverlay(): WallOverlay {
    return this.overlay
  }
  /** True once since the overlay last changed (so the scene redraws it only when it must). */
  takeFresh(): boolean {
    const f = this.fresh
    this.fresh = false
    return f
  }

  getPose(): CameraPose {
    // the rotation: the device's own, corrected by the camera; or the camera alone where there is no sensor
    const gyro = this.device && this.device(this.tmpQ)
    if (gyro && this.haveOffset) this.q.copy(this.offset).multiply(this.tmpQ)
    else this.q.copy(this.visQ)
    const quality: TrackingQuality = this.phase === 'holding' ? 'good' : this.haveOffset || !gyro ? 'limited' : 'none'
    return {
      q: [this.q.x, this.q.y, this.q.z, this.q.w],
      position: [this.pos[0] * this.scale + this.origin[0], this.pos[1] * this.scale + this.origin[1], this.pos[2] * this.scale - this.lift],
      quality,
      source: 'visual',
    }
  }

  /* ---------- the camera, frame by frame ---------- */

  private schedule() {
    if (this.stopped) return
    const v = this.video as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }) | null
    if (v && typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(() => this.tick())
    else this.timer = window.setTimeout(() => this.tick(), 66)
  }
  private tick() {
    if (this.stopped) return
    try {
      this.process()
    } catch {
      /* a bad frame is skipped */
    }
    this.schedule()
  }

  private process() {
    const v = this.video
    if (!v || v.readyState < 2 || !v.videoWidth || !this.ctx) return
    const now = performance.now()
    this.stat.seen++
    // about 20 pictures a second is plenty (and kinder to the battery)
    if (now - this.lastVisionAt < Math.max(28, this.stat.ms * 1.2)) return
    this.lastVisionAt = now
    const t0 = now
    if (this.vw !== v.videoWidth || this.vh !== v.videoHeight) {
      const fovV = 2 * Math.atan(this.vh / 2 / this.f)
      this.vw = v.videoWidth
      this.vh = v.videoHeight
      this.f = this.vh / 2 / Math.tan(fovV / 2)
      this.fBase = 0
    }
    if (!this.fBase) this.fBase = this.f
    const gh = Math.max(8, Math.round((GRAY_W * v.videoHeight) / v.videoWidth))
    if (this.canvas.width !== GRAY_W || this.canvas.height !== gh) {
      this.canvas.width = GRAY_W
      this.canvas.height = gh
    }
    this.ctx.drawImage(v, 0, 0, GRAY_W, gh)
    const px = this.ctx.getImageData(0, 0, GRAY_W, gh)
    // (a new picture each time: the tracker keeps the previous one to compare with, and must not have it overwritten)
    const g = rgbaToGray(px.data, GRAY_W, gh)
    this.gray = g
    if (this.phase === 'searching') this.search(g, now)
    else this.follow(g)
    // how long the whole picture took, and how many are being handled each second
    const s = this.stat
    const took = performance.now() - t0
    s.ms += (took - s.ms) * 0.1
    s.recent.push(took)
    if (s.recent.length > 90) s.recent.shift()
    s.max = Math.max(...s.recent)
    s.frames++
    s.lastGap = t0 - s.lastDone
    s.lastDone = t0
    if (!s.windowStart) s.windowStart = t0
    if (t0 - s.windowStart >= 1000) {
      s.fps = (s.frames * 1000) / (t0 - s.windowStart)
      s.camFps = (this.stat.seen - s.seenWin) * 1000 / (t0 - s.windowStart)
      s.seenWin = this.stat.seen
      s.frames = 0
      s.windowStart = t0
    }
  }

  /**
   * Where the surface is in the camera's picture right now, for the scene to draw with: the surface's x, y and 1 -> picture (as fractions
   * of the picture's width and height), and where a step toward the viewer goes. Brought up to date from the gyroscope since the last
   * picture (a turn of the phone is a known change of view, so it is applied at once, which is what keeps up in a quick move); with no gyro
   * it is the last picture's. `lagMs`: how far behind "now" the picture being shown is (0 for a virtual background, which is drawn for now;
   * about VIDEO_LAG when the camera itself is shown, so the two agree). Null before a surface has been found.
   */
  getSurface(lagMs = 0): { H: Mat3; zcol: Vec3 } | null {
    if (!this.Hs || !this.gray) return null
    const k = this.k()
    // gyro-led: this very moment's turn from the gyroscope, and the position the picture gave
    if (this.Wp && this.C && this.haveOff && this.device && this.device(this.tmpQ, lagMs)) {
      const q = this.off.clone().multiply(this.Wp).multiply(this.tmpQ)
      const R = this.surfaceToCamera(q)
      const t: Vec3 = [0, 1, 2].map((r) => -(R[r * 3] * this.C![0] + R[r * 3 + 1] * this.C![1] + R[r * 3 + 2] * this.C![2])) as Vec3
      const K = (v: Vec3): Vec3 => [k.f * v[0] + k.cx * v[2], k.f * v[1] + k.cy * v[2], v[2]]
      const c0 = K([R[0], R[3], R[6]])
      const c1 = K([R[1], R[4], R[7]])
      const c3 = K(t)
      const z = K([R[2], R[5], R[8]])
      const gw = GRAY_W
      const gh = this.gray.h
      const H: Mat3 = [c0[0], c1[0], c3[0], c0[1], c1[1], c3[1], c0[2], c1[2], c3[2]]
      const S: Mat3 = [1 / gw, 0, 0, 0, 1 / gh, 0, 0, 0, 1]
      return { H: mul3(S, H), zcol: [z[0] / gw, z[1] / gh, z[2]] }
    }
    const pc = planeColumns(this.Hs, k)
    if (!pc) return null
    let H = pc.H
    let z = pc.zcol
    if (this.haveQ && this.device && this.device(this.tmpQ, lagMs)) {
      const rel = this.tmpQ.clone().invert().multiply(this.qFrame) // camera at the last picture -> camera now
      if (rel.angleTo(new Quaternion()) < 0.6) {
        const m = new Matrix4().makeRotationFromQuaternion(rel).elements // column-major
        const R: Mat3 = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => m[c * 4 + r])) as Mat3
        const T = turnHomography(R, k)
        if (T) {
          H = mul3(T, H)
          z = mulVec(T, z)
        }
      }
    }
    const gw = GRAY_W
    const gh = this.gray.h
    const S: Mat3 = [1 / gw, 0, 0, 0, 1 / gh, 0, 0, 0, 1]
    return { H: mul3(S, H), zcol: [z[0] / gw, z[1] / gh, z[2]] }
  }

  /**
   * For "level": the frame of a wall that faces the camera exactly and stands level, as a turn of the tracked surface's frame (the
   * groups are drawn on that wall, so they stop being skewed by whatever angle the surface was first declared at). Null with nothing
   * to go on yet.
   */
  levelNow(): Mat3 | null {
    let q: Quaternion | null = null
    let up: Vec3 | undefined
    if (this.Wp && this.haveOff && this.device && this.device(this.tmpQ, 0)) {
      const m = this.off.clone().multiply(this.Wp)
      q = m.clone().multiply(this.tmpQ)
      const u = new Vector3(0, 1, 0).applyQuaternion(m)
      up = [u.x, u.y, u.z]
    } else if (this.havePos) q = this.visQ.clone()
    if (!q) return null
    const axis = (x: number, y: number, z: number): Vec3 => {
      const v = new Vector3(x, y, z).applyQuaternion(q as Quaternion)
      return [v.x, v.y, v.z]
    }
    return levelFrame({ right: axis(1, 0, 0), up: axis(0, 1, 0), back: axis(0, 0, 1) }, up)
  }

  /** The camera's turn `q` (camera -> the surface's frame, the 3D camera's axes) as the matrix taking the surface's axes to the picture's. */
  private surfaceToCamera(q: Quaternion): Mat3 {
    const m = new Matrix4().makeRotationFromQuaternion(q).elements // column-major: columns are the camera's axes in the surface's frame
    const f = [1, -1, -1]
    return [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => f[r] * m[r * 4 + c])) as Mat3
  }

  /** What the tracker is doing, as numbers (for the details display): speed, how well the fit holds, and how far the gyro and camera disagree. */
  diagnostics() {
    const s = this.stat
    return { gyroLed: !!(this.Wp && this.C && this.haveOff), hasWp: !!this.Wp, hasC: !!this.C, camFps: s.camFps, ms: s.ms, max: s.max, fps: s.fps, seen: s.seen, points: s.points, resid: s.resid, gyroGap: s.gyroGap, lostCount: s.lostCount, fovV: (2 * Math.atan(this.vh / 2 / this.f) * 180) / Math.PI, auto: this.autoF, phase: this.phase }
  }
  /** The points being followed: where each is now (as a fraction across and down the camera picture), and where it sits on the surface. */
  debugFrame(): { u: number; v: number; plane: Pt }[] {
    const inv = this.Hplane ? inv3(this.Hplane) : null
    if (!inv || !this.gray) return []
    const { now, ref } = this.lastSt
    return now.map((p, i) => ({ u: p.x / this.gray!.w, v: p.y / this.gray!.h, plane: apply(inv, ref[i].x, ref[i].y) }))
  }

  /** Where a camera pixel is, in the small picture the tracker sees. */
  private k() {
    const s = GRAY_W / this.vw
    return { f: this.f * s, cx: GRAY_W / 2, cy: (this.gray?.h ?? 0) / 2 }
  }

  private centralRect(g: Gray): Quad {
    const mx = g.w * 0.2
    const my = g.h * 0.2
    return [{ x: mx, y: my }, { x: g.w - mx, y: my }, { x: g.w - mx, y: g.h - my }, { x: mx, y: g.h - my }]
  }

  private search(g: Gray, now: number) {
    if (!this.searchSince) this.searchSince = now
    if (now - this.lastSearch < 220) return
    this.lastSearch = now
    // a sheet, a frame, a poster: a rectangle that holds still for a few looks
    const found = findQuads(g)[0]
    if (found) {
      const prev = this.seen
      const same = prev && prev.quad.every((p, i) => Math.hypot(p.x - found.quad[i].x, p.y - found.quad[i].y) < 3.5)
      this.seen = { quad: found.quad, n: same ? prev.n + 1 : 1 }
      if (this.seen.n >= 3) return void this.acquire(g, found.quad, 'rectangle')
    } else this.seen = null
    // nothing rectangular after a moment: a textured wall will do (it just has to have enough to follow)
    if (now - this.searchSince > 2200) {
      const mid = this.centralRect(g)
      const corners = detectCorners(g, { max: 60, minDist: 5, margin: 5, mask: (x, y) => x > mid[0].x && x < mid[2].x && y > mid[0].y && y < mid[2].y })
      if (corners.length >= 40) this.acquire(g, mid, 'texture')
    }
  }

  private acquire(g: Gray, quad: Quad, kind: 'rectangle' | 'texture') {
    if (!this.tracker.acquire(g, quad)) return
    // The surface is declared, not measured (see surfaceFrame): as wide and as tall as the region looks on screen, facing the viewer, and
    // standing upright when the phone's sensors say which way is up. The region's own perspective is not used: it may not be a rectangle.
    const w = (Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y) + Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y)) / 2
    const h = (Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y) + Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y)) / 2
    let aspect = h / Math.max(1, w)
    // a sheet is a standard shape: snap to one when it is close
    for (const a of COMMON_ASPECTS) if (Math.abs(aspect - a) / a < 0.07) aspect = a
    aspect = Math.min(2.5, Math.max(0.4, aspect))
    this.aspect = aspect
    const k = this.k()
    let axes: { right: [number, number, number]; up: [number, number, number]; back: [number, number, number] } | undefined
    if (this.device && this.device(this.tmpQ, VIDEO_LAG)) {
      const v = (x: number, y: number, z: number) => new Vector3(x, y, z).applyQuaternion(this.tmpQ)
      const [r, u, b] = [v(1, 0, 0), v(0, 1, 0), v(0, 0, 1)]
      axes = { right: [r.x, r.y, r.z], up: [u.x, u.y, u.z], back: [b.x, b.y, b.z] }
    }
    const centre = { x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4, y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4 }
    const fr = surfaceFrame({ cx: k.cx, cy: k.cy, f: k.f, center: centre, width: w, aspect, axes })
    // surface (width 1, height `aspect`) -> reference-picture pixels
    this.Hplane = fr ? fr.H : null
    this.Hs = null
    this.corners = null
    this.Wp = null
    this.C = null
    this.haveOff = false
    if (fr && axes && this.device && this.device(this.tmpQ, VIDEO_LAG)) {
      // the camera's turn in the surface's frame now (from the frame just declared) and in the sensors' world: the link between the two
      const m = new Matrix4().set(fr.R[0], fr.R[1], fr.R[2], 0, fr.R[3], fr.R[4], fr.R[5], 0, fr.R[6], fr.R[7], fr.R[8], 0, 0, 0, 0, 1)
      const q0 = new Quaternion().setFromRotationMatrix(m)
      this.Wp = q0.multiply(this.tmpQ.clone().invert())
    }
    this.kind = kind
    this.seen = null
    this.haveOffset = false
    this.setPhase('holding')
  }

  private follow(g: Gray) {
    const st = this.tracker.update(g)
    this.stat.resid += (st.residual - this.stat.resid) * 0.2
    this.stat.points = st.inliers
    this.lastSt = { now: st.now, ref: st.ref }
    if (st.status === 'lost' || !this.Hplane) {
      this.setPhase('lost')
      this.overlay = { phase: 'lost', quad: this.overlay.quad, points: this.overlay.points, inliers: 0, kind: this.kind }
      this.fresh = true
      // find the surface again where it was: if it is back in view the tracker picks it up by itself next frames; otherwise search anew
      if (st.status === 'lost' && this.lostSince === 0) (this.lostSince = performance.now()), this.stat.lostCount++
      if (this.lostSince && performance.now() - this.lostSince > 6000) {
        this.lostSince = 0
        this.recenter()
      }
      return
    }
    this.lostSince = 0
    this.setPhase('holding')
    // the surface as the camera now sees it: surface coords -> this picture's pixels
    const Himg = mul3(st.H, this.Hplane)
    this.learnFocal(Himg)
    // The surface's picture is what the scene draws with (not a pose worked out from it): so what sits on the surface is exactly where
    // the followed points are. It is lightly smoothed through the four corners of a patch of the surface (more when it moves quickly).
    {
      const unit: Pt[] = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }]
      const cs = unit.map((p) => apply(Himg, p.x, p.y))
      if (!this.corners) this.corners = cs
      else {
        const moved = cs.reduce((s, c, i) => s + Math.hypot(c.x - this.corners![i].x, c.y - this.corners![i].y), 0) / 4
        // (steadier when still, quick when the phone really moves)
        const a = Math.min(1, 0.06 * (1 - 0.7 * this.smoothing) + moved * (0.06 - 0.03 * this.smoothing))
        this.corners = this.corners.map((c, i) => ({ x: c.x + (cs[i].x - c.x) * a, y: c.y + (cs[i].y - c.y) * a }))
      }
      this.Hs = fitHomography(unit, this.corners) ?? Himg
      this.haveQ = !!(this.device && this.device(this.qFrame, VIDEO_LAG))
    }
    const pose = cameraFromPlaneHomography(Himg, this.k())
    if (pose) {
      this.visQ.set(...quatFromMat(pose.R))
      const p = pose.position
      if (!this.havePos) this.pos = [p[0], p[1], p[2]]
      else this.pos = [this.pos[0] + (p[0] - this.pos[0]) * 0.5, this.pos[1] + (p[1] - this.pos[1]) * 0.5, this.pos[2] + (p[2] - this.pos[2]) * 0.5]
      this.havePos = true
    }
    // gyro-led: the turn from the gyroscope, the position from the picture given that turn
    if (pose && this.Wp && this.haveQ) {
      const qg = this.Wp.clone().multiply(this.qFrame) // the camera's turn in the surface's frame, by the gyro alone
      const target = this.visQ.clone().multiply(qg.clone().invert())
      const gap = (this.visQ.angleTo(qg) * 180) / Math.PI
      this.stat.gyroGap += (gap - this.stat.gyroGap) * 0.2
      if (!this.haveOff) {
        this.off.copy(target)
        this.haveOff = true
      } else this.off.slerp(target, Math.min(0.5, 0.03 + gap * 0.02)) // (the picture only corrects slow drift; a big disagreement is pulled in faster)
      const toP = inv3(this.Hplane)
      if (toP) {
        const q = this.off.clone().multiply(qg)
        const Rcw = this.surfaceToCamera(q)
        const pts = st.ref.map((r, i) => ({ plane: apply(toP, r.x, r.y), pix: st.now[i] }))
        const t = translationFromRotation(Rcw, this.k(), pts)
        if (t) {
          const C: [number, number, number] = [0, 1, 2].map((i) => -(Rcw[i] * t[0] + Rcw[3 + i] * t[1] + Rcw[6 + i] * t[2])) as [number, number, number]
          if (!this.C) this.C = C
          else {
            const d = Math.hypot(C[0] - this.C[0], C[1] - this.C[1], C[2] - this.C[2])
            const a = Math.min(1, 0.16 - 0.12 * this.smoothing + d * (30 - 15 * this.smoothing))
            this.C = [this.C[0] + (C[0] - this.C[0]) * a, this.C[1] + (C[1] - this.C[1]) * a, this.C[2] + (C[2] - this.C[2]) * a]
          }
        }
      }
    }
    // for the scene to draw: the outline and the points being followed, pinned on the surface itself
    const toPlane = inv3(this.Hplane)
    if (toPlane) {
      const a2 = this.aspect / 2
      this.overlay = {
        phase: 'holding',
        quad: [{ x: -0.5, y: a2 }, { x: 0.5, y: a2 }, { x: 0.5, y: -a2 }, { x: -0.5, y: -a2 }],
        points: st.landmarks.map((p) => apply(toPlane, p.x, p.y)),
        inliers: st.inliers,
        kind: this.kind,
      }
      this.fresh = true
    }
  }
  private lostSince = 0
  /** Work out the lens from how the surface looks when it is seen at a slant, and move toward it (a median, so a bad reading does not count). */
  private learnFocal(Himg: Mat3) {
    if (!this.autoF || !this.gray) return
    const s = GRAY_W / this.vw
    const fg = focalFromHomography(Himg, GRAY_W / 2, this.gray.h / 2)
    if (fg === null) return
    const f = fg / s
    if (f < this.fBase * 0.75 || f > this.fBase * 1.4) return
    this.fSamples.push(f)
    if (this.fSamples.length > 150) this.fSamples.shift()
    if (this.fSamples.length < 40) return
    const sorted = [...this.fSamples].sort((x, y) => x - y)
    const med = sorted[sorted.length >> 1]
    this.f += (med - this.f) * 0.02
  }
  private havePos = false
}
