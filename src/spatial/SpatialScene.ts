// SpatialScene: draws the layout with Three.js. It knows nothing of where the camera pose comes from (it is given a TrackingProvider) or
// of what is behind (an EnvironmentProvider), and it never edits tasks: it reports taps and moves, and the caller decides what they mean.

import { CanvasTexture, DoubleSide, LineBasicMaterial, LineSegments, BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Plane, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, LinearMipmapLinearFilter } from 'three'
import { HUB_PX, drawCard, drawPlate, drawHub, type CardInfo, type HubInfo } from './cards'
import type { EnvironmentProvider } from './environment'
import { moveCluster, moveTask, taskWorld, lookAt } from './layout'
import { WORLD, type SpatialLayoutData } from './types'
import type { SpatialTracking } from './tracking'
import { edgeDots } from '../core/edges'

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
  /** A card or cluster was dragged somewhere new: the caller stores the layout. */
  onLayout(layout: SpatialLayoutData): void
}

interface Node {
  mesh: Mesh
  tex: CanvasTexture
  key: string
}
const MIN_FOV = 28
const MAX_FOV = 95
const HOLD_MS = 380
const TAP_PX = 8

export class SpatialScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(62, 1, 0.1, 300)
  private raycaster = new Raycaster()
  private tasks = new Map<string, Node>()
  private hubs = new Map<string, Node>()
  private plates = new Map<string, Mesh>()
  private links?: LineSegments
  private content: SceneContent = { clusters: [], tasks: [], layout: { clusters: {}, tasks: {} } }
  private layout: SpatialLayoutData = { clusters: {}, tasks: {} }
  private env?: EnvironmentProvider
  private raf = 0
  private running = true
  private dirty = true
  private lastQ = ''
  private ro?: ResizeObserver
  private fov = 62
  private focusTween?: { t0: number; from: [number, number]; to: [number, number] }
  private pointers = new Map<number, { x: number; y: number }>()
  private press?: { id: number; x: number; y: number; t0: number; hit: { kind: 'task' | 'hub'; id: string; uvx: number } | null; mode: 'pending' | 'look' | 'drag'; timer: number; plane?: Plane; offset?: Vector3 }
  private pinch?: { d: number; fov: number }
  private disposed = false
  /** Soft glowing dots on the frame for groups out of view (the Pond's edge dots, here for the room around you). */
  private dotEls = new Map<string, HTMLButtonElement>()

  constructor(
    private host: HTMLElement,
    private tracking: SpatialTracking,
    private events: SceneEvents,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = SRGBColorSpace
    const el = this.renderer.domElement
    Object.assign(el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', touchAction: 'none', outline: 'none' })
    el.tabIndex = 0
    el.setAttribute('aria-label', 'Your tasks arranged around you. Drag to look around, pinch to zoom, tap a task to open it.')
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
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  /* ---------- content ---------- */

  setContent(c: SceneContent) {
    this.content = c
    this.layout = c.layout
    const seen = new Set<string>()
    for (const t of c.tasks) {
      seen.add(t.id)
      // (with a great many tasks the pictures are drawn smaller, to save memory)
      const scale = c.tasks.length > 240 ? 0.55 : c.tasks.length > 120 ? 0.75 : 1
      const key = `${t.title}|${t.hue}|${t.done}|${t.due ?? ''}|${t.progress ?? ''}|${scale}`
      let n = this.tasks.get(t.id)
      if (!n) {
        const cv = document.createElement('canvas')
        const tex = new CanvasTexture(cv)
        tex.colorSpace = SRGBColorSpace
        tex.generateMipmaps = true
        tex.minFilter = LinearMipmapLinearFilter
        tex.anisotropy = 4
        const mesh = new Mesh(new PlaneGeometry(WORLD.cardW, WORLD.cardH), new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthWrite: false }))
        mesh.userData = { kind: 'task', id: t.id }
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
      const key = `${h.name}|${h.hue}|${h.count}`
      let n = this.hubs.get(h.id)
      if (!n) {
        const cv = document.createElement('canvas')
        const tex = new CanvasTexture(cv)
        tex.colorSpace = SRGBColorSpace
        const mesh = new Mesh(new PlaneGeometry(WORLD.cardW * 1.15, (WORLD.cardW * 1.15 * HUB_PX.h) / HUB_PX.w), new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthWrite: false }))
        mesh.userData = { kind: 'hub', id: h.id }
        this.scene.add(mesh)
        n = { mesh, tex, key: '' }
        this.hubs.set(h.id, n)
      }
      if (n.key !== key) {
        drawHub(n.tex.image as HTMLCanvasElement, h)
        n.tex.needsUpdate = true
        n.key = key
      }
    }
    for (const [id, n] of this.hubs) if (!hubSeen.has(id)) this.drop(this.hubs, id, n)
    this.place()
  }

  private drop(map: Map<string, Node>, id: string, n: Node) {
    this.scene.remove(n.mesh)
    n.mesh.geometry.dispose()
    ;(n.mesh.material as MeshBasicMaterial).dispose()
    n.tex.dispose()
    map.delete(id)
  }

  /** Put every mesh where the layout says (and the soft plate behind each cluster, and the lines between a group and its subgroups). */
  private place() {
    const L = this.layout
    for (const t of this.content.tasks) {
      const n = this.tasks.get(t.id)
      const tp = L.tasks[t.id]
      const cp = tp && L.clusters[tp.c]
      if (!n || !tp || !cp) continue
      const [x, y, z] = taskWorld(tp, cp)
      n.mesh.position.set(x, y, z)
      n.mesh.rotation.set(0, cp.ry, tp.rot ?? 0)
      n.mesh.scale.setScalar(cp.scale ?? 1)
    }
    const hueOf = new Map(this.content.clusters.map((c) => [c.id, c.hue]))
    const plateSeen = new Set<string>()
    for (const h of this.content.clusters) {
      const cp = L.clusters[h.id]
      const n = this.hubs.get(h.id)
      if (!cp || !n) continue
      n.mesh.position.set(cp.x, cp.y, cp.z)
      n.mesh.rotation.set(0, cp.ry, 0)
      // the plate: a faint pane the group's cards sit on
      const mine = this.content.tasks.filter((t) => L.tasks[t.id]?.c === h.id)
      let top = 0.55
      let bottom = -1
      let left = -WORLD.cardW / 2
      let right = WORLD.cardW / 2
      for (const t of mine) {
        const tp = L.tasks[t.id]
        top = Math.max(top, tp.v + WORLD.cardH / 2)
        bottom = Math.min(bottom, tp.v - WORLD.cardH / 2)
        left = Math.min(left, tp.u - WORLD.cardW / 2)
        right = Math.max(right, tp.u + WORLD.cardW / 2)
      }
      let plate = this.plates.get(h.id)
      if (!plate) {
        plate = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ transparent: true, side: DoubleSide, depthWrite: false }))
        this.scene.add(plate)
        this.plates.set(h.id, plate)
      }
      const w = right - left + 0.9
      const hh = top - bottom + 0.9
      // the pane is drawn at its own proportions, so its corners are equally round whatever its size (nothing is a hard square)
      const pm = plate.material as MeshBasicMaterial
      const pkey = `${w.toFixed(1)}x${hh.toFixed(1)}|${hueOf.get(h.id)}`
      if (plate.userData.key !== pkey) {
        pm.map?.dispose()
        pm.map = drawPlate(w, hh, hueOf.get(h.id) ?? 285)
        pm.needsUpdate = true
        plate.userData.key = pkey
      }
      plate.scale.set(w, hh, 1)
      const cx = (left + right) / 2
      const cy = (top + bottom) / 2
      plate.position.set(cp.x + Math.cos(cp.ry) * cx + Math.sin(cp.ry) * -0.06, cp.y + cy, cp.z + -Math.sin(cp.ry) * cx + Math.cos(cp.ry) * -0.06)
      plate.rotation.set(0, cp.ry, 0)
      plateSeen.add(h.id)
    }
    for (const [id, p] of this.plates) {
      if (plateSeen.has(id)) continue
      this.scene.remove(p)
      p.geometry.dispose()
      ;(p.material as MeshBasicMaterial).dispose()
      this.plates.delete(id)
    }
    // lines from a group's hub to each of its subgroups' hubs
    const pts: number[] = []
    for (const h of this.content.clusters) {
      const cp = L.clusters[h.id]
      const pp = h.parent ? L.clusters[h.parent] : null
      if (cp && pp) pts.push(pp.x, pp.y, pp.z, cp.x, cp.y, cp.z)
    }
    if (this.links) {
      this.scene.remove(this.links)
      this.links.geometry.dispose()
      ;(this.links.material as LineBasicMaterial).dispose()
      this.links = undefined
    }
    if (pts.length) {
      const g = new BufferGeometry()
      g.setAttribute('position', new Float32BufferAttribute(pts, 3))
      this.links = new LineSegments(g, new LineBasicMaterial({ color: 0xb69be0, transparent: true, opacity: 0.55 }))
      this.scene.add(this.links)
    }
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
    this.tracking.recenter()
    this.dirty = true
  }
  zoom(factor: number) {
    this.fov = Math.min(MAX_FOV, Math.max(MIN_FOV, this.fov / factor))
    this.dirty = true
  }
  /** Turn to face a group (the view glides there). */
  focusCluster(id: string) {
    const cp = this.layout.clusters[id]
    if (!cp) return
    const { yaw, pitch } = lookAt(cp)
    const t = this.tracking.touch
    // with motion on, the sensor already turns the view: the touch offset only has to make up the difference
    this.focusTween = { t0: performance.now(), from: [t.yaw, t.pitch], to: [yaw - this.tracking.sensorYaw(), pitch] }
    this.events.onFocus?.(id)
  }
  private resize() {
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // a wide window keeps the same vertical view; a tall one (a phone upright) is widened so the horizon is not narrow
    this.camera.updateProjectionMatrix()
    this.dirty = true
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
      ;(p.material as MeshBasicMaterial).dispose()
    }
    this.plates.clear()
    this.links?.geometry.dispose()
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
      if (k >= 1) this.focusTween = undefined
      this.dirty = true
    }
    const pose = this.tracking.getPose()
    const sig = pose.q.map((x) => x.toFixed(4)).join(',') + this.fov
    // in touch mode nothing changes unless it is moved: draw only when something did (kinder to the battery)
    if (sig !== this.lastQ || this.dirty || this.env?.kind === 'virtual') {
      this.lastQ = sig
      this.dirty = false
      this.camera.quaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3])
      if (pose.position) this.camera.position.set(...pose.position)
      // a tall window (a phone upright) is widened to keep a useful span from side to side, within reason
      const asp = this.camera.aspect
      this.camera.fov = asp >= 1 ? this.fov : Math.min(100, (2 * Math.atan(Math.tan((this.fov * Math.PI) / 360) / asp) * 180) / Math.PI)
      this.camera.updateProjectionMatrix()
      this.env?.tick?.(now)
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
      const cp = this.layout.clusters[c.id]
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
      return [{ id: c.id, x: sx, y: sy, r: 60, hue: c.hue }]
    })
    const dots = edgeDots(pts, { scale: 1, tx: 0, ty: 0 }, W, H, { inset: 14 })
    const now = new Set(dots.map((d) => d.id))
    for (const d of dots) {
      let el = this.dotEls.get(d.id)
      if (!el) {
        el = document.createElement('button')
        el.type = 'button'
        el.className = 'edge-dot'
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
  private pick(e: { clientX: number; clientY: number }): { kind: 'task' | 'hub'; id: string; uvx: number } | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    const hits = this.raycaster.intersectObjects([...this.tasks.values(), ...this.hubs.values()].map((n) => n.mesh), false)
    const h = hits[0]
    return h ? { kind: h.object.userData.kind, id: h.object.userData.id, uvx: h.uv?.x ?? 0.5 } : null
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
      if (this.press) clearTimeout(this.press.timer)
      this.press = undefined
      const [a, b] = [...this.pointers.values()]
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: this.fov }
      return
    }
    const hit = this.pick(e)
    const press = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), hit, mode: 'pending' as 'pending' | 'look' | 'drag', timer: 0 } as NonNullable<typeof this.press>
    // holding on a card (or a group's name) picks it up; a drag that starts at once just looks around, so scrolling never moves anything
    if (hit) press.timer = window.setTimeout(() => this.startDrag(press, e), HOLD_MS)
    this.press = press
  }
  private startDrag(p: NonNullable<typeof this.press>, e: { clientX: number; clientY: number }) {
    if (!p.hit || p.mode !== 'pending') return
    p.mode = 'drag'
    const isTask = p.hit.kind === 'task'
    const mesh = (isTask ? this.tasks : this.hubs).get(p.hit.id)?.mesh
    if (!mesh) return
    // the card slides on a plane facing the viewer through where it is now
    const dir = this.camera.getWorldDirection(new Vector3())
    p.plane = new Plane().setFromNormalAndCoplanarPoint(dir.clone().negate(), mesh.position)
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    const at = this.raycaster.ray.intersectPlane(p.plane, new Vector3())
    p.offset = at ? mesh.position.clone().sub(at) : new Vector3()
    if (navigator.vibrate) navigator.vibrate(8)
  }
  private move = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      this.fov = Math.min(MAX_FOV, Math.max(MIN_FOV, this.pinch.fov * (this.pinch.d / Math.max(10, d))))
      this.dirty = true
      return
    }
    const p = this.press
    if (!p || p.id !== e.pointerId) return
    if (p.mode === 'pending' && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PX) {
      clearTimeout(p.timer)
      p.mode = 'look'
    }
    if (p.mode === 'look') {
      const k = this.radPerPx()
      this.tracking.touch.look((e.clientX - prev.x) * k, (e.clientY - prev.y) * k)
      this.dirty = true
    } else if (p.mode === 'drag' && p.hit && p.plane) {
      this.raycaster.setFromCamera(this.ndc(e), this.camera)
      const at = this.raycaster.ray.intersectPlane(p.plane, new Vector3())
      if (!at) return
      at.add(p.offset ?? new Vector3())
      const L = this.layout
      if (p.hit.kind === 'task') {
        const tp = L.tasks[p.hit.id]
        const cp = tp && L.clusters[tp.c]
        if (tp && cp) {
          this.layout = { ...L, tasks: { ...L.tasks, [p.hit.id]: moveTask(tp, cp, [at.x, at.y, at.z]) } }
          this.place()
        }
      } else {
        const cp = L.clusters[p.hit.id]
        if (cp) {
          // a group moves around the room at its own distance, and keeps facing the middle
          const moved = moveCluster(cp, [at.x, at.y, at.z])
          this.layout = { ...L, clusters: { ...L.clusters, [p.hit.id]: moved } }
          this.place()
        }
      }
    }
  }
  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size < 2) this.pinch = undefined
    const p = this.press
    if (!p || p.id !== e.pointerId) return
    clearTimeout(p.timer)
    this.press = undefined
    if (p.mode === 'drag') {
      this.events.onLayout(this.layout)
      return
    }
    // a tap: on a card's round check it ticks, anywhere else on a card it opens; on a group's name it turns to that group
    if (p.mode === 'pending' && p.hit && performance.now() - p.t0 < 600) {
      if (p.hit.kind === 'hub') this.focusCluster(p.hit.id)
      else if (p.hit.uvx < 0.2) this.events.onToggle(p.hit.id)
      else this.events.onOpen(p.hit.id)
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

