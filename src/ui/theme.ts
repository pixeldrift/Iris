import { useStore } from '../state/store'
import { RGB, TOKENS } from './palette'

/** The violet the interface was drawn in; sliding the color moves everything from here. */
export const BASE_HUE = 271

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}
function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}
const hex = (s: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number]
const turn = (rgb: [number, number, number], by: number) => {
  const [h, s, l] = toHsl(rgb)
  return fromHsl((h + by + 360) % 360, s, l)
}

export function applyTheme(hue: number) {
  const root = document.documentElement
  const by = hue - BASE_HUE
  if (Math.abs(by) < 0.5) {
    // the original palette: leave the stylesheet's own values in charge
    for (const k of [...Object.keys(TOKENS), ...Object.keys(RGB)]) root.style.removeProperty(k)
    return
  }
  for (const [k, v] of Object.entries(TOKENS)) {
    const [r, g, b] = turn(hex(v), by)
    root.style.setProperty(k, `rgb(${r} ${g} ${b})`)
  }
  for (const [k, v] of Object.entries(RGB)) {
    const [r, g, b] = turn(v, by)
    root.style.setProperty(k, `${r} ${g} ${b}`)
  }
}

/** Sidebar spacing is one root variable too, so moving the slider restyles nothing but what reads it. */
export const applySpace = (v: number) => document.documentElement.style.setProperty('--sb', String(v))

/**
 * While a Look & Feel slider is held, the page is made cheap to repaint: no blurred glass, no drifting. Dragging
 * a colour across a 2,000-element page with blur layers is what made it laggy; this is the same look, paused.
 */
export const setScrubbing = (on: boolean) => document.body.classList.toggle('scrubbing', on)

let last = NaN
let lastSpace = NaN
const sync = () => {
  const { themeHue, sidebarSpace } = useStore.getState().settings
  if (themeHue !== last) {
    last = themeHue
    applyTheme(themeHue)
  }
  if (sidebarSpace !== lastSpace) {
    lastSpace = sidebarSpace
    applySpace(sidebarSpace)
  }
}
sync()
useStore.subscribe(sync)
