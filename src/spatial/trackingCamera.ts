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
    this.show('hidden')
    host.insertBefore(v, host.firstChild)
    for (const t of this.stream.getTracks()) t.onended = () => this.onLost?.()
    try {
      await v.play()
    } catch {
      /* starts on the first tap if autoplay was not allowed */
    }
    return true
  }

  /** `hidden`: hidden (only the tracker reads it). `full`: the background, as the camera sees it (a sharper picture is asked for). */
  show(mode: CameraShow) {
    const v = this.video
    if (!v) return
    if (mode === 'full') {
      Object.assign(v.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', zIndex: '0', pointerEvents: 'none', borderRadius: '0', boxShadow: 'none', border: 'none', top: '0', left: '0' })
    } else {
      // out of sight but still playing (a video that is not displayed can be paused by the browser, and it must keep feeding the tracker)
      Object.assign(v.style, { position: 'absolute', inset: 'auto', top: '0', left: '0', width: '2px', height: '2px', opacity: '0', zIndex: '0', pointerEvents: 'none', borderRadius: '0', border: 'none', boxShadow: 'none' })
    }
    const t = this.stream?.getVideoTracks()[0]
    void t?.applyConstraints(mode === 'full' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 640 }, height: { ideal: 480 } }).catch(() => undefined)
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
