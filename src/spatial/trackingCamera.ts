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
    this.show('full')
    v.style.opacity = '1'
    host.insertBefore(v, host.firstChild)
    for (const t of this.stream.getTracks()) t.onended = () => this.onLost?.()
    try {
      await v.play()
    } catch {
      /* starts on the first tap if autoplay was not allowed */
    }
    return true
  }

  private mode: CameraShow | null = null
  private sharp = false

  /**
   * `full`: the picture fills the area (the background; `sharp` asks for a larger picture, worth it only when it stays on screen).
   * `hidden`: out of sight but still playing, only the tracker reads it (a video that is not displayed can be paused by the browser).
   */
  show(mode: CameraShow, sharp = false) {
    const v = this.video
    if (!v) return
    if (mode !== this.mode) {
      if (mode === 'full') Object.assign(v.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', zIndex: '0', pointerEvents: 'none' })
      else Object.assign(v.style, { position: 'absolute', inset: 'auto', top: '0', left: '0', width: '2px', height: '2px', opacity: '0', zIndex: '0', pointerEvents: 'none' })
      this.mode = mode
      void v.play().catch(() => undefined)
    }
    const want = mode === 'full' && sharp
    if (want !== this.sharp) {
      this.sharp = want
      const t = this.stream?.getVideoTracks()[0]
      void t?.applyConstraints(want ? { width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 640 }, height: { ideal: 480 } }).catch(() => undefined)
    }
  }

  /** Wall mode with a virtual background: the camera is what is shown while the surface is being found (0), and fades away (1) once it has settled. */
  setReveal(r: number) {
    const v = this.video
    if (!v) return
    if (r >= 1) return this.show('hidden')
    this.show('full')
    v.style.opacity = String(1 - r)
  }

  /** The camera is the background: fully showing, and sharp. */
  showBackground() {
    this.show('full', true)
    if (this.video) this.video.style.opacity = '1'
  }

  get live(): boolean {
    return !!this.stream?.getTracks().some((t) => t.readyState === 'live')
  }

  stop() {
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    if (this.video) {
      this.video.srcObject = null
      this.video.remove()
    }
    this.stream = undefined
    this.video = undefined
  }
}
