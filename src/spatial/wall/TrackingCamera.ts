// The camera Wall mode follows. It is separate from the background: the tracker always reads this one, and the person chooses what is
// shown behind the tasks (Virtual, Camera or Photo). Hidden unless the background is the camera itself.

export type CameraShow = 'hidden' | 'full'

export class TrackingCamera {
  video?: HTMLVideoElement
  private stream?: MediaStream
  onLost?: () => void

  async start(host: HTMLElement): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false
    try {
      // tracking only needs a small picture (it is read at 192 px across), which is kinder to the battery
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
    } catch {
      return false
    }
    const v = document.createElement('video')
    v.setAttribute('playsinline', '')
    v.setAttribute('data-wall-camera', '')
    v.muted = true
    v.autoplay = true
    v.srcObject = this.stream
    this.video = v
    host.insertBefore(v, host.firstChild)
    this.show('full')
    v.style.opacity = '1'
    for (const t of this.stream.getTracks()) t.onended = () => this.onLost?.()
    try {
      await v.play()
    } catch {
      /* starts on the first tap if autoplay was not allowed */
    }
    return true
  }

  private mode: CameraShow | null = null
  private wash?: HTMLDivElement
  private muted = false
  private sharp = false

  /**
   * `full`: the picture fills the area (the background; `sharp` asks for a larger picture, worth it only when it stays on screen).
   * `hidden`: out of sight but still playing, only the tracker reads it (a video that is not displayed can be paused by the browser).
   */
  show(mode: CameraShow, sharp = false) {
    const v = this.video
    if (!v) return
    if (mode !== this.mode) {
      if (mode === 'full') Object.assign(v.style, { position: 'absolute', objectFit: 'cover', zIndex: '0', pointerEvents: 'none' })
      else Object.assign(v.style, { position: 'absolute', inset: 'auto', top: '0', left: '0', width: '2px', height: '2px', opacity: '0', zIndex: '0', pointerEvents: 'none' })
      this.mode = mode
      this.applyLook()
      void v.play().catch(() => undefined)
    }
    const want = mode === 'full' && sharp
    if (want !== this.sharp) {
      this.sharp = want
      const t = this.stream?.getVideoTracks()[0]
      void t?.applyConstraints(want ? { width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 640 }, height: { ideal: 480 } }).catch(() => undefined)
    }
  }

  /**
   * How the picture looks when it is the background: `muted` is the same quieter look the 3D view's camera has (less colour and contrast,
   * a soft blur, the app's cream over it) so the bubbles stand out; `clear` is the picture as it is (while the surface is being found).
   * Only the display changes: the tracker reads the unfiltered picture.
   */
  private applyLook() {
    const v = this.video
    if (!v) return
    const full = this.mode === 'full'
    const m = full && this.muted
    Object.assign(v.style, full ? { inset: m ? '-12px' : '0', width: m ? 'calc(100% + 24px)' : '100%', height: m ? 'calc(100% + 24px)' : '100%', filter: m ? 'saturate(0.45) contrast(0.82) blur(5px)' : 'none' } : { filter: 'none' })
    if (!this.wash && v.parentElement) {
      const w = document.createElement('div')
      Object.assign(w.style, { position: 'absolute', inset: '0', background: 'rgba(250,245,236,0.34)', zIndex: '0', pointerEvents: 'none' })
      v.parentElement.insertBefore(w, v.nextSibling)
      this.wash = w
    }
    if (this.wash) this.wash.style.display = m ? 'block' : 'none'
  }
  private look(muted: boolean) {
    if (muted === this.muted) return
    this.muted = muted
    this.applyLook()
  }

  /** Wall mode with a virtual background: the camera is what is shown while the surface is being found (0), and fades away (1) once it has settled. */
  setReveal(r: number) {
    const v = this.video
    if (!v) return
    if (r >= 1) {
      this.look(false)
      return this.show('hidden')
    }
    this.look(false)
    this.show('full')
    v.style.opacity = String(1 - r)
  }

  /** The camera is the background: fully showing, and sharp. */
  showBackground() {
    this.look(true)
    this.show('full', true)
    if (this.video) this.video.style.opacity = '1'
  }

  get live(): boolean {
    return !!this.stream?.getTracks().some((t) => t.readyState === 'live')
  }

  stop() {
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    this.wash?.remove()
    this.wash = undefined
    if (this.video) {
      this.video.srcObject = null
      this.video.remove()
    }
    this.stream = undefined
    this.video = undefined
  }
}
