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
import { linkGeometry } from './links'
import { FLAT_R, isFlat, freePose, fromRadius, nearestFreeSlot, snapCluster, snapFree, tidyClusters, tidyEverything, lookAt, localIn, moveCluster, onCylinder, paneOf, planeBasis, repose, separate, slotAt, taskWorld, withRadius } from './layout'
import type { SpatialTracking } from './tracking'
import type { WallTracking } from './wall'
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
  onFocus?(clusterId: string): void
  /** A task was dropped into a group: the caller moves it there (its place in the new group is already in the layout). */
  onRetag?(taskId: string, clusterId: string): void
  /** Something was moved: the caller stores the layout. */
  onLayout(layout: SpatialLayoutData): void
  /** The lens changed (a zoom, a fit): the horizontal angle in degrees. */
  onFov?(fov: number): void
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
  private pinch?: { d: number; fov: number }
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
    }
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  /* ---------- wall mode ---------- */

  private wallGroup?: Group
  private wallFrameMesh?: Mesh
  private wallDots?: Points
  /** The wall mode's world: the surface's width in world units, and where the groups' middle is (the surface's middle is put there). */
  private wallBox = { w: 120, ox: 0, oy: 0 }

  private buildWallOverlay() {
    const g = new Group()
    g.visible = false
    g.renderOrder = 0
    // a glowing outline for the surface that was found (drawn once into a picture and stretched to fit)
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    const x = c.getContext('2d')!
    const glow = x.createLinearGradient(0, 0, 256, 256)
    glow.addColorStop(0, 'rgba(190,140,255,0.95)')
    glow.addColorStop(1, 'rgba(120,200,255,0.95)')
    x.strokeStyle = glow
    x.shadowColor = 'rgba(190,150,255,0.95)'
    x.shadowBlur = 18
    x.lineWidth = 7
    x.strokeRect(14, 14, 228, 228)
    x.shadowBlur = 0
    x.fillStyle = 'rgba(190,150,255,0.08)'
    x.fillRect(14, 14, 228, 228)
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    const frame = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide }))
    frame.renderOrder = 0
    g.add(frame)
    // the points being followed, pinned on the surface: if they slide off what they were stuck to, the hold is slipping
    const dc = document.createElement('canvas')
    dc.width = 32
    dc.height = 32
    const dx = dc.getContext('2d')!
    const rg = dx.createRadialGradient(16, 16, 0, 16, 16, 15)
    rg.addColorStop(0, 'rgba(255,255,255,1)')
    rg.addColorStop(0.45, 'rgba(210,170,255,0.95)')
    rg.addColorStop(1, 'rgba(210,170,255,0)')
    dx.fillStyle = rg
    dx.fillRect(0, 0, 32, 32)
    const dtex = new CanvasTexture(dc)
    const pts = new Points(new BufferGeometry(), new PointsMaterial({ map: dtex, size: 1.1 * K, transparent: true, depthWrite: false, sizeAttenuation: true }))
    pts.frustumCulled = false
    g.add(pts)
    this.scene.add(g)
    this.wallGroup = g
    this.wallFrameMesh = frame
    this.wallDots = pts
  }

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
    this.wallBox = { w: Math.max(40, (maxX - minX) * 1.04), ox: (minX + maxX) / 2, oy: (minY + maxY) / 2 }
    this.wall.configure({ scale: this.wallBox.w, origin: [this.wallBox.ox, this.wallBox.oy], lift: 0.9 * K })
  }

  /** Draw the surface's outline and followed points where the tracker says they are (in the world: the surface, a little behind the groups). */
  private updateWallOverlay() {
    const wall = this.wall
    const g = this.wallGroup
    if (!wall || !g || !this.wallFrameMesh || !this.wallDots) return
    const ov = wall.getOverlay()
    g.visible = ov.phase === 'holding' && !!ov.quad
    if (!wall.takeFresh() || !ov.quad) return
    const { w, ox, oy } = this.wallBox
    const z = -0.9 * K
    const xs = ov.quad.map((p) => p.x * w + ox)
    const ys = ov.quad.map((p) => p.y * w + oy)
    this.wallFrameMesh.position.set((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, z)
    this.wallFrameMesh.scale.set(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1)
    const pos: number[] = []
    for (const p of ov.points) pos.push(p.x * w + ox, p.y * w + oy, z + 0.02 * K)
    this.wallDots.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3))
    this.wallDots.geometry.computeBoundingSphere()
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
      } else this.camera.fov = Math.max(8, Math.min(110, (2 * Math.atan(Math.tan((this.fov * Math.PI) / 360) / asp) * 180) / Math.PI))
      this.camera.updateProjectionMatrix()
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
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: this.fov }
      return
    }
    this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), hit: this.pick(e), mode: 'pending' }
  }

  /** Begin carrying a task or a whole group: it follows the finger on a plane facing the viewer. */
  private startCarry(kind: 'task' | 'cluster', id: string, e: { clientX: number; clientY: number }) {
    const mesh = kind === 'task' ? this.tasks.get(id)?.mesh : this.hubs.get(id)?.mesh
    if (!mesh) return
    const dir = this.camera.getWorldDirection(new Vector3())
    const plane = new Plane().setFromNormalAndCoplanarPoint(dir.clone().negate(), mesh.position)
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    const at = this.raycaster.ray.intersectPlane(plane, new Vector3())
    this.carry = { kind, id, plane, offset: at ? mesh.position.clone().sub(at) : new Vector3(), hover: null, pos: mesh.position.clone(), kids: kind === 'cluster' ? descendantsOf(this.content.clusters, id) : new Set() }
    if (kind === 'task') {
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
      this.setFov(this.pinch.fov * (this.pinch.d / Math.max(10, d)))
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
    if (p.mode === 'look' && this.wall) return // (in wall mode the phone is the way to look around)
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
      const a = onCylinder([at.x, at.y, at.z])
      mesh.rotation.set(Math.atan2(at.y, Math.hypot(at.x, at.z)), -a.a, 0)
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
