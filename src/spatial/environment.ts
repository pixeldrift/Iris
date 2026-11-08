// EnvironmentProvider: what is behind the tasks. Independent of tracking and of the layout: changing it never moves a task.
//   virtual   a soft procedural room of light and drifting dust (the default; it is meant to look good, not like a fallback)
//   panorama  a 360-degree equirectangular picture the person chooses
//   camera    the rear camera as the background (asked for only when the person chooses it)

import { AdditiveBlending, BackSide, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, Points, PointsMaterial, BufferGeometry, SphereGeometry, CircleGeometry, SRGBColorSpace, Texture, TextureLoader, type Scene } from 'three'
import type { EnvironmentKind } from './types'

export interface EnvironmentProvider {
  readonly kind: EnvironmentKind
  /** Begin (a camera asks for permission here). Resolves with whether it is now showing. */
  start(host: HTMLElement, scene: Scene): Promise<boolean>
  /** Called each frame with the time, for anything that drifts. */
  tick?(t: number): void
  /** Let go of everything: textures, streams, elements. */
  dispose(): void
  /** Called if the provider stops by itself (a camera was taken away). */
  onLost?: () => void
}

/** A soft sky as an equirectangular canvas: pale lilac at the top, warm light near the horizon, a deeper floor, a few glowing blobs. */
function skyCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, '#d9cdf2')
  grad.addColorStop(0.42, '#efe6f7')
  grad.addColorStop(0.5, '#fbeee8')
  grad.addColorStop(0.62, '#e4d7f0')
  grad.addColorStop(1, '#c9b8e6')
  g.fillStyle = grad
  g.fillRect(0, 0, 1024, 512)
  // soft pools of colour around the room, so turning has something to feel
  const blobs: [number, number, number, string][] = [
    [140, 220, 180, 'rgba(255,196,224,0.55)'],
    [420, 260, 220, 'rgba(184,214,255,0.5)'],
    [700, 210, 190, 'rgba(206,255,224,0.4)'],
    [900, 250, 160, 'rgba(255,224,190,0.45)'],
    [560, 90, 200, 'rgba(255,255,255,0.5)'],
  ]
  for (const [x, y, r, col] of blobs) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, col)
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = rg
    g.fillRect(x - r, y - r, r * 2, r * 2)
    // (wrap around the seam)
    if (x - r < 0 || x + r > 1024) {
      const off = x < 512 ? 1024 : -1024
      const rg2 = g.createRadialGradient(x + off, y, 0, x + off, y, r)
      rg2.addColorStop(0, col)
      rg2.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = rg2
      g.fillRect(x + off - r, y - r, r * 2, r * 2)
    }
  }
  return c
}

/**
 * A picture made quieter so it never competes with the bubbles: desaturated, a little less contrast, softly blurred, and washed with
 * the app's cream.
 */
export function mutedCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.min(2048, w)
  c.height = Math.round((c.width * h) / w)
  const g = c.getContext('2d')!
  g.filter = 'saturate(0.45) contrast(0.82) blur(5px)'
  g.drawImage(src, -10, -10, c.width + 20, c.height + 20) // (a little over, so the blur does not fade at the edges)
  g.filter = 'none'
  g.fillStyle = 'rgba(250,245,236,0.34)'
  g.fillRect(0, 0, c.width, c.height)
  return c
}

function skySphere(map: Texture): Mesh {
  map.colorSpace = SRGBColorSpace
  const m = new Mesh(new SphereGeometry(120, 48, 24), new MeshBasicMaterial({ map, side: BackSide, depthWrite: false, fog: false }))
  m.scale.x = -1 // (seen from inside, so the picture is not mirrored)
  m.renderOrder = -10
  return m
}

export class VirtualEnvironment implements EnvironmentProvider {
  readonly kind = 'virtual' as const
  private sky?: Mesh
  private dust?: Points
  private floor?: Mesh
  private tex?: CanvasTexture
  private scene?: Scene
  async start(_host: HTMLElement, scene: Scene): Promise<boolean> {
    this.scene = scene
    this.tex = new CanvasTexture(skyCanvas())
    this.sky = skySphere(this.tex)
    scene.add(this.sky)
    // a faint pool of light on the floor, so there is a down as well as an up
    const f = document.createElement('canvas')
    f.width = f.height = 256
    const g = f.getContext('2d')!
    const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    rg.addColorStop(0, 'rgba(255,255,255,0.55)')
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = rg
    g.fillRect(0, 0, 256, 256)
    this.floor = new Mesh(new CircleGeometry(24, 48), new MeshBasicMaterial({ map: new CanvasTexture(f), transparent: true, depthWrite: false, side: DoubleSide }))
    this.floor.rotation.x = -Math.PI / 2
    this.floor.position.y = -6
    scene.add(this.floor)
    // dust, drifting very slowly, for depth
    const n = 160
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 4 + Math.random() * 22
      pos[i * 3] = Math.sin(a) * r
      pos[i * 3 + 1] = (Math.random() - 0.4) * 14
      pos[i * 3 + 2] = -Math.cos(a) * r
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
    // round, soft specks (a plain point is a square)
    const sp = document.createElement('canvas')
    sp.width = sp.height = 64
    const sg = sp.getContext('2d')!
    const sr = sg.createRadialGradient(32, 32, 0, 32, 32, 32)
    sr.addColorStop(0, 'rgba(255,255,255,1)')
    sr.addColorStop(1, 'rgba(255,255,255,0)')
    sg.fillStyle = sr
    sg.fillRect(0, 0, 64, 64)
    this.dust = new Points(geo, new PointsMaterial({ size: 0.12, map: new CanvasTexture(sp), color: new Color('#ffffff'), transparent: true, opacity: 0.45, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true }))
    scene.add(this.dust)
    return true
  }
  tick(t: number) {
    if (this.dust) this.dust.rotation.y = t * 0.00002
  }
  dispose() {
    for (const o of [this.sky, this.floor, this.dust]) {
      if (!o) continue
      this.scene?.remove(o)
      o.geometry.dispose()
      const mat = o.material as MeshBasicMaterial | PointsMaterial
      mat.map?.dispose()
      mat.dispose()
    }
    this.tex?.dispose()
  }
}

/** A 360-degree equirectangular picture the person chose (kept only while the workspace is open). */
export class PanoramaEnvironment implements EnvironmentProvider {
  readonly kind = 'panorama' as const
  private sky?: Mesh
  private scene?: Scene
  private tex?: Texture
  constructor(private url: string) {}
  async start(_host: HTMLElement, scene: Scene): Promise<boolean> {
    this.scene = scene
    try {
      const raw = await new TextureLoader().loadAsync(this.url)
      const img = raw.image as HTMLImageElement
      this.tex = new CanvasTexture(mutedCanvas(img, img.naturalWidth || img.width, img.naturalHeight || img.height))
      raw.dispose()
    } catch {
      return false
    }
    this.sky = skySphere(this.tex)
    scene.add(this.sky)
    return true
  }
  dispose() {
    if (this.sky) {
      this.scene?.remove(this.sky)
      this.sky.geometry.dispose()
      ;(this.sky.material as MeshBasicMaterial).dispose()
    }
    this.tex?.dispose()
    URL.revokeObjectURL(this.url)
  }
}

/** The rear camera behind the (transparent) 3D canvas. It is only started on request, and every track is stopped on exit. */
export class CameraEnvironment implements EnvironmentProvider {
  readonly kind = 'camera' as const
  private video?: HTMLVideoElement
  private wash?: HTMLDivElement
  private stream?: MediaStream
  onLost?: () => void
  async start(host: HTMLElement): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    } catch {
      return false
    }
    const v = document.createElement('video')
    v.setAttribute('playsinline', '')
    v.muted = true
    v.autoplay = true
    v.srcObject = this.stream
    // the picture is made quieter (desaturated, a little less contrast, softly blurred) and washed with the app's cream, so the bubbles stand out
    Object.assign(v.style, { position: 'absolute', inset: '-12px', width: 'calc(100% + 24px)', height: 'calc(100% + 24px)', objectFit: 'cover', zIndex: '0', pointerEvents: 'none', filter: 'saturate(0.45) contrast(0.82) blur(5px)' })
    const wash = document.createElement('div')
    Object.assign(wash.style, { position: 'absolute', inset: '0', background: 'rgba(250,245,236,0.34)', zIndex: '0', pointerEvents: 'none' })
    host.insertBefore(wash, host.firstChild)
    host.insertBefore(v, wash)
    this.wash = wash
    this.video = v
    for (const t of this.stream.getTracks()) t.onended = () => this.onLost?.()
    try {
      await v.play()
    } catch {
      /* it starts on the first tap if the page was not allowed to autoplay */
    }
    return true
  }
  /** The stream is still live (it can be taken away when the app goes to the background). */
  get live(): boolean {
    return !!this.stream?.getTracks().some((t) => t.readyState === 'live')
  }
  dispose() {
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    if (this.video) {
      this.video.srcObject = null
      this.video.remove()
    }
    this.wash?.remove()
    this.wash = undefined
    this.stream = undefined
    this.video = undefined
  }
}
