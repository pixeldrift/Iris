// EnvironmentProvider: what is behind the tasks. Independent of tracking and of the layout: changing it never moves a task.
//   virtual   a soft procedural sky of pale colour (the default; it is meant to look good, not like a fallback)
//   panorama  a 360-degree equirectangular picture the person chooses
//   camera    the rear camera as the background (asked for only when the person chooses it)

import { BackSide, CanvasTexture, Mesh, MeshBasicMaterial, SphereGeometry, SRGBColorSpace, Texture, TextureLoader, type Scene } from 'three'
import { K, type EnvironmentKind } from './types'
import type { TrackingCamera } from './trackingCamera'

export interface EnvironmentProvider {
  readonly kind: EnvironmentKind
  /** Begin (a camera asks for permission here). Resolves with whether it is now showing. */
  start(host: HTMLElement, scene: Scene): Promise<boolean>
  /** Wall mode: fade the whole background in (1) or out (0). */
  setOpacity?(a: number): void
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
  const m = new Mesh(new SphereGeometry(120 * K, 48, 24), new MeshBasicMaterial({ map, side: BackSide, depthWrite: false, fog: false, transparent: true }))
  m.scale.x = -1 // (seen from inside, so the picture is not mirrored)
  m.renderOrder = -10
  return m
}

export class VirtualEnvironment implements EnvironmentProvider {
  readonly kind = 'virtual' as const
  private sky?: Mesh
  private tex?: CanvasTexture
  private scene?: Scene
  async start(_host: HTMLElement, scene: Scene): Promise<boolean> {
    this.scene = scene
    this.tex = new CanvasTexture(skyCanvas())
    this.sky = skySphere(this.tex)
    scene.add(this.sky)
    return true
  }
  setOpacity(a: number) {
    if (this.sky) (this.sky.material as MeshBasicMaterial).opacity = a
  }
  dispose() {
    if (this.sky) {
      this.scene?.remove(this.sky)
      this.sky.geometry.dispose()
      ;(this.sky.material as MeshBasicMaterial).dispose()
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
  setOpacity(a: number) {
    if (this.sky) (this.sky.material as MeshBasicMaterial).opacity = a
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

/** Wall mode's camera as the background: the tracker's own camera picture, shown full size (it is not opened a second time). */
export class SharedCameraEnvironment implements EnvironmentProvider {
  readonly kind = 'camera' as const
  constructor(private cam: TrackingCamera) {}
  async start(): Promise<boolean> {
    if (!this.cam.video || !this.cam.live) return false
    this.cam.showBackground()
    return true
  }
  dispose() {
    this.cam.setReveal(1) // (the camera itself belongs to Wall mode, which stops it)
  }
}

/** The rear camera behind the (transparent) 3D canvas. It is only started on request, and every track is stopped on exit. */
export class CameraEnvironment implements EnvironmentProvider {
  readonly kind = 'camera' as const
  /** `clear`: the picture as it is (Wall mode follows it, so it must not be blurred or washed out). */
  constructor(private opts: { clear?: boolean } = {}) {}
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
    Object.assign(v.style, { position: 'absolute', inset: this.opts.clear ? '0' : '-12px', width: this.opts.clear ? '100%' : 'calc(100% + 24px)', height: this.opts.clear ? '100%' : 'calc(100% + 24px)', objectFit: 'cover', zIndex: '0', pointerEvents: 'none', filter: this.opts.clear ? 'none' : 'saturate(0.45) contrast(0.82) blur(5px)' })
    const wash = document.createElement('div')
    Object.assign(wash.style, { position: 'absolute', inset: '0', background: this.opts.clear ? 'rgba(250,245,236,0.06)' : 'rgba(250,245,236,0.34)', zIndex: '0', pointerEvents: 'none' })
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
  /** The camera picture (for the Wall mode's tracker to read). */
  get videoElement(): HTMLVideoElement | undefined {
    return this.video
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
