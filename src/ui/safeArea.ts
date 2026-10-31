import { useStore } from '../state/store'

/**
 * Clearance around a notch / Dynamic Island. iOS reports the same inset on both sides of a phone turned sideways, so the
 * side without the notch would get empty space for nothing. The device's rotation says which side the notch is on:
 * only that side is kept clear (and a little less than iOS reports), and the other side gets none.
 *
 * The result is published as CSS variables (--safe-l, --safe-r) so layouts can use them, and returned by `safeInsets()`
 * for the places that position things in script. A setting can override the detection ("Notch: Auto, Left, Right").
 */
export type NotchSide = 'auto' | 'left' | 'right'

/** iOS keeps a little more room around the notch than it needs; this much is given back. */
const TRIM = 12

let probe: HTMLDivElement | null = null
const raw = () => {
  if (!probe) {
    probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;width:0;height:0;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)'
    document.body.appendChild(probe)
  }
  const cs = getComputedStyle(probe)
  return { left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0 }
}

/** Which side the top of the phone (and so its notch) is on, when it is turned sideways. null when upright. */
export function notchSideFromRotation(): 'left' | 'right' | null {
  const w = window as unknown as { orientation?: number }
  const angle = typeof w.orientation === 'number' ? w.orientation : (screen.orientation?.angle ?? 0)
  const a = ((angle % 360) + 360) % 360
  // rotated to the left (anticlockwise) puts the top of the phone on the left
  return a === 90 ? 'left' : a === 270 ? 'right' : null
}

export function safeInsets(pref: NotchSide = useStore.getState().settings.notch ?? 'auto'): { left: number; right: number } {
  if (typeof document === 'undefined') return { left: 0, right: 0 }
  const r = raw()
  if (r.left === 0 && r.right === 0) return { left: 0, right: 0 }
  const side = pref === 'auto' ? notchSideFromRotation() : pref
  const trim = (v: number) => Math.max(0, v - TRIM)
  // upright, or rotation unknown: whatever the system reports on each side stays (usually nothing)
  if (!side) return { left: trim(r.left), right: trim(r.right) }
  return side === 'left' ? { left: trim(Math.max(r.left, r.right)), right: 0 } : { left: 0, right: trim(Math.max(r.left, r.right)) }
}

function publish() {
  const { left, right } = safeInsets()
  const s = document.documentElement.style
  s.setProperty('--safe-l', `${left}px`)
  s.setProperty('--safe-r', `${right}px`)
}

/** Keep --safe-l / --safe-r current as the phone is turned and the setting changes. Returns the stop function. */
export function startSafeArea(): () => void {
  publish()
  const on = () => window.setTimeout(publish, 60) // the insets settle just after the rotation event
  window.addEventListener('resize', on)
  window.addEventListener('orientationchange', on)
  screen.orientation?.addEventListener?.('change', on)
  const unsub = useStore.subscribe((s, p) => s.settings.notch !== p.settings.notch && publish())
  return () => {
    window.removeEventListener('resize', on)
    window.removeEventListener('orientationchange', on)
    screen.orientation?.removeEventListener?.('change', on)
    unsub()
  }
}
