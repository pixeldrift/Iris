import { useStore } from '../state/store'

/** The violet the interface was drawn in; sliding the colour moves everything from here. */
export const BASE_HUE = 271

// the palette's own colours; each keeps its lightness and saturation and only turns round the colour wheel
const TOKENS: Record<string, string> = {
  '--color-lilac-50': '#f8f3fd',
  '--color-lilac-100': '#f0e7fa',
  '--color-lilac-200': '#e1d0f4',
  '--color-lilac-300': '#cdb1eb',
  '--color-lilac-400': '#b78fdf',
  '--color-lilac-500': '#9f6fcd',
  '--color-lilac-600': '#8656b6',
  '--color-lilac-700': '#6b4491',
  '--color-ink': '#3d3150',
  '--color-ink-soft': '#7b6e8e',
  '--color-ink-faint': '#a99fba',
}
// the same colours as "r g b", for the translucent shadows and glows written as rgb(var(--lr-x) / alpha)
const RGB: Record<string, [number, number, number]> = {
  '--lr-200': [225, 208, 244],
  '--lr-300': [205, 177, 235],
  '--lr-400': [183, 143, 223],
  '--lr-500': [159, 111, 205],
  '--lr-700': [107, 68, 145],
  '--lr-glass': [120, 80, 170],
  '--lr-deep': [70, 35, 110],
}

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

let last = NaN
const sync = () => {
  const h = useStore.getState().settings.themeHue
  if (h !== last) {
    last = h
    applyTheme(h)
  }
}
sync()
useStore.subscribe(sync)
