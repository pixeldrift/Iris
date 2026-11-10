// SpatialScene: draws the layout with Three.js. It knows nothing of where the camera pose comes from (it is given a TrackingProvider) or
// of what is behind (an EnvironmentProvider), and it never edits tasks: it reports taps, moves and drops, and the caller decides what
// they mean.
//
// Moving things is meant to be easy, like cards spread on a desk: grab any task and it comes with you; grab a group (its name or its
// pane) and the whole group does, the others making room; let go of a task over another group and it joins it, over empty space and it
// floats there (pulled out of its group) until it is dropped into one.

import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Points,
  PointsMaterial,
  ShaderMaterial,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { edgeDots } from '../core/edges'
import { CARD_PLANE, HUB_PX, drawCard, drawHub, drawPlate, type CardInfo, type HubInfo } from './cards'
import type { EnvironmentProvider } from './environment'
import { descendantsOf } from '../core/tree'
import { apply, inv3, mul3, mulVec, type Mat3 } from './vision/math'
import { linkGeometry } from './links'
import { FLAT_R, isFlat, freePose, fromRadius, nearestFreeSlot, snapCluster, snapFree, tidyClusters, tidyEverything, lookAt, localIn, moveCluster, onCylinder, paneOf, planeBasis, repose, separate, slotAt, taskWorld, withRadius } from './layout'
import type { SpatialTracking } from './tracking'
import { VIDEO_LAG, type WallTracking } from './wall'
import { K, WORLD, type ClusterPlacement, type SpatialLayoutData } from './types'

export interface SceneCluster extends HubInfo {
  id: string
  parent: string | null
}
export interface SceneTask extends CardInfo {
  id: string
  cluster: string
}
export interface SceneContent {
  clusters: SceneCluster[]
  tasks: SceneTask[]
  layout: SpatialLayoutData
}
/** How far behind the groups the real surface is, in Wall mode: small, so what is on it (the pins, the groups) stays together when the phone moves sideways. */
const WALL_LIFT = 0.12 * K

export interface SceneEvents {
  onOpen(taskId: string): void
  onToggle(taskId: string): void
  onFocus?(clusterId: string): void
  /** A task was dropped into a group: the caller moves it there (its place in the new group is already in the layout). */
  onRetag?(taskId: string, clusterId: string): void
  /** Something was moved: the caller stores the layout. */
  onLayout(layout: SpatialLayoutData): void
  /** The lens changed (a zoom, a fit): the horizontal angle in degrees. */
  onFov?(fov: number): void
  /** Wall mode: how much of the virtual wall is showing instead of the camera (0 while looking for the surface, 1 once it has settled). */
  onWallReveal?(reveal: number): void
  /** The twirl on a group's name was tapped. */
  onCollapse?(id: string): void
  /** Blank space inside a group's box was tapped: add a new item there. */
  onAddIn?(id: string): void
  /** A group was dropped onto another group's name: it should go inside it. */
  onReparent?(id: string, parent: string): void
  /** Something is being carried (and where the pointer is): the view can light up what is outside the canvas. */
  onCarry?(kind: 'task' | 'group', id: string, x: number, y: number): void
  onCarryEnd?(): void
  /** Let go outside the canvas: true when the drop was taken there (a group in the sidebar). */
  onDropOut?(kind: 'task' | 'group', id: string, x: number, y: number): boolean
}

interface Node {
  mesh: Mesh
  tex: CanvasTexture
  key: string
}
type Hit = { kind: 'task' | 'hub' | 'plate'; id: string; uvx: number }

/** The horizontal field of view of the lens, in degrees. */
const HUB_W = 1.5 * WORLD.cardW
export const FOV = { min: 20, max: 100, start: 50 }
const TAP_PX = 6

export class SpatialScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(60, 1, 0.1 * K, 300 * K)
  private raycaster = new Raycaster()
  private tasks = new Map<string, Node>()
  private hubs = new Map<string, Node>()
  private plates = new Map<string, Mesh>()
  private links?: Mesh
  private showLinks = true
  /** The radius of the cylinder the groups hang on (the layout itself is kept at WORLD.ring and bent to this). */
  private radius: number = WORLD.ring
  /** "Keep tidy": things let go snap to a grid (smoothly), so the space stays organised. */
  private tidy = true
  /** Where each card is drawn right now, easing toward where the layout says it goes: a card never jumps, it glides. */
  private taskShown = new Map<string, { c: string; free: boolean; x: number; y: number }>()
  /** Folded groups opened by lingering over them while carrying something (like spring-loaded folders), and the timer for the next. */
  private sprung = new Set<string>()
  private springTimer?: ReturnType<typeof setTimeout>
  /** The groups by id (for the lookups made on every frame). */
  private clusterMap = new Map<string, SceneCluster>()
  private content: SceneContent = { clusters: [], tasks: [], layout: { clusters: {}, tasks: {} } }
  /** Where everything is meant to be (the stored layout, with groups pushed clear of each other). */
  private layout: SpatialLayoutData = { clusters: {}, tasks: {} }
  /** Where the groups are drawn now: they glide to their places, so making room is smooth. */
  private shown: Record<string, ClusterPlacement> = {}
  private env?: EnvironmentProvider
  private raf = 0
  private running = true
  private dirty = true
  private lastQ = ''
  private ro?: ResizeObserver
  private fov = FOV.start
  private focusTween?: { t0: number; from: [number, number]; to: [number, number]; fov?: [number, number] }
  private pointers = new Map<number, { x: number; y: number }>()
  private press?: { id: number; x: number; y: number; t0: number; hit: Hit | null; mode: 'pending' | 'look' | 'task' | 'cluster' }
  private carry?: { kind: 'task' | 'cluster'; id: string; plane: Plane; offset: Vector3; hover: string | null; pos: Vector3; kids: Set<string> }
  private pinch?: { d: number; fov: number; zoom: number }
  private disposed = false
  /** Soft glowing dots on the frame for groups out of view (the Pond's edge dots, here for the room around you). */
  private dotEls = new Map<string, HTMLButtonElement>()

  constructor(
    private host: HTMLElement,
    private tracking: SpatialTracking,
    private events: SceneEvents,
    /** Wall mode: the camera finds a flat surface and the view is held to it (the groups hang flat, a little in front of it). */
    private wall?: WallTracking,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = SRGBColorSpace
    const el = this.renderer.domElement
    Object.assign(el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', touchAction: 'none', outline: 'none' })
    el.tabIndex = 0
    el.setAttribute('aria-label', 'Your tasks arranged around you. Drag empty space to look around, pinch to zoom, tap a task to open it, drag a task or a group to move it.')
    host.appendChild(el)
    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    el.addEventListener('pointerdown', this.down)
    el.addEventListener('pointermove', this.move)
    el.addEventListener('pointerup', this.up)
    el.addEventListener('pointercancel', this.up)
    el.addEventListener('wheel', this.wheel, { passive: false })
    el.addEventListener('keydown', this.key)
    if (wall) {
      this.radius = FLAT_R
      this.buildWallOverlay()
      this.buildWallSet()
    }
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  /* ---------- wall mode ---------- */

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
    this.scene.add(g)
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
    const kind = this.env?.kind
    g.visible = kind !== 'camera' && this.wallReveal > 0
    if (kind !== 'camera') this.env?.setOpacity?.(this.wallReveal) // (the virtual sky or photo comes in as the camera goes)
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
    this.scene.add(scan)
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
    this.scene.add(pins)
    this.wallPins = pins
  }
  private wallPins?: Points
  private pinsDirty = false
  private lastReveal = -1
  private pinCount = -1

  private wallScan = { t0: 0, held: false, quad: null as null | { x: number; y: number }[] }

  /** Size the wall world to the layout (the surface's width is the layout's) and tell the tracker. */
  private fitWall() {
    if (!this.wall) return
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const c of Object.values(this.layout.clusters)) {
      const hw = (c.cols * (WORLD.cardW + WORLD.gap)) / 2 + K
      minX = Math.min(minX, c.x - hw)
      maxX = Math.max(maxX, c.x + hw)
      minY = Math.min(minY, c.y - (c.rows ?? 1) * (WORLD.cardH + WORLD.gap) - K)
      maxY = Math.max(maxY, c.y + 1.5 * K)
    }
    if (!Number.isFinite(minX)) return
    this.wallLay = { w: Math.max(40, (maxX - minX) * 1.04), ox: (minX + maxX) / 2, oy: (minY + maxY) / 2 }
    this.applyWall()
    this.fitWallSet()
  }

  /** How many times bigger the world is than the surface it hangs on (2: the groups are twice as wide as the sheet). Pinch to change. */
  private wallZoom = 2.2
  /** Where the virtual world is slid to under the surface (a drag on empty space). */
  private wallPan: [number, number] = [0, 0]
  private wallLay = { w: 120, ox: 0, oy: 0 }

  /** The surface's size and middle in the world, from the layout, the zoom and the slide; told to the tracker. */
  private applyWall() {
    if (!this.wall) return
    const L = this.wallLay
    this.wallBox = { w: L.w / this.wallZoom, ox: L.ox + this.wallPan[0], oy: L.oy + this.wallPan[1] }
    this.wall.configure({ scale: this.wallBox.w, origin: [this.wallBox.ox, this.wallBox.oy], lift: WALL_LIFT })
    this.pinsDirty = true
    this.dirty = true
  }

  /**
   * The world -> screen map of what is on and just off the surface (3 rows of 4, row-major; a point (x, y, z) is at M*(x, y, z, 1)
   * homogeneous, in pixels of the view). It is made straight from the picture of the surface the tracker follows, so anything on the
   * surface is exactly where the followed points are, and moves toward and away from you as the surface does. Null before one is found.
   */
  private wallMatrix(): number[] | null {
    const wall = this.wall
    const surf = wall?.getSurface(this.env?.kind === 'camera' ? VIDEO_LAG : 0)
    if (!wall || !surf) return null
    const { w: vw, h: vh } = wall.videoSize
    const Wc = Math.max(1, this.host.clientWidth)
    const Hc = Math.max(1, this.host.clientHeight)
    const cover = Math.max(Wc / vw, Hc / vh)
    // (the picture is shown cropped to cover the view, centred)
    const S: Mat3 = [vw * cover, 0, (Wc - vw * cover) / 2, 0, vh * cover, (Hc - vh * cover) / 2, 0, 0, 1]
    const H = mul3(S, surf.H)
    const z = mulVec(S, surf.zcol)
    const { w: s, ox, oy } = this.wallBox
    const M: number[] = []
    for (let r = 0; r < 3; r++) M.push(H[r * 3] / s, H[r * 3 + 1] / s, z[r] / s, H[r * 3 + 2] - (H[r * 3] * ox) / s - (H[r * 3 + 1] * oy) / s + (z[r] * WALL_LIFT) / s)
    return M
  }

  /** (for tests) where the middle of the surface is on screen. */
  wallProbe(): [number, number] | null {
    const M = this.wallMatrix()
    if (!M) return null
    return this.wallScreen(M, this.wallBox.ox, this.wallBox.oy)
  }

  /** Where a point of the surface plane (world x, y) is on screen. */
  private wallScreen(M: number[], x: number, y: number): [number, number] {
    const z = -WALL_LIFT
    const w = M[8] * x + M[9] * y + M[10] * z + M[11]
    return [(M[0] * x + M[1] * y + M[2] * z + M[3]) / w, (M[4] * x + M[5] * y + M[6] * z + M[7]) / w]
  }

  /** The point of the surface plane that is at a place on screen. */
  private planePointAt(sx: number, sy: number): readonly [number, number] | null {
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
    const Wc = Math.max(1, this.host.clientWidth)
    const Hc = Math.max(1, this.host.clientHeight)
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
    this.camera.position.set(C[0], C[1], C[2])
    this.camera.quaternion.identity()
    this.camera.updateMatrixWorld(true)
    // (the view matrix is the move by -C, so the projection takes the move back)
    const P = clip.map((r) => [r[0], r[1], r[2], r[3] + r[0] * C[0] + r[1] * C[1] + r[2] * C[2]])
    this.camera.projectionMatrix.set(P[0][0], P[0][1], P[0][2], P[0][3], P[1][0], P[1][1], P[1][2], P[1][3], P[2][0], P[2][1], P[2][2], P[2][3], P[3][0], P[3][1], P[3][2], P[3][3])
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
    return true
  }

  /** Zoom about the middle of the screen: what is there stays there. */
  private setWallZoom(z: number) {
    if (!this.wall) return
    const centre = () => this.planePointAt(this.host.clientWidth / 2, this.host.clientHeight / 2)
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
    }
    st.held = holding
    // the pins (every point pinned so far, in the world on the surface's plane)
    const pins = this.wallPins
    if (pins && ov.quad && (wall.takeFresh() || this.pinsDirty)) {
      this.pinsDirty = false
      const { w, ox, oy } = this.wallBox
      const pos: number[] = []
      for (const p of ov.points) pos.push(p.x * w + ox, p.y * w + oy, -WALL_LIFT + 0.02 * K)
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
      if (this.wallReveal !== this.lastReveal) this.events.onWallReveal?.(this.wallReveal)
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
  wallDebug(): { tracked: [number, number][]; drawn: [number, number][] } {
    const wall = this.wall
    if (!wall) return { tracked: [], drawn: [] }
    const { w: vw, h: vh } = wall.videoSize
    const Wc = Math.max(1, this.host.clientWidth)
    const Hc = Math.max(1, this.host.clientHeight)
    const cover = Math.max(Wc / vw, Hc / vh)
    const tracked: [number, number][] = []
    const drawn: [number, number][] = []
    const v = new Vector3()
    const { w, ox, oy } = this.wallBox
    for (const p of wall.debugFrame()) {
      tracked.push([p.u * vw * cover + (Wc - vw * cover) / 2, p.v * vh * cover + (Hc - vh * cover) / 2])
      v.set(p.plane.x * w + ox, p.plane.y * w + oy, -WALL_LIFT).project(this.camera)
      drawn.push([((v.x + 1) / 2) * Wc, ((1 - v.y) / 2) * Hc])
    }
    return { tracked, drawn }
  }
  get wallPhase() {
    return this.wall?.phase ?? null
  }

  /* ---------- content ---------- */

  setContent(c: SceneContent) {
    this.content = c
    this.clusterMap = new Map(c.clusters.map((x) => [x.id, x]))
    // groups being carried keep their place under the finger until they are dropped
    const lay = withRadius(c.layout, this.radius)
    this.layout = this.carry?.kind === 'cluster' ? { ...lay, clusters: { ...lay.clusters, [this.carry.id]: this.layout.clusters[this.carry.id] ?? lay.clusters[this.carry.id] } } : lay
    const seen = new Set<string>()
    // (with a great many tasks the pictures are drawn smaller, to save memory)
    const scale = c.tasks.length > 240 ? 0.55 : c.tasks.length > 120 ? 0.75 : 1
    for (const t of c.tasks) {
      seen.add(t.id)
      const key = `${t.title}|${t.hue}|${t.done}|${t.due ?? ''}|${t.progress ?? ''}|${scale}`
      let n = this.tasks.get(t.id)
      if (!n) {
        const cv = document.createElement('canvas')
        const tex = new CanvasTexture(cv)
        tex.colorSpace = SRGBColorSpace
        tex.generateMipmaps = true
        tex.minFilter = LinearMipmapLinearFilter
        tex.anisotropy = 4
        const mesh = new Mesh(new PlaneGeometry(WORLD.cardW * CARD_PLANE.x, WORLD.cardH * CARD_PLANE.y), new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthWrite: false }))
        mesh.userData = { kind: 'task', id: t.id }
        mesh.rotation.order = 'YXZ'
        mesh.renderOrder = 2 // (a fixed order, so overlapping see-through things never swap places as the camera moves)
        this.scene.add(mesh)
        n = { mesh, tex, key: '' }
        this.tasks.set(t.id, n)
      }
      if (n.key !== key) {
        drawCard(n.tex.image as HTMLCanvasElement, t, scale)
        n.tex.needsUpdate = true
        n.key = key
      }
    }
    for (const [id, n] of this.tasks) if (!seen.has(id)) this.drop(this.tasks, id, n)
    const hubSeen = new Set<string>()
    for (const h of c.clusters) {
      hubSeen.add(h.id)
      const key = `${h.name}|${h.hue}|${h.count}|${h.shape}|${h.collapsed ? 1 : 0}`
      let n = this.hubs.get(h.id)
      if (!n) {
        const cv = document.createElement('canvas')
        const tex = new CanvasTexture(cv)
        tex.colorSpace = SRGBColorSpace
        const mesh = new Mesh(new PlaneGeometry(HUB_W, (HUB_W * HUB_PX.h) / HUB_PX.w), new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthWrite: false }))
        mesh.userData = { kind: 'hub', id: h.id }
        mesh.rotation.order = 'YXZ'
        mesh.renderOrder = 3
        this.scene.add(mesh)
        n = { mesh, tex, key: '' }
        this.hubs.set(h.id, n)
      }
      if (n.key !== key) {
        const hub = n
        drawHub(n.tex.image as HTMLCanvasElement, h, () => {
          hub.key = ''
          this.setContent(this.content)
        })
        n.tex.needsUpdate = true
        n.key = key
        n.mesh.userData.hov = false
      }
    }
    for (const [id, n] of this.hubs) if (!hubSeen.has(id)) this.drop(this.hubs, id, n)
    // newly seen groups appear in place; ones that were already here glide to wherever they are now meant to be
    for (const id of Object.keys(this.layout.clusters)) if (!this.shown[id]) this.shown[id] = this.layout.clusters[id]
    for (const id of Object.keys(this.shown)) if (!this.layout.clusters[id]) delete this.shown[id]
    this.place()
  }

  private drop(map: Map<string, Node>, id: string, n: Node) {
    this.scene.remove(n.mesh)
    n.mesh.geometry.dispose()
    ;(n.mesh.material as MeshBasicMaterial).dispose()
    n.tex.dispose()
    map.delete(id)
  }

  /** Glide the drawn groups toward where they are meant to be; true while any is still on its way. */
  private glide(): boolean {
    let moving = false
    // cards ease toward their places (a free one toward its spot on the cylinder, a grid one toward its slot in its group)
    for (const t of this.content.tasks) {
      const tp = this.layout.tasks[t.id]
      if (!tp || (this.carry?.kind === 'task' && this.carry.id === t.id)) continue
      const tx = tp.free ? tp.free.a : tp.u
      const ty = tp.free ? tp.free.y : tp.v
      const cur = this.taskShown.get(t.id)
      if (!cur || cur.c !== tp.c || cur.free !== !!tp.free) {
        this.taskShown.set(t.id, { c: tp.c, free: !!tp.free, x: tx, y: ty })
        continue
      }
      const dx = tx - cur.x
      const dy = ty - cur.y
      const dist = Math.hypot(tp.free ? dx * this.radius : dx, dy)
      if (dist < 0.02 * K) {
        if (cur.x !== tx || cur.y !== ty) (cur.x = tx), (cur.y = ty)
        continue
      }
      moving = true
      cur.x += dx * 0.28
      cur.y += dy * 0.28
    }
    for (const [id, want] of Object.entries(this.layout.clusters)) {
      const cur = this.shown[id]
      if (!cur) {
        this.shown[id] = want
        continue
      }
      const da = want.a - cur.a
      const dy = want.y - cur.y
      if (Math.abs(da * want.r) < 0.01 * K && Math.abs(dy) < 0.01 * K) {
        if (cur.a !== want.a || cur.y !== want.y) this.shown[id] = want
        continue
      }
      moving = true
      this.shown[id] = repose(want, cur.a + da * 0.3, cur.y + dy * 0.3)
    }
    return moving
  }

  /** Put every mesh where the layout says (and the pane behind each group, and the connectors between a group and its subgroups). */
  private place() {
    const L = this.layout
    const S = this.shown
    for (const t of this.content.tasks) {
      const n = this.tasks.get(t.id)
      const tp = L.tasks[t.id]
      if (!n || !tp) continue
      if (this.carry?.kind === 'task' && this.carry.id === t.id) continue // (under the finger)
      if (this.clusterMap.get(tp.c)?.collapsed && !tp.free) {
        n.mesh.visible = false
        continue
      }
      n.mesh.visible = true
      const eased = this.taskShown.get(t.id)
      // (where it is drawn now: easing toward the layout's place)
      const tv = eased && eased.c === tp.c && eased.free === !!tp.free ? (tp.free ? { ...tp, free: { a: eased.x, y: eased.y } } : { ...tp, u: eased.x, v: eased.y }) : tp
      const fp = freePose(tv, this.radius)
      const cp = S[tp.c]
      if (fp) {
        n.mesh.position.set(...fp.pos)
        n.mesh.rotation.set(fp.rx, fp.ry, tp.rot ?? 0)
        n.mesh.scale.setScalar(1.04)
        n.mesh.renderOrder = 4 // (floating things are in front)
      } else if (cp) {
        const [x, y, z] = taskWorld(tv, cp)
        n.mesh.position.set(x, y, z)
        n.mesh.rotation.set(cp.rx ?? 0, cp.ry, tp.rot ?? 0)
        n.mesh.scale.setScalar(cp.scale ?? 1)
        n.mesh.renderOrder = 2
      }
    }
    const hueOf = new Map(this.content.clusters.map((c) => [c.id, c.hue]))
    const plateSeen = new Set<string>()
    for (const h of this.content.clusters) {
      const cp = S[h.id]
      const n = this.hubs.get(h.id)
      if (!cp || !n) continue
      n.mesh.rotation.set(cp.rx ?? 0, cp.ry, 0)
      n.mesh.scale.setScalar(cp.scale ?? 1)
      // the pane its cards sit on: grown to hold every card in its grid (and drawn at its own proportions, with round corners)
      const pane = paneOf(cp)
      let left = pane.u0
      let right = pane.u1
      let bottom = pane.v0
      let gridCount = 0
      for (const t of this.content.tasks) {
        const tp = L.tasks[t.id]
        if (tp?.c !== h.id || tp.free) continue
        gridCount++
        left = Math.min(left, tp.u - WORLD.cardW / 2 - 0.4 * K)
        right = Math.max(right, tp.u + WORLD.cardW / 2 + 0.4 * K)
        bottom = Math.min(bottom, tp.v - WORLD.cardH / 2 - 0.4 * K)
      }
      const hov = this.carry?.hover === h.id
      if (n.mesh.userData.hov !== hov && n.key) {
        n.mesh.userData.hov = hov
        drawHub(n.tex.image as HTMLCanvasElement, h, () => {}, hov)
        n.tex.needsUpdate = true
      }
      // the name sits just above the box, along its left edge (outside it: the box is only the contents)
      {
        const bs0 = planeBasis(cp)
        const s0 = cp.scale ?? 1
        const hu = (left + HUB_W / 2) * s0
        const hv = (pane.v1 + 0.28 * K) * s0
        n.mesh.position.set(cp.x + bs0.right[0] * hu + bs0.up[0] * hv, cp.y + bs0.right[1] * hu + bs0.up[1] * hv, cp.z + bs0.right[2] * hu + bs0.up[2] * hv)
      }
      let plate = this.plates.get(h.id)
      if (!plate) {
        plate = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ transparent: true, side: DoubleSide, depthWrite: false }))
        plate.rotation.order = 'YXZ'
        plate.renderOrder = 1
        plate.userData = { kind: 'plate', id: h.id }
        this.scene.add(plate)
        this.plates.set(h.id, plate)
      }
      const w = right - left
      const hh = pane.v1 - bottom
      const hover = this.carry?.hover === h.id
      const pm = plate.material as MeshBasicMaterial
      const pkey = `${w.toFixed(1)}x${hh.toFixed(1)}|${hueOf.get(h.id)}|${hover}`
      if (plate.userData.key !== pkey) {
        pm.map?.dispose()
        pm.map = drawPlate(w, hh, hueOf.get(h.id) ?? 285, hover)
        pm.needsUpdate = true
        plate.userData.key = pkey
      }
      const s = cp.scale ?? 1
      plate.scale.set(w * s, hh * s, 1)
      const bs = planeBasis(cp)
      const cx = ((left + right) / 2) * s
      const cy = ((pane.v1 + bottom) / 2) * s
      const back = -0.06 * K
      plate.position.set(cp.x + bs.right[0] * cx + bs.up[0] * cy + bs.normal[0] * back, cp.y + bs.right[1] * cx + bs.up[1] * cy + bs.normal[1] * back, cp.z + bs.right[2] * cx + bs.up[2] * cy + bs.normal[2] * back)
      plate.rotation.set(cp.rx ?? 0, cp.ry, 0)
      plate.visible = !h.collapsed && gridCount > 0
      plateSeen.add(h.id)
    }
    for (const [id, p] of this.plates) {
      if (plateSeen.has(id)) continue
      this.scene.remove(p)
      p.geometry.dispose()
      ;(p.material as MeshBasicMaterial).map?.dispose()
      ;(p.material as MeshBasicMaterial).dispose()
      this.plates.delete(id)
    }
    this.buildLinks()
    this.fitWall()
    this.dirty = true
  }

  /**
   * The connectors of the group tree: a thick, soft ribbon that leaves the bottom of a group, swings gently, and arrives at the top of its
   * subgroup, shading from the one colour to the other (like the branches of a family tree). Behind everything else.
   */
  private buildLinks() {
    if (this.links) {
      this.scene.remove(this.links)
      this.links.geometry.dispose()
      ;(this.links.material as MeshBasicMaterial).dispose()
      this.links = undefined
    }
    if (!this.showLinks) return
    const geo = linkGeometry(this.content.clusters, this.shown)
    if (!geo) return
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(geo.pos, 3))
    g.setAttribute('color', new Float32BufferAttribute(geo.col, 3))
    g.setIndex(geo.idx)
    const m = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78, side: DoubleSide, depthWrite: false })
    this.links = new Mesh(g, m)
    this.links.renderOrder = 0
    this.scene.add(this.links)
  }

  /** Turn "keep tidy" on or off. Turning it on tidies everything now (smoothly). */
  setTidy(on: boolean) {
    const was = this.tidy
    this.tidy = on
    if (on && !was) this.tidyAll()
  }
  /** Put every card in a slot and every group and floating card on its grid, gliding there. */
  tidyAll() {
    const base = tidyEverything(fromRadius(this.layout, this.radius))
    this.layout = withRadius(base, this.radius)
    this.events.onLayout(base)
    this.dirty = true
    this.place()
  }
  /** Hang the groups on a cylinder of this radius: the same layout, curled more around you when near and flatter when far. */
  setRadius(r: number) {
    const changed = Math.abs(r - this.radius) > 1e-9
    this.radius = r
    this.layout = withRadius(this.content.layout, r)
    this.shown = { ...this.layout.clusters }
    this.place()
    this.dirty = true
    if (changed && !isFlat(r)) this.frameAll(true) // (a new radius changes how big everything looks, so fit it again)
  }
  getRadius() {
    return this.radius
  }
  /** Whether the connectors between a group and its subgroups are drawn. */
  setLinks(on: boolean) {
    this.showLinks = on
    this.buildLinks()
    this.dirty = true
  }

  /** Changes of background are done one after another, so a quick second choice can never leave an earlier camera running. */
  private envQueue: Promise<unknown> = Promise.resolve()
  setEnvironment(env: EnvironmentProvider): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      if (this.disposed) return false
      this.env?.dispose()
      this.env = undefined
      const ok = await env.start(this.host, this.scene)
      if (!ok || this.disposed) {
        env.dispose()
        return false
      }
      this.env = env
      this.lastReveal = -1
      this.dirty = true
      return true
    }
    const p = this.envQueue.then(run, run)
    this.envQueue = p
    return p
  }

  /* ---------- the camera ---------- */

  recenter() {
    if (this.wall) return void this.wall.recenter() // (look for the surface again)
    this.tracking.recenter()
    this.dirty = true
  }
  get lens(): number {
    return this.fov
  }
  /** Set the lens (the horizontal angle, in degrees). */
  setFov(f: number) {
    this.fov = Math.min(FOV.max, Math.max(FOV.min, f))
    this.dirty = true
    this.events.onFov?.(this.fov)
  }
  zoom(factor: number) {
    if (this.wall) return this.setWallZoom(this.wallZoom * factor)
    this.setFov(this.fov / factor)
  }
  /** Turn to face a group (the view glides there). */
  focusCluster(id: string) {
    if (this.wall) return // (the phone is how you move in wall mode)
    const cp = this.shown[id] ?? this.layout.clusters[id]
    if (!cp) return
    const { yaw, pitch } = lookAt(cp)
    const t = this.tracking.touch
    // with motion on, the sensor already turns the view: the touch offset only has to make up the difference
    this.focusTween = { t0: performance.now(), from: [t.yaw, t.pitch], to: [yaw - this.tracking.sensorYaw(), pitch] }
    this.events.onFocus?.(id)
  }
  /** Turn and zoom so the whole wall is in view (as far as the widest lens allows). */
  frameAll(instant = false) {
    if (this.wall) return
    const L = this.layout
    const ids = this.content.clusters.map((c) => c.id).filter((id) => L.clusters[id])
    if (!ids.length) return
    let minY = Infinity
    let maxY = -Infinity
    let minP = Infinity
    let maxP = -Infinity
    for (const id of ids) {
      const cp = L.clusters[id]
      const bs = planeBasis(cp)
      const pane = paneOf(cp)
      const n = this.content.tasks.filter((t) => L.tasks[t.id]?.c === id && !L.tasks[t.id]?.free).map((t) => L.tasks[t.id])
      const us = n.length ? n.map((t) => t.u) : [0]
      const vs = n.length ? n.map((t) => t.v) : [0]
      const s = cp.scale ?? 1
      const u0 = Math.min(pane.u0, Math.min(...us) - WORLD.cardW / 2) * s
      const u1 = Math.max(pane.u1, Math.max(...us) + WORLD.cardW / 2) * s
      const v0 = Math.min(pane.v0, Math.min(...vs) - WORLD.cardH / 2) * s
      const v1 = pane.v1 * s
      for (const [u, v] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) {
        const x = cp.x + bs.right[0] * u + bs.up[0] * v
        const y = cp.y + bs.right[1] * u + bs.up[1] * v
        const z = cp.z + bs.right[2] * u + bs.up[2] * v
        const yaw = Math.atan2(x, -z)
        const pit = Math.atan2(y, Math.hypot(x, z))
        minY = Math.min(minY, yaw)
        maxY = Math.max(maxY, yaw)
        minP = Math.min(minP, pit)
        maxP = Math.max(maxP, pit)
      }
    }
    const yaw0 = (minY + maxY) / 2
    const pit0 = (minP + maxP) / 2
    const aspect = Math.max(0.2, this.camera.aspect)
    const needH = Math.max(maxY - minY, 2 * Math.atan(Math.tan((maxP - minP) / 2) * aspect)) * 1.1
    const fov = Math.min(FOV.max, Math.max(FOV.min + 5, (needH * 180) / Math.PI))
    const t = this.tracking.touch
    if (instant) {
      t.set(-yaw0 - this.tracking.sensorYaw(), pit0)
      this.setFov(fov)
      return
    }
    this.focusTween = { t0: performance.now(), from: [t.yaw, t.pitch], to: [-yaw0 - this.tracking.sensorYaw(), pit0], fov: [this.fov, fov] }
  }
  private resize() {
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.dirty = true
  }

  /* ---------- for tests ---------- */

  /** Where something is on the screen (client coordinates), so a test can press on it. Only used by the end-to-end tests. */
  screenPoint(kind: 'task' | 'hub' | 'plate', id: string): { x: number; y: number } | null {
    const mesh = (kind === 'task' ? this.tasks.get(id)?.mesh : kind === 'hub' ? this.hubs.get(id)?.mesh : this.plates.get(id))
    if (!mesh) return null
    const p = mesh.position.clone().project(this.camera)
    const r = this.renderer.domElement.getBoundingClientRect()
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
  }
  /** A spot on a group's box with no card or name over it (where a tap adds an item). For tests. */
  blankInPlate(id: string): { x: number; y: number } | null {
    const plate = this.plates.get(id)
    if (!plate) return null
    const r = this.renderer.domElement.getBoundingClientRect()
    const c = this.screenPoint('plate', id)
    if (!c) return null
    for (let dy = 0; dy <= 120; dy += 6)
      for (let dx = 0; dx <= 160; dx += 6)
        for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          const pt = { clientX: c.x + sx * dx, clientY: c.y + sy * dy }
          if (pt.clientX < r.left || pt.clientX > r.right || pt.clientY < r.top || pt.clientY > r.bottom) continue
          const hit = this.pick(pt)
          if (hit?.kind === 'plate' && hit.id === id) return { x: pt.clientX, y: pt.clientY }
        }
    return null
  }
  /** A spot on the screen with nothing under it (open space). */
  emptyPoint(): { x: number; y: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect()
    for (let fy = 0.1; fy < 0.95; fy += 0.06)
      for (let fx = 0.1; fx < 0.9; fx += 0.06) {
        const pt = { clientX: r.left + r.width * fx, clientY: r.top + r.height * fy }
        if (!this.pick(pt)) return { x: pt.clientX, y: pt.clientY }
      }
    return null
  }

  /* ---------- lifecycle ---------- */

  pause() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }
  resume() {
    if (this.running || this.disposed) return
    this.running = true
    this.dirty = true
    this.raf = requestAnimationFrame(this.loop)
  }
  dispose() {
    this.disposed = true
    this.pause()
    this.ro?.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.down)
    el.removeEventListener('pointermove', this.move)
    el.removeEventListener('pointerup', this.up)
    el.removeEventListener('pointercancel', this.up)
    el.removeEventListener('wheel', this.wheel)
    el.removeEventListener('keydown', this.key)
    for (const d of this.dotEls.values()) d.remove()
    this.dotEls.clear()
    for (const [id, n] of [...this.tasks]) this.drop(this.tasks, id, n)
    for (const [id, n] of [...this.hubs]) this.drop(this.hubs, id, n)
    for (const p of this.plates.values()) {
      p.geometry.dispose()
      ;(p.material as MeshBasicMaterial).map?.dispose()
      ;(p.material as MeshBasicMaterial).dispose()
    }
    this.plates.clear()
    if (this.wallPins) {
      this.wallPins.geometry.dispose()
      ;(this.wallPins.material as PointsMaterial).map?.dispose()
      ;(this.wallPins.material as PointsMaterial).dispose()
    }
    if (this.wallGroup) {
      this.wallGroup.geometry.dispose()
      ;(this.wallGroup.material as ShaderMaterial).dispose()
    }
    if (this.setParts) {
      for (const m of Object.values(this.setParts)) {
        m.geometry.dispose()
        ;(m.material as MeshBasicMaterial).map?.dispose()
        ;(m.material as MeshBasicMaterial).dispose()
      }
    }
    if (this.links) {
      this.links.geometry.dispose()
      ;(this.links.material as MeshBasicMaterial).dispose()
    }
    // (after any background change still in flight, so a camera that was just starting is stopped too)
    void this.envQueue.finally(() => {
      this.env?.dispose()
      this.env = undefined
    })
    this.renderer.dispose()
    el.remove()
  }

  private loop(now: number) {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.loop)
    if (this.focusTween) {
      const k = Math.min(1, (now - this.focusTween.t0) / 650)
      const e = 1 - Math.pow(1 - k, 3)
      const f = this.focusTween
      // (the shortest way round)
      let dy = f.to[0] - f.from[0]
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      this.tracking.touch.set(f.from[0] + dy * e, f.from[1] + (f.to[1] - f.from[1]) * e)
      if (f.fov) this.fov = f.fov[0] + (f.fov[1] - f.fov[0]) * e
      if (k >= 1) {
        this.focusTween = undefined
        this.events.onFov?.(this.fov)
      }
      this.dirty = true
    }
    if (this.glide()) {
      this.place()
    }
    const pose = this.wall ? this.wall.getPose() : this.tracking.getPose()
    if (this.wall) this.dirty = true // (the camera picture moves all the time: draw every frame)
    const sig = pose.q.map((x) => x.toFixed(4)).join(',') + this.fov
    // in touch mode nothing changes unless it is moved: draw only when something did (kinder to the battery)
    if (sig !== this.lastQ || this.dirty) {
      this.lastQ = sig
      this.dirty = false
      this.camera.quaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3])
      if (pose.position) this.camera.position.set(...pose.position)
      // the lens is described by its horizontal angle; the vertical one follows the window's shape
      const asp = this.camera.aspect
      if (this.wall) {
        // the lens is the camera's: its picture fills the window the way the video does (cropped to cover), so the view lines up with it
        const { w: vw, h: vh, f } = this.wall.videoSize
        const Hc = Math.max(1, this.host.clientHeight)
        const Wc = Math.max(1, this.host.clientWidth)
        const cover = Math.max(Wc / vw, Hc / vh)
        this.camera.fov = (2 * Math.atan(Hc / 2 / (f * cover)) * 180) / Math.PI
        this.updateWallOverlay()
        this.updateWallSet()
      } else this.camera.fov = Math.max(8, Math.min(110, (2 * Math.atan(Math.tan((this.fov * Math.PI) / 360) / asp) * 180) / Math.PI))
      const wm = this.wall ? this.wallMatrix() : null
      if (!(wm && this.applyWallCamera(wm))) this.camera.updateProjectionMatrix()
      this.renderer.render(this.scene, this.camera)
      this.updateDots()
    }
  }

  /** One dot per group wholly out of view, riding the frame where a line from the middle of the screen to it crosses (fades in and out). */
  private updateDots() {
    const W = this.host.clientWidth
    const H = this.host.clientHeight
    const v = new Vector3()
    const pts = this.content.clusters.flatMap((c) => {
      const cp = this.shown[c.id]
      if (!cp) return []
      v.set(cp.x, cp.y, cp.z)
      const cam = v.clone().applyMatrix4(this.camera.matrixWorldInverse)
      let sx: number
      let sy: number
      if (cam.z < 0) {
        const p = v.clone().project(this.camera)
        sx = ((p.x + 1) / 2) * W
        sy = ((1 - p.y) / 2) * H
      } else {
        // behind the viewer: the way round is the way it lies in the screen's own plane
        const len = Math.hypot(cam.x, cam.y) || 1
        sx = W / 2 + (cam.x / len) * 5000
        sy = H / 2 - (cam.y / len) * 5000
      }
      // a dot that is showing stays until its group is well back in view, so one hovering at the edge never flickers
      return [{ id: c.id, x: sx, y: sy, r: this.dotEls.has(c.id) && !this.dotEls.get(c.id)!.classList.contains('leaving') ? -40 : 60, hue: c.hue }]
    })
    const dots = edgeDots(pts, { scale: 1, tx: 0, ty: 0 }, W, H, { inset: 14 })
    const now = new Set(dots.map((d) => d.id))
    for (const d of dots) {
      let el = this.dotEls.get(d.id)
      if (!el) {
        el = document.createElement('button')
        el.type = 'button'
        el.className = 'edge-dot still'
        el.setAttribute('aria-label', 'A group out of view this way: turn to it')
        el.title = 'A group out of view this way'
        Object.assign(el.style, { position: 'absolute', zIndex: '3', width: '16px', height: '16px', translate: '-50% -50%', borderRadius: '9999px' })
        const id = d.id
        el.addEventListener('click', () => this.focusCluster(id))
        el.addEventListener('pointerdown', (e) => e.stopPropagation())
        this.host.appendChild(el)
        this.dotEls.set(d.id, el)
      }
      el.classList.remove('leaving')
      el.style.setProperty('--h', String(Math.max(0, d.hue)))
      el.style.setProperty('--s', d.hue < 0 ? '0' : '1')
      el.style.left = `${d.x}px`
      el.style.top = `${d.y}px`
    }
    for (const [id, el] of this.dotEls) {
      if (now.has(id) || el.classList.contains('leaving')) continue
      el.classList.add('leaving')
      window.setTimeout(() => {
        if (el.classList.contains('leaving')) {
          el.remove()
          if (this.dotEls.get(id) === el) this.dotEls.delete(id)
        }
      }, 450)
    }
  }

  /* ---------- touch and mouse ---------- */

  private ndc(e: { clientX: number; clientY: number }): Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect()
    return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }
  /** What is under the finger: a task first, then a group's name, then the pane of a group. */
  private pick(e: { clientX: number; clientY: number }): Hit | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    const objs = [...this.tasks.values(), ...this.hubs.values()].map((n) => n.mesh).concat([...this.plates.values()]).filter((o) => o.visible)
    const hits = this.raycaster.intersectObjects(objs, false)
    const rank = { task: 0, hub: 1, plate: 2 } as const
    let best: (typeof hits)[number] | undefined
    for (const h of hits) {
      const k = h.object.userData.kind as keyof typeof rank
      if (!best || rank[k] < rank[best.object.userData.kind as keyof typeof rank]) best = h
    }
    return best ? { kind: best.object.userData.kind, id: best.object.userData.id, uvx: best.uv?.x ?? 0.5 } : null
  }
  private radPerPx() {
    return (this.camera.fov * Math.PI) / 180 / Math.max(1, this.renderer.domElement.clientHeight)
  }
  private down = (e: PointerEvent) => {
    const el = this.renderer.domElement
    el.setPointerCapture(e.pointerId)
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    this.focusTween = undefined
    if (this.pointers.size === 2) {
      this.press = undefined
      this.cancelCarry()
      const [a, b] = [...this.pointers.values()]
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: this.fov, zoom: this.wallZoom }
      return
    }
    this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), hit: this.pick(e), mode: 'pending' }
  }

  /** Begin carrying a task or a whole group: it follows the finger on a plane facing the viewer. */
  private startCarry(kind: 'task' | 'cluster', id: string, e: { clientX: number; clientY: number }) {
    const mesh = kind === 'task' ? this.tasks.get(id)?.mesh : this.hubs.get(id)?.mesh
    if (!mesh) return
    const dir = this.camera.getWorldDirection(new Vector3())
    // a task is lifted a little toward the viewer, and then stays flat to the screen (not tilted to the wall or the cylinder it came from)
    const from = kind === 'task' ? mesh.position.clone().addScaledVector(dir, -0.4 * K) : mesh.position
    const plane = new Plane().setFromNormalAndCoplanarPoint(dir.clone().negate(), from)
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    const at = this.raycaster.ray.intersectPlane(plane, new Vector3())
    this.carry = { kind, id, plane, offset: at ? from.clone().sub(at) : new Vector3(), hover: null, pos: mesh.position.clone(), kids: kind === 'cluster' ? descendantsOf(this.content.clusters, id) : new Set() }
    if (kind === 'task') {
      mesh.position.copy(from)
      mesh.quaternion.copy(this.camera.quaternion)
      mesh.renderOrder = 6
      mesh.scale.multiplyScalar(1.08)
    }
    if (navigator.vibrate) navigator.vibrate(6)
  }
  private cancelCarry() {
    if (!this.carry) return
    this.carry = undefined
    this.events.onCarryEnd?.()
    this.closeSprung(null)
    this.layout = withRadius(this.content.layout, this.radius)
    this.place()
  }

  /** Which group (if any) is under a carried task: where the pointer's line of sight meets a group's own plane, inside its pane. */
  private groupUnder(e: { clientX: number; clientY: number }, except: string): { id: string; u: number; v: number; hub?: boolean } | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    // a group's name is a target of its own (and the only one when it is folded)
    const names = [...this.hubs.entries()].filter(([id, n]) => id !== except && n.mesh.visible).map(([, n]) => n.mesh)
    const nh = this.raycaster.intersectObjects(names, false)[0]
    let best: { id: string; u: number; v: number; d: number; hub?: boolean } | null = nh ? { id: nh.object.userData.id as string, u: 0, v: 0, d: nh.distance, hub: true } : null
    for (const [id, cp] of Object.entries(this.shown)) {
      if (id === except) continue
      if (this.plates.get(id)?.visible === false) continue
      const bs = planeBasis(cp)
      const plane = new Plane().setFromNormalAndCoplanarPoint(new Vector3(...bs.normal), new Vector3(cp.x, cp.y, cp.z))
      const at = this.raycaster.ray.intersectPlane(plane, new Vector3())
      if (!at) continue
      const { u, v } = localIn(cp, [at.x, at.y, at.z])
      const pane = paneOf(cp)
      if (u < pane.u0 || u > pane.u1 || v < pane.v0 || v > pane.v1) continue
      const d = at.distanceTo(this.raycaster.ray.origin)
      if (!best || (!best.hub && d < best.d)) best = { id, u, v, d }
    }
    return best
  }

  /** The group a carried thing is over has changed: light it up, and if it is folded, open it after a short linger. */
  private hoverTo(id: string | null) {
    const c = this.carry
    if (!c || c.hover === id) return
    c.hover = id
    clearTimeout(this.springTimer)
    if (id && this.clusterMap.get(id)?.collapsed) {
      this.springTimer = setTimeout(() => {
        if (this.carry?.hover === id && this.clusterMap.get(id)?.collapsed) {
          this.sprung.add(id)
          this.events.onCollapse?.(id)
        }
      }, 700)
    }
    this.place()
  }
  /** Folded groups that were opened only to see where something goes close again, except the one it landed in. */
  private closeSprung(keep: string | null) {
    clearTimeout(this.springTimer)
    for (const id of this.sprung) if (id !== keep && !this.clusterMap.get(id)?.collapsed) this.events.onCollapse?.(id)
    this.sprung.clear()
  }

  private move = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (this.wall) this.setWallZoom(this.pinch.zoom * (d / Math.max(10, this.pinch.d)))
      else this.setFov(this.pinch.fov * (this.pinch.d / Math.max(10, d)))
      return
    }
    const p = this.press
    if (!p || p.id !== e.pointerId) return
    if (p.mode === 'pending' && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PX) {
      // anything grabbed comes with the finger at once; empty space looks around
      if (p.hit?.kind === 'task') {
        p.mode = 'task'
        this.startCarry('task', p.hit.id, { clientX: p.x, clientY: p.y })
      } else if (p.hit) {
        p.mode = 'cluster'
        this.startCarry('cluster', p.hit.kind === 'hub' || p.hit.kind === 'plate' ? p.hit.id : '', { clientX: p.x, clientY: p.y })
      } else p.mode = 'look'
    }
    if (p.mode === 'look' && this.wall) {
      // in wall mode the phone is the way to look around; a drag on empty space slides the virtual world under the surface instead
      const M = this.wallMatrix()
      if (!M) return
      // (a world unit on the surface is this many pixels here)
      const { ox, oy } = this.wallBox
      const a = this.wallScreen(M, ox, oy)
      const b = this.wallScreen(M, ox + 1, oy)
      const c = this.wallScreen(M, ox, oy + 1)
      const pxX = Math.max(1e-3, Math.abs(b[0] - a[0]))
      const pxY = Math.max(1e-3, Math.abs(c[1] - a[1]))
      this.wallPan[0] -= (e.clientX - prev.x) / pxX
      this.wallPan[1] += (e.clientY - prev.y) / pxY
      this.applyWall()
      return
    }
    if (p.mode === 'look') {
      const k = this.radPerPx()
      this.tracking.touch.look((e.clientX - prev.x) * k, (e.clientY - prev.y) * k)
      this.dirty = true
      return
    }
    const c = this.carry
    if (!c) return
    this.events.onCarry?.(p.mode === 'task' ? 'task' : 'group', c.id, e.clientX, e.clientY)
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    const at = this.raycaster.ray.intersectPlane(c.plane, new Vector3())
    if (!at) return
    at.add(c.offset)
    c.pos = at
    if (p.mode === 'task') {
      const mesh = this.tasks.get(c.id)?.mesh
      if (!mesh) return
      mesh.position.copy(at)
      mesh.quaternion.copy(this.camera.quaternion) // (flat to the screen, whatever it was lying on)
      // the group it would join if let go here lights up
      this.hoverTo(this.groupUnder(e, '')?.id ?? null)
      this.dirty = true
    } else {
      // a whole group: it follows the finger around the cylinder, and the others make room for it
      const cur = this.layout.clusters[c.id]
      if (!cur) return
      const moved = moveCluster(cur, [at.x, at.y, at.z])
      // (the others stay put while it is carried, so a name under the finger can be a target; they make room once it is let go)
      const clusters = { ...this.layout.clusters, [c.id]: moved }
      // its subgroups (and theirs) travel with it, keeping their places around it
      const da = moved.a - cur.a
      const dy = moved.y - cur.y
      for (const k of c.kids) {
        const kc = clusters[k]
        if (!kc) continue
        clusters[k] = repose(kc, kc.a + da, kc.y + dy)
        this.shown[k] = clusters[k]
      }
      this.layout = { ...this.layout, clusters }
      this.shown[c.id] = clusters[c.id] // (the carried one is under the finger, not gliding)
      this.place()
      const over = this.groupUnder(e, c.id)
      this.hoverTo(over?.hub && !c.kids.has(over.id) ? over.id : null) // (over another group's name: it would go inside; over its box it just makes room)
    }
  }
  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size < 2) this.pinch = undefined
    const p = this.press
    if (!p || p.id !== e.pointerId) return
    this.press = undefined
    const c = this.carry
    if (c && (p.mode === 'task' || p.mode === 'cluster')) {
      this.events.onCarryEnd?.()
      if (this.events.onDropOut?.(p.mode === 'task' ? 'task' : 'group', c.id, e.clientX, e.clientY)) {
        // let go over the sidebar (or anything else outside): it was taken there, and the canvas goes back to how it was
        this.carry = undefined
        this.layout = withRadius(this.content.layout, this.radius)
        this.closeSprung(null)
        this.place()
        return
      }
    }
    if (c && p.mode === 'task') {
      this.carry = undefined
      const L = this.layout
      const tp = L.tasks[c.id]
      const over = this.groupUnder(e, '')
      if (!tp) {
        this.place()
        return
      }
      if (over) {
        const cp = this.shown[over.id]
        const pane = paneOf(cp)
        // it lands where it was let go (kept inside the pane); a different group means it joins that one
        let u = Math.min(pane.u1 - WORLD.cardW / 2, Math.max(pane.u0 + WORLD.cardW / 2, over.u))
        let v = Math.min(pane.v1 - WORLD.cardH / 2 - 0.1 * K, Math.max(pane.v0 + WORLD.cardH / 2, over.v))
        const used = new Set(Object.values(L.tasks).filter((t) => t.c === over.id && !t.free).map((t) => t.slot))
        let slot = tp.c === over.id && !tp.free ? tp.slot : 0
        if (tp.c !== over.id || tp.free) {
          slot = 0
          while (used.has(slot)) slot++
        }
        if (over.hub) ({ u, v } = slotAt(slot, cp.cols)) // (dropped on the name: it takes the next free place in the group)
        else if (this.tidy) {
          // keep tidy: it settles into the nearest free slot of the group's grid (not one already taken by another card)
          const taken = new Set(Object.entries(L.tasks).filter(([id, t]) => id !== c.id && t.c === over.id && !t.free).map(([, t]) => t.slot))
          ;({ slot, u, v } = nearestFreeSlot(taken, cp.cols, over.u, over.v))
        }
        // (it glides from where the finger let go to its place, rather than jumping)
        const from = localIn(cp, [c.pos.x, c.pos.y, c.pos.z])
        this.taskShown.set(c.id, { c: over.id, free: false, x: from.u, y: from.v })
        this.layout = { ...L, tasks: { ...L.tasks, [c.id]: { ...tp, c: over.id, u, v, dz: 0, slot, free: undefined } } }
        if (over.id !== (this.content.tasks.find((t) => t.id === c.id)?.cluster ?? tp.c)) this.events.onRetag?.(c.id, over.id)
      } else {
        // pulled out and let go in open space: it floats there
        const a = onCylinder([c.pos.x, c.pos.y, c.pos.z])
        this.taskShown.set(c.id, { c: tp.c, free: true, x: a.a, y: a.y })
        this.layout = { ...L, tasks: { ...L.tasks, [c.id]: { ...tp, free: { a: a.a, y: a.y } } } }
        if (this.tidy) {
          // a floating card settles onto the free grid
          const base = fromRadius(this.layout, this.radius)
          const f = base.tasks[c.id].free
          if (f) base.tasks[c.id] = { ...base.tasks[c.id], free: snapFree(f) }
          this.layout = withRadius(base, this.radius)
        }
      }
      this.events.onLayout(fromRadius(this.layout, this.radius))
      this.closeSprung(over?.id ?? null)
      this.place()
      return
    }
    if (c && p.mode === 'cluster') {
      this.carry = undefined
      const into = c.hover && c.hover !== c.id ? c.hover : null
      if (into) {
        // let go over another group: it goes inside that group (and is not left where the finger was)
        this.layout = withRadius(this.content.layout, this.radius)
        this.events.onReparent?.(c.id, into)
      } else {
        const moved = new Set([c.id, ...c.kids])
        if (this.tidy) {
          // keep tidy: the group (and its subgroups, keeping their places around it) settle onto the grid, the others making room
          const base = fromRadius(this.layout, this.radius)
          const p0 = base.clusters[c.id]
          const clusters = { ...base.clusters }
          if (p0) {
            const p1 = snapCluster(p0)
            const da = p1.a - p0.a
            const dy = p1.y - p0.y
            clusters[c.id] = p1
            for (const k of c.kids) if (clusters[k]) clusters[k] = repose(clusters[k], clusters[k].a + da, clusters[k].y + dy)
          }
          const tidied = { ...base, clusters: tidyClusters(clusters, moved) }
          this.layout = withRadius(tidied, this.radius)
        } else this.layout = { ...this.layout, clusters: separate(this.layout.clusters, moved) }
        this.events.onLayout(fromRadius(this.layout, this.radius))
      }
      this.closeSprung(into)
      this.place()
      return
    }
    // a tap: on a card's round check it ticks, anywhere else on a card it opens; on a group's name it turns to that group
    if (p.mode === 'pending' && p.hit && performance.now() - p.t0 < 700) {
      if (p.hit.kind === 'hub') {
        if (p.hit.uvx < 0.1) this.events.onCollapse?.(p.hit.id)
        else this.focusCluster(p.hit.id)
      }
      else if (p.hit.kind === 'task') {
        if (p.hit.uvx < 0.2) this.events.onToggle(p.hit.id)
        else this.events.onOpen(p.hit.id)
      } else if (p.hit.kind === 'plate') this.events.onAddIn?.(p.hit.id) // (the box itself, not a card on it)
    }
  }
  private wheel = (e: WheelEvent) => {
    e.preventDefault()
    this.zoom(Math.exp(-e.deltaY * 0.0015))
  }
  private key = (e: KeyboardEvent) => {
    const t = this.tracking.touch
    const step = 0.08
    const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home', 'r', 'R'].includes(e.key)
    if (!handled) return
    e.preventDefault()
    if (e.key === 'ArrowLeft') t.look(step, 0)
    else if (e.key === 'ArrowRight') t.look(-step, 0)
    else if (e.key === 'ArrowUp') t.look(0, step)
    else if (e.key === 'ArrowDown') t.look(0, -step)
    else if (e.key === '+' || e.key === '=') this.zoom(1.15)
    else if (e.key === '-' || e.key === '_') this.zoom(1 / 1.15)
    else this.recenter()
    this.dirty = true
  }
}

void slotAt
