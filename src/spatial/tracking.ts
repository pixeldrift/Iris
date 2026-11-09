// TrackingProvider: where the camera is looking. The renderer reads a pose and a quality and never knows where they came from, so touch,
// motion, (later) visual tracking and (later) ARKit can be swapped without touching it.
//
// Honest limits: the motion provider gives ORIENTATION only. It does not integrate the accelerometer (that drifts within seconds and
// is no use for room-scale position); it uses the operating system's own fused orientation (gyro + accelerometer + compass), turns it
// into a pose relative to where the viewer was facing when they started or last recentred, and smooths it. There is no position.

import { Euler, Quaternion, Vector3 } from 'three'
import type { CameraPose, TrackingProvider, TrackingQuality, TrackingStatus } from './types'

const Q1 = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)) // the camera looks out of the back of the device, not its top
const ZEE = new Vector3(0, 0, 1)
const YAXIS = new Vector3(0, 1, 0)
const XAXIS = new Vector3(1, 0, 0)
const deg = Math.PI / 180

/** The pose a device reports as alpha/beta/gamma (degrees) and the screen's turn, as a camera rotation (the standard conversion). */
export function orientationToQuaternion(alpha: number, beta: number, gamma: number, screenAngle: number, out = new Quaternion()): Quaternion {
  out.setFromEuler(new Euler(beta * deg, alpha * deg, -gamma * deg, 'YXZ'))
  out.multiply(Q1)
  out.multiply(new Quaternion().setFromAxisAngle(ZEE, -screenAngle * deg))
  return out
}

/** The compass heading (radians about the vertical) a rotation faces. */
export const yawOf = (q: Quaternion): number => new Euler().setFromQuaternion(q, 'YXZ').y

const asTuple = (q: Quaternion): [number, number, number, number] => [q.x, q.y, q.z, q.w]

type Listener = (s: TrackingStatus) => void

/** Looking by touch: a yaw and a pitch, moved by dragging. Always available, needs nothing. */
export class TouchTracking {
  yaw = 0
  pitch = 0
  look(dyaw: number, dpitch: number) {
    this.yaw += dyaw
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + dpitch))
  }
  set(yaw: number, pitch: number) {
    this.yaw = yaw
    this.pitch = Math.max(-1.35, Math.min(1.35, pitch))
  }
  reset() {
    this.yaw = 0
    this.pitch = 0
  }
}

/** Orientation from the browser's motion sensors. */
export class SensorTracking {
  private target = new Quaternion()
  private smooth = new Quaternion()
  private yawRef = 0
  private haveRef = false
  private last = 0
  private running = false
  private cb?: (alive: boolean) => void
  private handler = (e: DeviceOrientationEvent) => this.ingest(e)
  /** One reading from the sensor (public so it can be tested with made-up readings). */
  ingest(e: Pick<DeviceOrientationEvent, 'alpha' | 'beta' | 'gamma'>) {
    if (e.alpha === null || e.beta === null || e.gamma === null) return
    const angle = (typeof screen !== 'undefined' && screen.orientation?.angle) || (typeof window !== 'undefined' ? ((window as unknown as { orientation?: number }).orientation ?? 0) : 0)
    orientationToQuaternion(e.alpha, e.beta, e.gamma, angle, this.target)
    const first = this.last === 0
    this.last = performance.now()
    if (!this.haveRef) this.recenter()
    if (first) {
      this.smooth.copy(this.target)
      this.cb?.(true)
    }
  }
  /** Turn permission (asked from a tap on iOS) and the first reading into whether it works. */
  async start(onAlive?: (alive: boolean) => void): Promise<boolean> {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false
    this.cb = onAlive
    const DOE = (window as unknown as { DeviceOrientationEvent: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
    if (typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') return false
      } catch {
        return false
      }
    }
    this.last = 0
    this.haveRef = false
    // (the plain event: its heading is relative, which is all that is wanted, since the view is re-referenced on entry and on Recenter)
    window.addEventListener('deviceorientation', this.handler as EventListener)
    this.running = true
    // a device with no sensor (a desktop) fires one empty event or none: wait a moment for a real reading
    const ok = await new Promise<boolean>((res) => {
      const t0 = performance.now()
      const id = window.setInterval(() => {
        if (this.last > 0) (window.clearInterval(id), res(true))
        else if (performance.now() - t0 > 1500) (window.clearInterval(id), res(false))
      }, 50)
    })
    if (!ok) this.stop()
    return ok
  }
  stop() {
    if (this.running && typeof window !== 'undefined') window.removeEventListener('deviceorientation', this.handler as EventListener)
    this.running = false
    this.last = 0
  }
  /** Forget the heading: "ahead" is wherever the device points now (the up/down tilt is kept). */
  recenter() {
    this.yawRef = yawOf(this.target)
    this.haveRef = true
  }
  get quality(): TrackingQuality {
    if (!this.running || this.last === 0) return 'none'
    const age = performance.now() - this.last
    return age < 600 ? 'good' : age < 2500 ? 'limited' : 'none'
  }
  /** The smoothed rotation relative to the reference. Small movements are smoothed hard (no jitter), big ones follow quickly. */
  read(out = new Quaternion()): Quaternion {
    const angle = this.smooth.angleTo(this.target)
    this.smooth.slerp(this.target, Math.min(0.85, 0.08 + angle * 5))
    out.setFromAxisAngle(YAXIS, -this.yawRef).multiply(this.smooth)
    return out
  }
}

/**
 * The provider the renderer uses: the sensor's rotation (when it is running) with the touch look added on top, so dragging still
 * nudges the view in motion mode and is the whole of it in touch mode. If the sensor goes quiet it drops to touch by itself.
 */
export class SpatialTracking implements TrackingProvider {
  readonly id = 'orientation'
  readonly touch = new TouchTracking()
  private sensor = new SensorTracking()
  private motionOn = false
  /** Motion has been wanted since it was last turned off on purpose (so a quiet sensor is a pause, not a choice). */
  private wanted = false
  private listeners = new Set<Listener>()
  private lastQuality: TrackingQuality = 'good'
  private q = new Quaternion()
  private tmp = new Quaternion()

  /** `wantMotion`: whether to try the sensors at all (a tap on "Start" is the gesture iOS needs to ask). */
  async start(wantMotion = true): Promise<boolean> {
    if (!wantMotion) return this.report('touch', 'good')
    const ok = await this.sensor.start()
    this.motionOn = ok
    this.wanted = ok
    this.report(ok ? 'motion' : 'touch', 'good', ok ? undefined : 'Motion tracking is not available, so you can look around by dragging.')
    return ok
  }
  stop() {
    this.sensor.stop()
    this.motionOn = false
    this.wanted = false
  }
  /** Motion was on and has gone quiet (e.g. the page was away). */
  get paused() {
    return this.wanted && !this.motionOn
  }
  /** Pick the sensor up again (it needs no permission again where that was already given). */
  async resume(): Promise<boolean> {
    this.sensor.stop()
    const ok = await this.sensor.start()
    this.motionOn = ok
    this.wanted = ok || this.wanted
    this.report(ok ? 'motion' : 'touch', 'good')
    return ok
  }
  get motion() {
    return this.motionOn
  }
  recenter() {
    this.touch.reset()
    if (this.motionOn) this.sensor.recenter()
  }
  /** Let the sensor go (e.g. the person turned motion off) and carry on by touch. */
  disableMotion() {
    this.sensor.stop()
    this.motionOn = false
    this.wanted = false
    this.report('touch', 'good')
  }
  getPose(): CameraPose {
    this.q.identity()
    let quality: TrackingQuality = 'good'
    if (this.motionOn) {
      quality = this.sensor.quality
      this.sensor.read(this.q)
      if (quality === 'none') {
        this.motionOn = false
        this.report('touch', 'good')
      }
    }
    // the touch look: turn about the vertical first (ahead moves), tilt about the camera's own sideways axis
    this.tmp.setFromAxisAngle(YAXIS, this.touch.yaw)
    this.q.premultiply(this.tmp)
    this.tmp.setFromAxisAngle(XAXIS, this.touch.pitch)
    this.q.multiply(this.tmp)
    if (quality !== this.lastQuality && this.motionOn) this.report('motion', quality)
    return { q: asTuple(this.q), position: null, quality, source: this.motionOn ? 'motion' : 'touch' }
  }
  /** The sensor part alone (for turning a wanted heading into a touch offset). */
  sensorYaw(): number {
    return this.motionOn ? yawOf(this.sensor.read(new Quaternion())) : 0
  }
  onStatus(cb: Listener) {
    this.listeners.add(cb)
    return () => void this.listeners.delete(cb)
  }
  private report(source: 'motion' | 'touch', quality: TrackingQuality, note?: string) {
    this.lastQuality = quality
    for (const l of this.listeners) l({ source, quality, note, paused: this.paused })
    return source === 'motion'
  }
}

/**
 * ARKit world tracking arrives later, from the native app (a Capacitor plugin or the Swift port), as a provider with this same
 * shape: a pose with a position, quality from the tracking state, and anchors the layout can be pinned to. Nothing in the renderer
 * or the layout needs to change; this class marks the place it plugs in and is deliberately not implemented.
 */
export class NativeTracking implements TrackingProvider {
  readonly id = 'native'
  start(): Promise<boolean> {
    return Promise.resolve(false)
  }
  stop() {}
  recenter() {}
  getPose(): CameraPose {
    return { q: [0, 0, 0, 1], position: [0, 0, 0], quality: 'none', source: 'native' }
  }
  onStatus() {
    return () => {}
  }
}
