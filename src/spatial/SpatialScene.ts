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
  LinearMipmapLinearFilter,
  Matrix4,
  RepeatWrapping,
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
import { popupWasOpen } from '../ui/popupGuard'
import { CARD_PLANE, HUB_PX, cardImage, drawCard, drawHub, drawPlate, type CardInfo, type HubInfo } from './cards'
import type { EnvironmentProvider } from './environment'
import { descendantsOf } from '../core/tree'
import { linkGeometry } from './links'
import { FLAT_R, LOOSE, MAX_COLS, MAX_ROWS, cellH, cellW, detent, minSizeOf, resizeCluster, settled, springStep, type Edge, type Spring, isFlat, freePose, fromRadius, nearestFreeSlot, snapCluster, snapFree, tidyClusters, tidyEverything, lookAt, localIn, moveCluster, onCylinder, paneOf, planeBasis, repose, separate, slotAt, taskWorld, withRadius } from './layout'
import type { SpatialTracking } from './tracking'
import { WallRig, type WallTracking } from './wall'
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
export interface SceneEvents {
  onOpen(taskId: string): void
  onToggle(taskId: string): void
  onIncrement?(taskId: string): void
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
  /** Empty space was tapped: a new item here (`a` and `y` are a free card's place, at the reference radius). */
  onAddAt?(a: number, y: number): void
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
type Hit = { kind: 'task' | 'hub' | 'plate' | 'grip'; id: string; uvx: number; uvy: number; edge?: Edge }

/** The horizontal field of view of the lens, in degrees. */
const HUB_W = 1.5 * WORLD.cardW
/** The lens (its horizontal angle): from wide down to a few degrees, enough to bring a single card up to the width of the screen. */
export const FOV = { min: 4, max: 100, start: 50 }
const TAP_PX = 6
/** The faint grid behind everything in 3D (the flat canvas has one): thin lines, in white-ish lilac, repeating. */
let gridTex: CanvasTexture | undefined
function gridTexture(): CanvasTexture {
  if (gridTex) return gridTex
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const g = cv.getContext('2d')!
  g.fillStyle = 'rgba(139,105,190,0.16)'
  g.fillRect(0, 0, 64, 2)
  g.fillRect(0, 0, 2, 64)
  gridTex = new CanvasTexture(cv)
  gridTex.colorSpace = SRGBColorSpace
  gridTex.wrapS = gridTex.wrapT = RepeatWrapping
  gridTex.anisotropy = 4
  return gridTex
}
const GRID_CELL = 0.145 * WORLD.cardW // (the same few-to-a-card proportion as the flat canvas's grid)

/** The faint empty slot shown while a group is being made bigger: a soft dashed outline and a hint of fill, in white so it takes the group's colour. */
let slotTex: CanvasTexture | undefined
function slotTexture(): CanvasTexture {
  if (slotTex) return slotTex
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 92
  const g = cv.getContext('2d')!
  g.fillStyle = 'rgba(255,255,255,0.5)'
  g.strokeStyle = 'rgba(255,255,255,1)'
  g.lineWidth = 3
  g.setLineDash([10, 8])
  g.beginPath()
  g.roundRect(5, 5, 246, 82, 28)
  g.fill()
  g.stroke()
  slotTex = new CanvasTexture(cv)
  slotTex.colorSpace = SRGBColorSpace
  return slotTex
}
/** A corner grip: a small dot pressed into the surface (a soft shadow inside along the top, a light edge along the bottom), like the grab dots of the sidebar and the ends of the Timeline's bars. */
let gripTex: CanvasTexture | undefined
function gripTexture(): CanvasTexture {
  if (gripTex) return gripTex
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const g = cv.getContext('2d')!
  const R = 2.3 // (as small as the flat canvas's grab dots)
  // the light edge along the bottom
  g.beginPath()
  g.arc(32, 32.9, R, 0, Math.PI * 2)
  g.fillStyle = 'rgba(255,255,255,0.8)'
  g.fill()
  // the dot itself, a soft recess
  g.beginPath()
  g.arc(32, 32, R, 0, Math.PI * 2)
  g.fillStyle = 'rgba(120,100,150,0.26)'
  g.fill()
  // the shadow just inside along the top
  g.save()
  g.beginPath()
  g.arc(32, 32, R, 0, Math.PI * 2)
  g.clip()
  const sh = g.createLinearGradient(0, 32 - R, 0, 32 + R * 0.4)
  sh.addColorStop(0, 'rgba(60,40,90,0.36)')
  sh.addColorStop(1, 'rgba(60,40,90,0)')
  g.fillStyle = sh
  g.fillRect(0, 32 - R, 64, R * 1.4)
  g.restore()
  gripTex = new CanvasTexture(cv)
  gripTex.colorSpace = SRGBColorSpace
  return gripTex
}

/** How long the wall takes to bend or straighten, and the view to ease, when the steering changes. */
const BEND_MS = 700

export class SpatialScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(60, 1, 0.1 * K, 300 * K)
  private raycaster = new Raycaster()
  private tasks = new Map<string, Node>()
  private hubs = new Map<string, Node>()
  private plates = new Map<string, Mesh>()
  /** The two dots in the bottom corners of each group's box, to make it bigger or smaller. */
  private grips = new Map<string, { l: Mesh; r: Mesh }>()
  /** The faint empty slots shown while a group is being resized, and how visible they are now. */
  private slotMeshes: Mesh[] = []
  private slotAlpha = 0
  /** A group being resized: what is drawn (springy, between whole sizes) and the whole size it will take when let go. */
  private rz?: { pid: number; id: string; edge: Edge; c0: number; r0: number; minC: number; minR: number; u0: number; v0: number; wantC: number; wantR: number; snapC: number; snapR: number; sc: Spring; sr: Spring; open: boolean; last: number }
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
  /** The view easing from one steering to another (see `setWall`), and the wall bending or straightening (see `setRadius`). */
  private blend?: { from: Matrix4; ref: Vector3; t0: number }
  private bend?: { from: number; to: number; t0: number }
  private reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  private ro?: ResizeObserver
  private fov = FOV.start
  private focusTween?: { t0: number; from: [number, number]; to: [number, number]; fov?: [number, number] }
  private pointers = new Map<number, { x: number; y: number }>()
  private press?: { id: number; x: number; y: number; t0: number; hit: Hit | null; mode: 'pending' | 'look' | 'task' | 'cluster' }
  private carry?: { kind: 'task' | 'cluster'; id: string; plane: Plane; offset: Vector3; hover: string | null; pos: Vector3; kids: Set<string> }
  private pinch?: { d: number; fov: number; zoom: number; mx: number; my: number }
  private disposed = false
  /** Wall mode's side of the scene (the world -> screen map, the scan effect, pins, zoom, level), when the camera is finding a surface. */
  private rig?: WallRig
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
      this.attachRig(wall)
    }
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  private attachRig(wall: WallTracking) {
    this.wall = wall
    this.rig = new WallRig(wall, {
      scene: this.scene,
      host: this.host,
      camera: this.camera,
      envKind: () => this.env?.kind,
      setEnvOpacity: (a) => this.env?.setOpacity?.(a), // (the virtual sky or photo comes in as the camera goes)
      extents: () => this.wallExtents(),
      onReveal: (r) => this.events.onWallReveal?.(r),
      invalidate: () => {
        this.dirty = true
      },
    })
  }

  /**
   * The camera starts (or stops) finding a surface while the scene stays as it is: the same canvas and the same cards. The view eases from
   * where it was to where the new steering puts it, and (with `setRadius`) the wall bends or straightens over the same moments.
   */
  setWall(wall?: WallTracking) {
    if (wall === this.wall) return
    this.startBlend()
    this.rig?.dispose()
    this.rig = undefined
    this.wall = undefined
    if (wall) this.attachRig(wall)
    this.dirty = true
  }

  /** Where the camera's view-projection is now, scaled so the middle of the groups has a clip depth of 1 (two such views can then be blended). */
  private viewMatrix(ref: Vector3): Matrix4 {
    this.camera.updateMatrixWorld(true)
    const m = new Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    const e = m.elements
    const w = e[3] * ref.x + e[7] * ref.y + e[11] * ref.z + e[15]
    const k = Math.abs(w) > 1e-9 ? 1 / w : 1
    for (let i = 0; i < 16; i++) e[i] *= k
    return m
  }
  private blendRef(): Vector3 {
    const cs = this.content.clusters.map((c) => this.shown[c.id]).filter(Boolean)
    if (!cs.length) return new Vector3(0, 0, -WORLD.ring)
    return new Vector3(cs.reduce((n, c) => n + c.x, 0) / cs.length, cs.reduce((n, c) => n + c.y, 0) / cs.length, cs.reduce((n, c) => n + c.z, 0) / cs.length)
  }
  private startBlend() {
    if (this.reducedMotion) return
    const ref = this.blendRef()
    this.blend = { from: this.viewMatrix(ref), ref, t0: performance.now() }
  }
  /** Mid-blend: the view is a mix of where it was and where it is now going. */
  private applyBlend(): boolean {
    const b = this.blend
    if (!b) return false
    const t = Math.min(1, (performance.now() - b.t0) / BEND_MS)
    if (t >= 1) {
      this.blend = undefined
      return false
    }
    const k = t * t * (3 - 2 * t)
    const to = this.viewMatrix(b.ref)
    const m = new Matrix4()
    for (let i = 0; i < 16; i++) m.elements[i] = b.from.elements[i] * (1 - k) + to.elements[i] * k
    // (the whole mix goes in as the projection, with the camera itself at the origin looking straight on)
    this.camera.position.set(0, 0, 0)
    this.camera.quaternion.identity()
    this.camera.updateMatrixWorld(true)
    this.camera.projectionMatrix.copy(m)
    this.camera.projectionMatrixInverse.copy(m).invert()
    return true
  }

  /* ---------- content ---------- */

  setContent(c: SceneContent) {
    this.content = c
    this.clusterMap = new Map(c.clusters.map((x) => [x.id, x]))
    // groups being carried keep their place under the finger until they are dropped
    const lay = withRadius(c.layout, this.radius)
    this.layout = this.carry?.kind === 'cluster' ? { ...lay, clusters: { ...lay.clusters, [this.carry.id]: this.layout.clusters[this.carry.id] ?? lay.clusters[this.carry.id] } } : lay
    const seen = new Set<string>()
    // Keep full-resolution card textures: images are also opened full-screen, so shrinking the source texture makes them visibly chunky.
    for (const t of c.tasks) {
      seen.add(t.id)
      const key = `${t.title}|${t.hue}|${t.done}|${t.due ?? ''}|${t.progress ?? ''}|${t.imageUrl ?? ''}|${t.tally?.done ?? ''}/${t.tally?.total ?? ''}`
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
        const image = cardImage(t.imageUrl, () => { n!.key = ''; this.setContent(this.content) })
        drawCard(n.tex.image as HTMLCanvasElement, { ...t, image }, 1)
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
      // being made bigger or smaller: the box is drawn at the springy size, its fixed edge staying where it is (the cards stay where they are in it)
      const rv = this.rz && this.rz.id === h.id ? this.rz : null
      if (rv) {
        const sized = paneOf({ ...cp, cols: rv.sc.x, rows: rv.sr.x })
        const width = sized.u1 - sized.u0
        if (rv.edge === 'right') {
          left = pane.u0
          right = left + width
        } else {
          right = pane.u1
          left = right - width
        }
        bottom = sized.v0
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
      // the grips, in the box's two bottom corners
      let gr = this.grips.get(h.id)
      if (!gr) {
        const mk = (edge: Edge) => {
          const m = new Mesh(new PlaneGeometry(0.9 * K, 0.9 * K), new MeshBasicMaterial({ map: gripTexture(), transparent: true, depthWrite: false, side: DoubleSide }))
          m.renderOrder = 3
          m.userData = { kind: 'grip', id: h.id, edge }
          this.scene.add(m)
          return m
        }
        gr = { l: mk('left'), r: mk('right') }
        this.grips.set(h.id, gr)
      }
      for (const [m, u] of [[gr.l, left + 0.28 * K], [gr.r, right - 0.28 * K]] as const) {
        const uu = u * s
        const vv = (bottom + 0.28 * K) * s
        const lift = back + 0.12 * K
        m.position.set(cp.x + bs.right[0] * uu + bs.up[0] * vv + bs.normal[0] * lift, cp.y + bs.right[1] * uu + bs.up[1] * vv + bs.normal[1] * lift, cp.z + bs.right[2] * uu + bs.up[2] * vv + bs.normal[2] * lift)
        m.rotation.set(cp.rx ?? 0, cp.ry, 0)
        m.scale.setScalar(s)
        ;(m.material as MeshBasicMaterial).color.setHSL(((hueOf.get(h.id) ?? 285) < 0 ? 285 : (hueOf.get(h.id) ?? 285)) / 360, 0.35, 0.82)
        m.visible = plate.visible
      }
    }
    for (const [id, g] of this.grips) {
      if (plateSeen.has(id)) continue
      for (const m of [g.l, g.r]) {
        this.scene.remove(m)
        m.geometry.dispose()
        ;(m.material as MeshBasicMaterial).dispose()
      }
      this.grips.delete(id)
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
    this.rig?.fit()
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
  setRadius(r: number, animate = false) {
    const changed = Math.abs(r - this.radius) > 1e-9
    const bothCurved = !isFlat(this.radius) && !isFlat(r)
    // (only a flat wall becoming curved, or back, is eased: a curve being dragged follows the slider at once)
    if (changed && animate && !bothCurved && !this.reducedMotion) {
      // the bend is eased in curvature (1 / radius), which is how a flat wall (no curvature) becomes a curved one without a jump
      this.bend = { from: 1 / this.radius, to: 1 / r, t0: performance.now() }
      this.dirty = true
      return
    }
    this.bend = undefined
    const before = this.radius
    this.radius = r
    this.layout = withRadius(this.content.layout, r)
    this.shown = { ...this.layout.clusters }
    this.place()
    this.dirty = true
    if (changed && !isFlat(r)) {
      if (this.radiusSet && bothCurved && !this.rig) {
        // the cards are as far off as the wall is round, so they would shrink as it is curved less (and swell as it is curved more, out of view):
        // the lens is changed to match, so what you see keeps the same size and only the person changes the scale (with the view angle)
        this.setFov(2 * Math.atan((before * Math.tan((this.fov * Math.PI) / 360)) / r) * (180 / Math.PI))
      } else this.frameAll(true) // (the first time, and when coming from a flat wall: fit everything in view)
    }
    this.radiusSet = true
  }
  private radiusSet = false
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
      this.rig?.resetReveal()
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
    if (this.rig) return this.rig.setWallZoom(this.rig.wallZoom * factor)
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
  /** Turn to a loose card. */
  focusTask(id: string) {
    if (this.wall) return
    const m = this.tasks.get(id)?.mesh
    if (!m) return
    const yaw = -Math.atan2(m.position.x, -m.position.z)
    const pitch = Math.atan2(m.position.y, Math.hypot(m.position.x, m.position.z))
    const t = this.tracking.touch
    this.focusTween = { t0: performance.now(), from: [t.yaw, t.pitch], to: [yaw - this.tracking.sensorYaw(), pitch] }
  }
  /** Turn and zoom so the whole wall is in view (as far as the widest lens allows). */
  frameAll(instant = false) {
    if (this.rig) return instant ? undefined : this.rig.frameAll() // (the first call, at the start, leaves the usual size alone)
    const L = this.layout
    const ids = this.content.clusters.map((c) => c.id).filter((id) => L.clusters[id])
    const loose = this.content.tasks.filter((t) => L.tasks[t.id]?.free)
    if (!ids.length && !loose.length) return
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
    // (and the cards left loose on the wall)
    for (const t of loose) {
      const fp = freePose(L.tasks[t.id], this.radius)
      if (!fp) continue
      const [x, y, z] = fp.pos
      const yaw = Math.atan2(x, -z)
      const pit = Math.atan2(y, Math.hypot(x, z))
      const m = WORLD.cardW / 2 / WORLD.ring
      minY = Math.min(minY, yaw - m)
      maxY = Math.max(maxY, yaw + m)
      minP = Math.min(minP, pit - m * 0.4)
      maxP = Math.max(maxP, pit + m * 0.4)
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

  /** Wall mode: face the groups straight on and level, from where the phone is now. */
  levelNow() {
    this.rig?.levelNow()
  }
  /** Everything that should be on the wall, in the world (the groups' boxes and the cards left loose). */
  private wallExtents(): { minX: number; maxX: number; minY: number; maxY: number } | null {
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
    for (const t of this.content.tasks) {
      const tp = this.layout.tasks[t.id]
      const fp = tp?.free ? freePose(tp, this.radius) : null
      if (!fp) continue
      minX = Math.min(minX, fp.pos[0] - WORLD.cardW / 2)
      maxX = Math.max(maxX, fp.pos[0] + WORLD.cardW / 2)
      minY = Math.min(minY, fp.pos[1] - WORLD.cardH / 2)
      maxY = Math.max(maxY, fp.pos[1] + WORLD.cardH / 2)
    }
    return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null
  }
  /** (for tests) where the middle of the surface is on screen. */
  wallProbe() {
    return this.rig?.probe() ?? null
  }
  wallDebug() {
    return this.rig?.debug() ?? { tracked: [], drawn: [] }
  }
  get wallPhase() {
    return this.wall?.phase ?? null
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
  /** Where a group's corner grip is on the screen. For tests. */
  gripPoint(id: string, edge: Edge): { x: number; y: number } | null {
    const g = this.grips.get(id)
    const mesh = g && (edge === 'left' ? g.l : g.r)
    if (!mesh || !mesh.visible) return null
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
    if (this.grid) {
      this.scene.remove(this.grid)
      this.grid.geometry.dispose()
      ;(this.grid.material as MeshBasicMaterial).dispose()
    }
    for (const g of this.grips.values())
      for (const m of [g.l, g.r]) {
        m.geometry.dispose()
        ;(m.material as MeshBasicMaterial).dispose()
      }
    this.grips.clear()
    for (const m of this.slotMeshes) {
      m.geometry.dispose()
      ;(m.material as MeshBasicMaterial).dispose()
    }
    this.slotMeshes = []
    this.rig?.dispose()
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
    if (this.rz || this.slotAlpha > 0) this.stepResize(now)
    if (this.rig) this.dirty = true // (the camera picture moves all the time: draw every frame)
    if (this.bend) {
      const b = this.bend
      const t = Math.min(1, (performance.now() - b.t0) / BEND_MS)
      const k = t * t * (3 - 2 * t)
      const curv = b.from + (b.to - b.from) * k
      const r = t >= 1 ? 1 / b.to : curv <= 1 / FLAT_R ? FLAT_R : 1 / curv
      this.radius = r
      this.layout = withRadius(this.content.layout, r)
      this.shown = { ...this.layout.clusters }
      this.place()
      if (t >= 1) this.bend = undefined
      this.dirty = true
    }
    if (this.blend) this.dirty = true
    const pose = this.rig ? null : this.tracking.getPose()
    const sig = pose ? pose.q.map((x) => x.toFixed(4)).join(',') + this.fov : ''
    // in touch mode nothing changes unless it is moved: draw only when something did (kinder to the battery)
    if (sig !== this.lastQ || this.dirty) {
      this.lastQ = sig
      this.dirty = false
      if (this.rig) this.rig.update() // (the camera is made from the surface's picture)
      else if (pose) {
        this.camera.quaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3])
        if (pose.position) this.camera.position.set(...pose.position)
        // the lens is described by its horizontal angle; the vertical one follows the window's shape
        const asp = this.camera.aspect
        this.camera.fov = Math.max(0.5, Math.min(110, (2 * Math.atan(Math.tan((this.fov * Math.PI) / 360) / asp) * 180) / Math.PI))
        this.camera.updateProjectionMatrix()
      }
      this.updateGrid()
      this.applyBlend()
      this.renderer.render(this.scene, this.camera)
      this.updateDots()
    }
  }

  private edgeOn = true
  /** The faint grid behind the groups, bent to the wall's curve (a flat wall in wall mode has its own, so none here). */
  private grid?: Mesh
  private gridR = NaN
  private updateGrid() {
    const want = !this.rig && !isFlat(this.radius) && (this.env?.kind ?? 'virtual') === 'virtual'
    if (!want) {
      if (this.grid) this.grid.visible = false
      return
    }
    if (!this.grid) {
      this.grid = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ map: gridTexture(), transparent: true, depthWrite: false, side: DoubleSide }))
      this.grid.renderOrder = 0
      this.grid.frustumCulled = false
      this.scene.add(this.grid)
    }
    this.grid.visible = true
    if (Math.abs(this.gridR - this.radius) < 1e-6) return
    this.gridR = this.radius
    // a patch of the cylinder behind the cards: its arc length the same whatever the radius, up and down well past any group
    const r = this.radius
    const R = r + 0.6 * K
    const half = Math.min(420, Math.PI * r * 0.98)
    const nx = 96
    const ny = 20
    const yMax = 11 * K
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (let iy = 0; iy <= ny; iy++)
      for (let ix = 0; ix <= nx; ix++) {
        const s = -half + (2 * half * ix) / nx
        const y = -yMax + (2 * yMax * iy) / ny
        pos.push(R * Math.sin(s / r), y, -R * Math.cos(s / r))
        uv.push(s / GRID_CELL, y / GRID_CELL)
      }
    for (let iy = 0; iy < ny; iy++)
      for (let ix = 0; ix < nx; ix++) {
        const a = iy * (nx + 1) + ix
        const b = a + 1
        const c = a + nx + 1
        idx.push(a, b, c, b, c + 1, c)
      }
    const g = this.grid.geometry as BufferGeometry
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeBoundingSphere()
    this.dirty = true
  }
  /** Whether the little dots along the edge of the screen (pointing to what is out of view) are drawn. */
  setEdgeDots(on: boolean) {
    this.edgeOn = on
    this.dirty = true
  }

  /** One dot per group or loose card wholly out of view, riding the frame where a line from the middle of the screen to it crosses (fades in and out). */
  private updateDots() {
    const W = this.host.clientWidth
    const H = this.host.clientHeight
    const v = new Vector3()
    const things: { id: string; at: [number, number, number]; hue: number }[] = []
    if (this.edgeOn) {
      for (const c of this.content.clusters) {
        const cp = this.shown[c.id]
        if (cp) things.push({ id: c.id, at: [cp.x, cp.y, cp.z], hue: c.hue })
      }
      // (a loose card, left on the wall, is out of view too when it is off to the side)
      for (const t of this.content.tasks) {
        if (!this.layout.tasks[t.id]?.free) continue
        const m = this.tasks.get(t.id)?.mesh
        if (m && m.visible) things.push({ id: `task:${t.id}`, at: [m.position.x, m.position.y, m.position.z], hue: t.hue })
      }
    }
    const pts = things.flatMap((c) => {
      v.set(...c.at)
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
      return [{ id: c.id, x: sx, y: sy, r: this.dotEls.has(c.id) && !this.dotEls.get(c.id)!.classList.contains('leaving') ? -40 : c.id.startsWith('task:') ? 30 : 60, hue: c.hue }]
    })
    const dots = edgeDots(pts, { scale: 1, tx: 0, ty: 0 }, W, H, { inset: 14 })
    const now = new Set(dots.map((d) => d.id))
    for (const d of dots) {
      let el = this.dotEls.get(d.id)
      if (!el) {
        el = document.createElement('button')
        el.type = 'button'
        el.className = 'edge-dot still'
        const isTask = d.id.startsWith('task:')
        el.setAttribute('aria-label', isTask ? 'A task out of view this way: turn to it' : 'A group out of view this way: turn to it')
        el.title = isTask ? 'A task out of view this way' : 'A group out of view this way'
        // (small: they are only a hint, and must not distract)
        Object.assign(el.style, { position: 'absolute', zIndex: '3', width: '11px', height: '11px', translate: '-50% -50%', borderRadius: '9999px' })
        const id = d.id
        el.addEventListener('click', () => (isTask ? this.focusTask(id.slice(5)) : this.focusCluster(id)))
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
    const grips = [...this.grips.values()].flatMap((g) => [g.l, g.r])
    const objs = [...this.tasks.values(), ...this.hubs.values()].map((n) => n.mesh).concat([...this.plates.values()], grips).filter((o) => o.visible)
    const hits = this.raycaster.intersectObjects(objs, false)
    const rank = { grip: -1, task: 0, hub: 1, plate: 2 } as const
    let best: (typeof hits)[number] | undefined
    for (const h of hits) {
      const k = h.object.userData.kind as keyof typeof rank
      if (!best || rank[k] < rank[best.object.userData.kind as keyof typeof rank]) best = h
    }
    return best ? { kind: best.object.userData.kind, id: best.object.userData.id, uvx: best.uv?.x ?? 0.5, uvy: best.uv?.y ?? 0.5, edge: best.object.userData.edge } : null
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
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: this.fov, zoom: this.rig?.wallZoom ?? 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
      if (this.rz?.open) {
        // (a resize under way is let go where it began: two fingers are for moving the view)
        this.rz.open = false
        this.rz.wantC = this.rz.c0
        this.rz.wantR = this.rz.r0
      }
      return
    }
    const hit = this.pick(e)
    if (hit?.kind === 'grip' && hit.edge) return void this.startResize(hit.id, hit.edge, e)
    this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), hit, mode: 'pending' }
  }

  /* ---------- making a group bigger or smaller ---------- */

  private planeUV(e: { clientX: number; clientY: number }, cp: ClusterPlacement): { u: number; v: number } | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    const bs = planeBasis(cp)
    const plane = new Plane().setFromNormalAndCoplanarPoint(new Vector3(...bs.normal), new Vector3(cp.x, cp.y, cp.z))
    const at = this.raycaster.ray.intersectPlane(plane, new Vector3())
    return at ? localIn(cp, [at.x, at.y, at.z]) : null
  }
  private startResize(id: string, edge: Edge, e: PointerEvent) {
    const cp = this.shown[id]
    const at = cp && this.planeUV(e, cp)
    if (!cp || !at) return
    const min = minSizeOf(this.content.layout, id, edge)
    const rows = cp.rows ?? 1
    this.rz = { pid: e.pointerId, id, edge, c0: cp.cols, r0: rows, minC: min.cols, minR: min.rows, u0: at.u, v0: at.v, wantC: cp.cols, wantR: rows, snapC: cp.cols, snapR: rows, sc: { x: cp.cols, v: 0 }, sr: { x: rows, v: 0 }, open: true, last: performance.now() }
    this.dirty = true
  }
  /** One frame of a resize: the drawn size springs toward what it is heading for (a whole size once let go), and the empty slots fade. */
  private stepResize(now: number) {
    const d = this.rz
    if (d) {
      const dt = (now - d.last) / 1000
      d.last = now
      d.sc = springStep(d.sc, d.wantC, dt)
      d.sr = springStep(d.sr, d.wantR, dt)
      if (!d.open && settled(d.sc, d.wantC) && settled(d.sr, d.wantR)) this.rz = undefined
      this.place()
      this.dirty = true
    }
    const to = this.rz?.open ? 0.5 : 0
    if (Math.abs(this.slotAlpha - to) > 0.004) {
      this.slotAlpha += (to - this.slotAlpha) * Math.min(1, 0.09 + 0.0)
      this.dirty = true
      this.paintSlots()
    } else if (this.slotAlpha !== to) {
      this.slotAlpha = to
      this.paintSlots()
    }
  }
  /** The slots of the size it is heading for that no card is in, as faint empty places. */
  private paintSlots() {
    const d = this.rz
    const cp = d && this.shown[d.id]
    const need = d && cp ? d.snapC * d.snapR : 0
    while (this.slotMeshes.length < need) {
      const m = new Mesh(new PlaneGeometry(WORLD.cardW, WORLD.cardH), new MeshBasicMaterial({ map: slotTexture(), transparent: true, depthWrite: false, side: DoubleSide }))
      m.renderOrder = 1.5
      this.scene.add(m)
      this.slotMeshes.push(m)
    }
    let used = 0
    if (d && cp) {
      const shift = d.edge === 'left' ? d.snapC - cp.cols : 0
      const busy = new Set<string>()
      for (const tp of Object.values(this.layout.tasks)) if (tp.c === d.id && !tp.free) busy.add(`${Math.floor(tp.slot / cp.cols)}:${(tp.slot % cp.cols) + shift}`)
      const dw = (d.snapC - cp.cols) * cellW
      const centre = (d.edge === 'right' ? dw : -dw) / 2 // (the new grid's middle, relative to the group's centre now)
      const bs = planeBasis(cp)
      const s = cp.scale ?? 1
      const hue = this.content.clusters.find((c) => c.id === d.id)?.hue ?? 285
      for (let row = 0; row < d.snapR; row++)
        for (let col = 0; col < d.snapC; col++) {
          if (busy.has(`${row}:${col}`)) continue
          const m = this.slotMeshes[used++]
          const { u, v } = slotAt(row * d.snapC + col, d.snapC)
          const uu = (centre + u) * s
          const vv = v * s
          const lift = 0.05 * K
          m.position.set(cp.x + bs.right[0] * uu + bs.up[0] * vv + bs.normal[0] * lift, cp.y + bs.right[1] * uu + bs.up[1] * vv + bs.normal[1] * lift, cp.z + bs.right[2] * uu + bs.up[2] * vv + bs.normal[2] * lift)
          m.rotation.set(cp.rx ?? 0, cp.ry, 0)
          m.scale.setScalar(s)
          const mat = m.material as MeshBasicMaterial
          mat.opacity = this.slotAlpha
          mat.color.setHSL(((hue < 0 ? 285 : hue) % 360) / 360, 0.55, 0.62)
          m.visible = this.slotAlpha > 0.01
        }
    }
    for (let i = used; i < this.slotMeshes.length; i++) this.slotMeshes[i].visible = false
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
      if (this.rig) this.rig.setWallZoom(this.pinch.zoom * (d / Math.max(10, this.pinch.d)))
      else this.setFov(this.pinch.fov * (this.pinch.d / Math.max(10, d)))
      // two fingers also move the view where they move together (wherever they went down): the same as a drag on empty space
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      if (this.rig) this.rig.panPixels(mx - this.pinch.mx, my - this.pinch.my)
      else {
        const k = this.radPerPx()
        this.tracking.touch.look((mx - this.pinch.mx) * k, (my - this.pinch.my) * k)
        this.dirty = true
      }
      this.pinch.mx = mx
      this.pinch.my = my
      return
    }
    const rd = this.rz
    if (rd && rd.open && rd.pid === e.pointerId) {
      const cp = this.shown[rd.id]
      const at = cp && this.planeUV(e, cp)
      if (!cp || !at) return
      // the pointer says how many columns and rows it asks for; the size is pulled toward the nearest whole one
      const c = detent(rd.c0 + (rd.edge === 'right' ? at.u - rd.u0 : rd.u0 - at.u) / cellW, rd.minC, MAX_COLS)
      const r = detent(rd.r0 + (rd.v0 - at.v) / cellH, rd.minR, MAX_ROWS)
      rd.wantC = c.want
      rd.wantR = r.want
      rd.snapC = c.snap
      rd.snapR = r.snap
      this.dirty = true
      this.paintSlots()
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
    if (p.mode === 'look' && this.rig) {
      // in wall mode the phone is the way to look around; a drag on empty space slides the virtual world under the surface instead
      this.rig.panPixels(e.clientX - prev.x, e.clientY - prev.y)
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
    const rd = this.rz
    if (rd && rd.open && rd.pid === e.pointerId) {
      // let go: the layout takes the nearest whole size now (cards stay where they are), and what is drawn settles onto it
      rd.open = false
      rd.wantC = rd.snapC
      rd.wantR = rd.snapR
      if (rd.snapC !== rd.c0 || rd.snapR !== rd.r0) {
        const next = resizeCluster(this.content.layout, rd.id, rd.snapC, rd.snapR, rd.edge)
        this.content = { ...this.content, layout: next }
        this.layout = withRadius(next, this.radius)
        if (this.layout.clusters[rd.id]) this.shown[rd.id] = this.layout.clusters[rd.id] // (the group itself does not glide: its cards stay put)
        for (const t of this.content.tasks) if (this.layout.tasks[t.id]?.c === rd.id) this.taskShown.delete(t.id)
        this.events.onLayout(next)
      }
      this.place()
      this.paintSlots()
      this.dirty = true
      return
    }
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
      let unsort = false
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
        // pulled out and let go in open space: it is left there, in no group (unsorted, anywhere on the wall)
        const a = onCylinder([c.pos.x, c.pos.y, c.pos.z], this.radius)
        this.taskShown.set(c.id, { c: LOOSE, free: true, x: a.a, y: a.y })
        this.layout = { ...L, tasks: { ...L.tasks, [c.id]: { ...tp, c: LOOSE, free: { a: a.a, y: a.y } } } }
        unsort = tp.c !== LOOSE
        if (this.tidy) {
          // a floating card settles onto the free grid
          const base = fromRadius(this.layout, this.radius)
          const f = base.tasks[c.id].free
          if (f) base.tasks[c.id] = { ...base.tasks[c.id], free: snapFree(f) }
          this.layout = withRadius(base, this.radius)
        }
      }
      this.events.onLayout(fromRadius(this.layout, this.radius))
      if (unsort) this.events.onRetag?.(c.id, LOOSE) // (after the layout is stored, so the new place is the one it is built from)
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
        else if (p.hit.uvx > 0.78 && p.hit.uvy < 0.43) this.events.onIncrement?.(p.hit.id)
        else this.events.onOpen(p.hit.id)
      } else if (p.hit.kind === 'plate') {
        if (!popupWasOpen()) this.events.onAddIn?.(p.hit.id)
      } // (the box itself, not a card on it)
    } else if (p.mode === 'pending' && !p.hit && performance.now() - p.t0 < 700) {
      // a tap on empty space: a new item left there
      const spot = this.spotAt(e)
      if (spot && !popupWasOpen()) this.events.onAddAt?.(spot.a, spot.y)
    }
  }
  /** The place on the wall (a free card's, at the reference radius) under a screen point. */
  private spotAt(e: { clientX: number; clientY: number }): { a: number; y: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect()
    let f: { a: number; y: number } | null = null
    if (this.rig) {
      const w = this.rig.worldAt(e.clientX - r.left, e.clientY - r.top)
      if (w) f = { a: w.x / WORLD.ring, y: w.y } // (a flat wall: arc length over the reference radius)
    } else {
      this.raycaster.setFromCamera(this.ndc(e), this.camera)
      const d = this.raycaster.ray.direction
      const flat = Math.hypot(d.x, d.z)
      if (flat > 1e-6) {
        const t = this.radius / flat
        f = { a: Math.atan2(d.x, -d.z) * (this.radius / WORLD.ring), y: d.y * t }
      }
    }
    if (!f) return null
    return this.tidy ? snapFree(f) : f
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
