// What this device and browser can do, found out without asking for anything (permissions are asked for later, from a tap).

export interface Capabilities {
  webgl: boolean
  /** A motion sensor reports orientation (it may still need permission). */
  motion: boolean
  /** iOS: motion needs an explicit permission asked from a tap. */
  motionNeedsPermission: boolean
  camera: boolean
  secure: boolean
  reducedMotion: boolean
}

export function detectCapabilities(): Capabilities {
  const w = typeof window !== 'undefined' ? window : undefined
  let webgl = false
  try {
    const c = document.createElement('canvas')
    webgl = !!(w && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    webgl = false
  }
  const DOE = w && (w as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
  return {
    webgl,
    motion: !!DOE,
    motionNeedsPermission: !!DOE && typeof DOE.requestPermission === 'function',
    camera: !!(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia),
    secure: typeof window !== 'undefined' ? window.isSecureContext : false,
    reducedMotion: !!w?.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  }
}
