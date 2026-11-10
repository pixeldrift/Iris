// The scene's side of Wall mode. WallTracking says where the surface is in the camera's picture; this turns that into what is drawn:
// the world -> screen map (so everything on the surface sits exactly on the followed points and moves nearer and farther as the phone
// does), the "scanned" effect when a surface is first found, the pins, the virtual room behind, and the zoom, drag, frame-all and level.
// The scene gives it a small host (the Three scene, the view, the camera, and a few questions about itself) and calls `fit` when what
// is on the wall changes and `update` every frame.

import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { K } from '../types'
import type { EnvironmentKind } from '../types'
import { apply, inv3, mul3, mulVec, type Mat3 } from './vision/math'
import { VIDEO_LAG, type WallTracking } from './WallTracking'

/** How far behind the groups the real surface is: small, so what is on it (the pins, the groups) stays together when the phone moves sideways. */
export const WALL_LIFT = 0.12 * K

/** What the rig needs from the scene it draws into. */
export interface WallHost {
  scene: Scene
  host: HTMLElement
  camera: PerspectiveCamera
  /** The background now (the camera, the virtual room, a photo), if there is one. */
  envKind(): EnvironmentKind | undefined
  setEnvOpacity(a: number): void
  /** The world-space box of everything that should be on the wall (groups and loose cards), or null when there is nothing yet. */
  extents(): { minX: number; maxX: number; minY: number; maxY: number } | null
  /** How much of the virtual wall is showing instead of the camera (0 while looking for the surface, 1 once it has settled). */
  onReveal(r: number): void
  invalidate(): void
}

export class WallRig {
  constructor(
    private wall: WallTracking,
    private h: WallHost,
  ) {
    this.buildWallOverlay()
    this.buildWallSet()
  }

  private wallGroup?: Mesh
  /** The wall mode's world: the surface's width in world units, and where the groups' middle is (the surface's middle is put there). */
  private wallBox = { w: 120, ox: 0, oy: 0 }

  // a quiet stand-in for the room behind the surface (when the background is not the camera): a dot grid on the wall, and a floor and
  // two side walls of dots that fade into the mist toward the viewer
  private setGroup?: Group
  private setParts?: { wall: Mesh; floor: Mesh; left: Mesh; right: Mesh }

  /** Dots on a transparent picture, with an alpha falloff `fade(u, v)` (0..1 across the picture, v up). */
  private dotTexture(wU: number, hU: number, fade: (u: number, v: number) => number): CanvasTexture {
    const PPU = 300 // pixels per unit (a unit is the surface's width)
    const w = Math.round(wU * PPU)
    const h = Math.round(hU * PPU)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    const step = 0.2 * PPU
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const a = fade(x / w, 1 - y / h)
        if (a < 0.02) continue
        g.fillStyle = `rgba(160,124,212,${(0.3 * a).toFixed(3)})`
        g.beginPath()
        g.arc(x, y, 1.3, 0, Math.PI * 2)
        g.fill()
      }
    }
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }

  private buildWallSet() {
    const g = new Group()
    g.visible = false
    const smooth = (x: number) => Math.max(0, Math.min(1, x)) ** 1.6
    const mk = (tex: CanvasTexture, order: number) => {
      const m = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide, fog: false }))
      m.renderOrder = order
      g.add(m)
      return m
    }
    // (all in units of the surface's width; fitWall sizes them)
    const wall = mk(this.dotTexture(5, 5, (u, v) => smooth(1 - Math.hypot(u - 0.5, v - 0.5) * 2)), -6)
    const floor = mk(this.dotTexture(5, 2.2, (u, v) => smooth(v) * smooth(1 - Math.abs(u - 0.5) * 2)), -6)
    const side = this.dotTexture(2.2, 3, (u, v) => smooth(u) * smooth(1 - v))
    const left = mk(side, -6)
    const right = mk(side, -6)
    floor.rotation.x = -Math.PI / 2
    left.rotation.y = Math.PI / 2
    right.rotation.y = -Math.PI / 2
    right.scale.x = -1
    this.h.scene.add(g)
    this.setGroup = g
    this.setParts = { wall, floor, left, right }
  }

  private fitWallSet() {
    const p = this.setParts
    if (!p) return
    const { w: W, ox, oy } = this.wallLay
    const z = -WALL_LIFT - 0.03 * K
    p.wall.scale.set(5 * W, 5 * W, 1)
    p.wall.position.set(ox, oy, z)
    const floorY = oy - 0.6 * W
    p.floor.scale.set(5 * W, 2.2 * W, 1)
    p.floor.position.set(ox, floorY, z + 1.1 * W)
    for (const [m, sx] of [[p.left, -1], [p.right, 1]] as const) {
      m.scale.set(2.2 * W * (sx === 1 ? -1 : 1), 3 * W, 1)
      m.position.set(ox + sx * 1.3 * W, floorY + 1.5 * W, z + 1.1 * W)
    }
  }

  private updateWallSet() {
    const g = this.setGroup
    if (!g) return
    const kind = this.h.envKind()
    g.visible = kind !== 'camera' && this.wallReveal > 0
    if (kind !== 'camera') this.h.setEnvOpacity(this.wallReveal) // (the virtual sky or photo comes in as the camera goes)
    for (const m of Object.values(this.setParts ?? {})) (m.material as MeshBasicMaterial).opacity = this.wallReveal
    // a picture behind is busy enough: the floor and walls are only for the virtual room
    if (this.setParts) for (const m of [this.setParts.floor, this.setParts.left, this.setParts.right]) m.visible = kind === 'virtual' || kind === undefined
  }

  private buildWallOverlay() {
    // a one-time "scanned" effect when the surface is first found: a soft outline, and a grid of dots wiping across it (then the virtual
    // wall is revealed). It is a single plane with a small shader, sized to the surface, and gone a couple of seconds later.
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: { uWipe: { value: 0 }, uFade: { value: 0 }, uOutline: { value: 0 }, uAsp: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uWipe; uniform float uFade; uniform float uOutline; uniform float uAsp;
        void main(){
          // the plane is a little larger than the surface, so the glow can fade away on both sides of its border
          vec2 q = (vUv - 0.5) * 1.3 + 0.5;
          vec2 e = min(q, 1.0 - q) * vec2(uAsp, 1.0);
          float d = min(e.x, e.y); // (negative outside the surface)
          float glow = exp(-pow(d / 0.045, 2.0)) * 0.7 + exp(-pow(d / 0.016, 2.0)) * 0.25;
          float inside = smoothstep(0.0, 0.03, d);
          // dots on a grid, lit where the wipe has passed (brightest right at its edge, then settling)
          vec2 cell = vec2(q.x * uAsp, q.y) * 18.0;
          float dot = smoothstep(0.2, 0.0, length(fract(cell) - 0.5) - 0.12);
          float behind = uWipe - q.x;
          float lit = smoothstep(0.0, 0.05, behind) * (0.35 + 0.65 * exp(-behind * 6.0));
          float edge = exp(-pow(behind / 0.05, 2.0)) * inside;
          vec3 col = mix(vec3(0.74, 0.56, 1.0), vec3(0.62, 0.82, 1.0), vUv.y);
          float a = (glow * uOutline + dot * lit * inside * 0.8 + edge * 0.12) * uFade;
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        }`,
    })
    const scan = new Mesh(new PlaneGeometry(1, 1), mat)
    scan.renderOrder = 0
    scan.visible = false
    scan.frustumCulled = false
    this.h.scene.add(scan)
    this.wallGroup = scan
    // pins: the points being followed, fixed on the surface's plane in the virtual world. Large and soft, so a few are always in view
    // whichever way the phone points; they keep their places when they go out of view, and come back when the camera does.
    const dc = document.createElement('canvas')
    dc.width = 64
    dc.height = 64
    const dx = dc.getContext('2d')!
    const rg = dx.createRadialGradient(32, 32, 0, 32, 32, 31)
    rg.addColorStop(0, 'rgba(255,255,255,1)')
    rg.addColorStop(0.4, 'rgba(214,186,255,1)')
    rg.addColorStop(0.75, 'rgba(176,130,250,0.55)')
    rg.addColorStop(1, 'rgba(190,150,255,0)')
    dx.fillStyle = rg
    dx.fillRect(0, 0, 64, 64)
    const pins = new Points(new BufferGeometry(), new PointsMaterial({ map: new CanvasTexture(dc), size: 5, transparent: true, depthWrite: false, sizeAttenuation: true, opacity: 0 }))
    pins.frustumCulled = false
    pins.renderOrder = 1
    pins.visible = false
    this.h.scene.add(pins)
    this.wallPins = pins
  }
  private wallPins?: Points
  private pinsDirty = false
  private lastReveal = -1
  private pinCount = -1

  private wallScan = { t0: 0, held: false, quad: null as null | { x: number; y: number }[] }

  /** Size the wall world to the layout (the surface's width is the layout's) and tell the tracker. */
  /** Size the wall world to what is there (the surface's width is the layout's, over the zoom). */
  fit() {
    const ex = this.h.extents()
    if (!ex) return
    this.wallLay = { w: Math.max(40, (ex.maxX - ex.minX) * 1.04), h: Math.max(30, (ex.maxY - ex.minY) * 1.04), ox: (ex.minX + ex.maxX) / 2, oy: (ex.minY + ex.maxY) / 2 }
    this.applyWall()
    this.fitWallSet()
  }

  /** How many times bigger the world is than the surface it hangs on (2: the groups are twice as wide as the sheet). Pinch to change. */
  wallZoom = 2.2
  /** Where the virtual world is slid to under the surface (a drag on empty space). */
  private wallPan: [number, number] = [0, 0]
  private wallLay = { w: 120, h: 80, ox: 0, oy: 0 }

  /** The surface's size and middle in the world, from the layout, the zoom and the slide; told to the tracker. */
  private applyWall() {
    const L = this.wallLay
    this.wallBox = { w: L.w / this.wallZoom, ox: L.ox + this.wallPan[0], oy: L.oy + this.wallPan[1] }
    this.pinsDirty = true
    this.h.invalidate()
  }

  /**
   * The world -> screen map of what is on and just off the surface (3 rows of 4, row-major; a point (x, y, z) is at M*(x, y, z, 1)
   * homogeneous, in pixels of the view). It is made straight from the picture of the surface the tracker follows, so anything on the
   * surface is exactly where the followed points are, and moves toward and away from you as the surface does. Null before one is found.
   */
  private wallMatrix(): number[] | null {
    const wall = this.wall
    const surf = wall?.getSurface(this.h.envKind() === 'camera' ? VIDEO_LAG : 0)
    if (!wall || !surf) return null
    const { w: vw, h: vh } = wall.videoSize
    const Wc = Math.max(1, this.h.host.clientWidth)
    const Hc = Math.max(1, this.h.host.clientHeight)
    const cover = Math.max(Wc / vw, Hc / vh)
    // (the picture is shown cropped to cover the view, centred)
    const S: Mat3 = [vw * cover, 0, (Wc - vw * cover) / 2, 0, vh * cover, (Hc - vh * cover) / 2, 0, 0, 1]
    const H = mul3(S, surf.H)
    const z = mulVec(S, surf.zcol)
    const { w: s, ox, oy } = this.wallBox
    // the groups' wall may be turned from the tracked surface (see levelNow): V axis i is the surface's R[., i]
    const R = this.levelRot ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]
    const M: number[] = []
    for (let r = 0; r < 3; r++) {
      const hx = H[r * 3]
      const hy = H[r * 3 + 1]
      const hz = z[r]
      const cx = (hx * R[0] + hy * R[3] + hz * R[6]) / s
      const cy = (hx * R[1] + hy * R[4] + hz * R[7]) / s
      const cz = (hx * R[2] + hy * R[5] + hz * R[8]) / s
      M.push(cx, cy, cz, H[r * 3 + 2] - cx * ox - cy * oy + cz * WALL_LIFT)
    }
    return M
  }

  /** (for tests) where the middle of the surface is on screen. */
  probe(): [number, number] | null {
    const M = this.wallMatrix()
    if (!M) return null
    return this.wallScreen(M, this.wallBox.ox, this.wallBox.oy)
  }

  /** The groups' wall as a turn of the tracked surface (null: the same). Set by `levelNow`. */
  private levelRot: Mat3 | null = null

  /** Face the groups straight on and level, from where the phone is now (the tracked surface itself is untouched). */
  levelNow() {
    const R = this.wall?.levelNow()
    if (!R) return
    this.levelRot = R
    this.pinsDirty = true
    this.h.invalidate()
  }

  /** A point of the tracked surface (its own x, y) in the groups' world, for things that belong to the real wall (the pins). */
  private surfaceToWorld(x: number, y: number, z = 0): [number, number, number] {
    const { w, ox, oy } = this.wallBox
    const R = this.levelRot
    // p_virtual = R^T * p_surface
    const p0 = R ? R[0] * x + R[3] * y + R[6] * z : x
    const p1 = R ? R[1] * x + R[4] * y + R[7] * z : y
    const p2 = R ? R[2] * x + R[5] * y + R[8] * z : z
    return [ox + w * p0, oy + w * p1, -WALL_LIFT + w * p2]
  }

  /** Where a point of the surface plane (world x, y) is on screen. */
  private wallScreen(M: number[], x: number, y: number): [number, number] {
    const z = -WALL_LIFT
    const w = M[8] * x + M[9] * y + M[10] * z + M[11]
    return [(M[0] * x + M[1] * y + M[2] * z + M[3]) / w, (M[4] * x + M[5] * y + M[6] * z + M[7]) / w]
  }

  /** The point of the surface plane that is at a place on screen. */
  planePointAt(sx: number, sy: number): readonly [number, number] | null {
    const M = this.wallMatrix()
    if (!M) return null
    const z = -WALL_LIFT
    const G: Mat3 = [M[0], M[1], M[2] * z + M[3], M[4], M[5], M[6] * z + M[7], M[8], M[9], M[10] * z + M[11]]
    const inv = inv3(G)
    if (!inv) return null
    const p = apply(inv, sx, sy)
    return [p.x, p.y]
  }

  /** Make the 3D camera exactly the one the surface's picture describes (its own matrices, not a position and a turn). */
  private applyWallCamera(M0: number[]): boolean {
    const { ox, oy } = this.wallBox
    let M = M0
    let w0 = M[8] * ox + M[9] * oy + M[10] * -WALL_LIFT + M[11]
    if (w0 < 0) {
      M = M.map((v) => -v)
      w0 = -w0
    }
    if (!(w0 > 1e-12)) return false
    const Wc = Math.max(1, this.h.host.clientWidth)
    const Hc = Math.max(1, this.h.host.clientHeight)
    const n = 0.04 * w0
    const f = 80 * w0
    const a = (f + n) / (f - n)
    const b = (-2 * f * n) / (f - n)
    const row = (r: number) => M.slice(r * 4, r * 4 + 4)
    const [m0, m1, m2] = [row(0), row(1), row(2)]
    const clip = [m0.map((v, i) => (2 / Wc) * v - m2[i]), m1.map((v, i) => (-2 / Hc) * v + m2[i]), m2.map((v, i) => a * v + (i === 3 ? b : 0)), m2]
    // where the camera is: the point every ray passes through (A * C + b = 0)
    const A: Mat3 = [m0[0], m0[1], m0[2], m1[0], m1[1], m1[2], m2[0], m2[1], m2[2]]
    const Ai = inv3(A)
    if (!Ai) return false
    const C = mulVec(Ai, [m0[3], m1[3], m2[3]]).map((v) => -v)
    this.h.camera.position.set(C[0], C[1], C[2])
    this.h.camera.quaternion.identity()
    this.h.camera.updateMatrixWorld(true)
    // (the view matrix is the move by -C, so the projection takes the move back)
    const P = clip.map((r) => [r[0], r[1], r[2], r[3] + r[0] * C[0] + r[1] * C[1] + r[2] * C[2]])
    this.h.camera.projectionMatrix.set(P[0][0], P[0][1], P[0][2], P[0][3], P[1][0], P[1][1], P[1][2], P[1][3], P[2][0], P[2][1], P[2][2], P[2][3], P[3][0], P[3][1], P[3][2], P[3][3])
    this.h.camera.projectionMatrixInverse.copy(this.h.camera.projectionMatrix).invert()
    return true
  }

  /** Wall mode: bring every group into view (the zoom that fits them at the distance the phone is at, centred on the screen). */
  frameAll() {
    const L = this.wallLay
    const M = this.wallMatrix()
    const Wc = Math.max(1, this.h.host.clientWidth)
    const Hc = Math.max(1, this.h.host.clientHeight)
    if (M) {
      const a = this.wallScreen(M, L.ox, L.oy)
      const b = this.wallScreen(M, L.ox + 1, L.oy)
      const c = this.wallScreen(M, L.ox, L.oy + 1)
      const pxX = Math.max(1e-3, Math.abs(b[0] - a[0]))
      const pxY = Math.max(1e-3, Math.abs(c[1] - a[1]))
      // (a world unit is this many pixels now; pixels per unit grow with the zoom)
      const want = Math.min((0.9 * Wc) / (L.w * pxX), (0.9 * Hc) / (L.h * pxY))
      this.wallZoom = Math.min(8, Math.max(0.3, this.wallZoom * want))
    } else this.wallZoom = 1
    this.wallPan = [0, 0]
    this.applyWall()
    // then slide them so their middle is the middle of the screen
    const P = this.planePointAt(Wc / 2, Hc / 2)
    if (P) {
      this.wallPan = [L.ox - P[0], L.oy - P[1]]
      this.applyWall()
    }
  }

  /** Zoom about the middle of the screen: what is there stays there. */
  setWallZoom(z: number) {
    const centre = () => this.planePointAt(this.h.host.clientWidth / 2, this.h.host.clientHeight / 2)
    const before = centre()
    this.wallZoom = Math.min(8, Math.max(0.6, z))
    this.applyWall()
    const after = centre()
    if (before && after) {
      this.wallPan[0] += before[0] - after[0]
      this.wallPan[1] += before[1] - after[1]
      this.applyWall()
    }
  }

  /** The first-found effect (about 2.4 s), and the reveal of the virtual wall that follows it. */
  private updateWallOverlay() {
    const wall = this.wall
    const scan = this.wallGroup as Mesh | undefined
    if (!wall || !scan) return
    const ov = wall.getOverlay()
    const st = this.wallScan
    const holding = ov.phase === 'holding' && !!ov.quad
    if (holding && !st.held) {
      st.t0 = performance.now() // (found, or found again after being lost)
      const { w, ox, oy } = this.wallBox
      const xs = ov.quad!.map((p) => p.x * w + ox)
      const ys = ov.quad!.map((p) => p.y * w + oy)
      const sw = Math.max(...xs) - Math.min(...xs)
      const sh = Math.max(...ys) - Math.min(...ys)
      scan.position.set((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, -WALL_LIFT)
      scan.scale.set(sw * 1.3, sh * 1.3, 1)
      ;(scan.material as ShaderMaterial).uniforms.uAsp.value = sw / Math.max(1e-3, sh)
    }
    if (ov.phase === 'searching') {
      st.t0 = 0 // (looking again: the camera comes back)
      st.held = false
      this.levelRot = null
    }
    st.held = holding
    // the pins (every point pinned so far, in the world on the surface's plane)
    const pins = this.wallPins
    if (pins && ov.quad && (wall.takeFresh() || this.pinsDirty)) {
      this.pinsDirty = false
      const pos: number[] = []
      for (const p of ov.points) {
        const q = this.surfaceToWorld(p.x, p.y)
        pos.push(q[0], q[1], q[2] + 0.02 * K)
      }
      if (pos.length / 3 !== this.pinCount) {
        pins.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3))
        pins.geometry.computeBoundingSphere()
        this.pinCount = pos.length / 3
      } else {
        const attr = pins.geometry.getAttribute('position') as Float32BufferAttribute
        attr.set(pos)
        attr.needsUpdate = true
      }
      ;(pins.material as PointsMaterial).size = 0.035 * this.wallLay.w
    }
    const t = (performance.now() - st.t0) / 1000
    const on = st.t0 > 0 && t < 2.5
    scan.visible = on
    if (on) {
      const u = (scan.material as ShaderMaterial).uniforms
      u.uWipe.value = Math.min(1.4, t / 1.2 * 1.4) - 0.1
      u.uFade.value = Math.min(1, t / 0.3) * Math.min(1, Math.max(0, (2.5 - t) / 1.0))
      u.uOutline.value = Math.min(1, t / 0.4) * Math.min(1, Math.max(0, (1.6 - t) / 0.8))
    }
    // the virtual wall is revealed as the scan finishes
    this.wallReveal = st.t0 > 0 ? Math.min(1, Math.max(0, (t - 0.8) / 1.2)) : 0
    if (Math.abs(this.wallReveal - this.lastReveal) > 0.005 || this.wallReveal === 0 || this.wallReveal === 1) {
      if (this.wallReveal !== this.lastReveal) this.h.onReveal(this.wallReveal)
      this.lastReveal = this.wallReveal
    }
    if (pins) {
      pins.visible = this.wallReveal > 0 && ov.phase !== 'searching'
      ;(pins.material as PointsMaterial).opacity = 0.5 * this.wallReveal
    }
  }
  private wallReveal = 0
  /**
   * For finding out where a problem is: each followed point twice, as the tracker saw it in the camera picture, and as this scene draws
   * the same point of the surface (through the pose it is using). If the two sit apart, the fault is in how the pose is worked out or
   * shown; if both slide off the real features, it is in the following itself. Pixels within the view.
   */
  debug(): { tracked: [number, number][]; drawn: [number, number][] } {
    const wall = this.wall
    if (!wall) return { tracked: [], drawn: [] }
    const { w: vw, h: vh } = wall.videoSize
    const Wc = Math.max(1, this.h.host.clientWidth)
    const Hc = Math.max(1, this.h.host.clientHeight)
    const cover = Math.max(Wc / vw, Hc / vh)
    const tracked: [number, number][] = []
    const drawn: [number, number][] = []
    const v = new Vector3()
    for (const p of wall.debugFrame()) {
      tracked.push([p.u * vw * cover + (Wc - vw * cover) / 2, p.v * vh * cover + (Hc - vh * cover) / 2])
      v.set(...this.surfaceToWorld(p.plane.x, p.plane.y)).project(this.h.camera)
      drawn.push([((v.x + 1) / 2) * Wc, ((1 - v.y) / 2) * Hc])
    }
    return { tracked, drawn }
  }
  get phase() {
    return this.wall.phase
  }

  /** One frame: the scan effect, the virtual room, then the 3D camera made from the surface's picture. */
  update() {
    this.updateWallOverlay()
    this.updateWallSet()
    const cam = this.h.camera
    const { w: vw, h: vh, f } = this.wall.videoSize
    const Hc = Math.max(1, this.h.host.clientHeight)
    const Wc = Math.max(1, this.h.host.clientWidth)
    const cover = Math.max(Wc / vw, Hc / vh)
    // (the lens is the camera's: its picture fills the view the way the video does, cropped to cover)
    cam.fov = (2 * Math.atan(Hc / 2 / (f * cover)) * 180) / Math.PI
    const wm = this.wallMatrix()
    if (!(wm && this.applyWallCamera(wm))) {
      // before a surface has been found: a plain camera a little back from the middle
      cam.position.set(this.wallBox.ox, this.wallBox.oy, 2.2 * this.wallBox.w)
      cam.quaternion.identity()
      cam.updateProjectionMatrix()
    }
  }

  /** A drag of `dx`, `dy` pixels on empty space: slide the groups under the surface (so they follow the finger). */
  panPixels(dx: number, dy: number) {
    const M = this.wallMatrix()
    if (!M) return
    // (a world unit on the surface is this many pixels here)
    const { ox, oy } = this.wallBox
    const a = this.wallScreen(M, ox, oy)
    const b = this.wallScreen(M, ox + 1, oy)
    const c = this.wallScreen(M, ox, oy + 1)
    const pxX = Math.max(1e-3, Math.abs(b[0] - a[0]))
    const pxY = Math.max(1e-3, Math.abs(c[1] - a[1]))
    this.wallPan[0] -= dx / pxX
    this.wallPan[1] += dy / pxY
    this.applyWall()
  }

  /** Where a screen place is on the groups' wall, in the layout's units at the reference radius (for a tap that makes something). */
  worldAt(sx: number, sy: number): { x: number; y: number } | null {
    const p = this.planePointAt(sx, sy)
    return p ? { x: p[0], y: p[1] } : null
  }

  /** The camera shows again (looking for the surface anew). */
  resetReveal() {
    this.lastReveal = -1
  }

  dispose() {
    if (this.wallPins) {
      this.h.scene.remove(this.wallPins)
      this.wallPins.geometry.dispose()
      ;(this.wallPins.material as PointsMaterial).map?.dispose()
      ;(this.wallPins.material as PointsMaterial).dispose()
    }
    if (this.wallGroup) {
      this.h.scene.remove(this.wallGroup)
      this.wallGroup.geometry.dispose()
      ;(this.wallGroup.material as ShaderMaterial).dispose()
    }
    if (this.setParts) {
      this.setGroup && this.h.scene.remove(this.setGroup)
      for (const m of Object.values(this.setParts)) {
        m.geometry.dispose()
        ;(m.material as MeshBasicMaterial).map?.dispose()
        ;(m.material as MeshBasicMaterial).dispose()
      }
    }
  }
}
